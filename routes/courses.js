const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { school_code, level } = req.query;
    const base = `SELECT c.*, u.full_name AS teacher_name, s.name AS school_name, pc.code AS prerequisite_code, pc.title AS prerequisite_title
                  FROM courses c
                  LEFT JOIN users u ON u.id = c.teacher_id
                  LEFT JOIN schools s ON s.code = c.school_code
                  LEFT JOIN courses pc ON pc.id = c.prerequisite_course_id`;
    const conditions = [];
    const values = [];
    if (school_code) { values.push(school_code); conditions.push(`c.school_code = $${values.length}`); }
    if (level) { values.push(level); conditions.push(`$${values.length} = ANY(c.applicable_levels)`); }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(`${base}${where} ORDER BY c.code`, values);
    res.json({ courses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireRole("faculty", "staff"), async (req, res) => {
  const { code, title, school_code, department, level, credits, teacher_id, prerequisite_course_id, is_elective, applicable_levels, syllabus_url } = req.body || {};
  if (!code || !title || !school_code) return res.status(400).json({ error: "code, title, and school_code are required." });
  try {
    const { rows } = await pool.query(
      `INSERT INTO courses (code, title, school_code, department, level, credits, teacher_id, prerequisite_course_id, is_elective, applicable_levels, syllabus_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [code, title, school_code, department || null, level || null, credits || 3, teacher_id || null,
       prerequisite_course_id || null, !!is_elective, applicable_levels || [], syllabus_url || null]
    );
    await logAction(req.user.id, "create", "course", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id", requireRole("faculty", "staff"), async (req, res) => {
  const fields = ["title", "department", "level", "credits", "prerequisite_course_id", "is_elective", "applicable_levels", "syllabus_url"];
  const updates = []; const values = []; let i = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); values.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update." });
  values.push(req.params.id);
  try {
    await pool.query(`UPDATE courses SET ${updates.join(", ")} WHERE id = $${i}`, values);
    await logAction(req.user.id, "update", "course", req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id/teacher", requireRole("staff"), async (req, res) => {
  try {
    const { teacher_id } = req.body || {};
    await pool.query("UPDATE courses SET teacher_id = $1 WHERE id = $2", [teacher_id || null, req.params.id]);
    await logAction(req.user.id, "assign_teacher", "course", req.params.id, { teacher_id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/schedule", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM course_schedule WHERE course_id = $1 ORDER BY day_of_week, start_time", [req.params.id]);
    res.json({ schedule: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/schedule", requireRole("staff", "faculty"), async (req, res) => {
  try {
    const { day_of_week, start_time, end_time, room, term } = req.body || {};
    if (!day_of_week || !start_time || !end_time || !term) {
      return res.status(400).json({ error: "day_of_week, start_time, end_time, and term are required." });
    }
    const { rows } = await pool.query(
      "INSERT INTO course_schedule (course_id, day_of_week, start_time, end_time, room, term, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [req.params.id, day_of_week, start_time, end_time, room || null, term, req.user.id]
    );
    await logAction(req.user.id, "add_schedule", "course_schedule", rows[0].id, req.body);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/schedule/:scheduleId", requireRole("staff", "faculty"), async (req, res) => {
  try {
    await pool.query("DELETE FROM course_schedule WHERE id = $1", [req.params.scheduleId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/timetable/all", async (req, res) => {
  try {
    const { school_code } = req.query;
    const base = `SELECT cs.*, c.code, c.title, c.school_code, s.name AS school_name
                  FROM course_schedule cs
                  JOIN courses c ON c.id = cs.course_id
                  LEFT JOIN schools s ON s.code = c.school_code`;
    const { rows } = school_code
      ? await pool.query(`${base} WHERE c.school_code = $1 ORDER BY cs.day_of_week, cs.start_time`, [school_code])
      : await pool.query(`${base} ORDER BY cs.day_of_week, cs.start_time`);
    res.json({ schedule: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
