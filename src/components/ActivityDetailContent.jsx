import { MapPin, Calendar, Clock, Users, Tag, User, ExternalLink } from 'lucide-react';

// จัดรูปแบบวันที่เป็นภาษาไทย เช่น "29 กันยายน 2569" (ไม่มีค่าแสดง "-")
function fmt(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}
// ตัดเวลาเหลือแค่ ชั่วโมง:นาที (ไม่มีค่าแสดง "-")
function fmtTime(t) { return t ? String(t).slice(0, 5) : '-'; }

// แกะพิกัด lat,lng จากลิงก์ Google Maps ที่ระบบบันทึกไว้ (รูปแบบเดียวกับที่ LocationPicker สร้าง เช่น
// https://www.google.com/maps?q=13.75,100.50 หรือ .../@13.75,100.50,15z) — ลิงก์แบบย่อ (maps.app.goo.gl)
// แกะพิกัดฝั่ง client ไม่ได้ จึงไม่แสดงแผนที่ฝัง แต่ยังมีปุ่มเปิดใน Google Maps ให้
function parseLatLng(url) {
    if (!url) return null;
    let m = String(url).match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!m) m = String(url).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

// เนื้อหารายละเอียดกิจกรรมแบบเดียวกันทุกที่ในแอป: หมวดหมู่ -> ผู้จัดกิจกรรม (ชื่อเท่านั้น)
// -> กริดข้อมูล (สถานที่/วันที่/เวลา/จำนวน/ช่วงรับสมัคร) -> progress bar -> รายละเอียด -> เหตุผลไม่อนุมัติ (ถ้ามี)
export default function ActivityDetailContent({ activity, organizerName, organizerContact, rejectionReason }) {
    const registered = parseInt(activity.registered_count) || 0;
    const capacity = activity.Capacity || 0;
    const pct = capacity > 0 ? Math.round((registered / capacity) * 100) : 0;
    const hasRegPeriod = activity.Registration_start || activity.Registration_end;
    const description = activity.Activity_description || activity.Activity_detail || 'ไม่มีรายละเอียดเพิ่มเติม';
    // วันที่จัด: ถ้าจัดหลายวันแสดงเป็นช่วง "วันเริ่ม - วันสิ้นสุด"
    const dateRange = (activity.Activity_end && activity.Activity_end !== activity.Activity_start)
        ? `${fmt(activity.Activity_start)} - ${fmt(activity.Activity_end)}`
        : fmt(activity.Activity_start);

    // รายการในกริดข้อมูล: [ไอคอน, หัวข้อ, ค่า]
    const infoItems = [
        [<MapPin size={14} color="#2D7D46" />, 'สถานที่', activity.Location || '-'],
        [<Calendar size={14} color="#2D7D46" />, 'วันที่จัดกิจกรรม', dateRange],
        [<Clock size={14} color="#2D7D46" />, 'เวลา', `${fmtTime(activity.Activity_start_time)} - ${fmtTime(activity.Activity_end_time)} น.`],
        [<Users size={14} color="#2D7D46" />, 'จำนวนรับสมัคร', `${registered}/${capacity || '-'} คน`],
    ];
    // ที่อยู่: จังหวัด / อำเภอ / ตำบล (แสดงเฉพาะที่มีข้อมูล)
    if (activity.Province_name) infoItems.push([<MapPin size={14} color="#2D7D46" />, 'จังหวัด', activity.Province_name]);
    if (activity.District_name) infoItems.push([<MapPin size={14} color="#2D7D46" />, 'อำเภอ', activity.District_name]);
    if (activity.Subdistrict_name) infoItems.push([<MapPin size={14} color="#2D7D46" />, 'ตำบล', activity.Subdistrict_name]);
    if (hasRegPeriod) {
        infoItems.push([<Calendar size={14} color="#94a3b8" />, 'ช่วงรับสมัคร', `${fmt(activity.Registration_start)} - ${fmt(activity.Registration_end)}`]);
    }

    // ลิงก์แผนที่และพิกัด (ใช้ฝังแผนที่ถ้าแกะพิกัดได้)
    const mapUrl = activity.Location_url || '';
    const coords = parseLatLng(mapUrl);

    return (
        <>
            {/* ป้ายประเภทกิจกรรม */}
            {activity.Category_name && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#2D7D46', background: '#f0fdf4', padding: '3px 10px', borderRadius: '20px', marginBottom: '14px' }}>
                    <Tag size={11} /> {activity.Category_name}
                </div>
            )}

            {/* กล่องชื่อผู้จัดกิจกรรม (+ ช่องทางติดต่อถ้ามี) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px', marginBottom: '16px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={16} color="#0284c7" />
                </div>
                <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ผู้จัดกิจกรรม</div>
                    <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>{organizerName || 'ไม่ทราบผู้จัด'}</div>
                    {organizerContact && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>{organizerContact}</div>
                    )}
                </div>
            </div>

            {/* กริดข้อมูลกิจกรรม 2 คอลัมน์ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                {infoItems.map(([icon, label, val], i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <div style={{ marginTop: '2px', flexShrink: 0 }}>{icon}</div>
                        <div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                            <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{val}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* แผนที่: ฝัง Google Maps (ถ้าแกะพิกัดได้) + ลิงก์เปิดใน Google Maps */}
            {mapUrl && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>แผนที่</div>
                    {coords && (
                        <iframe
                            title="แผนที่สถานที่จัดกิจกรรม"
                            src={`https://www.google.com/maps?q=${coords[0]},${coords[1]}&z=15&output=embed`}
                            style={{ width: '100%', height: '240px', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'block' }}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            allowFullScreen
                        />
                    )}
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '13px', color: '#2D7D46', fontWeight: '600', textDecoration: 'none' }}>
                        <ExternalLink size={13} /> เปิดใน Google Maps
                    </a>
                </div>
            )}

            {/* แถบเปอร์เซ็นต์ที่นั่งที่เต็มแล้ว (แดงเมื่อเต็ม) */}
            {capacity > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct >= 100 ? '#dc2626' : '#2D7D46', borderRadius: '3px' }} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{pct}% เต็ม</div>
                </div>
            )}

            {/* คำอธิบายกิจกรรม */}
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>รายละเอียดกิจกรรม</div>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.7', margin: rejectionReason ? '0 0 16px' : 0 }}>
                {description}
            </p>

            {/* เหตุผลที่ไม่อนุมัติ (แสดงเฉพาะกิจกรรมที่ถูกปฏิเสธ) */}
            {rejectionReason && (
                <div style={{ fontSize: '13px', color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: '10px' }}>
                    <strong>เหตุผลที่ไม่อนุมัติ:</strong> {rejectionReason}
                </div>
            )}
        </>
    );
}
