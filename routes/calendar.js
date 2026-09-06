const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ac.*, s.name AS school_name FROM academic_calendar ac LEFT JOIN schools s ON s.code = ac.school_code ORDER BY ac.start_date`
    );
    res.json({ events: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireRole("staff", "hr"), async (req, res) => {
  try {
    const { title, event_type, start_date, end_date, school_code } = req.body || {};
    if (!title || !event_type || !start_date) return res.status(400).json({ error: "title, event_type, and start_date are required." });
    const { rows } = await pool.query(
      "INSERT INTO academic_calendar (title, event_type, start_date, end_date, school_code, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [title, event_type, start_date, end_date || null, school_code || null, req.user.id]
    );
    await logAction(req.user.id, "create", "academic_calendar", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requireRole("staff", "hr"), async (req, res) => {
  try {
    await pool.query("DELETE FROM academic_calendar WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
