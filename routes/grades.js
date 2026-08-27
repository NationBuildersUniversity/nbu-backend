const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.post("/", requireRole("faculty", "staff"), async (req, res) => {
  const { student_id, course_id, component, score, max_score } = req.body || {};
  if (!student_id || !course_id || !component || max_score === undefined) {
    return res.status(400).json({ error: "student_id, course_id, component, and max_score are required." });
  }
  await pool.query(
    `INSERT INTO grades (student_id, course_id, component, score, max_score, entered_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (student_id, course_id, component)
     DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, entered_by = EXCLUDED.entered_by, updated_at = now()`,
    [student_id, course_id, component, score ?? null, max_score, req.user.id]
  );
  await logAction(req.user.id, "enter_grade", "grade", student_id, { course_id, component, score, max_score });
  res.json({ ok: true });
});

router.get("/student/:studentId", async (req, res) => {
  const targetId = Number(req.params.studentId);
  if (req.user.role === "student") {
    const { rows } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!rows[0] || rows[0].id !== targetId) return res.status(403).json({ error: "You may only view your own grades." });
  }
  const { rows } = await pool.query("SELECT * FROM grades WHERE student_id = $1", [targetId]);
  res.json({ grades: rows });
});

module.exports = router;
