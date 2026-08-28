const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { school_code } = req.query;
  const base = `SELECT c.*, u.full_name AS teacher_name, s.name AS school_name
                FROM courses c
                LEFT JOIN users u ON u.id = c.teacher_id
                LEFT JOIN schools s ON s.code = c.school_code`;
  const { rows } = school_code
    ? await pool.query(`${base} WHERE c.school_code = $1 ORDER BY c.code`, [school_code])
    : await pool.query(`${base} ORDER BY c.code`);
  res.json({ courses: rows });
});

router.post("/", requireRole("faculty", "staff"), async (req, res) => {
  const { code, title, school_code, department, level, credits, teacher_id } = req.body || {};
  if (!code || !title || !school_code) return res.status(400).json({ error: "code, title, and school_code are required." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO courses (code, title, school_code, department, level, credits, teacher_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [code, title, school_code, department || null, level || null, credits || 3, teacher_id || null]
    );
    await logAction(req.user.id, "create", "course", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id/teacher", requireRole("staff"), async (req, res) => {
  const { teacher_id } = req.body || {};
  await pool.query("UPDATE courses SET teacher_id = $1 WHERE id = $2", [teacher_id || null, req.params.id]);
  await logAction(req.user.id, "assign_teacher", "course", req.params.id, { teacher_id });
  res.json({ ok: true });
});

module.exports = router;
