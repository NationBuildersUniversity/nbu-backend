const express = require("express");
const PDFDocument = require("pdfkit");
const { pool, logAction } = require("../db/init");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const INK = "#12233F";
const BRASS = "#A6772C";
const BRASS_LIGHT = "#C9A464";
const SLATE = "#55606E";

const ROLE_LABELS = {
  student: "STUDENT", faculty: "FACULTY", mentor: "MENTOR", staff: "STAFF",
  boardDirector: "BOARD OF DIRECTORS", boardAdvisor: "BOARD OF ADVISORS",
  hr: "HUMAN RESOURCES", accounting: "ACCOUNTING", marketing: "MARKETING",
};

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? require("https") : require("http");
    const req = lib.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.setTimeout(4000, () => { req.destroy(new Error("Template image fetch timed out")); });
  });
}

router.get("/id-card-template/:role", requireAuth, requireRole("staff"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM id_card_templates WHERE role = $1", [req.params.role]);
  res.json({ template: rows[0] || null });
});

router.put("/id-card-template/:role", requireAuth, requireRole("staff"), async (req, res) => {
  const { front_image_url, back_image_url } = req.body || {};
  await pool.query(
    `INSERT INTO id_card_templates (role, front_image_url, back_image_url, updated_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (role) DO UPDATE SET front_image_url = $2, back_image_url = $3, updated_by = $4, updated_at = now()`,
    [req.params.role, front_image_url || null, back_image_url || null, req.user.id]
  );
  await logAction(req.user.id, "set_id_card_template", "id_card_template", null, req.body);
  res.json({ ok: true });
});

router.get("/id-card", requireAuth, async (req, res) => {
  const { role, full_name, id } = req.user;
  let idNumber = `NBU-${String(id).padStart(4, "0")}`;
  let lines = [];
  let roleLabel = ROLE_LABELS[role] || role.toUpperCase();

  if (role === "student") {
    const { rows } = await pool.query("SELECT * FROM students WHERE user_id = $1", [req.user.id]);
    const s = rows[0];
    if (s) { idNumber = s.student_number; lines = [s.program, `${s.level} · ${s.term}`]; }
    else lines = ["No academic record on file"];
  } else {
    lines = [roleLabel, "Nation Builders University"];
  }

  const { rows: tRows } = await pool.query("SELECT * FROM id_card_templates WHERE role = $1", [role]);
  const template = tRows[0];

  const doc = new PDFDocument({ size: [340, 220], margin: 0 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="NBU_ID_${idNumber}.pdf"`);
  doc.pipe(res);

  if (template && template.front_image_url) {
    try {
      const bg = await fetchImageBuffer(template.front_image_url);
      doc.image(bg, 0, 0, { width: 340, height: 220 });
    } catch (e) {
      doc.rect(0, 0, 340, 220).fill("#EFEAE0");
    }
    doc.fontSize(11).font("Helvetica-Bold").fillColor(INK).text(full_name, 16, 150, { width: 300 });
    doc.fontSize(9).font("Helvetica").fillColor(INK).text(idNumber, 16, 166);
    doc.fontSize(8).fillColor(INK).text(lines.join(" · "), 16, 180, { width: 300 });
  } else {
    doc.rect(0, 0, 340, 220).fill("#F6F3EC");
    doc.fontSize(10).fillColor(SLATE).text("No ID card template uploaded yet for this role.", 20, 20, { width: 300 });
    doc.fontSize(13).font("Helvetica-Bold").fillColor(INK).text(full_name, 20, 60);
    doc.fontSize(10).font("Helvetica").fillColor(INK).text(idNumber, 20, 80);
    doc.fontSize(9).fillColor(INK).text(lines.join(" · "), 20, 96, { width: 300 });
    doc.fontSize(8).fillColor(SLATE).text("Nation Builders University", 20, 190);
  }

  doc.end();
});

router.get("/admission-form", async (req, res) => {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="NBU_Admission_Form_2026-2027.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font("Helvetica-Bold").fillColor(INK).text("Nation Builders University", 40, 35);
  doc.fontSize(9).font("Helvetica").fillColor(SLATE)
    .text("1500 K Street NW, Washington, DC, USA", 40, 58)
    .text("Email: info@nationbuilderuniversity.com  ·  Phone: (771) 241-9259", 40, 70);

  doc.moveDown(3);
  let y = 110;
  doc.rect(40, y, 515, 20).fill(BRASS);
  doc.fillColor("#fff").fontSize(12).font("Helvetica-Bold").text("ADMISSION FORM — 2026-2027", 40, y + 4, { width: 515, align: "center" });
  y += 34;

  function section(title) {
    doc.rect(40, y, 515, 16).fill("#EFEAE0");
    doc.fillColor(INK).fontSize(10).font("Helvetica-Bold").text(title, 46, y + 3);
    y += 24;
  }
  function field(label, xOff = 40, width = 240) {
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(INK).text(label, xOff, y, { width });
    doc.moveTo(xOff, y + 13).lineTo(xOff + width - 10, y + 13).strokeColor("#ccc").stroke();
  }
  function row(labelA, labelB) {
    field(labelA, 40, 245);
    field(labelB, 300, 255);
    y += 22;
  }

  section("ADMISSION DETAILS");
  row("Admission No.", "Admission Date");
  row("Registration No.", "Enrollment No.");
  row("Program / Track", "Admission Type");
  row("Roll No.", "Medium");

  section("PERSONAL DETAILS");
  row("Student Name", "Gender");
  row("Date of Birth", "Nationality");
  row("Mobile No.", "Email");
  row("WhatsApp No.", "Alternate No.");
  row("Address", "Blood Group");

  section("FAMILY DETAILS");
  row("Father's Name", "Father's Occupation");
  row("Mother's Name", "Mother's Occupation");
  row("Guardian's Name (if applicable)", "Guardian's Contact");

  section("PREVIOUS ACADEMIC DETAILS");
  row("Attended Institution", "Last Program/Class");
  row("Enrolled Session", "Enrolled Year");

  if (y > 650) { doc.addPage(); y = 40; }
  section("DECLARATION & SIGNATURE");
  doc.fontSize(8.5).font("Helvetica").fillColor(SLATE)
    .text("I hereby certify that the above information is true and correct to the best of my knowledge.", 40, y, { width: 515 });
  y += 40;
  doc.moveTo(40, y).lineTo(220, y).strokeColor("#ccc").stroke();
  doc.moveTo(320, y).lineTo(500, y).strokeColor("#ccc").stroke();
  doc.fontSize(8).text("Applicant Signature", 40, y + 4);
  doc.fontSize(8).text("Date", 320, y + 4);

  doc.fontSize(7.5).fillColor(SLATE).text(
    "For inquiries: admissions@nationbuilderuniversity.com · This is an application form only — submission does not guarantee admission.",
    40, 780, { width: 515, align: "center" }
  );

  doc.end();
});

module.exports = router;
  
 
