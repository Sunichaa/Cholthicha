/**
 * Google Apps Script — ส่งอีเมลแจ้งเตือนเรื่องกิจกรรมของ RuamAsa
 *
 * ไฟล์นี้เป็นต้นฉบับอ้างอิงของสคริปต์ที่ deploy อยู่บน script.google.com
 * (Apps Script ไม่มี API ให้ deploy จากเครื่องโดยตรง ต้องคัดลอกไปวางเอง)
 * server/index.js เรียกสคริปต์นี้ผ่าน URL /exec ที่ตั้งไว้ใน GAS_CANCEL_NOTIFY_URL
 *
 * ── ประเภทอีเมล (field "type") ────────────────────────────
 *   - "cancel"             (ค่าเริ่มต้นถ้าไม่ส่ง type มา) แจ้งยกเลิกกิจกรรม ผู้รับหลายคน (ผู้สมัคร)
 *   - "approved"           กิจกรรมได้รับการอนุมัติ ผู้รับ 1 คน (ผู้จัดกิจกรรม)
 *   - "rejected"           กิจกรรมไม่ผ่านการอนุมัติ ผู้รับ 1 คน (ผู้จัดกิจกรรม) พร้อมเหตุผล
 *   - "cancelled_by_admin" แอดมินยกเลิกกิจกรรมที่เผยแพร่แล้วแทนผู้จัด ผู้รับ 1 คน (ผู้จัดกิจกรรม)
 *                          พร้อมเหตุผล (ที่ server/index.js: notifyOrganizerActivityCancelledByAdmin —
 *                          ส่งเฉพาะตอนแอดมินกดยกเลิก ไม่ส่งตอนผู้จัดยกเลิกกิจกรรมของตัวเอง)
 *   - "new_activity"       ผู้จัดส่งกิจกรรมใหม่ขออนุมัติ ผู้รับ 1 คน (แอดมิน — hardcode เฉพาะคนเดียว
 *                          ที่ server/index.js: notifyAdminNewActivitySubmission)
 *
 * ── วิธีอัปเดตสคริปต์ที่ deploy อยู่ ────────────────────────
 * 1. เปิดโปรเจกต์ Apps Script เดิมที่ https://script.google.com/
 * 2. แทนที่โค้ดทั้งหมดด้วยไฟล์นี้
 * 3. Deploy → Manage deployments → แก้ deployment เดิม (ไอคอนดินสอ) → Version: New version → Deploy
 *    (ใช้ deployment เดิม ไม่ต้องสร้างใหม่ — URL /exec เดิมจะยังใช้ได้เหมือนเดิม)
 *
 * ── รูปแบบข้อมูลที่รับ (จาก server/index.js หัวข้อ "5. แจ้งเตือนทางอีเมล") ──
 *   POST body (JSON):
 *   {
 *     type: "cancel" | "approved" | "rejected" | "cancelled_by_admin" | "new_activity", // ไม่ส่งมา = ถือเป็น "cancel"
 *     activity_name: "ปลูกป่าชายเลน ครั้งที่ 3",
 *     reason: "สภาพอากาศไม่เอื้ออำนวย",             // ใช้กับ cancel และ rejected เท่านั้น
 *     recipients: [
 *       { email: "user1@example.com", first_name: "สมชาย" },
 *       { email: "user2@example.com", first_name: "สมหญิง" }
 *     ]
 *   }
 *
 * ── ผลลัพธ์ที่ตอบกลับ ──
 *   สำเร็จ: { status: "SUCCESS", sent_count: <จำนวนที่ส่ง> }
 *   ผิดพลาด: { status: "ERROR", message: "<ข้อความ>" }
 */

// เปิด URL ด้วยเบราว์เซอร์ (GET) — ใช้เช็กว่าสคริปต์ยังทำงานอยู่
function doGet() {
  return HtmlService.createHtmlOutput('Google Apps Script Mail Server Active');
}

