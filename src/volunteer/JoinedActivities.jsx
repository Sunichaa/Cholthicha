/* =====================================================================
 *  หน้า "กิจกรรมที่เข้าร่วม" ของผู้เข้าร่วมกิจกรรม (volunteer)
 *
 *  แสดงการ์ดกิจกรรมทุกรายการที่ผู้ใช้เคยสมัคร พร้อมปุ่ม
 *    - รายละเอียดกิจกรรม          เปิด modal รายละเอียด
 *    - ติดต่อผู้จัด               ไปหน้าแชตกับผู้จัดกิจกรรม
 *    - ยกเลิกการเข้าร่วมกิจกรรม    (เฉพาะกรณีที่ยังยกเลิกได้)
 *    - ดาวน์โหลดใบประกาศนียบัตร    (เฉพาะกรณีที่เข้าร่วมผ่านแล้ว)
 * ===================================================================== */

import React, { useState, useEffect } from 'react';
import { MapPin, Calendar, Clock, Users, MessageCircle, X, Award, AlertCircle, Eye } from 'lucide-react';
import ActivityDetailModal from '../components/ActivityDetailModal';
import { notify } from '../notice';
import Pagination from '../components/Pagination';
import usePagination from '../usePagination';
import DateFilter from '../components/DateFilter';
import { EMPTY_DATE_FILTER, matchDateFilter, yearsOf, dateFilterKey } from '../dateFilter';


/* ---------------------------------------------------------------------
 *  ค่าคงที่
 * --------------------------------------------------------------------- */

// รูปสำรองตามประเภทกิจกรรม ใช้เมื่อกิจกรรมไม่มีรูป หรือโหลดรูปไม่ขึ้น
const FALLBACK_IMAGES = {
    'สิ่งแวดล้อม': 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&q=80',
    'การศึกษา': 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&q=80',
    'สุขภาพ': 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=600&q=80',
    'default': 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&q=80',
};

// ป้ายสถานะมุมซ้ายบนของการ์ด: ข้อความ, สีพื้นหลัง, สีตัวอักษร
const STATUS_BADGE = {
    registered: { label: 'สมัครแล้ว', bg: '#dbeafe', color: '#1d4ed8' },       // สมัครไว้ กิจกรรมยังไม่จบ
    done: { label: 'เข้าร่วมแล้ว', bg: '#dcfce7', color: '#16a34a' },          // กิจกรรมจบแล้ว
    cancelled: { label: 'ยกเลิกแล้ว', bg: '#fee2e2', color: '#dc2626' },       // ผู้เข้าร่วมยกเลิกการสมัครเอง
    // ผู้จัดกิจกรรมเป็นคนยกเลิกกิจกรรมทั้งงาน (ต่างจาก 'cancelled' ที่ผู้เข้าร่วมยกเลิกการสมัครเอง)
    activity_cancelled: { label: 'กิจกรรมถูกยกเลิก', bg: '#fee2e2', color: '#dc2626' },
};


/* ---------------------------------------------------------------------
 *  ฟังก์ชันช่วย
 * --------------------------------------------------------------------- */

// แปลง path รูปจาก DB ให้เป็น URL เต็ม
// - ถ้าเป็น URL เต็ม (http/https) หรือ data URI อยู่แล้ว ใช้ตามเดิม
// - ถ้าเป็น path ภายใน เช่น "/uploads/img_123.jpg" จะเติมที่อยู่ backend ไว้ข้างหน้า
function getFullImageUrl(path) {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `http://localhost:5000${cleanPath}`;
}

// จัดรูปแบบวันที่เป็นภาษาไทย เช่น "29 กันยายน 2569" (ไม่มีค่าแสดง "-")
function fmt(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ตัดเวลาเหลือแค่ ชั่วโมง:นาที เช่น "08:30:00" -> "08:30"
function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }

// เช็กว่ายังยกเลิกการสมัครได้ไหม: ต้องเหลือเวลาก่อนวันจัดกิจกรรมอย่างน้อย 3 วัน
// (ผลต่างเป็นมิลลิวินาที หารด้วย 1000*60*60*24 เพื่อแปลงเป็นจำนวนวัน)
// ถ้าจะเปลี่ยนจำนวนวัน ให้แก้ข้อความเตือนในการ์ด ("อย่างน้อย 3 วัน") ให้ตรงกันด้วย
function canCancel(activityStart) {
    if (!activityStart) return false; // ไม่มีวันจัดกิจกรรม -> ยกเลิกไม่ได้
    return (new Date(activityStart) - new Date()) / (1000 * 60 * 60 * 24) >= 3;
}

