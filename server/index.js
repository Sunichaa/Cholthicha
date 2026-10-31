const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const multer = require("multer");

/* =====================================================================
 *  1. การตั้งค่าเริ่มต้น
 * ===================================================================== */

// โหลดค่าจากไฟล์ .env เอง (ไม่ใช้ dotenv เพื่อไม่ต้องเพิ่ม dependency)
// อ่านบรรทัดแบบ KEY=VALUE, ข้ามบรรทัดว่าง/คอมเมนต์ (#) และไม่ทับค่าที่ตั้งไว้แล้วใน process.env
(function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const app = express();
app.use(cors());
app.use(express.json());

// ใช้ connection pool เพื่อให้ transaction (เช่น การลงทะเบียนกิจกรรมที่ล็อกแถวด้วย FOR UPDATE)
// ทำงานถูกต้องเมื่อมีหลาย request พร้อมกัน — แต่ละ transaction ต้องได้ connection เป็นของตัวเอง
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "volunteer",
  password: process.env.DB_PASSWORD ,
  database: process.env.DB_NAME || "volunteer",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.query("SELECT 1", (err) => {
  if (err) {
    console.error("MySQL connect error:", err.message);
    return;
  }
  console.log("Connected to MySQL: volunteer");
});

/* =====================================================================
 *  2. ค่าคงที่และฟังก์ชันช่วย
 * ===================================================================== */

// เงื่อนไข SQL: กิจกรรมที่นับในกราฟแดชบอร์ดของแอดมิน/ผู้จัด — ต้องไม่ถูกยกเลิก
// (Activity_suspend_status ว่าง) และไม่ถูกปฏิเสธ (Approval_status <> 'Rejected')
// ใช้กับตาราง activity ที่ตั้ง alias เป็น `a`
const COUNTED_ACTIVITY_SQL =
  "(a.Activity_suspend_status IS NULL OR a.Activity_suspend_status = '') AND (a.Approval_status IS NULL OR a.Approval_status <> 'Rejected')";

// ชื่อเดือนภาษาไทยแบบย่อ แปลงจากผลของ DATE_FORMAT(..., '%b') ของ MySQL
const TH = {
  Jan: "ม.ค.",
  Feb: "ก.พ.",
  Mar: "มี.ค.",
  Apr: "เม.ย.",
  May: "พ.ค.",
  Jun: "มิ.ย.",
  Jul: "ก.ค.",
  Aug: "ส.ค.",
  Sep: "ก.ย.",
  Oct: "ต.ค.",
  Nov: "พ.ย.",
  Dec: "ธ.ค.",
};

// เรียงชื่อจังหวัด/อำเภอ/ตำบลตามพจนานุกรมไทย — ORDER BY ใน MySQL เรียงตามรหัส Unicode
// ทำให้คำที่ขึ้นต้นด้วยสระหน้า (เ แ โ ใ ไ) หลุดไปอยู่ท้ายสุดเสมอ จึงเรียงในฝั่ง JS แทน
const thCollator = new Intl.Collator("th");

// วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาเครื่อง server
// ใช้เทียบกับวันที่จากฟอร์มซึ่งเป็น string รูปแบบเดียวกัน (เทียบ string ได้ตรงตามลำดับวันที่)
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// แปลงตัวกรองช่วงเวลาของแดชบอร์ดเป็นช่วงวันที่ { from, to } (รูปแบบ YYYY-MM-DD, รวมวันแรกและวันสุดท้าย)
//   ?date=YYYY-MM-DD   สัปดาห์ (จันทร์-อาทิตย์) ที่มีวันนั้นอยู่
//   ?year&half=1|2     ครึ่งปีแรก (ม.ค.-มิ.ย.) / ครึ่งปีหลัง (ก.ค.-ธ.ค.)
//   ?year&month        ทั้งเดือน
//   ?year              ทั้งปี
//   ไม่ส่งอะไร          คืน null (ไม่กรอง)
function resolveDateRange(q) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
    const d = new Date(`${q.date}T00:00:00Z`);
    if (!isNaN(d)) {
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return { from: fmt(monday), to: fmt(sunday), monday };
    }
  }
  const year = parseInt(q.year, 10) || null;
  if (!year) return null;
  const half = parseInt(q.half, 10) || null;
  const month = parseInt(q.month, 10) || null;
  if (half === 1 || half === 2) {
    return half === 1
      ? { from: `${year}-01-01`, to: `${year}-06-30`, firstMonth: 1 }
      : { from: `${year}-07-01`, to: `${year}-12-31`, firstMonth: 7 };
  }
  if (month) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      from: `${year}-${pad(month)}-01`,
      to: `${year}-${pad(month)}-${pad(last)}`,
    };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

// แปลงค่าจากฟอร์มก่อนบันทึกลง DB: ค่าว่าง / "undefined" -> null
const toNull = (val) =>
  val && String(val).trim() !== "" && val !== "undefined" ? val : null;

// แปลงเป็นจำนวนเต็มบวก ถ้าไม่ใช่ตัวเลขหรือ <= 0 -> null
const toIntNull = (val) => {
  const num = parseInt(val, 10);
  return isNaN(num) || num <= 0 ? null : num;
};

// ตรวจข้อมูลฟอร์มกิจกรรม (ใช้ทั้งตอนสร้างและแก้ไข) คืนข้อความ error หรือ null ถ้าผ่าน
// - ส่งอนุมัติ (Pending) ต้องกรอกช่องที่จำเป็นครบ ส่วนบันทึกร่างไม่บังคับ
// - เงื่อนไขวันที่เช็กเฉพาะช่องที่มีค่า (ตรวจซ้ำกับฝั่งหน้าเว็บ กันการยิง API ตรง)
function validateActivityInput(body, targetStatus) {
  const {
    activity_name,
    location,
    category_id,
    reg_start,
    reg_end,
    activity_start,
    activity_end,
    capacity,
    description,
  } = body;

  if (targetStatus === "Pending") {
    if (
      !activity_name ||
      !location ||
      !category_id ||
      !reg_start ||
      !reg_end ||
      !activity_start ||
      !activity_end ||
      !capacity ||
      !description
    ) {
      return "กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วนก่อนส่งอนุมัติ";
    }
  }
  if (reg_start && reg_start < todayStr()) {
    return "วันเปิดรับสมัครต้องไม่ใช่วันที่ผ่านมาแล้ว";
  }
  if (reg_start && reg_end && reg_end < reg_start) {
    return "วันปิดรับสมัครต้องเป็นวันเดียวกับ หรือหลังวันเปิดรับสมัคร";
  }
  if (reg_end && activity_start && activity_start <= reg_end) {
    return "วันที่จัดกิจกรรมต้องเป็นวันหลังวันปิดรับสมัคร";
  }
  if (activity_start && activity_end && activity_end < activity_start) {
    return "วันสิ้นสุดกิจกรรมต้องไม่น้อยกว่าวันที่จัดกิจกรรม";
  }
  return null;
}

/* =====================================================================
 *  3. การยืนยันตัวตนและสิทธิ์
 *     token แบบง่าย: base64url(payload).HMAC-SHA256 — ไม่ใช้ไลบรารีเพิ่ม
 * ===================================================================== */

const AUTH_SECRET =
  process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // อายุ token 7 วัน

// ออก token ที่มี payload { id, role } พร้อมวันหมดอายุ
function signToken(payload) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

// ตรวจลายเซ็นและวันหมดอายุของ token คืน payload หรือ null ถ้าไม่ถูกต้อง
function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expectedSig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");
  if (
    sig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ต้องแนบ header Authorization: Bearer <token> ที่ถูกต้อง แล้วเก็บ payload ไว้ที่ req.auth
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res
      .status(401)
      .json({ success: false, message: "กรุณาเข้าสู่ระบบ" });
  }
  req.auth = payload; // { id, role, exp }
  next();
}

// ตรวจว่า role ตรงตามที่กำหนด (ต้องใช้หลัง requireAuth เสมอ)
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.auth || !allowed.includes(req.auth.role)) {
      return res
        .status(403)
        .json({ success: false, message: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้" });
    }
    next();
  };
}

// ตรวจว่า :paramName ใน URL ตรงกับผู้ที่ login อยู่ (แอดมินผ่านได้เสมอ)
function requireSelfParam(paramName) {
  return (req, res, next) => {
    if (req.auth.role === "admin") return next();
    if (String(req.auth.id) !== String(req.params[paramName])) {
      return res
        .status(403)
        .json({ success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
    }
    next();
  };
}

// ตรวจว่ากิจกรรม (Activity_id) เป็นของผู้จัดที่ login อยู่ (แอดมินผ่านได้เสมอ)
function requireOwnActivity(getActivityId) {
  return (req, res, next) => {
    if (req.auth.role === "admin") return next();
    const activityId = getActivityId(req);
    db.query(
      "SELECT Member_id FROM activity WHERE Activity_id = ?",
      [activityId],
      (err, rows) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        if (!rows.length)
          return res
            .status(404)
            .json({ success: false, message: "ไม่พบกิจกรรม" });
        if (String(rows[0].Member_id) !== String(req.auth.id)) {
          return res
            .status(403)
            .json({
              success: false,
              message: "คุณไม่มีสิทธิ์จัดการกิจกรรมนี้",
            });
        }
        next();
      },
    );
  };
}

// ตรวจว่าการลงทะเบียน (Registration_id) อยู่ในกิจกรรมของผู้จัดที่ login อยู่ (แอดมินผ่านได้เสมอ)
function requireOwnRegistration(getRegistrationId) {
  return (req, res, next) => {
    if (req.auth.role === "admin") return next();
    const regId = getRegistrationId(req);
    db.query(
      `SELECT a.Member_id FROM registration r
       JOIN activity a ON r.Activity_id = a.Activity_id
       WHERE r.Registration_id = ?`,
      [regId],
      (err, rows) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        if (!rows.length)
          return res
            .status(404)
            .json({ success: false, message: "ไม่พบการลงทะเบียน" });
        if (String(rows[0].Member_id) !== String(req.auth.id)) {
          return res
            .status(403)
            .json({ success: false, message: "คุณไม่มีสิทธิ์จัดการรายการนี้" });
        }
        next();
      },
    );
  };
}

// ตรวจสิทธิ์เข้าห้องแชต (ใช้กับ API ดึงข้อความและส่งข้อความ)
//   getRegistrationId  ฟังก์ชันบอกว่าจะอ่านรหัสห้อง (Registration_id) จากตรงไหนของ request
// ขั้นตอน:
//   1. แอดมิน -> ผ่านเสมอ
//   2. ไม่มี Registration_id -> ปล่อยให้ endpoint จัดการเอง (เช่น คืนรายการข้อความว่าง)
//   3. ดึงผู้สมัคร (participant) และผู้จัด (organizer) ของห้องนี้จากตาราง registration + activity
//   4. ผู้ที่ login ไม่ใช่ทั้งสองคน -> 403 ไม่มีสิทธิ์ (กันแอบอ่าน/ส่งข้อความในห้องของคนอื่น)
//   5. กิจกรรมถูกยกเลิกแล้ว -> 403 พร้อม closed: true (ห้องแชตถูกปิด ทั้งอ่านและส่ง)
function requireChatParticipant(getRegistrationId) {
  return (req, res, next) => {
    // 1. แอดมินผ่านได้เสมอ
    if (req.auth.role === "admin") return next();
    // 2. ยังไม่มีรหัสห้อง
    const regId = getRegistrationId(req);
    if (!regId) return next(); // ห้องที่ยังไม่มี registration_id ให้ endpoint จัดการเอง
    // 3. ดึงคู่สนทนาทั้งสองฝั่งของห้องนี้
    db.query(
      `SELECT r.Member_id AS participant_id, a.Member_id AS organizer_id, a.Activity_suspend_status
       FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
       WHERE r.Registration_id = ?`,
      [regId],
      (err, rows) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        if (!rows.length)
          return res
            .status(404)
            .json({ success: false, message: "ไม่พบการลงทะเบียน" });
        // 4. ต้องเป็นผู้สมัคร หรือผู้จัดของห้องนี้เท่านั้น
        const { participant_id, organizer_id } = rows[0];
        if (
          String(req.auth.id) !== String(participant_id) &&
          String(req.auth.id) !== String(organizer_id)
        ) {
          return res
            .status(403)
            .json({
              success: false,
              message: "คุณไม่มีสิทธิ์เข้าถึงห้องแชตนี้",
            });
        }
        // 5. กิจกรรมถูกยกเลิก -> ปิดห้องแชต (หน้าเว็บเช็ก closed: true แล้วแสดงข้อความแจ้ง)
        if (rows[0].Activity_suspend_status) {
          return res
            .status(403)
            .json({
              success: false,
              closed: true,
              message: "กิจกรรมนี้ถูกยกเลิกแล้ว ห้องแชตถูกปิด",
            });
        }
        next();
      },
    );
  };
}

