const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public — no auth required. This is what the public website's Careers page calls.
router.get("/public", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT jp.id, jp.title, jp.role_type, jp.department, jp.description, jp.created_at, s.name AS school_name
       FROM job_postings jp LEFT JOIN schools s ON s.code = jp.school_code
       WHERE jp.status = 'Open' ORDER BY jp.created_at DESC`
    );
    res.json({ postings: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Everything below requires staff login.
router.use(requireAuth);

router.get("/", requireRole("staff"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT jp.*, s.name AS school_name FROM job_postings jp LEFT JOIN schools s ON s.code = jp.school_code ORDER BY jp.created_at DESC`
    );
    res.json({ postings: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireRole("staff"), async (req, res) => {
  try {
    const { title, role_type, school_code, department, description } = req.body || {};
    if (!title || !role_type) return res.status(400).json({ error: "title and role_type are required." });
    const { rows } = await pool.query(
      "INSERT INTO job_postings (title, role_type, school_code, department, description, posted_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [title, role_type, school_code || null, department || null, description || null, req.user.id]
    );
    await logAction(req.user.id, "publish", "job_posting", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id/status", requireRole("staff"), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["Open", "Closed"].includes(status)) return res.status(400).json({ error: "status must be Open or Closed." });
    await pool.query("UPDATE job_postings SET status = $1 WHERE id = $2", [status, req.params.id]);
    await logAction(req.user.id, "update_status", "job_posting", req.params.id, { status });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/apply", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "INSERT INTO job_applications (job_id, user_id) VALUES ($1,$2) ON CONFLICT (job_id, user_id) DO NOTHING RETURNING id",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "You've already applied to this position." });
    await logAction(req.user.id, "apply", "job_posting", req.params.id, null);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/mine", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ja.*, jp.title, jp.role_type FROM job_applications ja JOIN job_postings jp ON jp.id = ja.job_id WHERE ja.user_id = $1 ORDER BY ja.applied_at DESC`,
      [req.user.id]
    );
    res.json({ applications: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/applicants", requireRole("staff"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ja.*, u.full_name, u.email, u.resume_url, u.linkedin_url FROM job_applications ja JOIN users u ON u.id = ja.user_id WHERE ja.job_id = $1 ORDER BY ja.applied_at`,
      [req.params.id]
    );
    res.json({ applicants: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
