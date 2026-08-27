const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", requireRole("staff", "boardDirector", "boardAdvisor"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM communications ORDER BY sent_at DESC LIMIT 200");
  res.json({ communications: rows });
});

router.post("/", requireRole("staff"), async (req, res) => {
  const { channel, message } = req.body || {};
  if (!channel || !message) return res.status(400).json({ error: "channel and message are required." });
  const { rows } = await pool.query(
    "INSERT INTO communications (channel, message, sent_by) VALUES ($1,$2,$3) RETURNING id",
    [channel, message, req.user.id]
  );
  await logAction(req.user.id, "send", "communication", rows[0].id, { channel, message });
  res.status(201).json({ id: rows[0].id });
});

module.exports = router;
