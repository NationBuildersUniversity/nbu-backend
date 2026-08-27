const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

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

  const fields = ["organization", "period", "industry_supervisor", "status", "hours_logged", "hours_required"];
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
  values.push(studentId);
  await pool.query(`UPDATE internships SET ${updates.join(", ")} WHERE student_id = $${i}`, values);
  await logAction(req.user.id, "update_internship", "internship", studentId, req.body);
  res.json({ ok: true });
});

module.exports = router;
