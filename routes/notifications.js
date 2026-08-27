const express = require("express");
const { pool } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [req.user.id]
  );
  res.json({ notifications: rows, unreadCount: rows.filter((n) => !n.is_read).length });
});

router.post("/:id/read", async (req, res) => {
  await pool.query("UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await pool.query("UPDATE notifications SET is_read = true WHERE user_id = $1", [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
