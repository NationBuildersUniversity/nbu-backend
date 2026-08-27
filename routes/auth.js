const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db/init");
const { JWT_SECRET, requireAuth } = require("../middleware/auth");

const router = express.Router();
const TOKEN_TTL = "8h";

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid email or password." });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
});

router.post("/register", async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "email, password, and full_name are required." });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: "Password must be at least 10 characters." });
  }

  const { rows: existingRows } = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  if (existingRows[0]) return res.status(409).json({ error: "An account with this email already exists." });

  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,'student',$3) RETURNING *",
    [email.toLowerCase().trim(), hash, full_name]
  );
  const user = rows[0];
  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
