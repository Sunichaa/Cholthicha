import { X } from 'lucide-react';
import ActivityDetailContent from './ActivityDetailContent';

// รูปสำรอง ใช้เมื่อกิจกรรมไม่มีรูปหรือโหลดรูปไม่ขึ้น
const FALLBACK = 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=400&q=80';

/* =====================================================================
 *  Modal รายละเอียดกิจกรรม ใช้แบบเดียวกันทุกจุดในแอป (แอดมิน / ผู้จัด / ผู้เข้าร่วม)
 *  รูป + ป้ายสถานะ (ถ้ามี) + ปุ่มปิด ด้านบน แล้วตามด้วย ActivityDetailContent
 *    activity          ข้อมูลกิจกรรม
 *    organizerName     ชื่อผู้จัด (ถ้ามี)
 *    organizerContact  ช่องทางติดต่อผู้จัด (ถ้ามี)
 *    rejectionReason   เหตุผลที่ไม่อนุมัติ (ถ้ามี)
 *    badge             ป้ายสถานะ: { label, className } หรือ { label, style }
 *    footer            ปุ่ม/องค์ประกอบเสริมท้าย modal เช่น ปุ่มอนุมัติ (ถ้ามี)
 *    onClose           ปิด modal (กดปุ่มปิดหรือคลิกพื้นหลัง)
 * ===================================================================== */
export default function ActivityDetailModal({ activity, organizerName, organizerContact, rejectionReason, badge, footer, onClose }) {
    if (!activity) return null;
    return (
        // พื้นหลังมืด: คลิกนอกกล่องเพื่อปิด
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', maxWidth: '640px', width: '100%', overflow: 'hidden', margin: 'auto' }}>
                {/* รูปกิจกรรม + ป้ายสถานะมุมซ้าย + ปุ่มปิดมุมขวา */}
                <div style={{ position: 'relative', height: '220px' }}>
                    <img src={activity.Image || FALLBACK} alt={activity.Activity_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = FALLBACK; }} />
                    {badge && (
                        <span
                            className={badge.className}
                            style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, fontSize: '12px', fontWeight: 700, padding: '4px 14px', borderRadius: '20px', ...badge.style }}
                        >
                            {badge.label}
                        </span>
                    )}
                    <button onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                        <X size={18} />
                    </button>
                </div>
                {/* ชื่อกิจกรรม + รายละเอียด + ส่วนท้าย (ถ้ามี) */}
                <div style={{ padding: '24px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', margin: '0 0 4px' }}>{activity.Activity_name}</h2>
                    <ActivityDetailContent activity={activity} organizerName={organizerName} organizerContact={organizerContact} rejectionReason={rejectionReason} />
                    {footer && <div style={{ marginTop: '20px' }}>{footer}</div>}
                </div>
            </div>
        </div>
    );
}
