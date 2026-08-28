const express = require("express");
const { pool } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/schools", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM schools ORDER BY code");
  res.json({ schools: rows });
});

router.get("/departments", async (req, res) => {
  const { school_code } = req.query;
  const { rows } = school_code
    ? await pool.query("SELECT * FROM departments WHERE school_code = $1 ORDER BY name", [school_code])
    : await pool.query("SELECT * FROM departments ORDER BY school_code, name");
  res.json({ departments: rows });
});

module.exports = router;
