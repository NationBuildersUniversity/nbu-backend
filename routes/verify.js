const express = require("express");
const { pool } = require("../db/init");

const router = express.Router();

router.get("/:code", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.student_number, s.program, s.level, s.term, s.graduated_at, s.credits_completed, s.credits_required,
              u.full_name, sc.name AS school_name
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN schools sc ON sc.code = s.school_code
       WHERE s.verification_code = $1`,
      [req.params.code.toUpperCase()]
    );
    if (!rows[0]) return res.status(404).json({ error: "No record found for this verification code." });
    const r = rows[0];
    res.json({
      valid: true,
      full_name: r.full_name,
      program: r.program,
      level: r.level,
      school_name: r.school_name,
      status: r.graduated_at ? "Graduated" : "Currently Enrolled",
      graduated_at: r.graduated_at,
      institution: "Nation Builders University",
      note: "Nation Builders University is not currently licensed, accredited, approved, or authorized to confer degrees.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
