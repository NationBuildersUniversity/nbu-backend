const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { certificate_id } = req.query;
    const base = `SELECT cs.*, cc.name AS certificate_name, cc.category
                  FROM certificate_sections cs JOIN certificates_catalog cc ON cc.id = cs.certificate_id`;
    const { rows } = certificate_id
      ? await pool.query(`${base} WHERE cs.certificate_id = $1 ORDER BY cs.start_date`, [certificate_id])
      : await pool.query(`${base} ORDER BY cs.start_date`);
    res.json({ sections: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireRole("staff"), async (req, res) => {
  try {
    const { certificate_id, section_name, duration_months, start_date, end_date, capacity, syllabus_url } = req.body || {};
    if (!certificate_id || !section_name || !duration_months || !start_date || !end_date) {
      return res.status(400).json({ error: "certificate_id, section_name, duration_months, start_date, and end_date are required." });
    }
    const { rows } = await pool.query(
      `INSERT INTO certificate_sections (certificate_id, section_name, duration_months, start_date, end_date, capacity, syllabus_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [certificate_id, section_name, duration_months, start_date, end_date, capacity || null, syllabus_url || null, req.user.id]
    );
    await logAction(req.user.id, "create", "certificate_section", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/enroll", requireRole("staff"), async (req, res) => {
  try {
    const { student_id } = req.body || {};
    if (!student_id) return res.status(400).json({ error: "student_id is required." });

    const { rows: capRows } = await pool.query(
      `SELECT cs.capacity, COUNT(ce.id)::int AS enrolled FROM certificate_sections cs
       LEFT JOIN certificate_enrollments ce ON ce.section_id = cs.id
       WHERE cs.id = $1 GROUP BY cs.capacity`,
      [req.params.id]
    );
    if (capRows[0] && capRows[0].capacity !== null && capRows[0].enrolled >= capRows[0].capacity) {
      return res.status(400).json({ error: "This section is at capacity." });
    }

    const { rows } = await pool.query(
      "INSERT INTO certificate_enrollments (section_id, student_id) VALUES ($1,$2) ON CONFLICT (section_id, student_id) DO NOTHING RETURNING id",
      [req.params.id, student_id]
    );
    if (!rows[0]) return res.status(409).json({ error: "Student is already enrolled in this section." });
    await logAction(req.user.id, "enroll", "certificate_section", req.params.id, { student_id });
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/mine", async (req, res) => {
  try {
    const { rows: sRows } = await pool.query("SELECT id FROM students WHERE user_id = $1", [req.user.id]);
    if (!sRows[0]) return res.json({ enrollments: [] });
    const { rows } = await pool.query(
      `SELECT ce.*, cs.section_name, cs.start_date, cs.end_date, cs.syllabus_url, cc.name AS certificate_name
       FROM certificate_enrollments ce
       JOIN certificate_sections cs ON cs.id = ce.section_id
       JOIN certificates_catalog cc ON cc.id = cs.certificate_id
       WHERE ce.student_id = $1`,
      [sRows[0].id]
    );
    res.json({ enrollments: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
