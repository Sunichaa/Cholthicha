-- เปลี่ยน member_suspension จาก "เก็บแค่สถานะระงับปัจจุบัน" (แถวถูกลบทิ้งตอนเปิดใช้งานคืน)
-- เป็น "ประวัติ" แบบ append-only — 1 แถว = 1 รอบการระงับ ไม่ลบทิ้งตอนเปิดใช้งานคืน แต่อัปเดตช่อง
-- Activated_* แทน จึงต้องเปลี่ยน primary key จาก (Member_id, Admin_id) เดิม (จำกัดแค่ 1 แถวต่อคู่
-- แอดมิน+สมาชิก ทำให้ต้องลบแล้วสร้างใหม่ทุกครั้ง เก็บประวัติหลายรอบไม่ได้) มาเป็น Suspension_id
-- (surrogate key เพิ่มเข้ามาใหม่) แทน — ตารางว่างอยู่แล้ว (ยังไม่มีใครถูกระงับจริง) จึงลบสร้างใหม่ได้เลย
DROP TABLE IF EXISTS member_suspension;

CREATE TABLE member_suspension (
  Suspension_id INT NOT NULL AUTO_INCREMENT,
  Member_id INT NOT NULL,
  Admin_id INT NOT NULL,              -- ผู้ระงับ
  Suspended_at DATETIME NOT NULL,
  Suspended_time TIME NOT NULL,
  Suspension_reason VARCHAR(255) NULL,
  Activated_by INT NULL,              -- ผู้เปิดใช้งานคืน (NULL = ยังระงับอยู่)
  Activated_reason VARCHAR(255) NULL, -- เหตุผลที่ยกเลิกการระงับ
  Activated_at DATETIME NULL,
  Activated_time TIME NULL,
  PRIMARY KEY (Suspension_id),
  FOREIGN KEY (Member_id) REFERENCES member(Member_id),
  FOREIGN KEY (Admin_id) REFERENCES admin(Admin_id),
  FOREIGN KEY (Activated_by) REFERENCES admin(Admin_id)
);
