const express = require("express");
const { pool, logAction, notify } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/projects", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM projects ORDER BY created_at DESC");
    res.json({ projects: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/projects", requireRole("staff", "faculty"), async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required." });
    const { rows } = await pool.query(
      "INSERT INTO projects (name, description, created_by) VALUES ($1,$2,$3) RETURNING id",
      [name, description || null, req.user.id]
    );
    await logAction(req.user.id, "create", "project", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const { project_id } = req.query;
    const base = `SELECT t.*, u.full_name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id`;
    const { rows } = project_id
      ? await pool.query(`${base} WHERE t.project_id = $1 ORDER BY t.created_at`, [project_id])
      : await pool.query(`${base} ORDER BY t.created_at`);
    res.json({ tasks: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tasks/mine", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.name AS project_name FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.assignee_id = $1 ORDER BY t.due_date NULLS LAST`,
      [req.user.id]
    );
    res.json({ tasks: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tasks", async (req, res) => {
  try {
    const { project_id, title, description, assignee_id, due_date } = req.body || {};
    if (!project_id || !title) return res.status(400).json({ error: "project_id and title are required." });
    const { rows } = await pool.query(
      "INSERT INTO tasks (project_id, title, description, assignee_id, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [project_id, title, description || null, assignee_id || null, due_date || null, req.user.id]
    );
    if (assignee_id && Number(assignee_id) !== req.user.id) await notify(assignee_id, `New task assigned: ${title}`);
    await logAction(req.user.id, "create", "task", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/tasks/:id/status", async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["To Do", "In Progress", "Done"].includes(status)) return res.status(400).json({ error: "Invalid status." });
    await pool.query("UPDATE tasks SET status = $1 WHERE id = $2", [status, req.params.id]);
    await logAction(req.user.id, "update_status", "task", req.params.id, { status });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