// สร้างหัวข้อและเนื้อหาอีเมล (HTML) ตาม type — คืน { subject, htmlBody }
//   firstName    ชื่อผู้รับ (ใส่ในบรรทัด "เรียนคุณ ...")
//   activityName ชื่อกิจกรรม (ใส่ในหัวข้อและเนื้อหา)
//   reason       เหตุผล (ใช้กับ rejected / cancelled_by_admin / cancel)
function buildEmail(type, firstName, activityName, reason) {
  // อนุมัติแล้ว -> แจ้งผู้จัดว่ากิจกรรมเผยแพร่แล้ว
  if (type === "approved") {
    return {
      subject: "[กิจกรรมได้รับการอนุมัติ] " + activityName,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #16a34a; margin-top: 0;">กิจกรรมของคุณได้รับการอนุมัติแล้ว</h2>
          <p>เรียนคุณ <strong>${firstName}</strong>,</p>
          <p>กิจกรรม <strong>"${activityName}"</strong> ที่ท่านส่งขออนุมัติ ได้รับการอนุมัติจากผู้ดูแลระบบเรียบร้อยแล้ว และเผยแพร่ให้ผู้สนใจเข้าดูและลงทะเบียนได้ทันที</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">ข้อความนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ</p>
        </div>
      `
    };
  }

  // ไม่อนุมัติ -> แจ้งผู้จัดพร้อมเหตุผล และบอกว่าแก้ไขแล้วส่งใหม่ได้
  if (type === "rejected") {
    return {
      subject: "[กิจกรรมไม่ผ่านการอนุมัติ] " + activityName,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #ef4444; margin-top: 0;">กิจกรรมไม่ผ่านการอนุมัติ</h2>
          <p>เรียนคุณ <strong>${firstName}</strong>,</p>
          <p>กิจกรรม <strong>"${activityName}"</strong> ที่ท่านส่งขออนุมัติ ยังไม่ผ่านการอนุมัติจากผู้ดูแลระบบ</p>
          <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #ef4444; margin: 15px 0;">
            <strong>เหตุผลที่ไม่อนุมัติ:</strong><br/>
            ${reason}
          </div>
          <p>ท่านสามารถแก้ไขข้อมูลกิจกรรมและส่งขออนุมัติใหม่อีกครั้งได้</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">ข้อความนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ</p>
        </div>
      `
    };
  }

  // แอดมินยกเลิกกิจกรรม -> แจ้งผู้จัดพร้อมเหตุผล
  if (type === "cancelled_by_admin") {
    return {
      subject: "[กิจกรรมของคุณถูกยกเลิก] " + activityName,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #e11d48; margin-top: 0;">กิจกรรมของคุณถูกยกเลิกโดยผู้ดูแลระบบ</h2>
          <p>เรียนคุณ <strong>${firstName}</strong>,</p>
          <p>ผู้ดูแลระบบได้ทำการยกเลิกกิจกรรม <strong>"${activityName}"</strong> ที่ท่านเป็นผู้จัด และระบบได้แจ้งผู้ที่ลงทะเบียนไว้ทุกคนเรียบร้อยแล้ว</p>
          <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #e11d48; margin: 15px 0;">
            <strong>เหตุผลที่ยกเลิก:</strong><br/>
            ${reason}
          </div>
          <p>หากมีข้อสงสัยเกี่ยวกับการยกเลิกนี้ กรุณาติดต่อผู้ดูแลระบบ</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">ข้อความนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ</p>
        </div>
      `
    };
  }

  // มีกิจกรรมใหม่รออนุมัติ -> แจ้งแอดมินให้เข้าไปตรวจสอบ
  if (type === "new_activity") {
    return {
      subject: "[คำขอเผยแพร่กิจกรรมใหม่] " + activityName,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #2563eb; margin-top: 0;">มีคำขอเผยแพร่กิจกรรมใหม่รออนุมัติ</h2>
          <p>เรียนคุณ <strong>${firstName}</strong>,</p>
          <p>มีผู้จัดกิจกรรมส่งคำขอเผยแพร่ประกาศการจัดกิจกรรมจิตอาสา <strong>"${activityName}"</strong> เข้ามาในระบบ กรุณาเข้าสู่ระบบเพื่อตรวจสอบและพิจารณาอนุมัติ</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">ข้อความนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ</p>
        </div>
      `
    };
  }

  // ค่าเริ่มต้น: "cancel" -> แจ้งผู้สมัครว่ากิจกรรมที่ลงทะเบียนไว้ถูกยกเลิก พร้อมเหตุผล
  return {
    subject: "[แจ้งยกเลิกกิจกรรม] " + activityName,
    htmlBody: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h2 style="color: #e11d48; margin-top: 0;">แจ้งยกเลิกกิจกรรม</h2>
        <p>เรียนคุณ <strong>${firstName}</strong>,</p>
        <p>ขออภัยเป็นอย่างยิ่ง ทางผู้จัดมีความจำเป็นต้องยกเลิกกิจกรรม <strong>"${activityName}"</strong> ที่ท่านได้ลงทะเบียนไว้</p>

        <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #e11d48; margin: 15px 0;">
          <strong>เหตุผลในการยกเลิก:</strong><br/>
          ${reason}
        </div>

        <p>ขออภัยในความไม่สะดวกมา ณ ที่นี้</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">ข้อความนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ</p>
      </div>
    `
  };
}

// รับคำขอส่งอีเมล (POST) จาก backend แล้วส่งอีเมลให้ผู้รับทุกคนตาม type
function doPost(e) {
  try {
    // 1. อ่านข้อมูล JSON ที่ server ส่งมา (ค่าไหนไม่ส่งมาใช้ค่าเริ่มต้น)
    var params = JSON.parse(e.postData.contents);
    var type = params.type || "cancel";
    var activityName = params.activity_name || "กิจกรรม";
    var reason = params.reason || "ไม่ระบุเหตุผล";
    var recipients = params.recipients || []; // รับเป็น Array ของผู้รับ [{ email, first_name }, ...]

    // 2. ไม่มีผู้รับ -> ตอบ ERROR กลับไป ไม่ส่งอีเมล
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "ERROR",
        message: "ไม่พบรายชื่อผู้รับ"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var sentCount = 0; // จำนวนอีเมลที่ส่งออกไปแล้ว

    // 3. วนส่งอีเมลให้ผู้รับทีละคน (ข้ามคนที่ไม่มีอีเมล)
    //    สร้างเนื้อหาด้วย buildEmail() ให้แต่ละคน เพราะชื่อในบรรทัด "เรียนคุณ ..." ต่างกัน
    //    MailApp.sendEmail ส่งจากบัญชี Gmail ของเจ้าของสคริปต์
    //    (type อื่นนอกจาก cancel ปกติมีผู้รับคนเดียว)
    for (var i = 0; i < recipients.length; i++) {
      var user = recipients[i];
      var userEmail = user.email;
      var firstName = user.first_name || "ผู้ใช้งาน";

      if (userEmail) {
        var email = buildEmail(type, firstName, activityName, reason);
        MailApp.sendEmail({
          to: userEmail,
          subject: email.subject,
          htmlBody: email.htmlBody
        });
        sentCount++;
      }
    }

    // 4. ตอบกลับ server ว่าส่งสำเร็จกี่ฉบับ
    return ContentService.createTextOutput(JSON.stringify({
      status: "SUCCESS",
      sent_count: sentCount
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // เกิดข้อผิดพลาด (เช่น JSON ผิดรูปแบบ / เกินโควตาส่งอีเมลต่อวันของ Gmail) -> ตอบ ERROR พร้อมข้อความ
    return ContentService.createTextOutput(JSON.stringify({
      status: "ERROR",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
