const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/attendance — Faculty/Staff only. Records who marked it and when.
router.post("/", requireRole("faculty", "staff"), async (req, res) => {
  const { student_id, course_id, date, status } = req.body || {};
  if (!student_id || !course_id || !date || !["present", "absent"].includes(status)) {
    return res.status(400).json({ error: "student_id, course_id, date, and status ('present'|'absent') are required." });
  }
  await pool.query(
    `INSERT INTO attendance (student_id, course_id, date, status, marked_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (student_id, course_id, date)
     DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now()`,
    [student_id, course_id, date, status, req.user.id]
  );
  await logAction(req.user.id, "mark_attendance", "attendance", student_id, { course_id, date, status });
  res.json({ ok: true });
});

// GET /api/attendance/student/:studentId
router.get("/student/:studentId", async (req, res) => {
  const targetId = Number(req.params.studentId);
  if (req.user.role === "student") {
    const { rows } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!rows[0] || rows[0].id !== targetId) return res.status(403).json({ error: "You may only view your own attendance." });
  }
  const { rows } = await pool.query("SELECT * FROM attendance WHERE student_id = $1 ORDER BY date DESC", [targetId]);
  const total = rows.length;
  const present = rows.filter((r) => r.status === "present").length;
  const pct = total ? Math.round((present / total) * 100) : null;
  res.json({ records: rows, attendancePercent: pct });
});

module.exports = router;
