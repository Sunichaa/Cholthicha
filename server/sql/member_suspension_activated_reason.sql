-- เก็บเหตุผลที่ยกเลิกการระงับ (ก่อนหน้านี้มีแค่ Activated_by/Activated_at/Activated_time
-- ที่บอกว่าใคร/วันที่/เวลาไหนเป็นคนเปิดใช้งานคืน แต่ไม่มีช่องเก็บเหตุผลประกอบการเปิดใช้งานคืน)
ALTER TABLE member_suspension
  ADD COLUMN Activated_reason VARCHAR(255) NULL AFTER Activated_by;
