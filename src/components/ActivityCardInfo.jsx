import { MapPin, Calendar, Clock, Users } from 'lucide-react';

// จัดรูปแบบวันที่เป็นภาษาไทย เช่น "29 กันยายน 2569" (ไม่มีค่าแสดง "-")
function fmt(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}
// ตัดเวลาเหลือแค่ ชั่วโมง:นาที เช่น "08:30:00" -> "08:30"
function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }

// บล็อกข้อมูลกิจกรรมบนการ์ด ใช้ดีไซน์เดียวกันทุกหน้า (หน้าแรก / แอดมิน / ผู้จัด / ผู้เข้าร่วม):
// สถานที่จัดกิจกรรม / วันที่จัดกิจกรรม / เวลาทำกิจกรรม (ถ้ามี) / รับสมัครตั้งแต่วันที่ (ถ้ามี) / จำนวน
export default function ActivityCardInfo({ activity }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', color: '#64748b' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <MapPin size={13} color="#2D7D46" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>สถานที่จัดกิจกรรม: {activity.Location || '-'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={13} color="#2D7D46" />
                <span>วันที่จัดกิจกรรม: {fmt(activity.Activity_start)}</span>
            </div>
            {(activity.Activity_start_time || activity.Activity_end_time) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} color="#2D7D46" />
                    <span>เวลาทำกิจกรรม: {fmtTime(activity.Activity_start_time)} – {fmtTime(activity.Activity_end_time)} น.</span>
                </div>
            )}
            {(activity.Registration_start || activity.Registration_end) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={13} color="#94a3b8" />
                    <span>รับสมัครตั้งแต่วันที่: {fmt(activity.Registration_start)} – {fmt(activity.Registration_end)}</span>
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={13} color="#2D7D46" />
                <span>จำนวน {activity.Capacity || '-'} คน</span>
            </div>
        </div>
    );
}
