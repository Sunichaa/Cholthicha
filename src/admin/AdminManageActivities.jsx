import { useEffect, useState } from 'react';
import { Search, X, Eye } from 'lucide-react';
import ActivityDetailModal from '../components/ActivityDetailModal';
import ActivityCardInfo from '../components/ActivityCardInfo';
import Pagination from '../components/Pagination';
import usePagination from '../usePagination';
import DateFilter from '../components/DateFilter';
import { EMPTY_DATE_FILTER, matchDateFilter, yearsOf, dateFilterKey } from '../dateFilter';
import { notify, confirmDialog } from '../notice';
import { loadSession } from '../authSession.js';
import './AdminDashboard.css';

/* =====================================================================
 *  หน้าจัดการกิจกรรม (แอดมิน)
 *  แสดงการ์ดกิจกรรมทุกรายการ (ยกเว้นแบบร่าง) พร้อมแท็บกรองสถานะและช่องค้นหา
 *  จากการ์ดทำได้: ดูรายละเอียด / อนุมัติ / ไม่อนุมัติ (ต้องกรอกเหตุผล) / ยกเลิกกิจกรรม (ต้องกรอกเหตุผล)
 *    initialFilter  แท็บเริ่มต้น ('all' | 'pending' | 'open' | 'closed') — มาจากการ์ดสถิติหน้าแรก
 * ===================================================================== */

// รูปสำรอง ใช้เมื่อกิจกรรมไม่มีรูปหรือโหลดรูปไม่ขึ้น
const FALLBACK = 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=400&q=80';

// ป้ายสถานะตาม Approval_status
const STATUS_MAP = {
    'Pending':  { label: 'รอการอนุมัติ', cls: 'badge-pending' },
    'Approved': { label: 'อนุมัติสำเร็จ', cls: 'badge-open' },
    'Rejected': { label: 'ไม่อนุมัติ',   cls: 'badge-closed' },
};

// กิจกรรมที่อนุมัติแล้วแต่ถูกยกเลิกทีหลัง (Activity_suspend_status) ยังคงมี
// Approval_status = 'Approved' อยู่ — ต้องแยกป้ายสถานะออกมาต่างหาก ไม่งั้นจะโชว์
// "อนุมัติสำเร็จ" ทับสถานะจริงที่ถูกยกเลิกไปแล้ว
const CANCELLED_BADGE = { label: 'ถูกยกเลิก', cls: 'badge-closed' };

// จัดกิจกรรมเข้าหมวดของแท็บกรอง: 'pending' | 'open' | 'closed' | null (สถานะอื่น เช่น ร่าง)
// ใช้เงื่อนไขเดียวกับที่ /api/admin/stats นับตัวเลขในการ์ดสถิติหน้าแรก
// กดการ์ดสถิติมาแล้วจำนวนในรายการจึงตรงกับตัวเลขบนการ์ด
function getStatusBucket(a) {
    if (a.Approval_status === 'Rejected') return 'closed';
    if (a.Activity_suspend_status) return 'closed';
    if (a.Approval_status === 'Pending') return 'pending';
    if (a.Approval_status !== 'Approved') return null; // สถานะอื่น (เช่น ร่าง) — ไม่นับทั้ง open และ closed

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = a.Registration_start ? new Date(a.Registration_start) : null;
    const end = a.Registration_end ? new Date(a.Registration_end) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(0, 0, 0, 0);

    const isOpenNow = start && end && start <= today && end >= today;
    return isOpenNow ? 'open' : 'closed';
}

// แท็บกรองสถานะ
const FILTER_TABS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'pending', label: 'รอดำเนินการ' },
    { key: 'open', label: 'กำลังเปิดรับสมัคร' },
    { key: 'closed', label: 'ปิดรับสมัครแล้ว' },
];

