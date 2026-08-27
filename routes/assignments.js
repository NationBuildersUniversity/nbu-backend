const express = require("express");
const { pool, logAction, notify } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { course_id } = req.query;
  const { rows } = course_id
    ? await pool.query("SELECT * FROM assignments WHERE course_id = $1 ORDER BY due_at", [course_id])
    : await pool.query("SELECT * FROM assignments ORDER BY due_at");
  res.json({ assignments: rows });
});

router.post("/", requireRole("faculty", "staff"), async (req, res) => {
  const { course_id, title, description, due_at, max_points } = req.body || {};
  if (!course_id || !title) return res.status(400).json({ error: "course_id and title are required." });
  const { rows } = await pool.query(
    "INSERT INTO assignments (course_id, title, description, due_at, max_points, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [course_id, title, description || null, due_at || null, max_points || 100, req.user.id]
  );

  // Notify every student enrolled in that course.
  const { rows: enrolled } = await pool.query(
    `SELECT s.user_id FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.course_id = $1`,
    [course_id]
  );
  for (const s of enrolled) await notify(s.user_id, `New assignment posted: ${title}`);

  await logAction(req.user.id, "create", "assignment", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

// Student submits — real submission with a timestamp, flagged late automatically against the real due date.
router.post("/:id/submit", async (req, res) => {
  const { content, file_url } = req.body || {};
  const { rows: own } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
  if (!own[0]) return res.status(403).json({ error: "Only enrolled students may submit." });

  const { rows: aRows } = await pool.query("SELECT * FROM assignments WHERE id = $1", [req.params.id]);
  const assignment = aRows[0];
  if (!assignment) return res.status(404).json({ error: "Assignment not found." });
  const isLate = assignment.due_at ? new Date() > new Date(assignment.due_at) : false;

  const { rows } = await pool.query(
    `INSERT INTO assignment_submissions (assignment_id, student_id, content, file_url, is_late)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET content = EXCLUDED.content, file_url = EXCLUDED.file_url, is_late = EXCLUDED.is_late, submitted_at = now()
     RETURNING id`,
    [req.params.id, own[0].id, content || null, file_url || null, isLate]
  );
  res.status(201).json({ id: rows[0].id, isLate });
});

router.get("/:id/submissions", requireRole("faculty", "staff"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT sub.*, u.full_name, s.student_number FROM assignment_submissions sub
     JOIN students s ON s.id = sub.student_id JOIN users u ON u.id = s.user_id
     WHERE sub.assignment_id = $1`,
    [req.params.id]
  );
  res.json({ submissions: rows });
});

router.post("/submissions/:submissionId/grade", requireRole("faculty", "staff"), async (req, res) => {
  const { grade, feedback } = req.body || {};
  if (grade === undefined) return res.status(400).json({ error: "grade is required." });
  const { rows } = await pool.query(
    "UPDATE assignment_submissions SET grade = $1, feedback = $2, graded_at = now(), graded_by = $3 WHERE id = $4 RETURNING student_id, assignment_id",
    [grade, feedback || null, req.user.id, req.params.submissionId]
  );
  if (rows[0]) {
    const { rows: s } = await pool.query("SELECT user_id FROM students WHERE id = $1", [rows[0].student_id]);
    const { rows: a } = await pool.query("SELECT title FROM assignments WHERE id = $1", [rows[0].assignment_id]);
    if (s[0]) await notify(s[0].user_id, `Your submission for "${a[0]?.title}" was graded.`);
  }
  await logAction(req.user.id, "grade_assignment", "assignment_submission", req.params.submissionId, req.body);
  res.json({ ok: true });
});

module.exports = router;
