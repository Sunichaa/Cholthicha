import { Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import ActivityCardInfo from './ActivityCardInfo';
import './ActivityCard.css';

/* =====================================================================
 *  การ์ดกิจกรรมบนหน้าแรก
 *  แสดงรูป, ป้ายประเภท, ข้อมูลกิจกรรม, แถบจำนวนผู้สมัคร และปุ่มรายละเอียด/สมัคร
 *  การ์ดจะไม่แสดงเลย (คืน null) ถ้ากิจกรรมเป็นร่าง ยังไม่อนุมัติ หรือยังไม่ถึงวันเปิดรับสมัคร
 *    activity    ข้อมูลกิจกรรม
 *    onRegister  เรียกเมื่อกดปุ่มสมัคร
 *    isLoggedIn  ผู้ใช้ login อยู่หรือไม่
 * ===================================================================== */

// สีป้ายตามประเภทกิจกรรม (ประเภทอื่นใช้สีเขียวหลัก)
const CAT_COLORS = {
  'สิ่งแวดล้อม': '#0891B2',
  'การศึกษา': '#7C3AED',
  'ชุมชน': '#D97706',
  'สังคม': '#EA580C',
  'สุขภาพ': '#DC2626',
};

// รูปสำรองตามประเภทกิจกรรม ใช้เมื่อกิจกรรมไม่มีรูปหรือโหลดรูปไม่ขึ้น
const FALLBACK_IMAGES = {
  'สิ่งแวดล้อม': 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&q=80',
  'การศึกษา': 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&q=80',
  'สุขภาพ': 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=600&q=80',
  'default': 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&q=80',
};

export default function ActivityCard({ activity, onRegister, isLoggedIn }) {
  if (!activity) return null;

  // ─── 1. เช็กสถานะร่าง/อนุมัติ (แปลงเป็นตัวพิมพ์เล็กและตัดช่องว่างก่อนเทียบ) ───
  const rawStatus = String(activity.Activity_status || '').trim().toLowerCase();
  const rawApproval = String(activity.Approval_status || '').trim().toLowerCase();

  const isDraft = rawStatus === 'draft' || rawStatus === 'ร่าง';
  const isApproved = rawApproval === 'approved' || rawApproval === 'อนุมัติ';

  // ซ่อนถ้าเป็น Draft หรือ แอดมินยังไม่ได้อนุมัติ
  if (isDraft || !isApproved) {
    return null;
  }

  // ─── 2. เช็กวันเปิด-ปิดรับสมัคร ──────────────────────────────────────
  const now = new Date();

  // วันเปิดสมัคร: ถ้ายังไม่ถึงวัน -> ซ่อนการ์ด
  if (activity.Registration_start) {
    const regStart = new Date(activity.Registration_start);
    regStart.setHours(0, 0, 0, 0);
    if (now < regStart) return null;
  }

  // วันปิดสมัคร: เลยวันแล้ว -> ยังแสดงการ์ด แต่ปุ่มเป็น "ปิดรับสมัคร"
  let isExpired = false;
  if (activity.Registration_end) {
    const regEnd = new Date(activity.Registration_end);
    regEnd.setHours(23, 59, 59, 999);
    if (now > regEnd) {
      isExpired = true;
    }
  }

  // ─── 3. คำนวณจำนวนคนและสถานะเปิดรับสมัคร ─────────────────────────────
  const registered = parseInt(activity.registered_count) || 0;             // จำนวนผู้สมัครแล้ว
  const capacity = activity.Capacity || 0;                                 // จำนวนที่รับ (0 = ไม่จำกัด)
  const pct = capacity > 0 ? Math.round((registered / capacity) * 100) : 0; // เปอร์เซ็นต์ที่เต็ม
  const full = capacity > 0 && registered >= capacity;                     // เต็มแล้ว
  const almost = pct >= 80;                                                // ใกล้เต็ม (>= 80%)

  // โดนสั่งปิดโดยตรง
  const isExplicitlyClosed = rawStatus === 'closed' || rawStatus === 'ปิด' || rawStatus === 'ปิดรับสมัคร';

  // เปิดรับสมัครเมื่อ: อนุมัติแล้ว + ไม่โดนสั่งปิด + ไม่หมดอายุ
  const isOpen = isApproved && !isExplicitlyClosed && !isExpired;

  // ─── 4. กำหนดข้อความปุ่ม (ลำดับ: สมัครแล้ว > เต็มแล้ว > ปิดรับสมัคร > สมัครกิจกรรม) ───
  const isRegistered = Number(activity.Is_registered) > 0;
  let buttonText = 'สมัครกิจกรรม';
  let isBtnDisabled = false;

  if (isRegistered) {
    buttonText = 'สมัครแล้ว';
    isBtnDisabled = true;
  } else if (full) {
    buttonText = 'เต็มแล้ว';
    isBtnDisabled = true;
  } else if (!isOpen) {
    buttonText = 'ปิดรับสมัคร';
    isBtnDisabled = true;
  }

  // ─── 5. ข้อมูลสำหรับแสดงผล: สีป้าย, รูป, สถานที่ (สถานที่, ตำบล, อำเภอ) ───
  const catColor = CAT_COLORS[activity.Category_name] || '#2D7D46';
  const imgSrc = activity.Image || FALLBACK_IMAGES[activity.Category_name] || FALLBACK_IMAGES.default;
  const locationStr = [activity.Location, activity.Subdistrict_name, activity.District_name]
    .filter(Boolean).join(', ') || '-';

  return (
    <div className="card">
      {/* รูปกิจกรรม + ป้าย "เปิดรับสมัคร" + ป้ายประเภท */}
      <div className="card-img-wrap">
        <img
          src={imgSrc}
          alt={activity.Activity_name}
          className="card-img"
          loading="lazy"
          onError={e => { e.target.src = FALLBACK_IMAGES.default; }}
        />
        {isOpen && !full && <span className="badge-open">เปิดรับสมัคร</span>}
        {activity.Category_name && (
          <span className="badge-cat" style={{ background: catColor }}>
            <Tag size={10} /> {activity.Category_name}
          </span>
        )}
      </div>

      <div className="card-body">
        <h3 className="card-title">{activity.Activity_name}</h3>

        <ActivityCardInfo activity={{ ...activity, Location: locationStr }} />

        {/* แถบจำนวนผู้สมัคร: เขียว = ปกติ, เหลือง = ใกล้เต็ม, แดง = เต็ม */}
        {capacity > 0 && (
          <div className="progress-wrap">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: full ? '#DC2626' : almost ? '#F59E0B' : '#2D7D46'
                }}
              />
            </div>
            <span className="progress-label" style={{ color: full ? '#DC2626' : almost ? '#D97706' : '#2D7D46' }}>
              {registered}/{capacity} คน 
            </span>
          </div>
        )}

        {/* ปุ่มดูรายละเอียด (ไปหน้า /activities/:id) และปุ่มสมัคร */}
        <div className="card-actions">
          <Link to={`/activities/${activity.Activity_id}`} className="btn-detail">
            รายละเอียด
          </Link>

          <button
            className={`btn-register ${isBtnDisabled ? 'full' : ''}`}
            onClick={() => !isBtnDisabled && onRegister?.(activity)}
            disabled={isBtnDisabled}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}