export default function AdminManageActivities({ initialFilter = 'all' }) {
    const [activities, setActivities] = useState([]);
    const [search, setSearch] = useState('');              // คำค้นหา (ชื่อกิจกรรม / สถานที่)
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState(null);            // "<Activity_id><การกระทำ>" ที่กำลังทำ (ใช้ปิดปุ่มชั่วคราว)
    const [detailTarget, setDetailTarget] = useState(null); // กิจกรรมที่เปิดดูรายละเอียด
    // แท็บกรองสถานะ — ตั้งต้นจากการ์ดสถิติหน้าแรกที่กดมา (ถ้ามี) ไม่งั้นเริ่มที่ "ทั้งหมด"
    const [statusFilter, setStatusFilter] = useState(initialFilter);
    // ตัวกรองวัน / เดือน / ปี (ดูจากวันเริ่มจัดกิจกรรม)
    const [dateFilter, setDateFilter] = useState(EMPTY_DATE_FILTER);

    // Modal กรอกเหตุผลที่ไม่อนุมัติ
    const [rejectModal, setRejectModal] = useState({ open: false, activityId: null, reason: '' });

    // Modal กรอกเหตุผลยกเลิกกิจกรรมที่อนุมัติแล้ว
    const [cancelModal, setCancelModal] = useState({ open: false, activityId: null, reason: '' });

    // Admin ID จาก session (ดู src/authSession.js) ใช้บันทึกว่าแอดมินคนไหนเป็นผู้อนุมัติ/ไม่อนุมัติ
    const adminUser = loadSession()?.user || {};
    const adminId = adminUser.Admin_id || adminUser.User_id || 1;

    // ดึงกิจกรรมทั้งหมด (ทุกสถานะ)
    const fetch_ = () => {
        setLoading(true);
        fetch('http://localhost:5000/api/admin/activities')
            .then(r => r.json())
            .then(d => { setActivities(d.data || []); setLoading(false); })
            .catch(() => setLoading(false));
    };
    useEffect(() => { fetch_(); }, []);

    // ---------- อนุมัติกิจกรรม ----------
    // ถามยืนยันก่อน (อนุมัติแล้วกิจกรรมจะเผยแพร่ให้เห็นทันที)
    // คืน true ถ้าผู้ใช้กดยืนยัน (ใช้ปิด modal รายละเอียดต่อ), false ถ้ายกเลิก
    const handleApprove = async (id) => {
        const ok = await confirmDialog('ต้องการอนุมัติกิจกรรมนี้ใช่หรือไม่?', { confirmText: 'ยืนยันอนุมัติ' });
        if (!ok) return false;

        setActing(id + 'approve');
        fetch(`http://localhost:5000/api/admin/activities/${id}/approve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId })
        })
        .then(r => r.json())
        .then(d => {
            if (!d.success) notify(`อนุมัติกิจกรรมไม่สำเร็จ: ${d.message || d.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`, 'error');
            else notify('อนุมัติกิจกรรมสำเร็จ', 'success');
            fetch_();
            setActing(null);
        })
        .catch(() => { notify('อนุมัติกิจกรรมไม่สำเร็จ: เชื่อมต่อ server ไม่ได้', 'error'); setActing(null); });
        return true;
    };

    // ---------- ไม่อนุมัติกิจกรรม (เรียกจาก Modal เหตุผล) ----------
    // ต้องกรอกเหตุผล — backend จะส่งอีเมลแจ้งผู้จัดพร้อมเหตุผล
    const handleRejectSubmit = async () => {
        if (!rejectModal.reason.trim()) {
            notify('กรุณากรอกเหตุผลที่ไม่ผ่านการอนุมัติ', 'warning');
            return;
        }

        setActing(rejectModal.activityId + 'reject');
        fetch(`http://localhost:5000/api/admin/activities/${rejectModal.activityId}/reject`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adminId,
                reason: rejectModal.reason
            })
        })
        .then(r => r.json())
        .then(d => {
            if (!d.success) notify(`บันทึกการไม่อนุมัติไม่สำเร็จ: ${d.message || d.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`, 'error');
            else notify('บันทึกการไม่อนุมัติสำเร็จ', 'success');
            fetch_();
            setActing(null);
            setRejectModal({ open: false, activityId: null, reason: '' });
        })
        .catch(() => { notify('บันทึกการไม่อนุมัติไม่สำเร็จ: เชื่อมต่อ server ไม่ได้', 'error'); setActing(null); });
    };

    // ---------- ยกเลิกกิจกรรมที่อนุมัติแล้ว (เรียกจาก Modal เหตุผล) ----------
    // ใช้ endpoint เดียวกับที่ผู้จัดใช้ยกเลิกเอง (/api/organizer/activities/:id/cancel)
    // backend ข้ามการเช็กความเป็นเจ้าของให้แอดมิน และส่งอีเมลแจ้งผู้สมัครทุกคน + ผู้จัดให้อัตโนมัติ
    const handleCancelSubmit = () => {
        if (!cancelModal.reason.trim()) {
            notify('กรุณากรอกเหตุผลที่ยกเลิกกิจกรรม', 'warning');
            return;
        }

        setActing(cancelModal.activityId + 'cancel');
        fetch(`http://localhost:5000/api/organizer/activities/${cancelModal.activityId}/cancel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: cancelModal.reason })
        })
        .then(r => r.json())
        .then(d => {
            if (!d.success) notify(`ยกเลิกกิจกรรมไม่สำเร็จ: ${d.message || d.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`, 'error');
            else notify('ยกเลิกกิจกรรมสำเร็จ', 'success');
            fetch_();
            setActing(null);
            setCancelModal({ open: false, activityId: null, reason: '' });
        })
        .catch(() => { notify('ยกเลิกกิจกรรมไม่สำเร็จ: เชื่อมต่อ server ไม่ได้', 'error'); setActing(null); });
    };

    // ซ่อนแบบร่าง แล้วกรองตามคำค้นหาและแท็บสถานะ
    const filtered = activities.filter(a => {
        const rawStatus = String(a.Activity_status || '').trim().toLowerCase();
        const isDraft = rawStatus === 'draft' || rawStatus === 'ร่าง';
        const matchesSearch =
            (a.Activity_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (a.Location || '').toLowerCase().includes(search.toLowerCase());
        const matchesFilter = statusFilter === 'all' || getStatusBucket(a) === statusFilter;
        const matchesDate = matchDateFilter(a.Activity_start, dateFilter);

        return !isDraft && matchesSearch && matchesFilter && matchesDate;
    });

    // ปีที่มีกิจกรรมจริง ใช้เป็นตัวเลือกในตัวกรองปี
    const activityYears = yearsOf(activities, a => a.Activity_start);

    // แบ่งหน้าละ 9 การ์ด — เปลี่ยนคำค้นหา/แท็บแล้วกลับไปหน้า 1
    const { page, setPage, totalPages, pageItems } = usePagination(filtered, 9, `${search}|${statusFilter}|${dateFilterKey(dateFilter)}`);

    return (
        <div>
            <h2 className="section-title">จัดการกิจกรรมจิตอาสา</h2>
            <p className="section-sub">ตรวจสอบและอนุมัติกิจกรรมที่ผู้จัดกิจกรรมส่งเข้ามา</p>

            {/* แท็บกรองสถานะ */}
            <div className="status-tabs">
                {FILTER_TABS.map(t => (
                    <button
                        key={t.key}
                        type="button"
                        className={`status-tab${statusFilter === t.key ? ' active' : ''}`}
                        onClick={() => setStatusFilter(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="table-card">
                <div className="table-toolbar" style={{ flexWrap:'wrap', gap:'12px' }}>
                    <h3>รายการกิจกรรมทั้งหมด ({filtered.length})</h3>
                    <div className="toolbar-tools">
                        <DateFilter value={dateFilter} onChange={setDateFilter} years={activityYears} />
                        <div className="search-field">
                            <Search size={16} color="#94a3b8" />
                            <input placeholder="ค้นหากิจกรรม..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* กริดการ์ดกิจกรรม */}
                {loading ? (
                    <div style={{ padding:'40px',textAlign:'center',color:'#94a3b8' }}>กำลังโหลด...</div>
                ) : (<>
                    <div style={{ padding:'20px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'20px' }}>
                        {filtered.length === 0 && <p style={{ color:'#94a3b8',gridColumn:'1/-1',textAlign:'center',padding:'40px' }}>ไม่พบกิจกรรม</p>}
                        {pageItems.map(a => {
                            const isCancelled = !!a.Activity_suspend_status;
                            // ป้ายสถานะ: ถูกยกเลิกมาก่อน ไม่งั้นใช้ตาม Approval_status
                            const s = isCancelled ? CANCELLED_BADGE : (STATUS_MAP[a.Approval_status] || STATUS_MAP['Pending']);
                            const img = a.Image || FALLBACK;
                            return (
                                <div key={a.Activity_id} style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:'14px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                                    <div style={{ position:'relative',height:'160px' }}>
                                        <span className={`badge ${s.cls}`} style={{ position:'absolute',top:'10px',left:'10px',zIndex:2 }}>{s.label}</span>
                                        <img src={img} alt={a.Activity_name} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>{e.target.src=FALLBACK;}} />
                                    </div>
                                    <div style={{ padding:'16px',display:'flex',flexDirection:'column',gap:'10px' }}>
                                        <h4 style={{ fontSize:'15px',fontWeight:'700',color:'#1e293b',margin:0 }}>{a.Activity_name}</h4>
                                        <ActivityCardInfo activity={a} />

                                        {/* แสดงเหตุผลถ้าปฏิเสธแล้ว */}
                                        {a.Approval_status === 'Rejected' && a.Rejection_reason && (
                                            <div style={{ fontSize:'12px', color:'#ef4444', background:'#fef2f2', padding:'8px 12px', borderRadius:'8px' }}>
                                                <strong>เหตุผลที่ไม่อนุมัติ:</strong> {a.Rejection_reason}
                                            </div>
                                        )}

                                        {/* แสดงเหตุผลถ้าถูกยกเลิกไปแล้ว */}
                                        {isCancelled && a.Suspension_reason && (
                                            <div style={{ fontSize:'12px', color:'#ef4444', background:'#fef2f2', padding:'8px 12px', borderRadius:'8px' }}>
                                                <strong>เหตุผลที่ยกเลิก:</strong> {a.Suspension_reason}
                                            </div>
                                        )}

                                        {/* ดูรายละเอียดได้ทุกสถานะ ทั้งก่อนและหลังยืนยันการเผยแพร่ */}
                                        <button
                                            type="button"
                                            className="btn-sm"
                                            onClick={() => setDetailTarget(a)}
                                            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', width:'100%', padding:'8px', background:'#f1f5f9', color:'#475569', border:'none', borderRadius:'8px', fontWeight:'600', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}
                                        >
                                            <Eye size={14} /> ดูรายละเอียด
                                        </button>

                                        {/* รออนุมัติ: ปุ่มอนุมัติ / ไม่อนุมัติ */}
                                        {a.Approval_status === 'Pending' && (
                                            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
                                                <button className="btn-sm btn-approve"
                                                    disabled={acting === a.Activity_id+'approve'}
                                                    onClick={() => handleApprove(a.Activity_id)}>
                                                    {acting === a.Activity_id+'approve' ? '...' : 'อนุมัติ'}
                                                </button>
                                                <button className="btn-sm btn-reject"
                                                    disabled={acting === a.Activity_id+'reject'}
                                                    onClick={() => setRejectModal({ open: true, activityId: a.Activity_id, reason: '' })}>
                                                    ไม่อนุมัติ
                                                </button>
                                            </div>
                                        )}

                                        {/* อนุมัติแล้วและยังไม่ถูกยกเลิก: ปุ่มยกเลิกกิจกรรม
                                            (กรณีจัดจบไปแล้ว backend จะปฏิเสธและตอบ error กลับมา) */}
                                        {a.Approval_status === 'Approved' && !isCancelled && (
                                            <button className="btn-sm btn-reject" style={{ width:'100%' }}
                                                disabled={acting === a.Activity_id+'cancel'}
                                                onClick={() => setCancelModal({ open: true, activityId: a.Activity_id, reason: '' })}>
                                                {acting === a.Activity_id+'cancel' ? '...' : 'ยกเลิกกิจกรรม'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                </>)}
            </div>

            {/* Modal รายละเอียดกิจกรรม (แสดงช่องทางติดต่อผู้จัด และเหตุผลที่ไม่อนุมัติถ้ามี) */}
            {detailTarget && (
                <ActivityDetailModal
                    activity={detailTarget}
                    organizerName={(detailTarget.Organizer_first_name || detailTarget.Organizer_last_name)
                        ? `${detailTarget.Organizer_first_name || ''} ${detailTarget.Organizer_last_name || ''}`.trim()
                        : null}
                    organizerContact={[detailTarget.Organizer_email, detailTarget.Organizer_phone].filter(Boolean).join(' · ') || null}
                    rejectionReason={detailTarget.Approval_status === 'Rejected' ? detailTarget.Rejection_reason : null}
                    badge={{ label: (STATUS_MAP[detailTarget.Approval_status] || STATUS_MAP['Pending']).label, className: `badge ${(STATUS_MAP[detailTarget.Approval_status] || STATUS_MAP['Pending']).cls}` }}
                    onClose={() => setDetailTarget(null)}
                    // ปุ่มท้าย modal (ใช้ flow เดียวกับปุ่มบนการ์ด):
                    // - รออนุมัติ -> ปุ่มอนุมัติ / ไม่อนุมัติ
                    // - อนุมัติแล้วและยังไม่ถูกยกเลิก -> ปุ่มยกเลิกกิจกรรม (ปิด modal นี้แล้วเปิด Modal กรอกเหตุผล)
                    // - สถานะอื่น -> ไม่มีปุ่ม
                    footer={detailTarget.Approval_status === 'Pending' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button
                                className="btn-sm btn-approve"
                                style={{ padding: '11px' }}
                                disabled={acting === detailTarget.Activity_id + 'approve'}
                                onClick={async () => {
                                    const started = await handleApprove(detailTarget.Activity_id);
                                    if (started) setDetailTarget(null);
                                }}
                            >
                                {acting === detailTarget.Activity_id + 'approve' ? '...' : 'อนุมัติ'}
                            </button>
                            <button
                                className="btn-sm btn-reject"
                                style={{ padding: '11px' }}
                                onClick={() => {
                                    const id = detailTarget.Activity_id;
                                    setDetailTarget(null);
                                    setRejectModal({ open: true, activityId: id, reason: '' });
                                }}
                            >
                                ไม่อนุมัติ
                            </button>
                        </div>
                    ) : detailTarget.Approval_status === 'Approved' && !detailTarget.Activity_suspend_status ? (
                        <button
                            className="btn-sm btn-reject"
                            style={{ width: '100%', padding: '11px' }}
                            onClick={() => {
                                const id = detailTarget.Activity_id;
                                setDetailTarget(null);
                                setCancelModal({ open: true, activityId: id, reason: '' });
                            }}
                        >
                            ยกเลิกกิจกรรม
                        </button>
                    ) : null}
                />
            )}

            {/* MODAL ระบุเหตุผลที่ไม่อนุมัติ */}
            {rejectModal.open && (
                <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
                    <div style={{ background:'#fff', borderRadius:'12px', padding:'24px', width:'100%', maxWidth:'450px', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                            <h3 style={{ margin:0, fontSize:'18px', color:'#1e293b' }}>ระบุเหตุผลที่ไม่ผ่านการอนุมัติ</h3>
                            <X size={20} style={{ cursor:'pointer', color:'#64748b' }} onClick={() => setRejectModal({ open: false, activityId: null, reason: '' })} />
                        </div>
                        
                        <textarea
                            rows={4}
                            placeholder="พิมพ์เหตุผลที่ไม่อนุมัติกิจกรรมนี้ เพื่อแจ้งแก่ผู้จัด..."
                            value={rejectModal.reason}
                            onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                            style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', boxSizing:'border-box', marginBottom:'16px', fontFamily:'inherit' }}
                        />

                        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
                            <button 
                                onClick={() => setRejectModal({ open: false, activityId: null, reason: '' })}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', cursor:'pointer' }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleRejectSubmit}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', fontWeight:'600' }}
                            >
                                ยืนยันไม่อนุมัติ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL ระบุเหตุผลยกเลิกกิจกรรมที่อนุมัติแล้ว */}
            {cancelModal.open && (
                <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
                    <div style={{ background:'#fff', borderRadius:'12px', padding:'24px', width:'100%', maxWidth:'450px', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                            <h3 style={{ margin:0, fontSize:'18px', color:'#1e293b' }}>ยืนยันยกเลิกกิจกรรม</h3>
                            <X size={20} style={{ cursor:'pointer', color:'#64748b' }} onClick={() => setCancelModal({ open: false, activityId: null, reason: '' })} />
                        </div>

                        <p style={{ fontSize:'13px', color:'#64748b', marginTop:0, marginBottom:'12px' }}>
                            ระบบจะส่งอีเมลแจ้งยกเลิกไปยังผู้ที่สมัครเข้าร่วมกิจกรรมนี้ทุกคนโดยอัตโนมัติ
                        </p>

                        <textarea
                            rows={4}
                            placeholder="พิมพ์เหตุผลที่ยกเลิกกิจกรรมนี้ เพื่อแจ้งแก่ผู้จัดและผู้สมัคร..."
                            value={cancelModal.reason}
                            onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
                            style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', boxSizing:'border-box', marginBottom:'16px', fontFamily:'inherit' }}
                        />

                        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
                            <button
                                onClick={() => setCancelModal({ open: false, activityId: null, reason: '' })}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', cursor:'pointer' }}
                            >
                                ปิด
                            </button>
                            <button
                                onClick={handleCancelSubmit}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', fontWeight:'600' }}
                            >
                                ยืนยันยกเลิกกิจกรรม
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}