const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { school_code } = req.query;
  const { rows } = school_code
    ? await pool.query("SELECT * FROM courses WHERE school_code = $1 ORDER BY code", [school_code])
    : await pool.query("SELECT * FROM courses ORDER BY code");
  res.json({ courses: rows });
});

router.post("/", requireRole("faculty", "staff"), async (req, res) => {
  const { code, title, school_code, department, level, credits } = req.body || {};
  if (!code || !title || !school_code) return res.status(400).json({ error: "code, title, and school_code are required." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO courses (code, title, school_code, department, level, credits) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [code, title, school_code, department || null, level || null, credits || 3]
    );
    await logAction(req.user.id, "create", "course", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
