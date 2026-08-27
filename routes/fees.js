const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/student/:studentId", async (req, res) => {
  const targetId = Number(req.params.studentId);
  if (req.user.role === "student") {
    const { rows } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!rows[0] || rows[0].id !== targetId) return res.status(403).json({ error: "You may only view your own fee record." });
  }
  const { rows: studentRows } = await pool.query(
    "SELECT id, fee_total, fee_paid FROM students WHERE id = $1", [targetId]
  );
  const student = studentRows[0];
  if (!student) return res.status(404).json({ error: "Student not found." });

  const { rows: transactions } = await pool.query(
    "SELECT * FROM fee_transactions WHERE student_id = $1 ORDER BY recorded_at DESC", [targetId]
  );
  res.json({ balance: student.fee_total - student.fee_paid, ...student, transactions });
});

router.post("/transactions", requireRole("staff"), async (req, res) => {
  const { student_id, amount, method, note } = req.body || {};
  if (!student_id || !amount) return res.status(400).json({ error: "student_id and amount are required." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO fee_transactions (student_id, amount, method, note, recorded_by) VALUES ($1,$2,$3,$4,$5)",
      [student_id, amount, method || "manual_record", note || null, req.user.id]
    );
    await client.query("UPDATE students SET fee_paid = fee_paid + $1 WHERE id = $2", [amount, student_id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
  await logAction(req.user.id, "record_payment", "fee_transaction", student_id, { amount, method, note });
  res.status(201).json({ ok: true });
});

router.post("/checkout", (req, res) => {
  res.status(501).json({
    error:
      "Online payment processing is not configured. This requires a real Stripe (or similar) business account " +
      "with verified banking details — see README.md 'Payments' section for what's needed to enable this route.",
  });
});

module.exports = router;
