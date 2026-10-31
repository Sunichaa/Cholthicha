-- แยกตาราง "ระงับ" (ความสัมพันธ์ M:N ระหว่างผู้ดูแลระบบ และสมาชิก ในไดอะแกรม ER)
-- ออกจากคอลัมน์ Suspended_at / Suspended_time / Suspension_reason เดิมที่อยู่ในตาราง member
-- เก็บว่าใครระงับใคร (Member_id + Admin_id เป็น primary key ร่วม) พร้อมวันที่/เวลา/เหตุผล
-- แถวจะมีอยู่แค่ตอนที่สมาชิกถูกระงับอยู่เท่านั้น — เปิดใช้งานบัญชีคืนจะลบแถวทิ้ง (ไม่ใช่ตาราง log ประวัติ)

CREATE TABLE member_suspension (
  Member_id INT NOT NULL,
  Admin_id INT NOT NULL,
  Suspended_at DATETIME NOT NULL,
  Suspended_time TIME NOT NULL,
  Suspension_reason VARCHAR(255) NULL,
  PRIMARY KEY (Member_id, Admin_id),
  FOREIGN KEY (Member_id) REFERENCES member(Member_id),
  FOREIGN KEY (Admin_id) REFERENCES admin(Admin_id)
);

-- ย้ายข้อมูลระงับที่มีอยู่เดิม (ไม่รู้ว่าแอดมินคนไหนเป็นคนกด จึงใช้แอดมิน id ต่ำสุดเป็นค่าเริ่มต้น)
-- ปรับ Admin_id ตรงนี้เองถ้าต้องการระบุแอดมินที่ถูกต้องกว่านี้ก่อนรัน
INSERT INTO member_suspension (Member_id, Admin_id, Suspended_at, Suspended_time, Suspension_reason)
SELECT Member_id, (SELECT MIN(Admin_id) FROM admin), COALESCE(Suspended_at, NOW()),
       COALESCE(Suspended_time, CURTIME()), Suspension_reason
FROM member
WHERE Suspended = 1;

-- คอลัมน์เดิมย้ายออกไปอยู่ในตารางใหม่หมดแล้ว เหลือ Suspended (flag) ไว้เช็คสถานะเร็ว ๆ ตอน login
ALTER TABLE member
  DROP COLUMN Suspended_at,
  DROP COLUMN Suspended_time,
  DROP COLUMN Suspension_reason;