// บังคับ login และตรวจ role สำหรับทุก route ใต้ path เหล่านี้
// ต้องประกาศก่อน route ทั้งหมด เพราะ Express รัน middleware ตามลำดับที่ประกาศ
app.use("/api/admin", requireAuth, requireRole(["admin"]));
app.use("/api/organizer", requireAuth, requireRole(["organizer", "admin"]));
app.use("/api/profile", requireAuth);

/* =====================================================================
 *  4. อัปโหลดไฟล์
 * ===================================================================== */

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `img_${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // สูงสุด 5 MB
});

// เปิดให้เข้าถึงไฟล์ที่อัปโหลดผ่าน /uploads/<ชื่อไฟล์>
app.use("/uploads", express.static(uploadDir));

// รับไฟล์รูป (field "image") แล้วคืน URL สำหรับนำไปบันทึกในกิจกรรม
app.post("/api/upload/image", upload.single("image"), (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: "ไม่พบไฟล์" });
  res.json({
    success: true,
    url: `http://localhost:5000/uploads/${req.file.filename}`,
  });
});

/* =====================================================================
 *  5. แจ้งเตือนทางอีเมล (Google Apps Script webhook)
 *
 *  server ไม่ได้ส่งอีเมลเอง แต่ส่งข้อมูล (JSON) ไปให้ Google Apps Script ส่งแทน
 *  ด้วยบัญชี Gmail ของเจ้าของสคริปต์ (MailApp.sendEmail)
 *  ซอร์สของสคริปต์อยู่ที่ server/gas/cancel-notify.gs — deploy เป็น Web app แล้วนำ URL
 *  (ลงท้าย /exec) ไปใส่ใน server/.env ที่คีย์ GAS_CANCEL_NOTIFY_URL
 *
 *  ── อีเมลที่ระบบส่ง ──────────────────────────────────────────────
 *   ฟังก์ชัน                                  ส่งเมื่อ                       ผู้รับ              type
 *   notifyAdminNewActivitySubmission         ผู้จัดส่งกิจกรรมขออนุมัติ          แอดมิน (1 คน)       new_activity
 *   notifyOrganizerActivityDecision          แอดมินกดอนุมัติ                ผู้จัดกิจกรรม         approved
 *   notifyOrganizerActivityDecision          แอดมินกดไม่อนุมัติ (+ เหตุผล)      ผู้จัดกิจกรรม         rejected
 *   notifyActivityCancellation               ยกเลิกกิจกรรม (ผู้จัดหรือแอดมิน)   ผู้สมัครทุกคน        cancel
 *   notifyOrganizerActivityCancelledByAdmin  แอดมินเป็นคนยกเลิกกิจกรรม        ผู้จัดกิจกรรม         cancelled_by_admin
 *
 *  (อีเมล OTP ตอนสมัครสมาชิกไม่ได้ส่งจากที่นี่ — หน้าเว็บส่งตรงไปที่ Apps Script อีกตัว
 *   ดู src/components/AuthModal.jsx ที่ GAS_WEB_APP_URL)
 *
 *  ── ขั้นตอนการส่ง (ทุกฟังก์ชันใช้รูปแบบเดียวกัน) ──────────────────────
 *   1. isGasConfigured()   เช็กว่าตั้งค่า URL แล้ว ถ้ายังไม่ตั้ง -> เตือนใน console แล้วไม่ส่ง
 *   2. db.query(...)       ดึงอีเมลและชื่อผู้รับจากฐานข้อมูล (ข้ามคนที่ไม่มีอีเมล)
 *   3. postGasNotify()     POST ข้อมูล { type, activity_name, reason, recipients } ไปที่ Apps Script
 *   4. interpretGasNotifyResult()  อ่านผลตอบกลับ แล้ว log ว่าสำเร็จ/ไม่สำเร็จ
 *
 *  ทุกฟังก์ชันทำงานเบื้องหลัง (fire-and-forget): ถูกเรียกหลัง res.json() ส่งคำตอบไปแล้ว
 *  จึงไม่ทำให้ผู้ใช้ต้องรอ และถ้าส่งอีเมลไม่สำเร็จ การทำรายการหลัก (อนุมัติ/ยกเลิก ฯลฯ) ก็ยังสำเร็จ
 * ===================================================================== */

// URL ของ Apps Script ที่ใช้ส่งอีเมลแจ้งเตือน (อ่านจาก server/.env) — ว่าง = ปิดการส่งอีเมล
const GAS_CANCEL_NOTIFY_URL = process.env.GAS_CANCEL_NOTIFY_URL || "";

// อีเมลแอดมินที่รับแจ้งเตือนเมื่อมีกิจกรรมใหม่ส่งขออนุมัติ
const NEW_ACTIVITY_NOTIFY_EMAIL = "sssummer.keall@gmail.com";

// [ขั้นที่ 1] คืน true ถ้าตั้งค่า webhook แล้ว ถ้ายังไม่ตั้งจะเตือนใน console
// purpose = ข้อความบอกว่ากำลังจะส่งอีเมลเรื่องอะไร (ใช้ใน log)
function isGasConfigured(purpose) {
  if (GAS_CANCEL_NOTIFY_URL) return true;
  console.warn(
    `ยังไม่ได้ตั้งค่า GAS_CANCEL_NOTIFY_URL จึงไม่ส่งอีเมล${purpose}`,
  );
  return false;
}

// [ขั้นที่ 4] ตีความผลตอบกลับจาก webhook:
//   "ok"      Apps Script ตอบ SUCCESS
//   "error"   Apps Script ตอบ ERROR (เช่น ไม่พบผู้รับ)
//   "unknown" parse JSON ไม่ได้ — Apps Script จะ redirect ไปหน้า echo ที่ client ฝั่ง Node
//             อ่านไม่ได้ แม้อีเมลจะถูกส่งสำเร็จแล้ว จึงไม่ถือว่าล้มเหลว
async function interpretGasNotifyResult(res) {
  const result = await res.json().catch(() => null);
  if (result && result.status === "ERROR") return { outcome: "error", result };
  if (result && result.status === "SUCCESS") return { outcome: "ok", result };
  return { outcome: "unknown", result: null };
}

// [ขั้นที่ 3] ส่ง payload ไปยัง webhook แล้ว log ผลลัพธ์
//   payload = { type, activity_name, reason?, recipients: [{ email, first_name }, ...] }
//   label   = ข้อความระบุรายการใน log เช่น "แจ้งยกเลิกกิจกรรม #12 (5 คน)"
// ไม่โยน error ออกไป (ดักไว้ใน try/catch ทั้งหมด) เพื่อไม่ให้กระทบการทำงานส่วนอื่น
async function postGasNotify(payload, label) {
  try {
    // ส่งคำขอ POST แบบ JSON ไปให้ Apps Script (doPost ใน cancel-notify.gs)
    const res = await fetch(GAS_CANCEL_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // อ่านผลแล้ว log ตามผลที่ได้ (ดูผลได้ใน console ของ server)
    const { outcome, result } = await interpretGasNotifyResult(res);
    if (outcome === "error") {
      console.error(`ส่งอีเมล${label} ไม่สำเร็จ:`, result.message);
    } else if (outcome === "ok") {
      console.log(`ส่งอีเมล${label} สำเร็จ`);
    } else {
      console.log(
        `ส่งอีเมล${label} (เรียก webhook สำเร็จ แต่ยืนยันผลลัพธ์ไม่ได้ — Apps Script redirect quirk)`,
      );
    }
  } catch (mailErr) {
    // เชื่อมต่อ Apps Script ไม่ได้ (เช่น ไม่มีอินเทอร์เน็ต / URL ผิด)
    console.error(`ส่งอีเมล${label} ไม่สำเร็จ:`, mailErr.message);
  }
}

// ---------- อีเมลแจ้งยกเลิกกิจกรรม -> ผู้สมัครทุกคน (type: "cancel") ----------
// เรียกจาก: PUT /api/organizer/activities/:id/cancel (ทั้งตอนผู้จัดและแอดมินกดยกเลิก)
// ผู้รับ: ผู้สมัครทุกคนที่ยังไม่ได้ยกเลิกการสมัครเอง และมีอีเมลในระบบ
// ส่งเป็นคำขอเดียวที่มีผู้รับหลายคน (Apps Script วนส่งให้ทีละคนเอง)
function notifyActivityCancellation(activityId, activityName, reason) {
  // 1. ยังไม่ตั้งค่า URL -> ไม่ส่ง
  if (!isGasConfigured("แจ้งยกเลิกกิจกรรม")) return;

  // 2. ดึงอีเมลและชื่อของผู้สมัครทุกคนในกิจกรรมนี้
  db.query(
    `SELECT m.Email, m.First_name, r.Registration_fname
     FROM registration r
     JOIN member m ON r.Member_id = m.Member_id
     WHERE r.Activity_id = ? AND r.Cancel_date IS NULL
       AND m.Email IS NOT NULL AND m.Email <> ''`,
    [activityId],
    (err, recipients) => {
      if (err) {
        console.error(
          "ดึงรายชื่อผู้สมัครเพื่อแจ้งยกเลิกไม่สำเร็จ:",
          err.message,
        );
        return;
      }
      if (!recipients.length) return; // ไม่มีผู้สมัคร -> ไม่ต้องส่ง

      // 3. ส่งให้ Apps Script (ชื่อผู้รับใช้ชื่อที่กรอกตอนสมัครก่อน ถ้าไม่มีใช้ชื่อในโปรไฟล์)
      postGasNotify(
        {
          type: "cancel",
          activity_name: activityName,
          reason: reason || "ไม่ได้ระบุเหตุผล",
          recipients: recipients.map((r) => ({
            email: r.Email,
            first_name: r.Registration_fname || r.First_name,
          })),
        },
        `แจ้งยกเลิกกิจกรรม #${activityId} (${recipients.length} คน)`,
      );
    },
  );
}

// ---------- อีเมลแจ้งผลการอนุมัติ -> ผู้จัดกิจกรรม (type: "approved" | "rejected") ----------
// เรียกจาก: PUT /api/admin/activities/:id/approve  (type = "approved")
//           PUT /api/admin/activities/:id/reject   (type = "rejected" พร้อมเหตุผล)
// ผู้รับ: ผู้จัดกิจกรรมเจ้าของกิจกรรมนั้น (1 คน)
function notifyOrganizerActivityDecision(activityId, type, reason) {
  // 1. ยังไม่ตั้งค่า URL -> ไม่ส่ง
  if (!isGasConfigured("แจ้งผลอนุมัติกิจกรรม")) return;

  // 2. ดึงชื่อกิจกรรม และอีเมล/ชื่อของผู้จัด
  db.query(
    `SELECT a.Activity_name, m.Email, m.First_name
     FROM activity a
     JOIN member m ON a.Member_id = m.Member_id
     WHERE a.Activity_id = ? AND m.Email IS NOT NULL AND m.Email <> ''`,
    [activityId],
    (err, rows) => {
      if (err) {
        console.error(
          "ดึงข้อมูลผู้จัดกิจกรรมเพื่อแจ้งผลอนุมัติไม่สำเร็จ:",
          err.message,
        );
        return;
      }
      if (!rows.length) return; // ผู้จัดไม่มีอีเมล หรือไม่พบกิจกรรม

      // 3. ส่งให้ Apps Script (เลือกเทมเพลตอนุมัติ/ไม่อนุมัติตาม type)
      const { Activity_name, Email, First_name } = rows[0];
      postGasNotify(
        {
          type,
          activity_name: Activity_name || "กิจกรรม",
          reason: reason || "ไม่ได้ระบุเหตุผล",
          recipients: [{ email: Email, first_name: First_name }],
        },
        `แจ้งผล (${type}) กิจกรรม #${activityId}`,
      );
    },
  );
}

// ---------- อีเมลแจ้งมีกิจกรรมใหม่รออนุมัติ -> แอดมิน (type: "new_activity") ----------
// เรียกจาก: POST /api/organizer/activities เมื่อผู้จัดกด "บันทึกข้อมูล" ส่งขออนุมัติ
//           (ไม่ส่งตอนกด "บันทึกร่าง")
// ผู้รับ: แอดมินตามอีเมลที่กำหนดไว้ใน NEW_ACTIVITY_NOTIFY_EMAIL (1 คน)
function notifyAdminNewActivitySubmission(activityId, activityName) {
  // 1. ยังไม่ตั้งค่า URL -> ไม่ส่ง
  if (!isGasConfigured("แจ้งแอดมินเรื่องกิจกรรมใหม่")) return;

  // 2-3. ไม่ต้องดึงข้อมูลจาก DB เพราะรู้อีเมลผู้รับอยู่แล้ว -> ส่งให้ Apps Script ทันที
  postGasNotify(
    {
      type: "new_activity",
      activity_name: activityName || "กิจกรรม",
      recipients: [
        { email: NEW_ACTIVITY_NOTIFY_EMAIL, first_name: "ผู้ดูแลระบบ" },
      ],
    },
    `แจ้งแอดมิน (new_activity) กิจกรรม #${activityId}`,
  );
}

// ---------- อีเมลแจ้งว่าแอดมินยกเลิกกิจกรรม -> ผู้จัดกิจกรรม (type: "cancelled_by_admin") ----------
// เรียกจาก: PUT /api/organizer/activities/:id/cancel เฉพาะตอนที่ "แอดมิน" เป็นคนกดยกเลิก
//           (ถ้าผู้จัดยกเลิกกิจกรรมของตัวเอง จะไม่ส่งอีเมลนี้)
// ผู้รับ: ผู้จัดกิจกรรมเจ้าของกิจกรรมนั้น (1 คน)
function notifyOrganizerActivityCancelledByAdmin(
  activityId,
  activityName,
  reason,
) {
  // 1. ยังไม่ตั้งค่า URL -> ไม่ส่ง
  if (!isGasConfigured("แจ้งผู้จัดกิจกรรมเรื่องถูกยกเลิก")) return;

  // 2. ดึงอีเมลและชื่อของผู้จัด
  db.query(
    `SELECT m.Email, m.First_name
     FROM activity a
     JOIN member m ON a.Member_id = m.Member_id
     WHERE a.Activity_id = ? AND m.Email IS NOT NULL AND m.Email <> ''`,
    [activityId],
    (err, rows) => {
      if (err) {
        console.error(
          "ดึงข้อมูลผู้จัดกิจกรรมเพื่อแจ้งยกเลิกไม่สำเร็จ:",
          err.message,
        );
        return;
      }
      if (!rows.length) return; // ผู้จัดไม่มีอีเมล

      // 3. ส่งให้ Apps Script พร้อมเหตุผลที่ยกเลิก
      const { Email, First_name } = rows[0];
      postGasNotify(
        {
          type: "cancelled_by_admin",
          activity_name: activityName || "กิจกรรม",
          reason: reason || "ไม่ได้ระบุเหตุผล",
          recipients: [{ email: Email, first_name: First_name }],
        },
        `แจ้งผู้จัดเรื่องถูกยกเลิก กิจกรรม #${activityId}`,
      );
    },
  );
}

/* =====================================================================
 *  6. ใบประกาศนียบัตร
 * ===================================================================== */

// ออกเลขที่ใบประกาศ (Certificate_no) ให้ผู้เข้าร่วมที่ผู้จัดยืนยันว่ามาจริง (Participation_result = 'P')
// รูปแบบ "CERT-000001" อิงจาก Registration_id (auto_increment จึงไม่ซ้ำ)
// ออกให้ครั้งเดียวต่อการลงทะเบียน — ถ้ามีเลขอยู่แล้วจะไม่ออกทับ
function issueCertificateNo(registrationId, cb) {
  db.query(
    "SELECT Certificate_no FROM registration WHERE Registration_id = ?",
    [registrationId],
    (err, rows) => {
      if (err) return cb(err);
      if (!rows.length || rows[0].Certificate_no) return cb(null);
      const certNo = "CERT-" + String(registrationId).padStart(6, "0");
      db.query(
        "UPDATE registration SET Certificate_no = ? WHERE Registration_id = ?",
        [certNo, registrationId],
        (err2) => cb(err2 || null),
      );
    },
  );
}

/* =====================================================================
 *  7. API ข้อมูลทั่วไป (ไม่ต้อง login)
 * ===================================================================== */

// ---------- สไลด์หน้าแรก ----------
// สุ่ม 3 กิจกรรมที่มีรูป อนุมัติแล้ว ไม่ถูกยกเลิก และอยู่ในช่วงเปิดรับสมัคร
app.get("/api/slides", (req, res) => {
  const sql = `
    SELECT Activity_id, Image AS img, Activity_name AS title, Activity_description AS sub
    FROM activity
    WHERE Image IS NOT NULL AND Image != ''
      AND Approval_status = 'Approved'
      AND Activity_status = 'Approved'
      AND (Activity_suspend_status IS NULL OR Activity_suspend_status = '')
      AND (Registration_start IS NULL OR Registration_start <= CURDATE())
      AND (Registration_end IS NULL OR Registration_end >= CURDATE())
    ORDER BY RAND() LIMIT 3`;
  db.query(sql, (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data });
  });
});

