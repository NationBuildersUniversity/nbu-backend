const express = require("express");
const { pool, logAction, notify } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/enrollments — a student sees their own; faculty/staff can filter by course.
router.get("/", async (req, res) => {
  if (req.user.role === "student") {
    const { rows: own } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!own[0]) return res.json({ enrollments: [] });
    const { rows } = await pool.query(
      `SELECT e.*, c.code, c.title, c.credits FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = $1`,
      [own[0].id]
    );
    return res.json({ enrollments: rows });
  }
  const { course_id } = req.query;
  const { rows } = course_id
    ? await pool.query(
        `SELECT e.*, u.full_name, s.student_number FROM enrollments e
         JOIN students s ON s.id = e.student_id JOIN users u ON u.id = s.user_id
         WHERE e.course_id = $1`,
        [course_id]
      )
    : await pool.query(
        `SELECT e.*, u.full_name, s.student_number, c.code, c.title FROM enrollments e
         JOIN students s ON s.id = e.student_id JOIN users u ON u.id = s.user_id
         JOIN courses c ON c.id = e.course_id`
      );
  res.json({ enrollments: rows });
});

router.post("/", requireRole("staff"), async (req, res) => {
  const { student_id, course_id, term } = req.body || {};
  if (!student_id || !course_id || !term) return res.status(400).json({ error: "student_id, course_id, and term are required." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO enrollments (student_id, course_id, term) VALUES ($1,$2,$3) RETURNING id",
      [student_id, course_id, term]
    );
    const { rows: s } = await pool.query("SELECT user_id FROM students WHERE id = $1", [student_id]);
    const { rows: c } = await pool.query("SELECT title FROM courses WHERE id = $1", [course_id]);
    if (s[0]) await notify(s[0].user_id, `You've been enrolled in ${c[0]?.title || "a course"} for ${term}.`);
    await logAction(req.user.id, "enroll", "enrollment", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
