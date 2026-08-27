const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.post("/", requireRole("staff"), async (req, res) => {
  const { user_id, school_code } = req.body || {};
  if (!user_id || !school_code) return res.status(400).json({ error: "user_id and school_code are required." });
  const { rows } = await pool.query(
    "INSERT INTO mentors (user_id, school_code) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET school_code = EXCLUDED.school_code RETURNING id",
    [user_id, school_code]
  );
  await logAction(req.user.id, "create_mentor", "mentor", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

router.get("/", requireRole("staff", "boardDirector", "boardAdvisor"), async (req, res) => {
  const { rows: mentors } = await pool.query(
    `SELECT m.id, m.school_code, u.full_name, u.email FROM mentors m JOIN users u ON u.id = m.user_id`
  );
  for (const m of mentors) {
    const { rows: mentees } = await pool.query(
      `SELECT s.id, u.full_name FROM mentor_students ms
       JOIN students s ON s.id = ms.student_id
       JOIN users u ON u.id = s.user_id
       WHERE ms.mentor_id = $1`,
      [m.id]
    );
    m.mentees = mentees;
  }
  res.json({ mentors });
});

router.post("/:mentorId/students/:studentId", requireRole("staff"), async (req, res) => {
  await pool.query(
    "INSERT INTO mentor_students (mentor_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [req.params.mentorId, req.params.studentId]
  );
  await logAction(req.user.id, "assign_mentee", "mentor_students", req.params.studentId, req.params);
  res.status(201).json({ ok: true });
});

module.exports = router;