// ---------- รายการกิจกรรม (หน้าแรก) ----------
// แสดงเฉพาะกิจกรรมที่อนุมัติแล้ว ไม่ใช่ร่าง ถึงวันเปิดรับสมัครแล้ว และไม่ถูกยกเลิก
// ตัวกรอง: ?category, ?search (ชื่อ/สถานที่/รายละเอียด/จังหวัด/อำเภอ/ตำบล), ?status
// ?member_id ใช้คำนวณ Is_registered ว่าผู้ใช้คนนี้สมัครกิจกรรมนั้นแล้วหรือยัง
app.get("/api/activities", (req, res) => {
  const { category, search, status, member_id } = req.query;

  let where = [
    "a.Approval_status = 'Approved'",
    "a.Activity_status NOT IN ('Draft', 'ร่าง')",
    "(a.Registration_start IS NULL OR a.Registration_start <= CURDATE())",
    "(a.Activity_suspend_status IS NULL OR a.Activity_suspend_status = '')",
  ];

  const params = [];
  if (category && category !== "ทั้งหมด") {
    where.push("at.Category_name = ?");
    params.push(category);
  }
  if (search) {
    where.push(
      "(a.Activity_name LIKE ? OR a.Location LIKE ? OR a.Activity_description LIKE ? OR p.Province_name LIKE ? OR d.District_name LIKE ? OR sd.Subdistrict_name LIKE ?)",
    );
    params.push(
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
    );
  }
  if (status) {
    where.push("a.Activity_status = ?");
    params.push(status);
  }

  const sql = `
    SELECT a.*, at.Category_name, sd.Subdistrict_name, d.District_name, p.Province_name,
      m.First_name AS Organizer_first_name, m.Last_name AS Organizer_last_name,
      COUNT(r.Registration_id) AS registered_count,
      (SELECT COUNT(*) FROM registration r2 WHERE r2.Activity_id = a.Activity_id AND r2.Member_id = ? AND r2.Cancel_date IS NULL) AS Is_registered
    FROM activity a
    LEFT JOIN activitytype at ON a.Category_id = at.Category_id
    LEFT JOIN subdistrict sd ON a.Subdistrict_id = sd.Subdistrict_id
    LEFT JOIN district d ON sd.District_id = d.District_id
    LEFT JOIN province p ON d.Province_id = p.Province_id
    LEFT JOIN registration r ON a.Activity_id = r.Activity_id AND r.Cancel_date IS NULL
    LEFT JOIN member m ON a.Member_id = m.Member_id
    WHERE ${where.join(" AND ")}
    GROUP BY a.Activity_id ORDER BY a.Registration_end DESC`;

  db.query(sql, [member_id || null, ...params], (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data, total: data.length });
  });
});

// ---------- รายละเอียดกิจกรรม ----------
app.get("/api/activities/:id", (req, res) => {
  const sql = `
    SELECT a.*, at.Category_name, sd.Subdistrict_name, d.District_name, p.Province_name,
      m.First_name AS Organizer_first_name, m.Last_name AS Organizer_last_name,
      COUNT(r.Registration_id) AS registered_count,
      (SELECT COUNT(*) FROM registration r2 WHERE r2.Activity_id = a.Activity_id AND r2.Member_id = ? AND r2.Cancel_date IS NULL) AS Is_registered
    FROM activity a
    LEFT JOIN activitytype at ON a.Category_id = at.Category_id
    LEFT JOIN subdistrict sd ON a.Subdistrict_id = sd.Subdistrict_id
    LEFT JOIN district d ON sd.District_id = d.District_id
    LEFT JOIN province p ON d.Province_id = p.Province_id
    LEFT JOIN registration r ON a.Activity_id = r.Activity_id AND r.Cancel_date IS NULL
    LEFT JOIN member m ON a.Member_id = m.Member_id
    WHERE a.Activity_id = ? GROUP BY a.Activity_id`;
  db.query(sql, [req.query.member_id || null, req.params.id], (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    if (!data.length)
      return res.status(404).json({ success: false, message: "ไม่พบกิจกรรม" });
    res.json({ success: true, data: data[0] });
  });
});

// ---------- ประเภทกิจกรรม ----------
// รายชื่อประเภทสำหรับแถบตัวกรองหน้าแรก (มี "ทั้งหมด" นำหน้า)
app.get("/api/categories", (req, res) => {
  db.query("SELECT * FROM activitytype ORDER BY Category_id", (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({
      success: true,
      data: ["ทั้งหมด", ...data.map((c) => c.Category_name)],
    });
  });
});

// ประเภทกิจกรรมแบบเต็มแถว สำหรับ dropdown ในฟอร์มสร้างกิจกรรม
app.get("/api/activitytypes", (req, res) => {
  db.query("SELECT * FROM activitytype ORDER BY Category_id", (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data });
  });
});

// ---------- สถิติหน้าแรก ----------
app.get("/api/stats", (req, res) => {
  const sql = `SELECT
    (SELECT COUNT(*) FROM member WHERE Member_status = 'Active') AS total_volunteers,
    (SELECT COUNT(*) FROM activity WHERE Activity_status = 'Approved' AND (Activity_suspend_status IS NULL OR Activity_suspend_status = '')) AS total_activities,
    (SELECT COUNT(*) FROM registration WHERE Cancel_date IS NULL) AS total_registrations,
    (SELECT COUNT(DISTINCT Province_id) FROM province) AS provinces`;
  db.query(sql, (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: data[0] });
  });
});

// ---------- จังหวัด / อำเภอ / ตำบล ----------
app.get("/api/provinces", (req, res) => {
  db.query("SELECT * FROM province", (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    data.sort((a, b) => thCollator.compare(a.Province_name, b.Province_name));
    res.json({ success: true, data });
  });
});

app.get("/api/districts/:province_id", (req, res) => {
  db.query(
    "SELECT * FROM district WHERE Province_id = ?",
    [req.params.province_id],
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      data.sort((a, b) => thCollator.compare(a.District_name, b.District_name));
      res.json({ success: true, data });
    },
  );
});

app.get("/api/subdistricts/:district_id", (req, res) => {
  db.query(
    "SELECT * FROM subdistrict WHERE District_id = ?",
    [req.params.district_id],
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      data.sort((a, b) =>
        thCollator.compare(a.Subdistrict_name, b.Subdistrict_name),
      );
      res.json({ success: true, data });
    },
  );
});

// route รุ่นเก่า (คืนรายชื่อจังหวัดแบบไม่ห่อ { success, data })
app.get("/province", (req, res) => {
  db.query("SELECT * FROM province", (err, data) => {
    if (err) return res.status(500).json(err);
    res.json(data);
  });
});

/* =====================================================================
 *  8. API สมาชิก
 * ===================================================================== */