// คำนวณป้ายสถานะสำหรับ modal รายละเอียด (ใช้ตรรกะเดียวกับป้ายบนการ์ดในรายการ)
function statusBadgeFor(item) {
    const isCancelled = !!item.Cancel_date;
    const isActivityCancelled = !!item.Activity_suspend_status;
    const isFinished = item.Activity_end ? new Date(item.Activity_end) < new Date() : false;
    const isDone = isFinished && item.Participation_result === 'P';
    const key = isCancelled ? 'cancelled' : isActivityCancelled ? 'activity_cancelled' : (isDone || isFinished) ? 'done' : 'registered';
    const b = STATUS_BADGE[key];
    return { label: b.label, style: { background: b.bg, color: b.color } };
}


/* ---------------------------------------------------------------------
 *  Modal ยืนยันการยกเลิกการเข้าร่วม
 *    activity   กิจกรรมที่จะยกเลิก (ใช้แสดงชื่อ)
 *    onConfirm  เรียกพร้อมเหตุผล เมื่อกด "ยืนยันยกเลิก"
 *    onClose    ปิด modal (กด "ไม่ยกเลิก" หรือคลิกพื้นหลัง)
 * --------------------------------------------------------------------- */
function CancelModal({ activity, onConfirm, onClose }) {
    // เหตุผลที่ยกเลิก (บังคับกรอก) — บันทึกลงคอลัมน์ Cancel_reason ของตาราง registration
    const [reason, setReason] = useState('');

    // ไม่กรอกเหตุผล -> แจ้งเตือนและไม่ส่งคำขอ
    const handleConfirmClick = () => {
        if (!reason.trim()) {
            notify('กรุณากรอกเหตุผลที่ยกเลิกการเข้าร่วม', 'warning');
            return;
        }
        onConfirm(reason);
    };

    return (
        // พื้นหลังมืด: คลิกนอกกล่องเพื่อปิด modal
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            {/* กล่อง modal: stopPropagation กันคลิกข้างในแล้ว modal ปิด */}
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '100%', fontFamily: 'Sarabun,sans-serif' }}>
                {/* ไอคอนเตือน + หัวข้อ + ชื่อกิจกรรม */}
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ width: '56px', height: '56px', background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <AlertCircle size={28} color="#dc2626" />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: '0 0 8px' }}>ยืนยันการยกเลิก</h3>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                        คุณต้องการยกเลิกการสมัครกิจกรรม<br />
                        <strong style={{ color: '#1e293b' }}>"{activity.Activity_name}"</strong> ใช่หรือไม่?
                    </p>
                </div>

                {/* ช่องกรอกเหตุผล */}
                <textarea
                    rows={3}
                    placeholder="กรุณาระบุเหตุผลที่ยกเลิกการเข้าร่วม..."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', marginBottom: '16px', fontFamily: 'inherit', resize: 'vertical' }}
                />

                {/* ปุ่ม ไม่ยกเลิก / ยืนยันยกเลิก */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '11px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>ไม่ยกเลิก</button>
                    <button onClick={handleConfirmClick} style={{ flex: 1, padding: '11px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>ยืนยันยกเลิก</button>
                </div>
            </div>
        </div>
    );
}


/* ---------------------------------------------------------------------
 *  หน้าหลัก: รายการกิจกรรมที่เข้าร่วม
 *    user                   ผู้ใช้ที่ login อยู่ (ใช้ Member_id ดึงข้อมูล)
 *    onNavigate             เปลี่ยนเมนูในแดชบอร์ด เช่น ไปหน้า "แชต" / "ใบประกาศนียบัตร"
 *    onContactOrganizer     เปิดแชตกับผู้จัดกิจกรรม (ถ้าไม่ส่งมาจะใช้ onNavigate แทน)
 *    onDownloadCertificate  เปิดใบประกาศของกิจกรรมนั้น (ถ้าไม่ส่งมาจะไปหน้าใบประกาศแทน)
 * --------------------------------------------------------------------- */
export default function JoinedActivities({ user, onNavigate, onContactOrganizer, onDownloadCertificate }) {
    const [list, setList] = useState([]);                   // รายการกิจกรรมที่สมัครไว้ทั้งหมด
    const [loading, setLoading] = useState(true);           // กำลังโหลดข้อมูล
    const [error, setError] = useState(null);               // ข้อความ error ตอนโหลดไม่สำเร็จ
    const [cancelTarget, setCancelTarget] = useState(null); // กิจกรรมที่กำลังจะยกเลิก (มีค่า = เปิด CancelModal)
    const [detailTarget, setDetailTarget] = useState(null); // กิจกรรมที่กำลังดูรายละเอียด (มีค่า = เปิด modal รายละเอียด)
    // ตัวกรองวัน / เดือน / ปี (ดูจากวันเริ่มจัดกิจกรรม)
    const [dateFilter, setDateFilter] = useState(EMPTY_DATE_FILTER);
    const [toast, setToast] = useState('');                 // ข้อความแจ้งผลสำเร็จด้านบนรายการ

    // ---------- ดึงรายการกิจกรรมที่ผู้ใช้สมัครไว้ ----------
    const fetchList = () => {
        if (!user?.Member_id) { setError('กรุณาเข้าสู่ระบบก่อน'); setLoading(false); return; }
        setLoading(true);
        fetch(`http://localhost:5000/api/my-activities/${user.Member_id}`)
            .then(r => { if (!r.ok) throw new Error('ดึงข้อมูลไม่สำเร็จ'); return r.json(); })
            .then(d => {
                console.log('ข้อมูลกิจกรรมที่ดึงได้:', d.data);
                setList(d.data || []);
                setLoading(false);
            })
            .catch(e => { setError(e.message); setLoading(false); });
    };

    // โหลดรายการใหม่ทุกครั้งที่ผู้ใช้เปลี่ยน (รวมถึงตอนเปิดหน้าครั้งแรก)
    useEffect(() => { fetchList(); }, [user]);

    // ---------- ยืนยันยกเลิกการเข้าร่วม (เรียกจาก CancelModal) ----------
    // ส่งเหตุผลไปที่ API แล้วปิด modal ถ้าสำเร็จจะแสดงข้อความ 3 วินาทีและโหลดรายการใหม่
    const handleConfirmCancel = (reason) => {
        if (!cancelTarget) return;
        fetch(`http://localhost:5000/api/registrations/${cancelTarget.Registration_id}/cancel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
        })
            .then(r => r.json())
            .then(d => {
                setCancelTarget(null);
                if (d.success) { setToast('ยกเลิกการสมัครสำเร็จ'); fetchList(); setTimeout(() => setToast(''), 3000); }
                else notify(d.message || 'ยกเลิกไม่สำเร็จ', 'error');
            })
            .catch(() => { setCancelTarget(null); notify('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', 'error'); });
    };

    // ---------- ปุ่ม "ติดต่อผู้จัด" ----------
    // รวบรวมข้อมูลผู้จัดกิจกรรมและห้องแชต (Registration_id) แล้วส่งต่อไปหน้าแชต
    const handleContactClick = (item, img) => {
        // ดึงเฉพาะ ID ของผู้จัดจริง ห้ามใช้ item.Member_id เพราะเป็น ID ของผู้เข้าร่วมเอง
        const targetId = item.Organizer_id || item.Organizer_member_id || item.created_by || item.organizer_id;
        const targetFirstName = item.Organizer_first_name || item.Organizer_fname || item.Organizer_name || 'ผู้จัดกิจกรรม';
        const targetLastName = item.Organizer_last_name || item.Organizer_lname || '';

        if (!targetId) {
            notify('ไม่พบข้อมูลผู้จัดกิจกรรมนี้ กรุณาลองใหม่อีกครั้ง', 'warning');
            return;
        }

        const organizerData = {
            Organizer_id: targetId,
            Member_id: targetId, // ใช้ targetId เดียวกันเพื่อส่งไปยัง ChatView
            First_name: targetFirstName,
            Last_name: targetLastName,
            Role: item.Organizer_status || 'ผู้จัดกิจกรรม',
            Activity_id: item.Activity_id,
            Activity_name: item.Activity_name,
            Activity_image: img,
            Registration_id: item.Registration_id
        };

        if (onContactOrganizer) {
            onContactOrganizer(organizerData);
        } else {
            onNavigate?.('แชต', organizerData);
        }
    };

    // กรองตามวัน / เดือน / ปีที่จัดกิจกรรม และปีที่มีให้เลือก
    const filteredList = list.filter(item => matchDateFilter(item.Activity_start, dateFilter));
    const activityYears = yearsOf(list, item => item.Activity_start);

    // แบ่งหน้าละ 9 การ์ด (ต้องเรียก hook ก่อน return แบบมีเงื่อนไขด้านล่าง) — เปลี่ยนตัวกรองแล้วกลับไปหน้า 1
    const { page, setPage, totalPages, pageItems } = usePagination(filteredList, 9, dateFilterKey(dateFilter));

    // ---------- สถานะกำลังโหลด / โหลดไม่สำเร็จ ----------
    if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontFamily: 'Sarabun,sans-serif' }}>กำลังโหลดกิจกรรมของคุณ...</div>;
    if (error) return <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444', fontFamily: 'Sarabun,sans-serif' }}>{error}</div>;

    return (
        <div style={{ padding: '28px', fontFamily: 'Sarabun,sans-serif' }}>
            {/* หัวข้อหน้า + จำนวนกิจกรรม (หลังกรอง) + ตัวกรองวัน / เดือน / ปี */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', margin: '0 0 4px' }}>กิจกรรมจิตอาสาของคุณ</h2>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>พบทั้งหมด {filteredList.length} กิจกรรม</p>
                </div>
                {list.length > 0 && <DateFilter value={dateFilter} onChange={setDateFilter} years={activityYears} />}
            </div>

            {/* ข้อความแจ้งผลสำเร็จ (เช่น หลังยกเลิกการสมัคร) */}
            {toast && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
                    {toast}
                </div>
            )}

            {list.length === 0 ? (
                /* ยังไม่เคยสมัครกิจกรรมใดเลย */
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <AlertCircle size={48} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                    <p style={{ fontSize: '16px' }}>คุณยังไม่ได้เข้าร่วมกิจกรรมใดๆ</p>
                </div>
            ) : filteredList.length === 0 ? (
                /* มีกิจกรรม แต่ไม่ตรงกับวันที่ที่กรอง */
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontSize: '16px' }}>ไม่พบกิจกรรมในวันที่ที่เลือก</div>
            ) : (<>
                {/* กริดการ์ดกิจกรรม */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: '24px' }}>
                    {pageItems.map(item => {
                        // ----- คำนวณสถานะของการ์ดใบนี้ -----
                        // ผู้เข้าร่วมยกเลิกการสมัครเองแล้ว
                        const isCancelled = !!item.Cancel_date;
                        // ผู้จัดกิจกรรมยกเลิกกิจกรรมทั้งงาน (ต่างจาก isCancelled ที่ผู้เข้าร่วมยกเลิกการสมัครเอง)
                        const isActivityCancelled = !!item.Activity_suspend_status;
                        // กิจกรรมจบแล้ว — ดูจากวันสิ้นสุดกิจกรรม (Activity_status ไม่มีค่า 'Closed')
                        const isFinished = item.Activity_end ? new Date(item.Activity_end) < new Date() : false;
                        // กิจกรรมจบแล้ว และผู้จัดยืนยันว่าเข้าร่วมผ่าน ('P') -> ดาวน์โหลดใบประกาศได้
                        const isDone = isFinished && item.Participation_result === 'P';
                        // ยกเลิกการเข้าร่วมได้ไหม: ยังไม่ยกเลิก, กิจกรรมไม่ถูกยกเลิก, ยังไม่จบ และเหลือ >= 3 วัน
                        const ablToCancel = !isCancelled && !isActivityCancelled && !isFinished && canCancel(item.Activity_start);
                        // เลือกป้ายสถานะ (ลำดับความสำคัญ: ยกเลิกเอง > กิจกรรมถูกยกเลิก > จบแล้ว > สมัครแล้ว)
                        const statusKey = isCancelled ? 'cancelled' : isActivityCancelled ? 'activity_cancelled' : (isDone || isFinished) ? 'done' : 'registered';
                        const badge = STATUS_BADGE[statusKey];

                        // รูปกิจกรรม: ใช้รูปจริงก่อน ถ้าไม่มีใช้รูปสำรองตามประเภท
                        const rawImg = item.Image || item.Activity_image || item.Image_url || FALLBACK_IMAGES[item.Category_name] || FALLBACK_IMAGES['default'];
                        const img = getFullImageUrl(rawImg);

                        // สไตล์ปุ่มที่ใช้ร่วมกันทุกปุ่มในการ์ด
                        const btnStyle = { width: '100%', padding: '10px', background: '#7ba4d4', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' };

                        return (
                            <div key={item.Registration_id} style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                                {/* ส่วนรูป + ป้ายสถานะมุมซ้ายบน (รูปโหลดไม่ขึ้นจะเปลี่ยนเป็นรูปสำรอง) */}
                                <div style={{ position: 'relative', height: '190px', overflow: 'hidden' }}>
                                    <span style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 2, background: badge.bg, color: badge.color, fontSize: '12px', fontWeight: '700', padding: '4px 14px', borderRadius: '20px', border: `1px solid ${badge.color}44` }}>
                                        {badge.label}
                                    </span>
                                    <img src={img} alt={item.Activity_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = FALLBACK_IMAGES['default']; }} />
                                </div>

                                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* ชื่อกิจกรรม */}
                                    <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0, lineHeight: 1.3 }}>{item.Activity_name}</h4>

                                    {/* ข้อมูลกิจกรรม: สถานที่, วันจัด, เวลา, ช่วงรับสมัคร, จำนวนที่รับ */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', color: '#64748b' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}><MapPin size={13} color="#2D7D46" style={{ flexShrink: 0, marginTop: '2px' }} /><span>สถานที่จัดกิจกรรม: {item.Location || '-'}</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={13} color="#2D7D46" /><span>วันที่จัดกิจกรรม: {fmt(item.Activity_start)}</span></div>
                                        {(item.Activity_start_time || item.Activity_end_time) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={13} color="#2D7D46" /><span>เวลาทำกิจกรรม: {fmtTime(item.Activity_start_time)} – {fmtTime(item.Activity_end_time)} น.</span></div>
                                        )}
                                        {(item.Registration_start || item.Registration_end) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={13} color="#94a3b8" /><span>รับสมัครตั้งแต่วันที่: {fmt(item.Registration_start)} – {fmt(item.Registration_end)}</span></div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={13} color="#2D7D46" /><span>จำนวน {item.Capacity || '-'} คน</span></div>
                                    </div>

                                    {/* กล่องเตือน "ยกเลิกไม่ได้" — แสดงเมื่อการสมัครยังใช้งานอยู่
                                        แต่เหลือเวลาก่อนวันจัดไม่ถึง 3 วัน (จึงไม่มีปุ่มยกเลิกให้กด) */}
                                    {!isCancelled && !isActivityCancelled && !isFinished && !ablToCancel && (
                                        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', color: '#92400e' }}>
                                            ไม่สามารถยกเลิกได้ (ต้องยกเลิกก่อนวันจัดอย่างน้อย 3 วัน)
                                        </div>
                                    )}

                                    {/* ----- ปุ่มต่าง ๆ ด้านล่างการ์ด ----- */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                                        {/* ปุ่มดูรายละเอียด — แสดงเสมอ */}
                                        <button type="button" onClick={() => setDetailTarget(item)} style={btnStyle}>
                                            <Eye size={15} /> รายละเอียดกิจกรรม
                                        </button>

                                        {/* ปุ่มติดต่อผู้จัด — ซ่อนเมื่อยกเลิกการสมัครแล้ว หรือกิจกรรมถูกยกเลิก */}
                                        {!isCancelled && !isActivityCancelled && (
                                            <button
                                                type="button"
                                                onClick={() => handleContactClick(item, img)}
                                                style={btnStyle}
                                            >
                                                <MessageCircle size={15} /> ติดต่อผู้จัด
                                            </button>
                                        )}

                                        {/* ปุ่มสุดท้าย เลือกแสดงอย่างใดอย่างหนึ่ง:
                                            - เข้าร่วมผ่านแล้ว (isDone)   -> ปุ่มดาวน์โหลดใบประกาศนียบัตร
                                            - ยังยกเลิกได้ (ablToCancel) -> ปุ่มยกเลิกการเข้าร่วม (กดแล้วเปิด CancelModal)
                                            - นอกนั้น                    -> null = ไม่แสดงปุ่ม */}
                                        {isDone ? (
                                            <button
                                                type="button"
                                                onClick={() => onDownloadCertificate ? onDownloadCertificate(item) : onNavigate?.('ใบประกาศนียบัตร')}
                                                style={btnStyle}
                                            >
                                                <Award size={15} /> ดาวน์โหลดใบประกาศนียบัตร
                                            </button>
                                        ) : !isCancelled && !isFinished && ablToCancel ? (
                                            <button type="button" onClick={() => setCancelTarget(item)} style={btnStyle}>
                                                <X size={15} /> ยกเลิกการเข้าร่วมกิจกรรม
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>)}

            {/* Modal ยืนยันการยกเลิก — เปิดเมื่อ cancelTarget มีค่า */}
            {cancelTarget && <CancelModal activity={cancelTarget} onConfirm={handleConfirmCancel} onClose={() => setCancelTarget(null)} />}

            {/* Modal รายละเอียดกิจกรรม — เปิดเมื่อ detailTarget มีค่า */}
            {detailTarget && (
                <ActivityDetailModal
                    activity={detailTarget}
                    organizerName={(detailTarget.Organizer_first_name || detailTarget.Organizer_last_name)
                        ? `${detailTarget.Organizer_first_name || ''} ${detailTarget.Organizer_last_name || ''}`.trim()
                        : null}
                    badge={statusBadgeFor(detailTarget)}
                    onClose={() => setDetailTarget(null)}
                />
            )}
        </div>
    );
}
