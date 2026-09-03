const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/internships — scoped by role, enforced server-side.
router.get("/", async (req, res) => {
  if (req.user.role === "student") {
    const { rows: own } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!own[0]) return res.json({ internships: [] });
    const { rows } = await pool.query("SELECT * FROM internships WHERE student_id = $1", [own[0].id]);
    return res.json({ internships: rows });
  }

  if (req.user.role === "mentor") {
    const { rows } = await pool.query(
      `SELECT i.* FROM internships i
       JOIN mentor_students ms ON ms.student_id = i.student_id
       JOIN mentors m ON m.id = ms.mentor_id
       WHERE m.user_id = $1`,
      [req.user.id]
    );
    return res.json({ internships: rows });
  }

  const { rows } = await pool.query("SELECT * FROM internships");
  res.json({ internships: rows });
});

// PATCH /api/internships/:studentId — Staff or the assigned Mentor only.
// Real upsert: a student has no internship row until someone places them, so this
// creates the record on first use instead of silently updating nothing.
router.patch("/:studentId", async (req, res) => {
  const studentId = Number(req.params.studentId);

  if (req.user.role === "mentor") {
    const { rows } = await pool.query(
      `SELECT 1 FROM mentor_students ms JOIN mentors m ON m.id = ms.mentor_id
       WHERE m.user_id = $1 AND ms.student_id = $2`,
      [req.user.id, studentId]
    );
    if (!rows[0]) return res.status(403).json({ error: "This student is not assigned to you." });
  } else if (req.user.role !== "staff") {
    return res.status(403).json({ error: "Only Staff or the assigned Mentor may update internship records." });
  }

  const { organization, period, industry_supervisor, status, hours_logged, hours_required, mentor_notes } = req.body || {};
  try {
    const { rows: existing } = await pool.query("SELECT id FROM internships WHERE student_id = $1", [studentId]);
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO internships (student_id, organization, period, industry_supervisor, status, hours_logged, hours_required, mentor_notes, academic_supervisor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          studentId, organization || null, period || null, industry_supervisor || null,
          status || "Not Started", hours_logged ?? 0, hours_required ?? 300, mentor_notes || null,
          req.user.role === "mentor" ? req.user.id : null,
        ]
      );
    } else {
      const fields = { organization, period, industry_supervisor, status, hours_logged, hours_required, mentor_notes };
      const updates = []; const values = []; let i = 1;
      for (const [key, val] of Object.entries(fields)) {
        if (val !== undefined) { updates.push(`${key} = $${i++}`); values.push(val); }
      }
      if (updates.length > 0) {
        values.push(studentId);
        await pool.query(`UPDATE internships SET ${updates.join(", ")} WHERE student_id = $${i}`, values);
      }
    }
    await logAction(req.user.id, "update_internship", "internship", studentId, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