// ---------- เข้าสู่ระบบ ----------
// ค้นอีเมลในตาราง member ก่อน ถ้าไม่พบค่อยค้นในตาราง admin
// แล้วเทียบรหัสผ่านใน checkPasswordAndRespond()
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "กรุณากรอกอีเมลและรหัสผ่าน" });
  }

  db.query("SELECT * FROM member WHERE Email = ?", [email], (err, data) => {
    if (err) {
      console.error("MySQL Error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }

    if (data.length > 0) {
      return checkPasswordAndRespond(data[0], password, "member", res);
    }

    db.query(
      "SELECT * FROM admin WHERE Email = ?",
      [email],
      (errAdmin, adminData) => {
        if (errAdmin) {
          return res
            .status(500)
            .json({ success: false, error: errAdmin.message });
        }
        if (!adminData || adminData.length === 0) {
          return res
            .status(401)
            .json({ success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
        }
        return checkPasswordAndRespond(adminData[0], password, "admin", res);
      },
    );
  });
});

// เทียบรหัสผ่านแล้วตอบกลับพร้อม token (ไม่ส่งฟิลด์ Password กลับไปฝั่ง client)
// - รองรับทั้ง bcrypt hash และรหัสผ่าน plain text ของบัญชีเก่า
// - บัญชีเก่าที่ยังเป็น plain text จะถูก hash แล้วบันทึกกลับอัตโนมัติเมื่อ login ผ่าน
// - สมาชิกที่ถูกระงับ (Suspended) หรือยังไม่ยืนยัน OTP (Pending) เข้าสู่ระบบไม่ได้
function checkPasswordAndRespond(row, password, kind, res) {
  const stored = row.Password || "";
  const isHashed = /^\$2[aby]\$/.test(stored);
  const isMatch = isHashed
    ? bcrypt.compareSync(password, stored)
    : password === stored;

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message:
        kind === "admin"
          ? "อีเมลหรือรหัสผ่านแอดมินไม่ถูกต้อง"
          : "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    });
  }

  if (!isHashed) {
    const table = kind === "admin" ? "admin" : "member";
    const idCol = kind === "admin" ? "Admin_id" : "Member_id";
    const newHash = bcrypt.hashSync(password, 10);
    db.query(
      `UPDATE ${table} SET Password = ? WHERE ${idCol} = ?`,
      [newHash, row[idCol]],
      (e) => {
        if (e)
          console.error(
            `ย้ายรหัสผ่านเป็น hash ให้ ${table} #${row[idCol]} ไม่สำเร็จ:`,
            e.message,
          );
      },
    );
  }

  const { Password, ...safeRow } = row;

  if (kind === "admin") {
    const token = signToken({ id: row.Admin_id, role: "admin" });
    return res.json({
      success: true,
      message: "แอดมินเข้าสู่ระบบสำเร็จ",
      user: { ...safeRow, role: "admin" },
      token,
    });
  }

  if (row.Suspended) {
    return res
      .status(403)
      .json({
        success: false,
        message: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ (sssummer.keall@gmail.com)",
      });
  }

  if (row.Member_status === "Pending") {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "ยังไม่ได้ยืนยันการสมัครสมาชิก กรุณายืนยันรหัส OTP ให้เสร็จสิ้นก่อนเข้าสู่ระบบ",
      });
  }

  // role ส่งกลับเป็นตัวพิมพ์เล็กเสมอ (App.jsx ใช้ค่านี้เลือกหน้าที่จะแสดง)
  const userRole = (row.Role || row.role || "participant").toLowerCase();
  const token = signToken({ id: row.Member_id, role: userRole });

  return res.json({
    success: true,
    message: "เข้าสู่ระบบสำเร็จ",
    user: { ...safeRow, role: userRole },
    token,
  });
}

// ---------- สมัครสมาชิก ----------
// บันทึกลง DB ทันทีด้วยสถานะ 'Pending' แล้วรอยืนยัน OTP (/api/verify-member)
// ถ้าอีเมลนี้เคยสมัครแต่ยังไม่ยืนยัน OTP จะเขียนทับข้อมูลเดิมให้
// role จากฟอร์ม: "organizer" -> Organizer, อื่น ๆ -> Volunteer
app.post("/api/register-member", (req, res) => {
  const { first_name, last_name, email, phone, password, role } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res
      .status(400)
      .json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res
      .status(400)
      .json({ success: false, message: "รูปแบบอีเมลไม่ถูกต้อง" });
  }
  if (String(password).length < 8) {
    return res
      .status(400)
      .json({ success: false, message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
  }

  const memberRole = role === "organizer" ? "Organizer" : "Volunteer";
  const passwordHash = bcrypt.hashSync(password, 10);

  db.query(
    "SELECT Member_id, Member_status FROM member WHERE Email = ?",
    [email],
    (errFind, found) => {
      if (errFind)
        return res.status(500).json({ success: false, error: errFind.message });

      if (found.length > 0) {
        if (found[0].Member_status === "Pending") {
          return db.query(
            "UPDATE member SET First_name = ?, Last_name = ?, Phone_number = ?, Password = ?, Role = ? WHERE Member_id = ?",
            [
              first_name,
              last_name,
              phone,
              passwordHash,
              memberRole,
              found[0].Member_id,
            ],
            (errUpd) => {
              if (errUpd)
                return res
                  .status(500)
                  .json({ success: false, error: errUpd.message });
              res.json({
                success: true,
                message: "บันทึกข้อมูลแล้ว รอยืนยัน OTP",
                member_id: found[0].Member_id,
              });
            },
          );
        }
        return res
          .status(409)
          .json({ success: false, message: "อีเมลนี้มีในระบบแล้ว" });
      }

      db.query(
        "INSERT INTO member (First_name, Last_name, Email, Phone_number, Password, Member_status, Role) VALUES (?, ?, ?, ?, ?, 'Pending', ?)",
        [first_name, last_name, email, phone, passwordHash, memberRole],
        (err, result) => {
          if (err) {
            if (err.code === "ER_DUP_ENTRY")
              return res
                .status(409)
                .json({ success: false, message: "อีเมลนี้มีในระบบแล้ว" });
            return res.status(500).json({ success: false, error: err.message });
          }
          res.json({
            success: true,
            message: "บันทึกข้อมูลแล้ว รอยืนยัน OTP",
            member_id: result.insertId,
          });
        },
      );
    },
  );
});

// ---------- ยืนยัน OTP ----------
// เปลี่ยนสถานะจาก Pending เป็น Active (เปลี่ยนได้เฉพาะแถวที่ยัง Pending)
app.post("/api/verify-member", (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ success: false, message: "ไม่พบอีเมล" });
  db.query(
    "UPDATE member SET Member_status = 'Active' WHERE Email = ? AND Member_status = 'Pending'",
    [email],
    (err, result) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ success: false, message: "ไม่พบรายการสมัครที่รอยืนยัน" });
      res.json({ success: true, message: "ยืนยันอีเมลสำเร็จ" });
    },
  );
});

// ---------- ข้อมูลสมาชิก ----------
app.get("/api/member/:id", (req, res) => {
  db.query(
    "SELECT Member_id, First_name, Last_name, Email, Phone_number, Member_status, Role, Suspended FROM member WHERE Member_id = ?",
    [req.params.id],
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      if (!data.length)
        return res.status(404).json({ success: false, message: "ไม่พบสมาชิก" });
      res.json({ success: true, data: data[0] });
    },
  );
});

// ---------- แก้ไขโปรไฟล์ของตัวเอง (ต้อง login) ----------
// ระบุแถวที่จะแก้จาก Member_id ใน token เท่านั้น และสลับบทบาทได้แค่ Volunteer/Organizer
// ออก token ใหม่ตาม role ล่าสุด เพื่อให้เข้าเมนูของ role ใหม่ได้ทันที
app.put("/api/profile/update", (req, res) => {
  if (req.auth.role === "admin") {
    return res
      .status(400)
      .json({ success: false, message: "เส้นทางนี้ใช้สำหรับสมาชิกเท่านั้น" });
  }

  const first_name = req.body.first_name || req.body.firstName;
  const last_name = req.body.last_name || req.body.lastName;
  const phone = req.body.phone;
  const status = req.body.status; // บทบาทที่จะสลับ (Volunteer/Organizer) — ตรงกับคอลัมน์ Role

  if (!first_name) {
    return res
      .status(400)
      .json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
  }

  const allowedRoles = ["Volunteer", "Organizer"];
  const newRole = allowedRoles.includes(status) ? status : "Volunteer";

  db.query(
    "UPDATE member SET First_name = ?, Last_name = ?, Phone_number = ?, Role = ? WHERE Member_id = ?",
    [first_name, last_name || "", phone || "", newRole, req.auth.id],
    (err, result) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });

      const token = signToken({ id: req.auth.id, role: newRole.toLowerCase() });
      res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ", token });
    },
  );
});

/* =====================================================================
 *  9. API ลงทะเบียนกิจกรรม
 * ===================================================================== */

// ---------- สมัครเข้าร่วมกิจกรรม ----------
// ทำใน transaction เดียวและล็อกแถวกิจกรรมด้วย FOR UPDATE เพื่อกันผู้สมัครเกิน Capacity
// เมื่อมีหลายคนสมัครพร้อมกัน
// ขั้นตอน: ตรวจว่าไม่ใช่ผู้จัดเอง -> ไม่เคยสมัคร -> กิจกรรมอนุมัติแล้วและไม่ถูกยกเลิก
//          -> อยู่ในช่วงวันรับสมัคร -> ที่นั่งยังไม่เต็ม -> บันทึก
app.post("/api/activities/:id/register", (req, res) => {
  const activityId = req.params.id;
  const { member_id, fname, lname } = req.body;

  db.getConnection((connErr, conn) => {
    if (connErr) {
      return res.status(500).json({ success: false, error: connErr.message });
    }

    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return res.status(500).json({ success: false, error: txErr.message });
      }

      const fail = (status, message) =>
        conn.rollback(() => {
          conn.release();
          res.status(status).json({ success: false, message });
        });
      const failErr = (err) =>
        conn.rollback(() => {
          conn.release();
          console.error("SQL Error:", err.message);
          res.status(500).json({ success: false, error: err.message });
        });

      const checkSql = `
        SELECT
          a.Capacity,
          a.Activity_status,
          a.Activity_suspend_status,
          a.Registration_start,
          a.Registration_end,
          a.Member_id AS Organizer_id,
          (SELECT COUNT(*) FROM registration r WHERE r.Activity_id = a.Activity_id AND r.Cancel_date IS NULL) AS registered_count,
          (SELECT COUNT(*) FROM registration r WHERE r.Activity_id = a.Activity_id AND r.Member_id = ? AND r.Cancel_date IS NULL) AS is_already_registered
        FROM activity a
        WHERE a.Activity_id = ?
        FOR UPDATE
      `;

      conn.query(checkSql, [member_id || null, activityId], (err, rows) => {
        if (err) return failErr(err);
        if (!rows.length) return fail(404, "ไม่พบกิจกรรม");

        const {
          Capacity,
          registered_count,
          Activity_status,
          Activity_suspend_status,
          Registration_start,
          Registration_end,
          Organizer_id,
          is_already_registered,
        } = rows[0];

        if (
          member_id &&
          Organizer_id &&
          String(member_id) === String(Organizer_id)
        ) {
          return fail(
            400,
            "คุณเป็นผู้จัดกิจกรรมนี้ ไม่สามารถลงทะเบียนเข้าร่วมกิจกรรมของตัวเองได้",
          );
        }

        if (member_id && is_already_registered > 0) {
          return fail(400, "คุณได้ลงทะเบียนเข้าร่วมกิจกรรมนี้ไปแล้ว");
        }

        // Activity_status มีค่าได้แค่ Draft / Pending / Approved / Rejected
        if (Activity_status && Activity_status !== "Approved") {
          return fail(400, "กิจกรรมปิดรับสมัครแล้ว");
        }
        if (Activity_suspend_status) {
          return fail(400, "กิจกรรมนี้ถูกยกเลิกแล้ว");
        }

        const now = new Date();

        if (Registration_start) {
          const regStart = new Date(Registration_start);
          regStart.setHours(0, 0, 0, 0); // ต้นวันเปิดรับสมัคร
          if (now < regStart) return fail(400, "ยังไม่ถึงกำหนดวันเปิดรับสมัคร");
        }

        if (Registration_end) {
          const regEnd = new Date(Registration_end);
          regEnd.setHours(23, 59, 59, 999); // สิ้นวันปิดรับสมัคร
          if (now > regEnd) return fail(400, "กิจกรรมปิดรับสมัครแล้ว");
        }

        if (Capacity && registered_count >= Capacity) {
          return fail(400, "กิจกรรมเต็มแล้ว");
        }

        const insertSql = `
          INSERT INTO registration (Registration_date, Registration_time, Participation_result, Registration_fname, Registration_lname, Member_id, Activity_id)
          VALUES (NOW(), TIME(NOW()), NULL, ?, ?, ?, ?)
        `;

        conn.query(
          insertSql,
          [fname || null, lname || null, member_id || null, activityId],
          (err2, result) => {
            if (err2) return failErr(err2);

            conn.commit((commitErr) => {
              if (commitErr) return failErr(commitErr);
              conn.release();
              res.json({
                success: true,
                message: "ลงทะเบียนสำเร็จ!",
                registration_id: result.insertId,
              });
            });
          },
        );
      });
    });
  });
});

