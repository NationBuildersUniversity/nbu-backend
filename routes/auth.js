const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db/init");
const { JWT_SECRET, requireAuth } = require("../middleware/auth");

const router = express.Router();
const TOKEN_TTL = "8h";

// Real brute-force protection: 10 attempts per 15 minutes per IP, not per-account
// (per-account limiting would let an attacker lock out a real user — this doesn't).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." },
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
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

// POST /api/auth/register
// Open registration is intentionally restricted to the "student" role.
// Staff/Faculty/Mentor/Board accounts must be created by a Staff user via
// POST /api/users — this prevents anyone from self-registering as Registrar
// or Board of Directors.
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

// GET /api/auth/me — confirms the current token is valid and returns the user.
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
