const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/grades — Faculty/Staff only.
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

// GET /api/grades/student/:studentId
router.get("/student/:studentId", async (req, res) => {
  const targetId = Number(req.params.studentId);
  if (req.user.role === "student") {
    const { rows } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!rows[0] || rows[0].id !== targetId) return res.status(403).json({ error: "You may only view your own grades." });
  }
  const { rows } = await pool.query("SELECT * FROM grades WHERE student_id = $1", [targetId]);
  res.json({ grades: rows });
});

// GET /api/grades/student/:studentId/summary — real rollup: percentage + letter grade,
// grouped by course, computed from actual component scores (not a hardcoded example).
function letterGrade(pct) {
  if (pct >= 93) return "A"; if (pct >= 90) return "A-";
  if (pct >= 87) return "B+"; if (pct >= 83) return "B"; if (pct >= 80) return "B-";
  if (pct >= 77) return "C+"; if (pct >= 73) return "C"; if (pct >= 70) return "C-";
  if (pct >= 60) return "D";
  return "F";
}
router.get("/student/:studentId/summary", async (req, res) => {
  const targetId = Number(req.params.studentId);
  if (req.user.role === "student") {
    const { rows } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!rows[0] || rows[0].id !== targetId) return res.status(403).json({ error: "You may only view your own grades." });
  }
  const { rows } = await pool.query(
    `SELECT g.*, c.code, c.title FROM grades g JOIN courses c ON c.id = g.course_id WHERE g.student_id = $1`,
    [targetId]
  );
  const byCourse = {};
  for (const g of rows) {
    const key = g.course_id;
    if (!byCourse[key]) byCourse[key] = { code: g.code, title: g.title, earned: 0, possible: 0 };
    byCourse[key].earned += Number(g.score) || 0;
    byCourse[key].possible += Number(g.max_score) || 0;
  }
  const summary = Object.values(byCourse).map((c) => {
    const pct = c.possible ? Math.round((c.earned / c.possible) * 100) : null;
    return { ...c, percentage: pct, letterGrade: pct === null ? null : letterGrade(pct) };
  });
  res.json({ summary });
});

module.exports = router;
