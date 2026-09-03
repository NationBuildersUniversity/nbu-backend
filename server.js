require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { init } = require("./db/init");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, service: "nbu-backend" }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/students", require("./routes/students"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/grades", require("./routes/grades"));
app.use("/api/fees", require("./routes/fees"));
app.use("/api/internships", require("./routes/internships"));
app.use("/api/mentors", require("./routes/mentors"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/leads", require("./routes/leads"));
app.use("/api/certificates", require("./routes/certificates"));
app.use("/api/communications", require("./routes/comms"));
app.use("/api/tickets", require("./routes/tickets"));
app.use("/api/forms", require("./routes/forms"));
app.use("/api/resources", require("./routes/resources"));
app.use("/api/academics", require("./routes/content"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/enrollments", require("./routes/enrollments"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/discussions", require("./routes/discussions"));
app.use("/api/sessions", require("./routes/sessions"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/audit-log", require("./routes/auditlog"));
app.use("/api/export", require("./routes/export"));
app.use("/api/catalog", require("./routes/catalog"));
app.use("/api/careers", require("./routes/careers"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/tasks", require("./routes/tasks"));
app.use("/api/onboarding", require("./routes/onboarding"));
app.use("/api/accounting", require("./routes/accounting"));
app.use("/api/verify", require("./routes/verify"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server stayed up):", reason);
});

const PORT = process.env.PORT || 4000;

init()
  .then(() => {
    app.listen(PORT, () => console.log(`NBU backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database — server did not start:", err);
    process.exit(1);
  });
