const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Refusing to start — see README for how to get a free Postgres connection string (Neon/Supabase)."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Schema. Real tables, real constraints, real persistence — this lives in
// Postgres, not on any local disk, so it survives restarts/redeploys and
// works on hosts (like Render's free tier) that don't offer persistent disks.
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','faculty','mentor','staff','boardDirector','boardAdvisor')),
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_number TEXT UNIQUE NOT NULL,
  school_code TEXT NOT NULL,
  program TEXT NOT NULL,
  level TEXT NOT NULL,
  term TEXT NOT NULL,
  credits_completed INTEGER DEFAULT 0,
  credits_required INTEGER DEFAULT 120,
  fee_total NUMERIC DEFAULT 0,
  fee_paid NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mentors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mentor_students (
  mentor_id INTEGER REFERENCES mentors(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (mentor_id, student_id)
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  school_code TEXT NOT NULL,
  department TEXT,
  level TEXT,
  credits INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent')),
  marked_by INTEGER REFERENCES users(id),
  marked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, course_id, date)
);

CREATE TABLE IF NOT EXISTS grades (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  score NUMERIC,
  max_score NUMERIC NOT NULL,
  entered_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, course_id, component)
);

CREATE TABLE IF NOT EXISTS fee_transactions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual_record',
  note TEXT,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internships (
  id SERIAL PRIMARY KEY,
  student_id INTEGER UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  organization TEXT,
  period TEXT,
  academic_supervisor_id INTEGER REFERENCES users(id),
  industry_supervisor TEXT,
  status TEXT DEFAULT 'Not Started',
  hours_logged INTEGER DEFAULT 0,
  hours_required INTEGER DEFAULT 300
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  interest TEXT,
  stage TEXT NOT NULL DEFAULT 'New' CHECK (stage IN ('New','Contacted','Application Sent','Admitted')),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificates_catalog (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(category, name)
);

CREATE TABLE IF NOT EXISTS communications (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_by INTEGER REFERENCES users(id),
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  raised_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Resolved')),
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_forms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id SERIAL PRIMARY KEY,
  form_id INTEGER REFERENCES custom_forms(id) ON DELETE CASCADE,
  submitted_by INTEGER REFERENCES users(id),
  data JSONB,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_materials (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  school_code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'PDF',
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_content (
  id SERIAL PRIMARY KEY,
  school_code TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('PDF','Video','Audio','Quiz')),
  file_name TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  school_code TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  school_code TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  scheduled_at TEXT,
  live_proctoring BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_submissions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  answers JSONB,
  score INTEGER,
  total INTEGER,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, course_id, term)
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  max_points NUMERIC NOT NULL DEFAULT 100,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  content TEXT,
  file_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  is_late BOOLEAN DEFAULT false,
  grade NUMERIC,
  feedback TEXT,
  graded_at TIMESTAMPTZ,
  graded_by INTEGER REFERENCES users(id),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS discussion_threads (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discussion_posts (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER REFERENCES discussion_threads(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

const CERTIFICATE_CATALOG_SEED = {
  "Business & Management": ["Business Fundamentals","Business Analytics Essentials","Project Management Professional Prep","Operations Management","Strategic Management","Entrepreneurship Fundamentals","Startup Launch & Growth","Small Business Management","Venture Capital & Fundraising Essentials","Financial Accounting Fundamentals","Corporate Finance Essentials","Financial Technology (FinTech) Foundations","Investment Management Basics","Digital Marketing Fundamentals","Sales Management Essentials","Human Resource Management Fundamentals","Talent Acquisition & Recruiting"],
  "Technology & Artificial Intelligence": ["Artificial Intelligence Fundamentals","Generative AI Applications","Prompt Engineering","Machine Learning Foundations","AI for Business Leaders","Full Stack Web Development","Cloud Computing Essentials","DevOps Fundamentals","Network & Systems Administration","Cybersecurity Fundamentals","Ethical Hacking Foundations","Digital Forensics Essentials","Cloud Security","Data Science Fundamentals","Data Analytics Essentials","Big Data Foundations","IT Systems Administration"],
  "Public Policy & Leadership": ["Public Administration Fundamentals","Government Management Essentials","Public Policy Analysis","Public Finance Fundamentals","Local Government Leadership","International Relations Foundations","Diplomacy & Protocol","International Negotiation","NGO Management Fundamentals","Disaster Risk & Emergency Management","Human Rights Foundations","Peace & Conflict Resolution","Mediation Skills","National & Global Security Foundations"],
  "Hospitality & Operations": ["Hotel Operations Management","Resort & Guest Services Management","Food & Beverage Management","Hospitality Leadership Essentials","Tourism Management Fundamentals","Airline Operations Essentials","Airport Management Fundamentals","Supply Chain Management Fundamentals","Logistics & Transportation Management","Procurement & Vendor Management","Event Management Essentials","Sports Management Fundamentals","Entertainment Management","Luxury Hospitality Service"],
  "Communication & Education": ["Digital Communication Essentials","Public Relations Fundamentals","Journalism & News Writing","Podcast Production","Content Creation & Strategy","Social Media Marketing","SEO Fundamentals","Content Marketing Strategy","Instructional Design Fundamentals","Educational Technology Essentials","AI in Education","Curriculum Development","Online Learning Design","Corporate Training & Facilitation","English for Global Professionals"],
};

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM users");
  if (rows[0].c > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  // NOTE: placeholder passwords for first-run setup only — change immediately. See README.
  await pool.query(
    "INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,$3,$4)",
    ["registrar@nationbuilderuniversity.com", hash("ChangeMe!123"), "staff", "Registrar Office"]
  );
  await pool.query(
    "INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,$3,$4)",
    ["board.director@nationbuilderuniversity.com", hash("ChangeMe!123"), "boardDirector", "Board Director"]
  );
  await pool.query(
    "INSERT INTO users (email, password_hash, role, full_name) VALUES ($1,$2,$3,$4)",
    ["board.advisor@nationbuilderuniversity.com", hash("ChangeMe!123"), "boardAdvisor", "Board Advisor"]
  );
  console.log("Seeded initial staff/board accounts. See README for default passwords — change them immediately.");
}

async function init() {
  await pool.query(SCHEMA);
  await seedIfEmpty();
  await seedCertificateCatalog();
}

async function logAction(actorId, action, entity, entityId, detail) {
  await pool.query(
    "INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)",
    [actorId, action, entity, entityId, detail ? JSON.stringify(detail) : null]
  );
}

async function notify(userId, message) {
  await pool.query("INSERT INTO notifications (user_id, message) VALUES ($1,$2)", [userId, message]);
}

async function seedCertificateCatalog() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM certificates_catalog");
  if (rows[0].c > 0) return;
  for (const [category, names] of Object.entries(CERTIFICATE_CATALOG_SEED)) {
    for (const name of names) {
      await pool.query("INSERT INTO certificates_catalog (category, name) VALUES ($1,$2) ON CONFLICT DO NOTHING", [category, name]);
    }
  }
  console.log("Seeded certificate catalog (77 certificates).");
}

module.exports = { pool, init, logAction, notify };
