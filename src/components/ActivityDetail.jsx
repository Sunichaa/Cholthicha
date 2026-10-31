import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import RegisterPage from './RegisterPage';
import ActivityDetailContent from './ActivityDetailContent';
import './ActivityDetail.css';

/* =====================================================================
 *  หน้ารายละเอียดกิจกรรม (route /activities/:id)
 *  แสดงรูป รายละเอียด และปุ่มสมัครเข้าร่วม — ยังไม่ login จะเปิดหน้าเข้าสู่ระบบแทน
 *    user        ผู้ใช้ที่ login อยู่ (ถ้ามี)
 *    onOpenAuth  เปิดหน้าเข้าสู่ระบบ/สมัครสมาชิก
 * ===================================================================== */

// รูปสำรองตามประเภทกิจกรรม ใช้เมื่อกิจกรรมไม่มีรูปหรือโหลดรูปไม่ขึ้น
const FALLBACK_IMAGES = {
  'สิ่งแวดล้อม': 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200&q=80',
  'การศึกษา': 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&q=80',
  'สุขภาพ': 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=1200&q=80',
  'default': 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1200&q=80',
};

export default function ActivityDetail({ user, onOpenAuth }) {
  const { id } = useParams();                             // Activity_id จาก URL
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRegister, setShowRegister] = useState(false); // เปิดฟอร์มสมัครอยู่หรือไม่

  // เข้าหน้ารายละเอียดจากหน้าที่เลื่อนลงมาแล้ว ให้เริ่มที่บนสุดเสมอ จะได้เห็นรูปภาพ
  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  // ดึงรายละเอียดกิจกรรม (ส่ง member_id ไปด้วยเพื่อให้รู้ว่าผู้ใช้สมัครแล้วหรือยัง)
  useEffect(() => {
    setLoading(true);
    const qs = user?.Member_id ? `?member_id=${user.Member_id}` : '';
    fetch(`http://localhost:5000/api/activities/${id}${qs}`)
      .then(res => {
        if (!res.ok) throw new Error('ไม่พบข้อมูลกิจกรรมนี้ในระบบ');
        return res.json();
      })
      .then(data => {
        setActivity(data.data || data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id, user]);

  // กำลังโหลด
  if (loading) return (
    <div style={{ padding: '100px 20px', textAlign: 'center', color: '#555', fontFamily: 'Sarabun, sans-serif' }}>
      กำลังโหลดรายละเอียดกิจกรรม...
    </div>
  );

  // โหลดไม่สำเร็จ / ไม่พบกิจกรรม
  if (error || !activity) return (
    <div style={{ padding: '100px 20px', textAlign: 'center', fontFamily: 'Sarabun, sans-serif' }}>
      <h2>เกิดข้อผิดพลาด</h2>
      <p style={{ color: 'red' }}>{error || 'ไม่พบข้อมูลกิจกรรมนี้'}</p>
      <Link to="/" style={{ color: '#2D7D46', textDecoration: 'underline' }}>กลับหน้าหลัก</Link>
    </div>
  );

  // ---------- สถานะสำหรับกล่องสมัคร ----------
  const registered = parseInt(activity.registered_count) || 0;             // จำนวนผู้สมัครแล้ว
  const capacity = activity.Capacity || 0;                                 // จำนวนที่รับ
  const pct = capacity > 0 ? Math.round((registered / capacity) * 100) : 0;
  const full = pct >= 100;                                                 // เต็มแล้ว
  const isRegistered = Number(activity.Is_registered) > 0;                 // ผู้ใช้คนนี้สมัครแล้ว
  // เปิดรับสมัครเมื่ออนุมัติแล้วและไม่ถูกยกเลิก/ระงับ
  // (Activity_status มีแค่ Draft/Pending/Approved/Rejected ไม่มีค่า 'Open')
  const isOpen = activity.Approval_status === 'Approved' && !activity.Activity_suspend_status;
  const imgSrc = activity.Image || FALLBACK_IMAGES[activity.Category_name] || FALLBACK_IMAGES.default;
  const locationStr = [activity.Location, activity.Subdistrict_name, activity.District_name].filter(Boolean).join(', ');

  // ปุ่มสมัคร: ยังไม่ login -> เปิดหน้าเข้าสู่ระบบ, login แล้ว -> เปิดฟอร์มสมัคร
  const handleRegisterClick = () => {
    if (!user) {
      onOpenAuth?.('login'); // เปิด login modal ถ้ายังไม่ login
    } else {
      setShowRegister(true);
    }
  };

  return (
    <div className="detail-wrap">
      <div className="detail-container">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> กลับหน้าหลัก
        </Link>

        {/* รูปกิจกรรม + ป้าย "เปิดรับสมัคร" */}
        <div className="detail-hero">
          <img src={imgSrc} alt={activity.Activity_name}
            onError={e => { e.target.src = FALLBACK_IMAGES.default; }} />
          {isOpen && <span className="detail-badge-open">เปิดรับสมัคร</span>}
        </div>

        <div className="detail-body">
          {/* ชื่อกิจกรรม + รายละเอียด (ใช้ ActivityDetailContent ดีไซน์เดียวกับหน้าอื่นในแอป) */}
          <h1 className="detail-title" style={{ marginBottom: '16px' }}>{activity.Activity_name}</h1>

          <ActivityDetailContent
            activity={{ ...activity, Location: locationStr || activity.Location }}
            organizerName={(activity.Organizer_first_name || activity.Organizer_last_name)
              ? `${activity.Organizer_first_name || ''} ${activity.Organizer_last_name || ''}`.trim()
              : null}
          />

          {/* กล่องสมัคร: สมัครแล้ว / ปิดรับสมัคร / เต็มแล้ว / ปุ่มสมัคร */}
          <div className="detail-register-box">
            {isRegistered ? (
              <p className="detail-closed-msg">คุณได้ลงทะเบียนเข้าร่วมกิจกรรมนี้แล้ว</p>
            ) : !isOpen ? (
              <p className="detail-closed-msg">กิจกรรมนี้ปิดรับสมัครแล้ว</p>
            ) : full ? (
              <p className="detail-closed-msg">ผู้สมัครเต็มจำนวนแล้ว</p>
            ) : (
              <>

                <button className="btn-register-detail" onClick={handleRegisterClick}>
                  {user ? 'สมัครเข้าร่วมกิจกรรมนี้' : 'สมัครเข้าร่วมกิจกกรม'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ฟอร์มสมัครเข้าร่วมกิจกรรม */}
      {showRegister && (
        <RegisterPage
          activity={activity}
          user={user}
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            setShowRegister(false);
            // สมัครสำเร็จ: โหลดข้อมูลกิจกรรมใหม่เพื่ออัปเดตจำนวนผู้สมัครและสถานะ "สมัครแล้ว"
            const qs = user?.Member_id ? `?member_id=${user.Member_id}` : '';
            fetch(`http://localhost:5000/api/activities/${id}${qs}`)
              .then(r => r.json())
              .then(d => setActivity(d.data || d));
          }}
        />
      )}
    </div>
  );
}
