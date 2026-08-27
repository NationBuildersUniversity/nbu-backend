const express = require("express");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ---- Course content (PDF/Video/Audio) ----
router.get("/content", async (req, res) => {
  const { school_code } = req.query;
  const { rows } = school_code
    ? await pool.query("SELECT * FROM course_content WHERE school_code = $1 ORDER BY created_at DESC", [school_code])
    : await pool.query("SELECT * FROM course_content ORDER BY created_at DESC");
  res.json({ content: rows });
});
router.post("/content", requireRole("faculty", "staff"), async (req, res) => {
  const { school_code, title, type, file_name, external_url } = req.body || {};
  if (!school_code || !title || !type) return res.status(400).json({ error: "school_code, title, and type are required." });
  const { rows } = await pool.query(
    "INSERT INTO course_content (school_code, title, type, file_name, uploaded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [school_code, title, type, external_url || file_name || null, req.user.id]
  );
  await logAction(req.user.id, "upload", "course_content", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

// ---- Quizzes (question bank per school, feeds Exams below) ----
router.get("/quizzes", async (req, res) => {
  const { school_code } = req.query;
  const { rows } = school_code
    ? await pool.query("SELECT * FROM quizzes WHERE school_code = $1 ORDER BY created_at", [school_code])
    : await pool.query("SELECT * FROM quizzes ORDER BY created_at");
  res.json({ quizzes: rows });
});
router.post("/quizzes", requireRole("faculty", "staff"), async (req, res) => {
  const { school_code, question, options, correct_index } = req.body || {};
  if (!school_code || !question || !Array.isArray(options) || correct_index === undefined) {
    return res.status(400).json({ error: "school_code, question, options[], and correct_index are required." });
  }
  const { rows } = await pool.query(
    "INSERT INTO quizzes (school_code, question, options, correct_index, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [school_code, question, JSON.stringify(options), correct_index, req.user.id]
  );
  await logAction(req.user.id, "create", "quiz", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

// ---- Exams (scheduled, draw questions from the quiz bank for their school) ----
router.get("/exams", async (req, res) => {
  const { school_code } = req.query;
  const { rows } = school_code
    ? await pool.query("SELECT * FROM exams WHERE school_code = $1 ORDER BY created_at DESC", [school_code])
    : await pool.query("SELECT * FROM exams ORDER BY created_at DESC");
  res.json({ exams: rows });
});
router.post("/exams", requireRole("faculty", "staff"), async (req, res) => {
  const { school_code, title, duration_minutes, scheduled_at, live_proctoring } = req.body || {};
  if (!school_code || !title) return res.status(400).json({ error: "school_code and title are required." });
  const { rows } = await pool.query(
    "INSERT INTO exams (school_code, title, duration_minutes, scheduled_at, live_proctoring, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [school_code, title, duration_minutes || 60, scheduled_at || null, live_proctoring !== false, req.user.id]
  );
  await logAction(req.user.id, "schedule", "exam", rows[0].id, req.body);
  res.status(201).json({ id: rows[0].id });
});

// Student submits real answers; server grades against the real quiz bank — no client-side trust.
router.post("/exams/:id/submit", async (req, res) => {
  const examId = Number(req.params.id);
  const { student_id, answers } = req.body || {}; // answers: { [quizId]: chosenIndex }
  if (!student_id || !answers) return res.status(400).json({ error: "student_id and answers are required." });

  const { rows: examRows } = await pool.query("SELECT * FROM exams WHERE id = $1", [examId]);
  const exam = examRows[0];
  if (!exam) return res.status(404).json({ error: "Exam not found." });

  const { rows: questions } = await pool.query("SELECT * FROM quizzes WHERE school_code = $1", [exam.school_code]);
  let score = 0;
  for (const q of questions) {
    if (answers[q.id] !== undefined && Number(answers[q.id]) === q.correct_index) score++;
  }

  const { rows } = await pool.query(
    `INSERT INTO exam_submissions (exam_id, student_id, answers, score, total) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (exam_id, student_id) DO UPDATE SET answers = EXCLUDED.answers, score = EXCLUDED.score, total = EXCLUDED.total, submitted_at = now()
     RETURNING id`,
    [examId, student_id, JSON.stringify(answers), score, questions.length]
  );
  await logAction(student_id, "submit_exam", "exam_submission", rows[0].id, { examId, score, total: questions.length });
  res.status(201).json({ id: rows[0].id, score, total: questions.length });
});

router.get("/exams/:id/submissions", requireRole("faculty", "staff"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT es.*, u.full_name FROM exam_submissions es
     JOIN students s ON s.id = es.student_id JOIN users u ON u.id = s.user_id
     WHERE es.exam_id = $1`,
    [req.params.id]
  );
  res.json({ submissions: rows });
});

module.exports = router;