// ---------- กิจกรรมที่สมัคร ----------
// ใช้ในหน้า "กิจกรรมที่เข้าร่วม" และ "ใบประกาศนียบัตร"
app.get("/api/my-activities/:member_id", (req, res) => {
  const sql = `
    SELECT
      r.*,
      a.Activity_name,
      a.Activity_start,
      a.Activity_end,
      a.Activity_start_time,
      a.Activity_end_time,
      a.Registration_start,
      a.Registration_end,
      a.Capacity,
      a.Activity_description,
      a.Location,
      a.Location_url,
      sd.Subdistrict_name, d.District_name, p.Province_name,
      a.Activity_status,
      a.Activity_suspend_status,
      a.Suspension_reason,
      a.Image,
      a.Signature,
      at.Category_name,

      -- ข้อมูลผู้จัดกิจกรรม
      a.Member_id AS Organizer_id,
      m.First_name AS Organizer_first_name,
      m.Last_name AS Organizer_last_name,
      m.Member_status AS Organizer_status,

      (SELECT COUNT(*) FROM registration WHERE Activity_id = a.Activity_id AND Cancel_date IS NULL) AS registered_count

    FROM registration r
    JOIN activity a ON r.Activity_id = a.Activity_id
    LEFT JOIN activitytype at ON a.Category_id = at.Category_id
    LEFT JOIN subdistrict sd ON a.Subdistrict_id = sd.Subdistrict_id
    LEFT JOIN district d ON sd.District_id = d.District_id
    LEFT JOIN province p ON d.Province_id = p.Province_id
    LEFT JOIN member m ON a.Member_id = m.Member_id
    WHERE r.Member_id = ?
    ORDER BY r.Registration_date DESC
  `;

  db.query(sql, [req.params.member_id], (err, data) => {
    if (err) {
      console.error("Error fetching my-activities:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data });
  });
});

// ---------- ยกเลิกการสมัคร ----------
app.put("/api/registrations/:id/cancel", (req, res) => {
  const { reason } = req.body;
  db.query(
    "UPDATE registration SET Cancel_date = NOW(), Cancel_time = TIME(NOW()), Cancel_reason = ? WHERE Registration_id = ?",
    [reason || null, req.params.id],
    (err, result) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ success: false, message: "ไม่พบการลงทะเบียน" });
      res.json({ success: true, message: "ยกเลิกการสมัครสำเร็จ" });
    },
  );
});

/* =====================================================================
 *  10. API แชต (ต้อง login)
 *
 *  ── โครงสร้าง ──────────────────────────────────────────────────
 *   ห้องแชต 1 ห้อง = การลงทะเบียน 1 รายการ (Registration_id)
 *   คู่สนทนาในห้อง = ผู้สมัครคนนั้น <-> ผู้จัดกิจกรรมนั้น (แชตแบบ 1 ต่อ 1)
 *   ข้อความเก็บในตาราง chat: 1 แถว = 1 ข้อความ
 *     Chat_id          รหัสข้อความ (เรียงลำดับข้อความด้วยค่านี้)
 *     Registration_id  ห้องที่ข้อความนี้อยู่
 *     Member_id        ผู้ส่ง
 *     Activity_id      กิจกรรม
 *     Message          ข้อความ
 *     Sent_at / Sent_time  วันที่ / เวลาที่ส่ง
 *
 *  ── API ─────────────────────────────────────────────────────────
 *   GET  /api/chat/contacts/:member_id     รายการห้องแชตของฉัน (แถบซ้ายของหน้าแชต)
 *   GET  /api/chat/messages/:activity_id   ข้อความทั้งหมดในห้อง (?registration_id=)
 *   POST /api/chat/send                    ส่งข้อความใหม่
 *
 *  ── การเริ่มแชตครั้งแรก ──────────────────────────────────────────
 *   ผู้เข้าร่วมกด "ติดต่อผู้จัด" (หน้ากิจกรรมที่เข้าร่วม) หรือผู้จัดกด "แชต" (หน้ารายชื่อผู้สมัคร)
 *   -> หน้าเว็บสร้างห้องชั่วคราวไว้ในรายการ (ยังไม่มีในฐานข้อมูล)
 *   -> พอส่งข้อความแรก ห้องนี้จะมีข้อความใน chat และจะแสดงในรายการห้องตั้งแต่นั้น
 *
 *  ระบบแชตไม่ใช่แบบ real-time: ข้อความใหม่จากอีกฝ่ายจะเห็นเมื่อเปิดห้องใหม่หรือรีเฟรชหน้า
 * ===================================================================== */

// ---------- รายการห้องแชตของฉัน ----------
// ?as=organizer  มุมมองผู้จัด: ห้องของผู้สมัครในกิจกรรมที่ฉันจัด (คู่สนทนา = ผู้สมัคร)
// ไม่ระบุ         มุมมองผู้เข้าร่วม: ห้องของกิจกรรมที่ฉันสมัคร (คู่สนทนา = ผู้จัด)
// แสดงเฉพาะห้องที่เคยมีข้อความ และยังแสดงห้องของกิจกรรม/การสมัครที่ยกเลิกแล้วเพื่อดูประวัติ
// เรียงห้องที่มีข้อความล่าสุดไว้บนสุด
app.get(
  "/api/chat/contacts/:member_id",
  requireAuth,
  requireSelfParam("member_id"), // ดูได้เฉพาะรายการห้องของตัวเอง
  (req, res) => {
    const { member_id } = req.params;
    const asOrganizer = req.query.as === "organizer";

    // SQL 2 แบบต่างกันแค่ "ใครคือคู่สนทนา" และ "กรองห้องจากฝั่งไหน"
    //   ผู้จัด:      JOIN member p ด้วย r.Member_id (ผู้สมัคร)   และ WHERE a.Member_id = ฉัน
    //   ผู้เข้าร่วม: JOIN member org ด้วย a.Member_id (ผู้จัด)   และ WHERE r.Member_id = ฉัน
    // subquery ในแต่ละห้องดึง: ข้อความล่าสุด, เวลาข้อความล่าสุด, ผู้ส่งล่าสุด (ใช้ทำตัวหนา "ยังไม่ได้อ่าน")
    //   และ Chat_id ล่าสุด (ใช้เรียงห้อง)
    // EXISTS (...) = แสดงเฉพาะห้องที่มีข้อความอย่างน้อย 1 ข้อความ
    const sql = asOrganizer
      ? `
      SELECT DISTINCT
        a.Activity_id, a.Activity_name, a.Image AS Activity_image, r.Registration_id,
        p.Member_id AS Partner_id, p.First_name, p.Last_name,
        (SELECT c2.Message FROM chat c2 WHERE c2.Registration_id = r.Registration_id ORDER BY c2.Chat_id DESC LIMIT 1) AS last_message,
        (SELECT c2.Sent_time FROM chat c2 WHERE c2.Registration_id = r.Registration_id ORDER BY c2.Chat_id DESC LIMIT 1) AS last_message_time,
        (SELECT c2.Member_id FROM chat c2 WHERE c2.Registration_id = r.Registration_id ORDER BY c2.Chat_id DESC LIMIT 1) AS last_sender_id,
        (SELECT MAX(c2.Chat_id) FROM chat c2 WHERE c2.Registration_id = r.Registration_id) AS last_chat_id
      FROM registration r
      JOIN activity a ON r.Activity_id = a.Activity_id
      JOIN member p ON r.Member_id = p.Member_id
      WHERE a.Member_id = ?
        AND EXISTS (SELECT 1 FROM chat cx WHERE cx.Registration_id = r.Registration_id)
      ORDER BY last_chat_id IS NULL, last_chat_id DESC`
      : `
      SELECT DISTINCT
        a.Activity_id, a.Activity_name, a.Image AS Activity_image, r.Registration_id,
        org.Member_id AS Partner_id, org.First_name, org.Last_name,
        (SELECT c2.Message FROM chat c2 WHERE c2.Registration_id = r.Registration_id ORDER BY c2.Chat_id DESC LIMIT 1) AS last_message,
        (SELECT c2.Sent_time FROM chat c2 WHERE c2.Registration_id = r.Registration_id ORDER BY c2.Chat_id DESC LIMIT 1) AS last_message_time,
        (SELECT c2.Member_id FROM chat c2 WHERE c2.Registration_id = r.Registration_id ORDER BY c2.Chat_id DESC LIMIT 1) AS last_sender_id,
        (SELECT MAX(c2.Chat_id) FROM chat c2 WHERE c2.Registration_id = r.Registration_id) AS last_chat_id
      FROM registration r
      JOIN activity a ON r.Activity_id = a.Activity_id
      JOIN member org ON a.Member_id = org.Member_id
      WHERE r.Member_id = ?
        AND EXISTS (SELECT 1 FROM chat cx WHERE cx.Registration_id = r.Registration_id)
      ORDER BY last_chat_id IS NULL, last_chat_id DESC`;

    db.query(sql, [member_id], (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data });
    });
  },
);

// ---------- ข้อความทั้งหมดในห้องแชต ----------
// ระบุห้องด้วย ?registration_id (ค่าที่หน้าเว็บส่งมาเป็นข้อความ "null"/"undefined" ถือว่าไม่มี)
// ไม่มีรหัสห้อง (ห้องชั่วคราวที่ยังไม่เคยคุย) -> คืนรายการว่าง
// มีรหัสห้อง -> ตรวจสิทธิ์ด้วย requireChatParticipant แล้วดึงข้อความทั้งหมด เรียงเก่า -> ใหม่
// พร้อมชื่อผู้ส่งแต่ละข้อความ (JOIN member)
app.get(
  "/api/chat/messages/:activity_id",
  requireAuth,
  requireChatParticipant((req) => {
    const { registration_id } = req.query;
    return registration_id &&
      registration_id !== "null" &&
      registration_id !== "undefined"
      ? registration_id
      : null;
  }),
  (req, res) => {
    const { registration_id } = req.query;

    if (
      !registration_id ||
      registration_id === "null" ||
      registration_id === "undefined"
    ) {
      return res.json({ success: true, data: [] });
    }

    const sql = `
    SELECT
      c.Chat_id,
      c.Member_id,
      c.Activity_id,
      c.Registration_id,
      c.Message,
      c.Sent_at,
      c.Sent_time,
      m.First_name,
      m.Last_name
    FROM chat c
    LEFT JOIN member m ON c.Member_id = m.Member_id
    WHERE c.Registration_id = ?
    ORDER BY c.Chat_id ASC
  `;

    db.query(sql, [registration_id], (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data });
    });
  },
);

