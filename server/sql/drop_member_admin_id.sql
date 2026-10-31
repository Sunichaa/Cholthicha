-- member.Admin_id ไม่เคยถูกอ่านหรือเขียนที่ไหนในโค้ดเลย (ตรวจสอบทั้ง server/index.js แล้ว) — ดูเหมือน
-- ตั้งใจไว้สำหรับ "แอดมินที่อนุมัติการสมัครสมาชิก" แต่ระบบสมัครสมาชิกจริงไม่มีขั้นตอนให้แอดมินอนุมัติ
-- (Member_status ถูกตั้งเป็น 'Active' ทันทีตอนสมัคร) จึงต่างจาก Admin_suspended/Admin_approved ที่มี
-- endpoint ใช้งานจริงอยู่แล้ว ต้องลบ FK constraint (member_ibfk_1) ก่อนถึงจะ DROP COLUMN ได้
ALTER TABLE member DROP FOREIGN KEY member_ibfk_1;
ALTER TABLE member DROP COLUMN Admin_id;
