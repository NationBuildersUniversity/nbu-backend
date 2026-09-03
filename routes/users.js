const express = require("express");
const bcrypt = require("bcryptjs");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const VALID_ROLES = ["student", "faculty", "mentor", "staff", "boardDirector", "boardAdvisor", "hr", "accounting", "marketing"];

router.post("/", requireRole("staff"), async (req, res) => {
  const { email, password, full_name, role } = req.body || {};
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: "email, password, full_name, and role are required." });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
  }
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  if (existing[0]) return res.status(409).json({ error: "An account with this email already exists." });

  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,$3,$4) RETURNING id",
    [email.toLowerCase().trim(), hash, role, full_name]
  );
  await logAction(req.user.id, "create_account", "user", rows[0].id, { email, role });
  res.status(201).json({ id: rows[0].id, email, role, full_name });
});

router.get("/", requireRole("staff", "boardDirector", "boardAdvisor"), async (req, res) => {
  const { rows } = await pool.query("SELECT id, email, role, full_name, created_at FROM users");
  res.json({ users: rows });
});

router.post("/:id/reset-password", requireRole("staff"), async (req, res) => {
  const { new_password } = req.body || {};
  if (!new_password || new_password.length < 10) {
    return res.status(400).json({ error: "new_password is required and must be at least 10 characters." });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  const { rowCount } = await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "User not found." });
  await logAction(req.user.id, "reset_password", "user", req.params.id, null);
  res.json({ ok: true });
});

module.exports = router;
