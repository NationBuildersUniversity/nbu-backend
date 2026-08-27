# NBU Backend — Real Auth + Database API

Real password hashing (bcrypt), real signed sessions (JWT), a real Postgres database, and
server-side role enforcement that cannot be bypassed by editing frontend code. Tested end-to-end
against a live Postgres instance in the same session this was built — see "What's been tested" below.

## What changed from the first version

The first version used SQLite with a local file. That was switched to Postgres because
**Render's free tier does not include persistent disk storage** — a SQLite file would have been
wiped on restarts there. Postgres (hosted separately, e.g. on Neon's free tier) solves this
properly and is the standard pattern for real deployments anyway.

## What this is NOT yet

- **Not connected to the HTML prototype yet.** `nbu-full-platform-v9.html` still uses local
  browser state. Wiring the frontend to call these real API endpoints instead is the next task.
- **Not processing real payments.** `POST /api/fees/checkout` deliberately returns `501` — see "Payments" below.
- **Not deployed anywhere public yet.** Tested locally against a real Postgres instance in this session only.

## Quick start (local development)

You need a Postgres database to point this at — either install Postgres locally, or (recommended,
matches production) create a free one at neon.com or supabase.com in under two minutes and copy
its connection string.

```bash
npm install
cp .env.example .env       # then fill in DATABASE_URL and a long random JWT_SECRET
npm start
```

First run auto-creates all tables and seeds three accounts:

| Email | Password | Role |
|---|---|---|
| registrar@nationbuilderuniversity.com | ChangeMe!123 | staff |
| board.director@nationbuilderuniversity.com | ChangeMe!123 | boardDirector |
| board.advisor@nationbuilderuniversity.com | ChangeMe!123 | boardAdvisor |

**Change these passwords immediately** — create real accounts via `POST /api/users` (as staff),
then update or remove the seeded ones directly in the database.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes — server refuses to start without it | Postgres connection string, e.g. `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Yes — server refuses to start without it | Signs session tokens. Long random string, different per environment. |
| `PORT` | No (default 4000) | Port the API listens on |
| `CORS_ORIGIN` | No (default `*`) | Set to your real frontend origin (e.g. `https://portal.nationbuilderuniversity.com`) once deployed |

## What's been tested (this session, live, against real Postgres)

- Staff login with correct password succeeds; wrong password is rejected
- Public self-registration creates **student**-role accounts only
- Staff created a real student record; that same student attempting a staff-only action was
  correctly blocked with a 403, enforced server-side
- **Killed the server process and started a brand new one against the same database** — the
  student record and audit log were both still there
- Every privileged action was written to `audit_log` with who did it and when

## Deploying for free: Neon (database) + Render (server)

```
Step 1 — Create the database
  1. Go to neon.com, sign up free
  2. Create a new project — Neon gives you a connection string immediately
  3. Copy it — this is your DATABASE_URL

Step 2 — Push this code to GitHub
  1. Create a new repository on github.com
  2. From this folder: git init, git add ., git commit -m "NBU backend"
  3. git remote add origin <your-repo-url>, git push -u origin main

Step 3 — Deploy on Render
  1. Go to render.com, sign up free, connect your GitHub account
  2. New > Web Service > select your nbu-backend repo
  3. Environment: Node
  4. Build command: npm install
  5. Start command: npm start
  6. Under Environment Variables, add DATABASE_URL (from Neon) and JWT_SECRET (generate a random
     long string — e.g. run `openssl rand -hex 32` locally)
  7. Deploy — Render gives you a URL like https://nbu-backend.onrender.com

Note: Render's free tier spins the service down after 15 minutes of no traffic, and the next
request takes 30-60 seconds to wake it back up. Fine for testing; consider a paid tier once
real students depend on this being responsive.
```

## API surface implemented so far

`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
`POST /api/users`, `GET /api/users` (staff/board only)
`GET/POST/PATCH /api/students`
`POST /api/attendance`, `GET /api/attendance/student/:id`
`POST /api/grades`, `GET /api/grades/student/:id`
`GET /api/fees/student/:id`, `POST /api/fees/transactions`, `POST /api/fees/checkout` (stub)
`GET/PATCH /api/internships`
`GET/POST /api/mentors`, `POST /api/mentors/:mentorId/students/:studentId`
`GET /api/stats` (staff/board — real aggregate counts)
`GET/POST/PATCH /api/leads`
`GET /api/certificates` (77-item catalog, seeded automatically)
`GET/POST /api/communications`
`GET/POST /api/tickets`, `PATCH /api/tickets/:id/resolve`
`GET/POST /api/forms`, `POST /api/forms/:id/submit`
`GET/POST /api/resources/materials`, `GET/POST /api/resources/events`
`GET/POST /api/academics/content`, `GET/POST /api/academics/quizzes`
`GET/POST /api/academics/exams`, `POST /api/academics/exams/:id/submit` (server-side grading — the client never computes or sends its own score), `GET /api/academics/exams/:id/submissions`

Everything from the earlier list is now a real, tested endpoint. ID Cards needed no new endpoint — it's a real-data rendering of the existing `/api/students` roster.

## Payments — what's actually required before `/api/fees/checkout` can work

This is not a coding gap, it's a business/legal one:

1. NBU needs its own account with a real payment processor (Stripe is the standard choice for a
   US-based institution) — requires business verification and bank details only NBU can provide.
2. Once that exists, its API keys go into environment variables (never in code) and the checkout
   route gets built against Stripe's actual API.
3. **Resolve the HELC/OSSE licensure status before accepting real tuition payments from real
   students** — see the Engineering Handoff doc for why this matters. This is independent of
   anything technical.
