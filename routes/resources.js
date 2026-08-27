const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/materials", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM study_materials ORDER BY created_at DESC");
  res.json({ materials: rows });
});
router.post("/materials", requireRole("faculty", "staff"), async (req, res) => {
  const { title, school_code, type } = req.body || {};
  if (!title || !school_code) return res.status(400).json({ error: "title and school_code are required." });
  const { rows } = await pool.query(
    "INSERT INTO study_materials (title, school_code, type, uploaded_by) VALUES ($1,$2,$3,$4) RETURNING id",
    [title, school_code, type || "PDF", req.user.id]
  );
  await logAction(req.user.id, "upload", "study_material", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

router.get("/events", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM events ORDER BY created_at DESC");
  res.json({ events: rows });
});
router.post("/events", requireRole("staff"), async (req, res) => {
  const { title, event_date } = req.body || {};
  if (!title || !event_date) return res.status(400).json({ error: "title and event_date are required." });
  const { rows } = await pool.query("INSERT INTO events (title, event_date, created_by) VALUES ($1,$2,$3) RETURNING id", [title, event_date, req.user.id]);
  await logAction(req.user.id, "create", "event", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

module.exports = router;
