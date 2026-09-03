const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, role, full_name, photo_url, resume_url, linkedin_url, bio FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json({ profile: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/me", async (req, res) => {
  try {
    const { photo_url, resume_url, linkedin_url, bio } = req.body || {};
    await pool.query(
      "UPDATE users SET photo_url = $1, resume_url = $2, linkedin_url = $3, bio = $4 WHERE id = $5",
      [photo_url || null, resume_url || null, linkedin_url || null, bio || null, req.user.id]
    );
    await logAction(req.user.id, "update_profile", "user", req.user.id, null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
