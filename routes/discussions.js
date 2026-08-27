const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/threads", async (req, res) => {
  const { course_id } = req.query;
  const { rows } = course_id
    ? await pool.query("SELECT * FROM discussion_threads WHERE course_id = $1 ORDER BY created_at DESC", [course_id])
    : await pool.query("SELECT * FROM discussion_threads ORDER BY created_at DESC");
  res.json({ threads: rows });
});

router.post("/threads", requireRole("faculty", "staff"), async (req, res) => {
  const { course_id, title } = req.body || {};
  if (!course_id || !title) return res.status(400).json({ error: "course_id and title are required." });
  const { rows } = await pool.query(
    "INSERT INTO discussion_threads (course_id, title, created_by) VALUES ($1,$2,$3) RETURNING id",
    [course_id, title, req.user.id]
  );
  await logAction(req.user.id, "create", "discussion_thread", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

router.get("/threads/:id/posts", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, u.full_name, u.role FROM discussion_posts p JOIN users u ON u.id = p.author_id WHERE p.thread_id = $1 ORDER BY p.created_at`,
    [req.params.id]
  );
  res.json({ posts: rows });
});

router.post("/threads/:id/posts", async (req, res) => {
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: "body is required." });
  const { rows } = await pool.query(
    "INSERT INTO discussion_posts (thread_id, author_id, body) VALUES ($1,$2,$3) RETURNING id",
    [req.params.id, req.user.id, body]
  );
  res.status(201).json({ id: rows[0].id });
});

module.exports = router;
