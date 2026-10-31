import { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { registerActivity } from '../api';
import './RegisterPage.css';

/* =====================================================================
 *  Modal ฟอร์มสมัครเข้าร่วมกิจกรรม
 *  กรอกชื่อ-นามสกุล (ดึงจากโปรไฟล์มาใส่ให้ก่อน) แล้วส่งไปที่ /api/activities/:id/register
 *    activity   กิจกรรมที่จะสมัคร
 *    user       ผู้ใช้ที่ login อยู่ (ไม่มี = สมัครแบบ Guest)
 *    onClose    ปิด modal
 *    onSuccess  เรียกเมื่อสมัครสำเร็จ (ให้หน้าที่เปิดมาโหลดข้อมูลใหม่)
 * ===================================================================== */
export default function RegisterPage({ activity, user, onClose, onSuccess }) {
  // ชื่อ-นามสกุลที่จะใช้สมัคร (บันทึกลง Registration_fname / Registration_lname)
  const [form, setForm] = useState({
    fname: user?.First_name || '',
    lname: user?.Last_name || '',
  });
  const [loading, setLoading] = useState(false); // กำลังส่งข้อมูล
  const [done, setDone] = useState(false);       // สมัครสำเร็จแล้ว -> แสดงหน้าจอสำเร็จ
  const [error, setError] = useState('');

  // ไม่มีข้อมูลกิจกรรม -> ไม่ render อะไรเลย
  if (!activity) return null;

  // ส่งฟอร์มสมัคร: ต้องกรอกชื่อและนามสกุล ถ้า backend ปฏิเสธ (เต็ม/ปิดรับ/สมัครซ้ำ) แสดงข้อความที่ได้กลับมา
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.fname || !form.lname) { setError('กรุณากรอกชื่อและนามสกุล'); return; }
    setLoading(true); setError('');
    try {
      await registerActivity(activity.Activity_id, {
        member_id: user?.Member_id || null,
        fname: form.fname,
        lname: form.lname,
      });
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={20} /></button>

        {/* สมัครสำเร็จ -> หน้าจอยืนยัน, ยังไม่สมัคร -> ฟอร์ม */}
        {done ? (
          <div className="modal-success">
            <CheckCircle size={56} color="var(--green)" />
            <h2>ลงทะเบียนสำเร็จ!</h2>
            <p>คุณได้สมัครเข้าร่วม<br /><strong>{activity.Activity_name}</strong></p>
            <button className="btn-green" onClick={onClose}>ปิด</button>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <h2>สมัครเข้าร่วมกิจกรรม</h2>
              <p className="modal-activity-name">{activity.Activity_name}</p>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-row">
                <label className="form-group-label">
                  {/* ครอบข้อความหัวข้อกับเครื่องหมาย * ไว้ด้วยกัน ให้อยู่บรรทัดเดียวกัน */}
                  <div className="label-text-wrapper">
                    <span>ชื่อ</span>
                    <span className="req">*</span>
                  </div>
                  <input
                    type="text"
                    placeholder="ชื่อ"
                    value={form.fname}
                    onChange={e => setForm({ ...form, fname: e.target.value })}
                  />
                </label>

                <label className="form-group-label">
                  <div className="label-text-wrapper">
                    <span>นามสกุล</span>
                    <span className="req">*</span>
                  </div>
                  <input
                    type="text"
                    placeholder="นามสกุล"
                    value={form.lname}
                    onChange={e => setForm({ ...form, lname: e.target.value })}
                  />
                </label>
              </div>

              {/* หมายเหตุสำหรับผู้ที่ยังไม่ได้ login */}
              {!user && (
                <div className="guest-note">
                  <AlertCircle size={14} />
                  <span>คุณกำลังสมัครในฐานะ Guest หากต้องการติดตามกิจกรรม กรุณาเข้าสู่ระบบก่อน</span>
                </div>
              )}
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="btn-green" disabled={loading}>
                {loading ? 'กำลังส่ง...' : 'ยืนยันการสมัคร'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
