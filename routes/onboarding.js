const express = require("express");
const { pool, logAction, notify } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const DEFAULT_CHECKLIST = [
  "Offer letter / contract signed",
  "ID and background documentation collected",
  "NBU email account created",
  "LMS account and role assigned",
  "Orientation completed",
];

router.get("/", requireRole("staff"), async (req, res) => {
  try {
    const { rows: onboardings } = await pool.query(
      `SELECT o.*, u.full_name, u.email, u.role FROM onboarding o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC`
    );
    for (const o of onboardings) {
      const { rows } = await pool.query("SELECT * FROM onboarding_tasks WHERE onboarding_id = $1 ORDER BY id", [o.id]);
      o.tasks = rows;
    }
    res.json({ onboardings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireRole("staff"), async (req, res) => {
  try {
    const { user_id, contract_type, start_date, notes } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "user_id is required." });
    const { rows } = await pool.query(
      "INSERT INTO onboarding (user_id, contract_type, start_date, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [user_id, contract_type || null, start_date || null, notes || null, req.user.id]
    );
    for (const label of DEFAULT_CHECKLIST) {
      await pool.query("INSERT INTO onboarding_tasks (onboarding_id, label) VALUES ($1,$2)", [rows[0].id, label]);
    }
    await notify(user_id, "Your onboarding at Nation Builders University has started — check with HR/Staff for next steps.");
    await logAction(req.user.id, "start_onboarding", "onboarding", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/tasks/:id", requireRole("staff"), async (req, res) => {
  try {
    const { is_complete } = req.body || {};
    await pool.query("UPDATE onboarding_tasks SET is_complete = $1 WHERE id = $2", [!!is_complete, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/status", requireRole("staff"), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["Pending", "In Progress", "Complete"].includes(status)) return res.status(400).json({ error: "Invalid status." });
    await pool.query("UPDATE onboarding SET status = $1 WHERE id = $2", [status, req.params.id]);
    await logAction(req.user.id, "update_status", "onboarding", req.params.id, { status });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
