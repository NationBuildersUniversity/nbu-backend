const express = require("express");
const { pool } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/audit-log — the audit_log table has been written to since day one;
// this is the first way anyone can actually read it.
router.get("/", requireRole("staff", "boardDirector"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, u.full_name AS actor_name, u.email AS actor_email
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.created_at DESC LIMIT 300`
  );
  res.json({ entries: rows });
});

module.exports = router;
