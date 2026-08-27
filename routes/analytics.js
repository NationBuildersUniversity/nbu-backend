const express = require("express");
const { pool } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/analytics/at-risk — real computation, not sample data.
// Flags: attendance <75%, any unpaid balance, any missing (ungraded/unsubmitted) assignment past due.
router.get("/at-risk", requireRole("faculty", "staff", "boardDirector", "boardAdvisor"), async (req, res) => {
  const { rows: students } = await pool.query(
    `SELECT s.id, s.student_number, s.fee_total, s.fee_paid, u.full_name FROM students s JOIN users u ON u.id = s.user_id`
  );

  const results = [];
  for (const s of students) {
    const { rows: att } = await pool.query("SELECT status FROM attendance WHERE student_id = $1", [s.id]);
    const total = att.length;
    const present = att.filter((a) => a.status === "present").length;
    const attendancePct = total ? Math.round((present / total) * 100) : null;

    const { rows: missing } = await pool.query(
      `SELECT a.title FROM assignments a
       JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = $1
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = $1
       WHERE a.due_at < now() AND sub.id IS NULL`,
      [s.id]
    );

    const flags = [];
    if (attendancePct !== null && attendancePct < 75) flags.push(`Attendance ${attendancePct}%`);
    if (Number(s.fee_paid) < Number(s.fee_total)) flags.push(`Balance due $${(s.fee_total - s.fee_paid).toLocaleString()}`);
    if (missing.length > 0) flags.push(`${missing.length} missing assignment(s)`);

    if (flags.length > 0) {
      results.push({ student_id: s.id, student_number: s.student_number, full_name: s.full_name, flags });
    }
  }

  res.json({ atRisk: results });
});

module.exports = router;
