const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", requireRole("staff", "boardDirector", "boardAdvisor"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM leads ORDER BY created_at DESC");
  res.json({ leads: rows });
});

router.post("/", requireRole("staff"), async (req, res) => {
  const { name, interest, stage, tags } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required." });
  const { rows } = await pool.query(
    "INSERT INTO leads (name, interest, stage, tags) VALUES ($1,$2,$3,$4) RETURNING id",
    [name, interest || null, stage || "New", tags || []]
  );
  await logAction(req.user.id, "create", "lead", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

router.patch("/:id", requireRole("staff"), async (req, res) => {
  const fields = ["interest", "stage", "tags"];
  const updates = []; const values = []; let i = 1;
  for (const f of fields) if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); values.push(req.body[f]); }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields." });
  values.push(req.params.id);
  await pool.query(`UPDATE leads SET ${updates.join(", ")} WHERE id = $${i}`, values);
  await logAction(req.user.id, "update", "lead", req.params.id, req.body);
  res.json({ ok: true });
});

module.exports = router;
