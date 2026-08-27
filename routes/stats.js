const express = require("express");
const { pool } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", requireRole("staff", "boardDirector", "boardAdvisor"), async (req, res) => {
  const [{ rows: studentCount }, { rows: feeAgg }, { rows: pendingLeave }, { rows: byRole }] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS c FROM students"),
    pool.query("SELECT COALESCE(SUM(fee_total),0) AS total, COALESCE(SUM(fee_paid),0) AS paid FROM students"),
    pool.query("SELECT COUNT(*)::int AS c FROM students WHERE fee_paid < fee_total"),
    pool.query("SELECT role, COUNT(*)::int AS c FROM users GROUP BY role"),
  ]);

  res.json({
    totalStudents: studentCount[0].c,
    feeTotal: Number(feeAgg[0].total),
    feePaid: Number(feeAgg[0].paid),
    studentsWithBalanceDue: pendingLeave[0].c,
    usersByRole: Object.fromEntries(byRole.map((r) => [r.role, r.c])),
  });
});

module.exports = router;
