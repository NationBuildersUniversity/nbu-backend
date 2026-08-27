const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { rows: forms } = await pool.query("SELECT * FROM custom_forms ORDER BY created_at DESC");
  for (const f of forms) {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM form_submissions WHERE form_id = $1", [f.id]);
    f.submissions = rows[0].c;
  }
  res.json({ forms });
});

router.post("/", requireRole("staff"), async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required." });
  const { rows } = await pool.query("INSERT INTO custom_forms (name, created_by) VALUES ($1,$2) RETURNING id", [name, req.user.id]);
  await logAction(req.user.id, "create", "form", rows[0].id, { name });
  res.status(201).json({ id: rows[0].id });
});

router.post("/:id/submit", async (req, res) => {
  const { rows } = await pool.query(
    "INSERT INTO form_submissions (form_id, submitted_by, data) VALUES ($1,$2,$3) RETURNING id",
    [req.params.id, req.user.id, req.body.data || {}]
  );
  res.status(201).json({ id: rows[0].id });
});

module.exports = router;
