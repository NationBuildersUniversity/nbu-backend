const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Any logged-in user can raise a ticket; only they (or staff) see it listed appropriately.
router.get("/", async (req, res) => {
  if (req.user.role === "staff" || req.user.role === "boardDirector" || req.user.role === "boardAdvisor") {
    const { rows } = await pool.query(
      `SELECT t.*, u.full_name AS raised_by_name FROM support_tickets t LEFT JOIN users u ON u.id = t.raised_by ORDER BY created_at DESC`
    );
    return res.json({ tickets: rows });
  }
  const { rows } = await pool.query("SELECT * FROM support_tickets WHERE raised_by = $1 ORDER BY created_at DESC", [req.user.id]);
  res.json({ tickets: rows });
});

router.post("/", async (req, res) => {
  const { subject, priority } = req.body || {};
  if (!subject) return res.status(400).json({ error: "subject is required." });
  const { rows } = await pool.query(
    "INSERT INTO support_tickets (subject, raised_by, priority) VALUES ($1,$2,$3) RETURNING id",
    [subject, req.user.id, priority || "Medium"]
  );
  await logAction(req.user.id, "create", "ticket", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

router.patch("/:id/resolve", requireRole("staff"), async (req, res) => {
  await pool.query("UPDATE support_tickets SET status = 'Resolved' WHERE id = $1", [req.params.id]);
  await logAction(req.user.id, "resolve", "ticket", req.params.id, null);
  res.json({ ok: true });
});

module.exports = router;
