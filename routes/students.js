const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/students — Staff/Faculty/Mentor/Board can list; a student can only see themselves.
router.get("/", async (req, res) => {
  if (req.user.role === "student") {
    const { rows } = await pool.query(
      `SELECT s.*, u.full_name, u.email FROM students s JOIN users u ON u.id = s.user_id WHERE u.id = $1`,
      [req.user.id]
    );
    return res.json({ students: rows });
  }

  if (req.user.role === "mentor") {
    const { rows } = await pool.query(
      `SELECT s.*, u.full_name, u.email FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN mentor_students ms ON ms.student_id = s.id
       JOIN mentors m ON m.id = ms.mentor_id
       WHERE m.user_id = $1`,
      [req.user.id]
    );
    return res.json({ students: rows });
  }

  // staff, faculty, boardDirector, boardAdvisor: full roster.
  const { rows } = await pool.query(
    `SELECT s.*, u.full_name, u.email FROM students s JOIN users u ON u.id = s.user_id`
  );
  res.json({ students: rows });
});

// POST /api/students — Staff only: create a student record (enrollment).
router.post("/", requireRole("staff"), async (req, res) => {
  const { user_id, student_number, school_code, program, level, term, fee_total } = req.body || {};
  if (!user_id || !student_number || !school_code || !program || !level || !term) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO students (user_id, student_number, school_code, program, level, term, fee_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [user_id, student_number, school_code, program, level, term, fee_total || 0]
    );
    await logAction(req.user.id, "create", "student", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/students/:id — Staff only: update program/level/term/credits.
router.patch("/:id", requireRole("staff"), async (req, res) => {
  const fields = ["school_code", "program", "level", "term", "credits_completed", "credits_required", "fee_total"];
  const updates = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update." });
  values.push(req.params.id);
  await pool.query(`UPDATE students SET ${updates.join(", ")} WHERE id = $${i}`, values);
  await logAction(req.user.id, "update", "student", req.params.id, req.body);
  res.json({ ok: true });
});

module.exports = router;
