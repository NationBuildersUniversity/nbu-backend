const express = require("express");
const { pool, logAction, notify } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { course_id } = req.query;
  const { rows } = course_id
    ? await pool.query("SELECT * FROM live_sessions WHERE course_id = $1 ORDER BY scheduled_at", [course_id])
    : await pool.query("SELECT * FROM live_sessions ORDER BY scheduled_at");
  res.json({ sessions: rows });
});

router.post("/", requireRole("faculty", "staff"), async (req, res) => {
  const { course_id, title, meeting_url, scheduled_at } = req.body || {};
  if (!course_id || !title || !scheduled_at) return res.status(400).json({ error: "course_id, title, and scheduled_at are required." });
  const { rows } = await pool.query(
    "INSERT INTO live_sessions (course_id, title, meeting_url, scheduled_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [course_id, title, meeting_url || null, scheduled_at, req.user.id]
  );

  const { rows: enrolled } = await pool.query(
    `SELECT s.user_id FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.course_id = $1`,
    [course_id]
  );
  for (const s of enrolled) await notify(s.user_id, `Live session scheduled: ${title}`);

  await logAction(req.user.id, "schedule", "live_session", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

module.exports = router;
