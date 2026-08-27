const express = require("express");
const { pool } = require("../db/init");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Reference catalog — readable by anyone logged in.
router.get("/", async (req, res) => {
  const { category } = req.query;
  const { rows } = category
    ? await pool.query("SELECT * FROM certificates_catalog WHERE category = $1 ORDER BY name", [category])
    : await pool.query("SELECT * FROM certificates_catalog ORDER BY category, name");
  res.json({ certificates: rows });
});

module.exports = router;
