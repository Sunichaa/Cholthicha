-- certificate_seq เดิมมีไว้ชิงเลข seq_id (auto_increment) แบบ atomic เพื่อออกเลขใบประกาศ
-- "CERT-000001" ไม่ให้ซ้ำกันเวลามีผู้จัดหลายคนกดยืนยันพร้อมกัน แต่จริง ๆ แล้ว registration
-- มี Registration_id เป็น auto_increment primary key อยู่แล้ว (ไม่ซ้ำ + atomic เหมือนกัน)
-- จึงใช้เลขนั้นออกใบประกาศได้ตรง ๆ โดยไม่ต้องมีตารางนับเลขแยกต่างหาก (ดู issueCertificateNo
-- ใน server/index.js) — ตารางนี้ไม่มีความหมายทางธุรกิจใด ๆ ลบทิ้งได้เลย
DROP TABLE certificate_seq;
