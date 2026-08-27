const express = require("express");
const bcrypt = require("bcryptjs");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

// GET /api/export/students|grades|attendance|fees — real CSV, generated from real data.
router.get("/:type", requireRole("staff", "boardDirector", "boardAdvisor"), async (req, res) => {
  const queries = {
    students: `SELECT s.student_number, u.full_name, u.email, s.program, s.level, s.term, s.fee_total, s.fee_paid FROM students s JOIN users u ON u.id = s.user_id`,
    grades: `SELECT u.full_name, s.student_number, g.component, g.score, g.max_score FROM grades g JOIN students s ON s.id = g.student_id JOIN users u ON u.id = s.user_id`,
    attendance: `SELECT u.full_name, s.student_number, a.date, a.status FROM attendance a JOIN students s ON s.id = a.student_id JOIN users u ON u.id = s.user_id`,
    fees: `SELECT u.full_name, s.student_number, t.amount, t.method, t.recorded_at FROM fee_transactions t JOIN students s ON s.id = t.student_id JOIN users u ON u.id = s.user_id`,
  };
  const q = queries[req.params.type];
  if (!q) return res.status(400).json({ error: "type must be one of: students, grades, attendance, fees" });
  const { rows } = await pool.query(q);
  const csv = toCsv(rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="nbu_${req.params.type}.csv"`);
  res.send(csv);
});

// POST /api/export/bulk-students — staff pastes CSV text: full_name,email,password,student_number,school_code,program,level,term
// Real parsing, real inserts, reports exactly which rows succeeded/failed — no silent partial failure.
router.post("/bulk-students", requireRole("staff"), async (req, res) => {
  const { csv } = req.body || {};
  if (!csv) return res.status(400).json({ error: "csv text is required." });

  const lines = csv.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const results = { created: 0, errors: [] };

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    const [full_name, email, password, student_number, school_code, program, level, term] = parts;
    if (!full_name || !email || !password || !student_number || !school_code || !program || !level || !term) {
      results.errors.push({ line: i + 1, error: "Missing one or more required fields (expected 8 comma-separated values)." });
      continue;
    }
    try {
      const hash = bcrypt.hashSync(password, 10);
      const { rows: userRows } = await pool.query(
        "INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,'student',$3) RETURNING id",
        [email.toLowerCase(), hash, full_name]
      );
      await pool.query(
        `INSERT INTO students (user_id, student_number, school_code, program, level, term) VALUES ($1,$2,$3,$4,$5,$6)`,
        [userRows[0].id, student_number, school_code, program, level, term]
      );
      results.created++;
    } catch (err) {
      results.errors.push({ line: i + 1, error: err.message });
    }
  }

  await logAction(req.user.id, "bulk_import", "students", null, { created: results.created, errorCount: results.errors.length });
  res.json(results);
});

module.exports = router;
