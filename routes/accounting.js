const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = {
  Income: ["Tuition & Fees", "Certificate Programs", "Grants", "Donations", "Other Income"],
  Expense: ["Payroll", "Facilities & Rent", "Technology & Software", "Marketing", "Professional Services (Legal/Accounting)", "Office Supplies", "Travel", "Other Expense"],
};

router.get("/categories", (req, res) => res.json({ categories: CATEGORIES }));

router.get("/", requireRole("staff", "accounting", "boardDirector"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT le.*, u.full_name AS recorded_by_name FROM ledger_entries le LEFT JOIN users u ON u.id = le.recorded_by ORDER BY le.entry_date DESC, le.id DESC`
    );
    const income = rows.filter((r) => r.entry_type === "Income").reduce((s, r) => s + Number(r.amount), 0);
    const expense = rows.filter((r) => r.entry_type === "Expense").reduce((s, r) => s + Number(r.amount), 0);
    res.json({ entries: rows, totals: { income, expense, net: income - expense } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireRole("staff", "accounting"), async (req, res) => {
  try {
    const { entry_type, category, amount, description, entry_date } = req.body || {};
    if (!entry_type || !category || !amount || !entry_date) {
      return res.status(400).json({ error: "entry_type, category, amount, and entry_date are required." });
    }
    const { rows } = await pool.query(
      "INSERT INTO ledger_entries (entry_type, category, amount, description, entry_date, recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [entry_type, category, amount, description || null, entry_date, req.user.id]
    );
    await logAction(req.user.id, "record_ledger_entry", "ledger_entry", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requireRole("staff", "accounting"), async (req, res) => {
  try {
    await pool.query("DELETE FROM ledger_entries WHERE id = $1", [req.params.id]);
    await logAction(req.user.id, "delete_ledger_entry", "ledger_entry", req.params.id, null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/export", requireRole("staff", "accounting", "boardDirector"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT entry_type, category, amount, description, entry_date FROM ledger_entries ORDER BY entry_date");
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Type,Category,Amount,Description,Date";
    const lines = rows.map((r) => [r.entry_type, r.category, r.amount, r.description, r.entry_date.toISOString().slice(0, 10)].map(escape).join(","));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="nbu_ledger.csv"');
    res.send([header, ...lines].join("\n"));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
