-- admin.Admin_cancelled ไม่มี FK constraint ผูกกับตารางไหนเลย และไม่เคยถูกอ่าน/เขียนที่ไหนในโค้ด
-- (การบันทึกว่าแอดมินคนไหนเป็นคนกดยกเลิกกิจกรรมแทนผู้จัด ใช้ activity.Admin_cancelled อยู่แล้ว
-- ซึ่งเป็นคนละคอลัมน์กัน) จึงเป็นคอลัมน์ที่ตกค้างไม่มีจุดประสงค์ ลบทิ้งได้เลย
ALTER TABLE admin DROP COLUMN Admin_cancelled;