// ---------- ส่งข้อความ ----------
// body: { activity_id, registration_id, message }
// ขั้นตอน: ตรวจสิทธิ์ห้อง -> ตรวจข้อมูลครบ -> บันทึกลงตาราง chat -> ตอบกลับ chat_id และเวลาที่ส่ง
// ผู้ส่งคือผู้ที่ login อยู่ (จาก token) ไม่รับ member_id จาก body กันการปลอมเป็นคนอื่น
app.post(
  "/api/chat/send",
  requireAuth,
  requireChatParticipant((req) => req.body.registration_id),
  (req, res) => {
    const { activity_id, registration_id, message } = req.body;
    const member_id = req.auth.id;

    // ข้อมูลไม่ครบ -> ไม่บันทึก
    if (!member_id || !activity_id || !registration_id || !message) {
      return res.status(400).json({
        success: false,
        message:
          "ข้อมูลไม่ครบถ้วน (ต้องการ member_id, activity_id, registration_id และ message)",
      });
    }

    // วันที่ (YYYY-MM-DD) และเวลา (HH:MM:SS) ที่ส่ง — ทั้งคู่คิดตามเวลาเครื่อง server (เวลาไทย)
    // จาก now ตัวเดียวกัน ไม่ใช้ toISOString() เพราะเป็นเวลา UTC (ช้ากว่าไทย 7 ชม.)
    // ซึ่งทำให้ข้อความที่ส่งช่วง 00:00-06:59 น. ได้วันที่เป็นวันก่อนหน้า
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const sent_at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const sent_time = now.toTimeString().slice(0, 8);

    // บันทึกข้อความลงตาราง chat
    const sql = `
    INSERT INTO chat (Sent_at, Sent_time, Message, Registration_id, Member_id, Activity_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

    db.query(
      sql,
      [sent_at, sent_time, message, registration_id, member_id, activity_id],
      (err, result) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        // ส่งรหัสข้อความและเวลากลับไป ให้หน้าเว็บต่อข้อความท้ายห้องได้ทันทีโดยไม่ต้องโหลดใหม่
        res.json({
          success: true,
          chat_id: result.insertId,
          sent_at,
          sent_time,
        });
      },
    );
  },
);

/* =====================================================================
 *  11. API แอดมิน (/api/admin/* — ต้อง login เป็น admin)
 *
 *  หมายเหตุ Express 5: ห้าม `return db.query(...)` ตรง ๆ ใน handler เพราะ Express 5
 *  จะพยายามเรียก .then() บนค่าที่คืนมา (Query object ของ mysql2 ไม่ใช่ promise จริง)
 *  ให้เรียก db.query(...) แล้วค่อย `return;` แยกบรรทัด
 * ===================================================================== */

// ---------- แดชบอร์ด: สถิติรวม (การ์ด 4 ใบในหน้าแรกแอดมิน) ----------
// แยกเป็น 4 query ตามการ์ดแต่ละใบ (นับกิจกรรมของผู้จัดทุกคนในระบบ)

// query 1: การ์ด "ประกาศทั้งหมด" — นับทุกกิจกรรม ไม่กรองสถานะ
const ADMIN_TOTAL_SQL = `
  SELECT COUNT(*) AS total
  FROM activity`;

// query 2: การ์ด "กิจกรรมที่รอดำเนินการ" — ส่งขออนุมัติแล้ว รอแอดมินพิจารณา
const ADMIN_PENDING_SQL = `
  SELECT COUNT(*) AS pending
  FROM activity
  WHERE Approval_status = 'Pending'`;

// query 3: การ์ด "กำลังเปิดรับสมัคร" — อนุมัติแล้ว, ไม่ถูกยกเลิก และวันนี้อยู่ในช่วงวันเปิด-ปิดรับสมัคร
const ADMIN_OPEN_SQL = `
  SELECT COUNT(*) AS open
  FROM activity
  WHERE Activity_status = 'Approved'
    AND (Activity_suspend_status IS NULL OR Activity_suspend_status = '')
    AND Registration_start IS NOT NULL AND Registration_start <= CURDATE()
    AND Registration_end IS NOT NULL AND Registration_end >= CURDATE()`;

// query 4: การ์ด "ปิดรับสมัครแล้ว" — ไม่อนุมัติ, ถูกยกเลิก หรืออนุมัติแล้วแต่อยู่นอกช่วงรับสมัคร
const ADMIN_CLOSED_SQL = `
  SELECT COUNT(*) AS closed
  FROM activity
  WHERE Activity_status = 'Rejected'
    OR (Activity_suspend_status IS NOT NULL AND Activity_suspend_status <> '')
    OR (Activity_status = 'Approved' AND (
          Registration_start IS NULL OR Registration_start > CURDATE()
          OR Registration_end IS NULL OR Registration_end < CURDATE()
        ))`;

// รัน 4 query พร้อมกัน แล้วรวมผลเป็น { total, open, closed, pending } ส่งกลับให้หน้าเว็บ
app.get("/api/admin/stats", async (req, res) => {
  try {
    const [[totalRows], [pendingRows], [openRows], [closedRows]] = await Promise.all([
      db.promise().query(ADMIN_TOTAL_SQL),
      db.promise().query(ADMIN_PENDING_SQL),
      db.promise().query(ADMIN_OPEN_SQL),
      db.promise().query(ADMIN_CLOSED_SQL),
    ]);
    res.json({
      success: true,
      data: {
        total: totalRows[0].total,
        open: openRows[0].open,
        closed: closedRows[0].closed,
        pending: pendingRows[0].pending,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- แดชบอร์ด: ปีที่มีข้อมูลการสมัคร (สำหรับตัวกรองปี) ----------
app.get("/api/admin/registration-years", (req, res) => {
  db.query(
    `SELECT DISTINCT YEAR(Registration_date) AS year FROM registration
     WHERE Cancel_date IS NULL ORDER BY year DESC`,
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: data.map((r) => r.year) });
    },
  );
});

// ---------- แดชบอร์ด: จำนวนผู้สมัคร (กราฟแท่ง) ----------
//   ?date=YYYY-MM-DD      รายวัน 7 แท่ง (จันทร์-อาทิตย์ ของสัปดาห์นั้น)
//   ?year&month           รายวันทั้งเดือน
//   ?year[&half=1|2]      รายเดือนทั้งปี หรือครึ่งปี
//   ไม่ส่งอะไร             รายเดือน 6 เดือนล่าสุด
// ช่วงที่ไม่มีข้อมูลจะเติมเป็น 0
app.get("/api/admin/monthly-registrations", (req, res) => {
  const year = parseInt(req.query.year, 10) || null;
  const month = parseInt(req.query.month, 10) || null;
  const half = parseInt(req.query.half, 10) || null;

  // รายสัปดาห์
  if (req.query.date) {
    const range = resolveDateRange({ date: req.query.date });
    if (!range)
      return res
        .status(400)
        .json({
          success: false,
          message: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)",
        });
    db.query(
      `SELECT DATE_FORMAT(r.Registration_date,'%Y-%m-%d') AS d, COUNT(*) AS count
       FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
       WHERE r.Cancel_date IS NULL AND ${COUNTED_ACTIVITY_SQL}
       AND DATE(r.Registration_date) BETWEEN ? AND ?
       GROUP BY d`,
      [range.from, range.to],
      (err, rows) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        const byDay = {};
        rows.forEach((r) => {
          byDay[r.d] = r.count;
        });
        const dayNames = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
        const data = dayNames.map((name, i) => {
          const d = new Date(range.monday);
          d.setUTCDate(range.monday.getUTCDate() + i);
          const key = d.toISOString().slice(0, 10);
          return { label: `${name} ${d.getUTCDate()}`, count: byDay[key] || 0 };
        });
        res.json({
          success: true,
          data,
          range: { from: range.from, to: range.to },
        });
      },
    );
    return;
  }

  // รายวันของเดือน
  if (year && month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    db.query(
      `SELECT DAY(r.Registration_date) AS d, COUNT(*) AS count
       FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
       WHERE r.Cancel_date IS NULL AND ${COUNTED_ACTIVITY_SQL}
       AND YEAR(r.Registration_date) = ? AND MONTH(r.Registration_date) = ?
       GROUP BY d`,
      [year, month],
      (err, rows) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        const byDay = {};
        rows.forEach((r) => {
          byDay[r.d] = r.count;
        });
        const data = Array.from({ length: daysInMonth }, (_, i) => ({
          label: String(i + 1),
          count: byDay[i + 1] || 0,
        }));
        res.json({ success: true, data });
      },
    );
    return;
  }

  // รายเดือนของปี (หรือครึ่งปี)
  if (year) {
    db.query(
      `SELECT MONTH(r.Registration_date) AS m, COUNT(*) AS count
       FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
       WHERE r.Cancel_date IS NULL AND ${COUNTED_ACTIVITY_SQL} AND YEAR(r.Registration_date) = ?
       GROUP BY m`,
      [year],
      (err, rows) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        const byMonth = {};
        rows.forEach((r) => {
          byMonth[r.m] = r.count;
        });
        let thaiMonths = Object.values(TH).map((label, i) => ({
          label,
          m: i + 1,
        }));
        if (half === 1) thaiMonths = thaiMonths.slice(0, 6);
        else if (half === 2) thaiMonths = thaiMonths.slice(6);
        const data = thaiMonths.map(({ label, m }) => ({
          label,
          count: byMonth[m] || 0,
        }));
        res.json({ success: true, data });
      },
    );
    return;
  }

  // ค่าเริ่มต้น: 6 เดือนล่าสุด
  db.query(
    `SELECT DATE_FORMAT(r.Registration_date,'%b') AS label,
    DATE_FORMAT(r.Registration_date,'%Y-%m') AS ym, COUNT(*) AS count
    FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
    WHERE r.Cancel_date IS NULL AND ${COUNTED_ACTIVITY_SQL}
    AND r.Registration_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY ym ORDER BY ym`,
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({
        success: true,
        data: data.map((r) => ({ ...r, label: TH[r.label] || r.label })),
      });
    },
  );
});

// ---------- แดชบอร์ด: สัดส่วนผ่าน / ไม่ผ่าน / ยังไม่เช็กชื่อ (กราฟโดนัท) ----------
// ใช้ตัวกรองช่วงเวลาเดียวกับกราฟแท่ง (ดู resolveDateRange) และ ?activity_id ดูเฉพาะกิจกรรมเดียว
app.get("/api/admin/attendance", (req, res) => {
  const activityId = parseInt(req.query.activity_id, 10) || null;

  const conditions = ["r.Cancel_date IS NULL", COUNTED_ACTIVITY_SQL];
  const params = [];
  const range = resolveDateRange(req.query);
  if (range) {
    conditions.push("DATE(r.Registration_date) BETWEEN ? AND ?");
    params.push(range.from, range.to);
  }
  if (activityId) {
    conditions.push("r.Activity_id = ?");
    params.push(activityId);
  }

  db.query(
    `SELECT
    SUM(r.Participation_result='P') AS passed,
    SUM(r.Participation_result='F') AS notPassed,
    SUM(r.Participation_result IS NULL OR r.Participation_result = 'Y') AS unmarked
    FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
    WHERE ${conditions.join(" AND ")}`,
    params,
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({
        success: true,
        data: {
          passed: parseInt(data[0].passed) || 0,
          notPassed: parseInt(data[0].notPassed) || 0,
          unmarked: parseInt(data[0].unmarked) || 0,
        },
      });
    },
  );
});

// ---------- กิจกรรมทั้งหมด (ทุกสถานะ) ----------
app.get("/api/admin/activities", (req, res) => {
  db.query(
    `SELECT a.*, at.Category_name, COUNT(r.Registration_id) AS registered_count,
      m.First_name AS Organizer_first_name, m.Last_name AS Organizer_last_name,
      m.Email AS Organizer_email, m.Phone_number AS Organizer_phone,
      sd.Subdistrict_name, d.District_name, p.Province_name
    FROM activity a
    LEFT JOIN activitytype at ON a.Category_id = at.Category_id
    LEFT JOIN subdistrict sd ON a.Subdistrict_id = sd.Subdistrict_id
    LEFT JOIN district d ON sd.District_id = d.District_id
    LEFT JOIN province p ON d.Province_id = p.Province_id
    LEFT JOIN registration r ON a.Activity_id = r.Activity_id AND r.Cancel_date IS NULL
    LEFT JOIN member m ON a.Member_id = m.Member_id
    GROUP BY a.Activity_id ORDER BY a.Activity_id DESC`,
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data });
    },
  );
});

// ---------- อนุมัติกิจกรรม ----------
// แล้วส่งอีเมลแจ้งผู้จัดกิจกรรม
app.put("/api/admin/activities/:id/approve", (req, res) => {
  const activityId = req.params.id;
  const { adminId } = req.body;

  const sql = `
    UPDATE activity
    SET Approval_status = 'Approved',
        Activity_status = 'Approved',
        Admin_id = ?,
        Rejection_reason = NULL,
        Approval_date = NOW()
    WHERE Activity_id = ?`;

  db.query(sql, [adminId || null, activityId], (err, result) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: "อนุมัติกิจกรรมสำเร็จ" });

    // ส่งอีเมลแจ้งผู้จัดว่ากิจกรรมได้รับการอนุมัติ (ทำงานเบื้องหลัง หลังตอบกลับแล้ว)
    notifyOrganizerActivityDecision(activityId, "approved");
  });
});

// ---------- ไม่อนุมัติกิจกรรม ----------
// บันทึกเหตุผลและแอดมินที่ทำรายการ แล้วส่งอีเมลแจ้งผู้จัดกิจกรรม
app.put("/api/admin/activities/:id/reject", (req, res) => {
  const activityId = req.params.id;
  const { adminId, reason } = req.body;

  const sql = `
    UPDATE activity
    SET Approval_status = 'Rejected',
        Activity_status = 'Rejected',
        Admin_id = ?,
        Rejection_reason = ?,
        Approval_date = NOW()
    WHERE Activity_id = ?`;

  db.query(sql, [adminId || null, reason, activityId], (err, result) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: "บันทึกการไม่อนุมัติสำเร็จ" });

    // ส่งอีเมลแจ้งผู้จัดว่ากิจกรรมไม่ผ่านการอนุมัติ พร้อมเหตุผล (ทำงานเบื้องหลัง)
    notifyOrganizerActivityDecision(activityId, "rejected", reason);
  });
});

// ---------- รายชื่อสมาชิกทั้งหมด ----------
app.get("/api/admin/members", (req, res) => {
  db.query(
    "SELECT Member_id, First_name, Last_name, Email, Phone_number, Member_status, Role, Suspended FROM member ORDER BY Member_id DESC",
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data });
    },
  );
});

// ---------- ประวัติการระงับ / เปิดใช้งานบัญชีของสมาชิก ----------
// ตาราง member_suspension เก็บแบบ append-only: 1 แถว = 1 รอบการระงับ
// ตอนเปิดใช้งานคืนจะเติมช่อง Activated_* ในแถวเดิม (ไม่ลบทิ้ง)
app.get("/api/admin/members/:id/suspension-history", (req, res) => {
  db.query(
    `SELECT ms.Suspension_id, ms.Suspended_at, ms.Suspended_time, ms.Suspension_reason,
            suspender.Email AS Suspended_by_email,
            ms.Activated_at, ms.Activated_time, ms.Activated_reason,
            activator.Email AS Activated_by_email
     FROM member_suspension ms
     JOIN admin suspender ON suspender.Admin_id = ms.Admin_id
     LEFT JOIN admin activator ON activator.Admin_id = ms.Activated_by
     WHERE ms.Member_id = ?
     ORDER BY ms.Suspension_id DESC`,
    [req.params.id],
    (err, data) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data });
    },
  );
});

// ---------- ระงับบัญชีสมาชิก ----------
// เพิ่มแถวใหม่ใน member_suspension แล้วตั้ง member.Suspended = 1
// (Member_status มีแค่ Active/Inactive/Pending — สถานะระงับใช้คอลัมน์ Suspended แยก)
// member.Admin_suspended = แอดมินที่ระงับล่าสุด (ดูประวัติครบได้ใน member_suspension)
app.put("/api/admin/members/:id/suspend", (req, res) => {
  const memberId = req.params.id;
  const { adminId, reason } = req.body;
  if (!adminId)
    return res
      .status(400)
      .json({ success: false, message: "ไม่พบรหัสผู้ดูแลระบบที่ทำรายการ" });

  db.query(
    "INSERT INTO member_suspension (Admin_id, Member_id, Suspended_at, Suspended_time, Suspension_reason) VALUES (?, ?, NOW(), TIME(NOW()), ?)",
    [adminId, memberId, reason || null],
    (insErr) => {
      if (insErr)
        return res.status(500).json({ success: false, error: insErr.message });

      db.query(
        "UPDATE member SET Suspended = 1, Admin_suspended = ? WHERE Member_id=?",
        [adminId, memberId],
        (updErr) => {
          if (updErr)
            return res
              .status(500)
              .json({ success: false, error: updErr.message });
          res.json({ success: true, message: "ระงับบัญชีสำเร็จ" });
        },
      );
    },
  );
});

// ---------- เปิดใช้งานบัญชีสมาชิก (ยกเลิกการระงับ) ----------
// เติมช่อง Activated_* ในแถวระงับล่าสุดที่ยังเปิดอยู่ แล้วตั้ง member.Suspended = 0
// member.Admin_approved = แอดมินที่เปิดใช้งานคืนล่าสุด
app.put("/api/admin/members/:id/activate", (req, res) => {
  const memberId = req.params.id;
  const { adminId, reason } = req.body;
  if (!adminId)
    return res
      .status(400)
      .json({ success: false, message: "ไม่พบรหัสผู้ดูแลระบบที่ทำรายการ" });

  db.query(
    `UPDATE member_suspension SET Activated_by=?, Activated_at=NOW(), Activated_time=TIME(NOW()), Activated_reason=?
     WHERE Member_id=? AND Activated_at IS NULL
     ORDER BY Suspension_id DESC LIMIT 1`,
    [adminId, reason || null, memberId],
    (updSuspErr) => {
      if (updSuspErr)
        return res
          .status(500)
          .json({ success: false, error: updSuspErr.message });

      db.query(
        "UPDATE member SET Suspended = 0, Admin_approved = ? WHERE Member_id=?",
        [adminId, memberId],
        (updErr) => {
          if (updErr)
            return res
              .status(500)
              .json({ success: false, error: updErr.message });
          res.json({ success: true, message: "เปิดใช้งานบัญชีสำเร็จ" });
        },
      );
    },
  );
});

// ---------- เพิ่มผู้ดูแลระบบ ----------
// แอดมินเก็บในตาราง admin แยกจาก member
app.post("/api/admin/add-admin", (req, res) => {
  const { first_name, last_name, email, password } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res
      .status(400)
      .json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res
      .status(400)
      .json({ success: false, message: "รูปแบบอีเมลไม่ถูกต้อง" });
  }
  if (String(password).length < 8) {
    return res
      .status(400)
      .json({ success: false, message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.query(
    "INSERT INTO admin (First_name, Last_name, Email, Password) VALUES (?, ?, ?, ?)",
    [first_name, last_name, email, passwordHash],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res
            .status(409)
            .json({ success: false, message: "อีเมลนี้มีในระบบแล้ว" });
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({
        success: true,
        message: "เพิ่มผู้ดูแลระบบสำเร็จ",
        admin_id: result.insertId,
      });
    },
  );
});

/* =====================================================================
 *  12. API ผู้จัดกิจกรรม (/api/organizer/* — ต้อง login เป็น organizer หรือ admin)
 * ===================================================================== */

// ---------- แดชบอร์ด: สถิติกิจกรรมของตัวเอง (การ์ด 3 ใบในหน้าแรกผู้จัด) ----------
// แยกเป็น 3 query ตามการ์ดแต่ละใบ (เกณฑ์ open / closed เหมือน /api/admin/stats)

// query 1: การ์ด "ประกาศทั้งหมด" — นับทุกกิจกรรมของผู้จัด ไม่กรองสถานะ
const ORGANIZER_TOTAL_SQL = `
  SELECT COUNT(*) AS total
  FROM activity
  WHERE Member_id = ?`;

// query 2: การ์ด "กำลังเปิดรับสมัคร" — อนุมัติแล้ว, ไม่ถูกยกเลิก และวันนี้อยู่ในช่วงวันเปิด-ปิดรับสมัคร
const ORGANIZER_OPEN_SQL = `
  SELECT COUNT(*) AS open
  FROM activity
  WHERE Member_id = ?
    AND Activity_status = 'Approved'
    AND (Activity_suspend_status IS NULL OR Activity_suspend_status = '')
    AND Registration_start IS NOT NULL AND Registration_start <= CURDATE()
    AND Registration_end IS NOT NULL AND Registration_end >= CURDATE()`;

// query 3: การ์ด "ปิดรับสมัครแล้ว" — ไม่อนุมัติ, ถูกยกเลิก หรืออนุมัติแล้วแต่อยู่นอกช่วงรับสมัคร
const ORGANIZER_CLOSED_SQL = `
  SELECT COUNT(*) AS closed
  FROM activity
  WHERE Member_id = ?
    AND (
      Activity_status = 'Rejected'
      OR (Activity_suspend_status IS NOT NULL AND Activity_suspend_status <> '')
      OR (Activity_status = 'Approved' AND (
            Registration_start IS NULL OR Registration_start > CURDATE()
            OR Registration_end IS NULL OR Registration_end < CURDATE()
          ))
    )`;

// รัน 3 query พร้อมกัน แล้วรวมผลเป็น { total, open, closed } ส่งกลับให้หน้าเว็บ
app.get(
  "/api/organizer/stats/:member_id",
  requireSelfParam("member_id"),
  async (req, res) => {
    const id = req.params.member_id;
    try {
      const [[totalRows], [openRows], [closedRows]] = await Promise.all([
        db.promise().query(ORGANIZER_TOTAL_SQL, [id]),
        db.promise().query(ORGANIZER_OPEN_SQL, [id]),
        db.promise().query(ORGANIZER_CLOSED_SQL, [id]),
      ]);
      res.json({
        success: true,
        data: {
          total: totalRows[0].total,
          open: openRows[0].open,
          closed: closedRows[0].closed,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// ---------- แดชบอร์ด: ผู้สมัครรายเดือน 6 เดือนล่าสุด ----------
app.get(
  "/api/organizer/monthly-registrations/:member_id",
  requireSelfParam("member_id"),
  (req, res) => {
    db.query(
      `SELECT DATE_FORMAT(r.Registration_date,'%b') AS label,
    DATE_FORMAT(r.Registration_date,'%Y-%m') AS ym, COUNT(*) AS count
    FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
    WHERE a.Member_id=? AND r.Cancel_date IS NULL
    AND r.Registration_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY ym ORDER BY ym`,
      [req.params.member_id],
      (err, data) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        res.json({
          success: true,
          data: data.map((r) => ({ ...r, label: TH[r.label] || r.label })),
        });
      },
    );
  },
);

// ---------- แดชบอร์ด: ปีที่มีกิจกรรม (สำหรับตัวกรองปี) ----------
app.get(
  "/api/organizer/activity-years/:member_id",
  requireSelfParam("member_id"),
  (req, res) => {
    db.query(
      `SELECT DISTINCT YEAR(Activity_start) AS year FROM activity
     WHERE Member_id = ? AND Activity_start IS NOT NULL ORDER BY year DESC`,
      [req.params.member_id],
      (err, data) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: data.map((r) => r.year) });
      },
    );
  },
);

// ---------- แดชบอร์ด: จำนวนผู้สมัครแต่ละกิจกรรม (กราฟเปรียบเทียบ) ----------
// ?month=YYYY-MM หรือ ?year=YYYY (ไม่ส่ง = ทุกกิจกรรม)
app.get(
  "/api/organizer/monthly-activities/:member_id",
  requireSelfParam("member_id"),
  (req, res) => {
    const { month, year } = req.query;
    const params = [req.params.member_id];
    let dateFilter = "";
    if (month) {
      dateFilter = "AND DATE_FORMAT(a.Activity_start, '%Y-%m') = ?";
      params.push(month);
    } else if (year) {
      dateFilter = "AND YEAR(a.Activity_start) = ?";
      params.push(year);
    }
    db.query(
      `SELECT a.Activity_id, a.Activity_name, a.Activity_suspend_status,
      COUNT(r.Registration_id) AS registered_count
    FROM activity a
    LEFT JOIN registration r ON a.Activity_id = r.Activity_id AND r.Cancel_date IS NULL
    WHERE a.Member_id = ? AND ${COUNTED_ACTIVITY_SQL} ${dateFilter}
    GROUP BY a.Activity_id
    ORDER BY a.Activity_start ASC`,
      params,
      (err, data) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data });
      },
    );
  },
);

// ---------- แดชบอร์ด: สัดส่วนผ่าน / ไม่ผ่าน / ยังไม่เช็กชื่อ ----------
// ?month=YYYY-MM หรือ ?year=YYYY และ ?activity_id ดูเฉพาะกิจกรรมเดียว
// (กรองด้วย a.Member_id อยู่แล้ว จึงดูได้เฉพาะกิจกรรมของตัวเอง)
app.get(
  "/api/organizer/attendance/:member_id",
  requireSelfParam("member_id"),
  (req, res) => {
    const { month, year } = req.query;
    const activityId = parseInt(req.query.activity_id, 10) || null;
    const params = [req.params.member_id];
    let dateFilter = "";
    if (month) {
      dateFilter = "AND DATE_FORMAT(a.Activity_start, '%Y-%m') = ?";
      params.push(month);
    } else if (year) {
      dateFilter = "AND YEAR(a.Activity_start) = ?";
      params.push(year);
    }
    if (activityId) {
      dateFilter += " AND a.Activity_id = ?";
      params.push(activityId);
    }
    db.query(
      `SELECT
    SUM(r.Participation_result='P') AS passed,
    SUM(r.Participation_result='F') AS notPassed,
    SUM(r.Participation_result IS NULL OR r.Participation_result = 'Y') AS unmarked
    FROM registration r JOIN activity a ON r.Activity_id = a.Activity_id
    WHERE a.Member_id=? AND r.Cancel_date IS NULL
      AND ${COUNTED_ACTIVITY_SQL} ${dateFilter}`,
      params,
      (err, data) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        res.json({
          success: true,
          data: {
            passed: parseInt(data[0].passed) || 0,
            notPassed: parseInt(data[0].notPassed) || 0,
            unmarked: parseInt(data[0].unmarked) || 0,
          },
        });
      },
    );
  },
);

// ---------- รายการกิจกรรมของตัวเอง (ระบุด้วย ?organizerId) ----------
// ผู้จัดดูได้เฉพาะของตัวเอง แอดมินดูของใครก็ได้
app.get("/api/organizer/activities", (req, res) => {
  const organizerId = req.query.organizerId;

  if (
    req.auth.role !== "admin" &&
    String(req.auth.id) !== String(organizerId)
  ) {
    return res
      .status(403)
      .json({ success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
  }

  const sql = `
    SELECT
      a.*,
      a.Rejection_reason
    FROM activity a
    WHERE a.Member_id = ?
    ORDER BY a.Activity_id DESC`;

  db.query(sql, [organizerId], (err, data) => {
    if (err)
      return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data });
  });
});

// ---------- รายการกิจกรรมของตัวเอง พร้อมที่อยู่และจำนวนผู้สมัคร ----------
app.get(
  "/api/organizer/activities/:member_id",
  requireSelfParam("member_id"),
  (req, res) => {
    db.query(
      `SELECT a.*, at.Category_name, sd.District_id, d.Province_id,
      sd.Subdistrict_name, d.District_name, p.Province_name,
      COUNT(r.Registration_id) AS registered_count
    FROM activity a
    LEFT JOIN activitytype at ON a.Category_id = at.Category_id
    LEFT JOIN subdistrict sd ON a.Subdistrict_id = sd.Subdistrict_id
    LEFT JOIN district d ON sd.District_id = d.District_id
    LEFT JOIN province p ON d.Province_id = p.Province_id
    LEFT JOIN registration r ON a.Activity_id = r.Activity_id AND r.Cancel_date IS NULL
    WHERE a.Member_id=? GROUP BY a.Activity_id ORDER BY a.Activity_id DESC`,
      [req.params.member_id],
      (err, data) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data });
      },
    );
  },
);

// ---------- สร้างกิจกรรมใหม่ (บันทึกร่าง หรือ ส่งขออนุมัติ) ----------
// status: "Draft" (ค่าเริ่มต้น) หรือ "Pending"
// ผู้จัดคือผู้ที่ login อยู่ (จาก token) และ Activity_created_at ใช้ NOW() ของ MySQL
// ถ้าส่งขออนุมัติจะส่งอีเมลแจ้งแอดมิน
app.post("/api/organizer/activities", (req, res) => {
  const {
    activity_name,
    location,
    subdistrict_id,
    category_id,
    location_url,
    reg_start,
    reg_end,
    activity_start,
    activity_end,
    time_start,
    time_end,
    capacity,
    description,
    image,
    signature,
    status,
  } = req.body;
  const member_id = req.auth.id;

  const targetStatus = status || "Draft";
  const approvalStatus = targetStatus === "Draft" ? "Draft" : "Pending";

  const validationError = validateActivityInput(req.body, targetStatus);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const sql = `
    INSERT INTO activity
    (Activity_name, Location, Subdistrict_id, Category_id, Location_url,
     Registration_start, Registration_end, Activity_start, Activity_end,
     Activity_start_time, Activity_end_time, Capacity, Activity_description,
     Image, Signature, Member_id, Activity_status, Approval_status, Activity_created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
  `;

  const values = [
    toNull(activity_name) || "ร่างกิจกรรม",
    toNull(location),
    toIntNull(subdistrict_id),
    toIntNull(category_id),
    toNull(location_url),
    toNull(reg_start),
    toNull(reg_end),
    toNull(activity_start),
    toNull(activity_end),
    toNull(time_start),
    toNull(time_end),
    toIntNull(capacity),
    toNull(description),
    toNull(image),
    toNull(signature),
    toIntNull(member_id),
    targetStatus,
    approvalStatus,
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error(
        "SQL Error (POST activity):",
        err.sqlMessage || err.message,
      );
      return res
        .status(500)
        .json({ success: false, error: err.sqlMessage || err.message });
    }

    res.json({
      success: true,
      message:
        targetStatus === "Draft"
          ? "บันทึกร่างสำเร็จ"
          : "ส่งกิจกรรมขออนุมัติสำเร็จ",
      activity_id: result.insertId,
    });

    // ส่งขออนุมัติ (ไม่ใช่บันทึกร่าง) -> ส่งอีเมลแจ้งแอดมินว่ามีกิจกรรมใหม่รออนุมัติ
    // values[0] = ชื่อกิจกรรม
    if (targetStatus === "Pending") {
      notifyAdminNewActivitySubmission(result.insertId, values[0]);
    }
  });
});

// ---------- แก้ไขกิจกรรมฉบับร่าง ----------
// แก้ได้เฉพาะกิจกรรมที่ยังเป็นร่าง (Draft) และเป็นของผู้จัดที่ login อยู่
// ส่ง status: "Pending" มาเพื่อส่งร่างนี้ขออนุมัติ
app.put(
  "/api/organizer/activities/:id",
  requireOwnActivity((req) => req.params.id),
  (req, res) => {
    const { id } = req.params;
    const {
      activity_name,
      location,
      subdistrict_id,
      category_id,
      location_url,
      reg_start,
      reg_end,
      activity_start,
      activity_end,
      time_start,
      time_end,
      capacity,
      description,
      image,
      signature,
      status,
    } = req.body;

    const targetStatus = status || "Draft";
    const approvalStatus = targetStatus === "Draft" ? "Draft" : "Pending";

    const validationError = validateActivityInput(req.body, targetStatus);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const sql = `
    UPDATE activity SET
      Activity_name = ?, Location = ?, Subdistrict_id = ?, Category_id = ?, Location_url = ?,
      Registration_start = ?, Registration_end = ?, Activity_start = ?, Activity_end = ?,
      Activity_start_time = ?, Activity_end_time = ?, Capacity = ?, Activity_description = ?,
      Image = ?, Signature = ?, Activity_status = ?, Approval_status = ?
    WHERE Activity_id = ? AND (Activity_status = 'Draft' OR Activity_status = 'ร่าง')
  `;

    const values = [
      toNull(activity_name) || "ร่างกิจกรรม",
      toNull(location),
      toIntNull(subdistrict_id),
      toIntNull(category_id),
      toNull(location_url),
      toNull(reg_start),
      toNull(reg_end),
      toNull(activity_start),
      toNull(activity_end),
      toNull(time_start),
      toNull(time_end),
      toIntNull(capacity),
      toNull(description),
      toNull(image),
      toNull(signature),
      targetStatus,
      approvalStatus,
      id,
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error(
          "SQL Error (PUT activity):",
          err.sqlMessage || err.message,
        );
        return res
          .status(500)
          .json({ success: false, error: err.sqlMessage || err.message });
      }

      res.json({ success: true, message: "อัปเดตข้อมูลเรียบร้อย" });
    });
  },
);

// ---------- ยกเลิกกิจกรรม ----------
// ยกเลิกได้เฉพาะกิจกรรมที่อนุมัติแล้ว ยังไม่ถูกยกเลิก และยังจัดไม่เสร็จ
// บันทึกสถานะที่ Activity_suspend_status = 'Cancelled' (Activity_status ไม่มีค่า Closed)
// ผู้ยกเลิก: ผู้จัด -> Cancelled_member_id, แอดมิน -> Admin_cancelled
// จากนั้นส่งอีเมลแจ้งผู้สมัครทุกคน และแจ้งผู้จัดด้วยถ้าแอดมินเป็นผู้ยกเลิก
app.put(
  "/api/organizer/activities/:id/cancel",
  requireOwnActivity((req) => req.params.id),
  (req, res) => {
    const { reason } = req.body || {};
    db.query(
      "SELECT Approval_status, Activity_suspend_status, Activity_end FROM activity WHERE Activity_id=?",
      [req.params.id],
      (err0, rows) => {
        if (err0)
          return res.status(500).json({ success: false, error: err0.message });
        if (!rows.length)
          return res
            .status(404)
            .json({ success: false, message: "ไม่พบกิจกรรม" });

        const { Approval_status, Activity_suspend_status, Activity_end } =
          rows[0];
        if (Activity_suspend_status) {
          return res
            .status(400)
            .json({ success: false, message: "กิจกรรมนี้ถูกยกเลิกไปแล้ว" });
        }
        if (Approval_status !== "Approved") {
          return res
            .status(400)
            .json({
              success: false,
              message: "ยกเลิกได้เฉพาะกิจกรรมที่อนุมัติแล้วเท่านั้น",
            });
        }
        if (Activity_end && new Date(Activity_end) < new Date()) {
          return res
            .status(400)
            .json({
              success: false,
              message: "กิจกรรมนี้จัดเสร็จสิ้นไปแล้ว ไม่สามารถยกเลิกได้",
            });
        }

        const isAdmin = req.auth.role === "admin";
        const cancelledMemberId = isAdmin ? null : req.auth.id;
        const adminCancelledId = isAdmin ? req.auth.id : null;

        db.query(
          `UPDATE activity SET Activity_suspend_status='Cancelled', Suspension_reason=?, Suspension_date=NOW(),
          Cancelled_member_id=?, Admin_cancelled=? WHERE Activity_id=?`,
          [reason || null, cancelledMemberId, adminCancelledId, req.params.id],
          (err) => {
            if (err)
              return res
                .status(500)
                .json({ success: false, error: err.message });
            res.json({ success: true, message: "ยกเลิกกิจกรรมสำเร็จ" });

            // ตอบกลับผู้ใช้แล้ว -> ส่งอีเมลแจ้งเตือนเบื้องหลัง
            // ดึงชื่อกิจกรรมก่อน เพื่อใส่ในหัวข้อและเนื้อหาอีเมล
            db.query(
              "SELECT Activity_name FROM activity WHERE Activity_id=?",
              [req.params.id],
              (errName, nameRows) => {
                const activityName =
                  !errName && nameRows.length
                    ? nameRows[0].Activity_name
                    : "กิจกรรม";
                // ส่งอีเมลแจ้งผู้สมัครทุกคนว่ากิจกรรมถูกยกเลิก
                notifyActivityCancellation(req.params.id, activityName, reason);
                // ถ้าแอดมินเป็นคนยกเลิก ส่งอีเมลแจ้งผู้จัดกิจกรรมด้วย
                if (isAdmin) {
                  notifyOrganizerActivityCancelledByAdmin(
                    req.params.id,
                    activityName,
                    reason,
                  );
                }
              },
            );
          },
        );
      },
    );
  },
);

// ---------- รายชื่อผู้สมัครในกิจกรรม ----------
app.get(
  "/api/organizer/attendees/:activity_id",
  requireOwnActivity((req) => req.params.activity_id),
  (req, res) => {
    db.query(
      `SELECT r.*, m.First_name, m.Last_name, m.Email, m.Phone_number
    FROM registration r LEFT JOIN member m ON r.Member_id = m.Member_id
    WHERE r.Activity_id=? ORDER BY r.Registration_date ASC`,
      [req.params.activity_id],
      (err, data) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data });
      },
    );
  },
);

// ---------- เช็กชื่อผู้เข้าร่วม (body: registration_id, result) ----------
// result = 'P' (ผ่าน) จะออกเลขที่ใบประกาศให้อัตโนมัติ
app.put(
  "/api/organizer/attendance",
  requireOwnRegistration((req) => req.body.registration_id),
  (req, res) => {
    const { registration_id, result } = req.body;
    db.query(
      "UPDATE registration SET Participation_result=? WHERE Registration_id=?",
      [result, registration_id],
      (err) => {
        if (err)
          return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "บันทึกการเข้าร่วมสำเร็จ" });
        if (result === "P") issueCertificateNo(registration_id, () => {});
      },
    );
  },
);

// ---------- อัปเดตสถานะการเข้าร่วมรายคน (body: registration_id, status) ----------
// ตรวจว่าส่งข้อมูลครบก่อน เพราะ middleware ตรวจสิทธิ์ต้องใช้ registration_id
// status = 'P' (ผ่าน) จะออกเลขที่ใบประกาศให้อัตโนมัติ
app.put(
  "/api/organizer/attendees/status",
  (req, res, next) => {
    const { registration_id, status } = req.body;
    if (!registration_id || !status) {
      return res.status(400).json({
        success: false,
        message: "กรุณาระบุ registration_id และ status ให้ถูกต้อง",
      });
    }
    next();
  },
  requireOwnRegistration((req) => req.body.registration_id),
  (req, res) => {
    const { registration_id, status } = req.body;
    db.query(
      "UPDATE registration SET Participation_result = ? WHERE Registration_id = ?",
      [status, registration_id],
      (err, result) => {
        if (err) {
          console.error("Error updating attendee status:", err.message);
          return res
            .status(500)
            .json({
              success: false,
              message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล",
            });
        }
        if (result.affectedRows === 0) {
          return res
            .status(404)
            .json({ success: false, message: "ไม่พบรายการที่ต้องการอัปเดต" });
        }
        res.json({ success: true, message: "อัปเดตสถานะเรียบร้อย" });
        if (status === "P") issueCertificateNo(registration_id, () => {});
      },
    );
  },
);

// ---------- ยืนยันผู้เข้าร่วมทั้งหมด ----------
// ตั้งผู้สมัครที่ยังไม่ได้เช็กชื่อทุกคนเป็น 'P' แล้วออกเลขที่ใบประกาศให้คนที่ยังไม่มีเลข
app.put(
  "/api/organizer/attendees/:activity_id/confirm-all",
  requireOwnActivity((req) => req.params.activity_id),
  (req, res) => {
    const { activity_id } = req.params;
    db.query(
      `UPDATE registration
         SET Participation_result = 'P'
         WHERE Activity_id = ? AND Cancel_date IS NULL
           AND (Participation_result IS NULL OR Participation_result = 'Y')`,
      [activity_id],
      (err) => {
        if (err) {
          console.error("Error confirming all:", err.message);
          return res
            .status(500)
            .json({
              success: false,
              message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล",
            });
        }
        res.json({ success: true, message: "ยืนยันทั้งหมดเรียบร้อย" });

        db.query(
          "SELECT Registration_id FROM registration WHERE Activity_id = ? AND Cancel_date IS NULL AND Participation_result = 'P' AND Certificate_no IS NULL",
          [activity_id],
          (err2, rows) => {
            if (err2)
              return console.error(
                "ดึงรายชื่อออกเลขใบประกาศไม่สำเร็จ:",
                err2.message,
              );
            rows.forEach((r) =>
              issueCertificateNo(r.Registration_id, () => {}),
            );
          },
        );
      },
    );
  },
);

/* =====================================================================
 *  13. เริ่มเซิร์ฟเวอร์
 * ===================================================================== */

app.get("/", (req, res) => res.send("Backend Server is Running on port 5000"));

app.listen(5000, () => console.log("Server running on http://localhost:5000"));
