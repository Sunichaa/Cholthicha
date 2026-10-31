import React, { useEffect, useState } from 'react';
import { Search, X, Clock, Edit3, Eye, AlertCircle, CheckCircle2, UserX, MessageCircle } from 'lucide-react';
import ActivityDetailModal from '../components/ActivityDetailModal';
import ActivityCardInfo from '../components/ActivityCardInfo';
import Pagination from '../components/Pagination';
import usePagination from '../usePagination';
import DateFilter from '../components/DateFilter';
import { EMPTY_DATE_FILTER, matchDateFilter, yearsOf, dateFilterKey } from '../dateFilter';
import { notify, confirmDialog } from '../notice';
import '../admin/AdminDashboard.css';

/* =====================================================================
 *  หน้าจัดการกิจกรรมของผู้จัดกิจกรรม
 *  แสดงการ์ดกิจกรรมทั้งหมดที่ผู้จัดสร้างไว้ พร้อมแท็บกรองสถานะและช่องค้นหา
 *  จากการ์ดทำได้: ดูรายละเอียด / แก้ไขแบบร่าง / ตรวจสอบรายชื่อผู้สมัคร / ยกเลิกกิจกรรม
 *
 *  ไฟล์นี้มี 3 ส่วน:
 *    AttendeesModal       Modal รายชื่อผู้สมัคร + ยืนยัน/ไม่เข้าร่วม + ปุ่มแชต
 *    CancelModal          Modal ยืนยันการยกเลิกกิจกรรม
 *    OrganizerActivities  หน้าหลัก (export default)
 * ===================================================================== */

// รูปสำรอง ใช้เมื่อกิจกรรมไม่มีรูปหรือโหลดรูปไม่ขึ้น
const FALLBACK = 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=400&q=80';

// จัดกิจกรรมเข้าหมวดของแท็บกรอง: 'open' | 'closed' | null (แบบร่าง/รออนุมัติ)
// ใช้เงื่อนไขเดียวกับที่ /api/organizer/stats/:member_id นับตัวเลขในการ์ดสถิติหน้าแรก
// กดการ์ดสถิติมาแล้วจำนวนในรายการจึงตรงกับตัวเลขบนการ์ด
// "closed" = ปิดรับสมัครแล้ว (รวมทั้งที่รอวันจัด จัดจบแล้ว ถูกปฏิเสธ และถูกยกเลิก)
function getStatusBucket(a) {
    const statusStr = a.Activity_status || a.Status || '';
    const approvalStr = a.Approval_status || '';

    const isRejected = approvalStr === 'Rejected' || statusStr === 'Rejected' || statusStr === 'ไม่อนุมัติ';
    const isDraft = (statusStr === 'Draft' || statusStr === 'ร่าง' || statusStr === 'แบบร่าง') && !isRejected;
    const isCancelled = !!a.Activity_suspend_status;
    const isApprovedActive = (statusStr === 'Open' || statusStr === 'Approved' || approvalStr === 'Approved')
        && !isDraft && !isRejected && !isCancelled;

    if (isRejected || isCancelled) return 'closed';
    if (!isApprovedActive) return null; // แบบร่าง/รออนุมัติ — ไม่นับทั้ง open และ closed

    // เปิดรับสมัคร = ต้องมีทั้งวันเปิดและวันปิดรับสมัคร และวันนี้อยู่ในช่วงนั้น (เทียบเฉพาะวันที่ ไม่สนเวลา)
    // ตรงกับ ORGANIZER_OPEN_SQL: Registration_start <= CURDATE() AND Registration_end >= CURDATE()
    // ไม่มีวันใดวันหนึ่ง -> นับเป็น closed เหมือน ORGANIZER_CLOSED_SQL
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const regStart = a.Registration_start ? new Date(a.Registration_start) : null;
    const regEnd = a.Registration_end ? new Date(a.Registration_end) : null;
    if (regStart) regStart.setHours(0, 0, 0, 0);
    if (regEnd) regEnd.setHours(0, 0, 0, 0);
    const isRegActive = regStart && regEnd && regStart <= today && regEnd >= today;

    return isRegActive ? 'open' : 'closed';
}

// แท็บกรองสถานะ
const FILTER_TABS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'open', label: 'กำลังเปิดรับสมัคร' },
    { key: 'closed', label: 'ปิดรับสมัครแล้ว' },
];

// สไตล์ปุ่มหลักที่ใช้ร่วมกันในการ์ดและในตาราง
const mainBtnStyle = {
    width: '100%',
    padding: '10px 16px',
    background: '#729fe0',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13.5px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit'
};


/* ---------------------------------------------------------------------
 *  Modal รายชื่อผู้สมัคร
 *  - บันทึกการเข้าร่วมรายคน (ยืนยัน = 'P' / ไม่เข้าร่วม = 'F') ได้เมื่อถึงวันจัดกิจกรรมแล้วเท่านั้น
 *  - ปุ่ม "ยืนยันทั้งหมด" ตั้งทุกคนที่ยังไม่ได้บันทึกเป็น 'P'
 *  - ปุ่มแชตเปิดห้องแชตกับผู้สมัครรายนั้น
 *    activity  กิจกรรมที่ดูรายชื่อ
 *    onClose   ปิด modal
 *    onChat    เปิดหน้าแชตพร้อมห้องของผู้สมัครที่เลือก
 * --------------------------------------------------------------------- */
function AttendeesModal({ activity, onClose, onChat }) {
    const [list, setList] = useState([]);              // รายชื่อผู้สมัคร
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null); // Registration_id ที่กำลังบันทึก (ใช้ปิดปุ่มชั่วคราว)

    // กิจกรรมเริ่มจัดแล้วหรือยัง (เวลาปัจจุบัน >= วันเริ่มกิจกรรม) — ยังไม่เริ่มจะบันทึกการเข้าร่วมไม่ได้
    const now = new Date();
    const activityStartDate = activity?.Activity_start ? new Date(activity.Activity_start) : null;
    const hasStarted = activityStartDate ? now >= activityStartDate : false;

    // ทุกคนที่ยังไม่ยกเลิกถูกบันทึกผลการเข้าร่วมครบแล้ว (หรือไม่มีผู้สมัครเลย) -> ไม่ต้องกดยืนยันทั้งหมดอีก
    const activeList = list.filter(item => !item.Cancel_date);
    const allRecorded = activeList.length === 0 || activeList.every(item => item.Participation_result && item.Participation_result !== 'Y');
    const canConfirmAll = hasStarted && !allRecorded;

    // ดึงรายชื่อผู้สมัครของกิจกรรมนี้
    const fetchAttendees = () => {
        if (!activity?.Activity_id) return;
        setLoading(true);
        fetch(`http://localhost:5000/api/organizer/attendees/${activity.Activity_id}`)
            .then(r => r.json())
            .then(d => { setList(d.data || []); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchAttendees();
    }, [activity]);

    // บันทึกการเข้าร่วมรายคน (status: 'P' = ยืนยัน, 'F' = ไม่เข้าร่วม)
    // สำเร็จแล้วอัปเดตสถานะในตารางทันทีโดยไม่ต้องโหลดใหม่
    const handleUpdateStatus = async (regId, status) => {
        if (!hasStarted) {
            return notify('กิจกรรมนี้ยังไม่ถึงเวลาจัดขึ้น ไม่สามารถบันทึกการเข้าร่วมได้', 'warning');
        }
        if (!regId) return notify('ไม่พบข้อมูล รหัสการสมัคร (Registration_id)', 'error');

        setUpdatingId(regId);
        try {
            const res = await fetch(`http://localhost:5000/api/organizer/attendees/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    registration_id: regId,
                    activity_id: activity.Activity_id,
                    status: status
                })
            });

            const data = await res.json();

            if (res.ok && data.success !== false) {
                // อัปเดต UI ทันที
                setList(prev => prev.map(item => {
                    const id = item.Registration_id || item.registration_id || item.id;
                    return id === regId ? { ...item, Participation_result: status } : item;
                }));
                notify('บันทึกการเข้าร่วมสำเร็จ', 'success');
            } else {
                notify(`บันทึกไม่สำเร็จ: ${data.message || 'เกิดข้อผิดพลาด'}`, 'error');
            }
        } catch (err) {
            console.error(err);
            notify('ไม่สามารถเชื่อมต่อกับ Server ได้', 'error');
        } finally {
            setUpdatingId(null);
        }
    };

    // ปุ่ม "ยืนยันทั้งหมด": ถามยืนยันก่อน แล้วตั้งทุกคนที่ยังไม่ได้บันทึกเป็น 'P'
    const handleConfirmAll = async () => {
        if (!canConfirmAll) return;
        const ok = await confirmDialog('ต้องการยืนยันการเข้าร่วมสำหรับผู้สมัครที่ยังไม่ได้บันทึกทั้งหมดใช่หรือไม่? (คนที่บันทึกไม่เข้าร่วมไว้แล้วจะไม่ถูกเปลี่ยน)');
        if (!ok) return;

        try {
            const res = await fetch(`http://localhost:5000/api/organizer/attendees/${activity.Activity_id}/confirm-all`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await res.json();

            if (res.ok && data.success !== false) {
                // ยืนยันเฉพาะคนที่ยังไม่ได้บันทึก (ว่าง/Y) คนที่กดไม่เข้าร่วม (F) หรือยืนยันแล้ว (P) คงเดิม
                setList(prev => prev.map(item => (!item.Cancel_date && (!item.Participation_result || item.Participation_result === 'Y')) ? { ...item, Participation_result: 'P' } : item));
                notify('ยืนยันการเข้าร่วมของผู้สมัครทั้งหมดสำเร็จ', 'success');
            } else {
                notify(`เกิดข้อผิดพลาด: ${data.message || 'ไม่สามารถยืนยันทั้งหมดได้'}`, 'error');
            }
        } catch (err) {
            console.error(err);
            notify('ไม่สามารถเชื่อมต่อกับ Server ได้', 'error');
        }
    };

    // แบ่งหน้ารายชื่อผู้สมัครละ 10 คน (startIndex ใช้ต่อเลขลำดับข้ามหน้า)
    const { page, setPage, totalPages, pageItems, startIndex } = usePagination(list, 10);

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', maxWidth: '850px', width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                
                {/* หัว modal: ชื่อกิจกรรม + ปุ่มปิด */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                            รายชื่อผู้สมัคร: {activity.Activity_name}
                        </h3>
                    </div>
                    <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* แถบแจ้งเตือนเมื่อกิจกรรมยังไม่ถึงวันจัด */}
                {!hasStarted && (
                    <div style={{ background: '#fffbebe6', borderBottom: '1px solid #fef3c7', padding: '10px 24px', color: '#b45309', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                        <AlertCircle size={16} color="#d97706" />
                        <span>กิจกรรมนี้ยังไม่ถึงเวลาจัดขึ้น จะสามารถยืนยันหรือปฏิเสธการเข้าร่วมได้เมื่อถึงเวลาจัดกิจกรรมแล้ว</span>
                    </div>
                )}

                {/* แถบปุ่ม "ยืนยันทั้งหมด" (กดได้เมื่อกิจกรรมเริ่มแล้วและยังมีคนที่ยังไม่ได้บันทึก) */}
                <div style={{ padding: '14px 24px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'flex-end', background: '#fafafa' }}>
                    <button 
                        disabled={!canConfirmAll}
                        onClick={handleConfirmAll}
                        style={{
                            background: canConfirmAll ? '#38bdf8' : '#cbd5e1',
                            color: '#ffffff',
                            border: 'none',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            fontSize: '13.5px',
                            fontWeight: '600',
                            cursor: canConfirmAll ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: canConfirmAll ? '0 2px 4px rgba(56, 189, 248, 0.2)' : 'none',
                            transition: 'all 0.2s',
                            opacity: canConfirmAll ? 1 : 0.7
                        }}
                    >
                        ยืนยันทั้งหมด
                    </button>
                </div>

                {/* ตารางรายชื่อ: ลำดับ / ชื่อ / เบอร์โทร / สถานะการเข้าร่วม / จัดการ / แชต */}
                <div style={{ overflow: 'auto', flex: 1, padding: '0 24px 20px' }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>กำลังโหลดข้อมูล...</div>
                    ) : list.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>ยังไม่มีผู้สมัครเข้าร่วมกิจกรรมนี้</div>
                    ) : (<>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569' }}>ลำดับ</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569' }}>ชื่อ-นามสกุล</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569' }}>เบอร์โทรศัพท์</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569' }}>การเข้าร่วมกิจกรรม</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'center', fontSize: '13px', fontWeight: '700', color: '#475569' }}>จัดการ</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'center', fontSize: '13px', fontWeight: '700', color: '#475569' }}>แชต</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map((r, i) => {
                                    const regId = r.Registration_id || r.registration_id || r.id || r.Registration_ID;
                                    const isCancelled = !!r.Cancel_date;
                                    const status = r.Participation_result; 
                                    const phone = r.Phone || r.Phone_number || r.Tel || r.Mobile || '-';

                                    return (
                                        <tr key={regId || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '14px', color: '#64748b', fontSize: '13.5px', fontWeight: '500' }}>{startIndex + i + 1}</td>
                                            <td style={{ padding: '14px', fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>
                                                {r.Registration_fname || r.First_name} {r.Registration_lname || r.Last_name}
                                            </td>
                                            <td style={{ padding: '14px', color: '#475569', fontSize: '13.5px' }}>
                                                {phone}
                                            </td>
                                            {/* สถานะการเข้าร่วม: ยกเลิกการสมัคร / ยืนยันแล้ว (P) / ไม่เข้าร่วม (F) / รอการยืนยัน */}
                                            <td style={{ padding: '14px', fontSize: '13.5px' }}>
                                                {isCancelled ? (
                                                    <span style={{ color: '#ef4444', fontWeight: '500' }}>ยกเลิกการสมัคร</span>
                                                ) : status === 'P' ? (
                                                    <span style={{ color: '#16a34a', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <CheckCircle2 size={15} /> ยืนยันแล้ว
                                                    </span>
                                                ) : status === 'F' ? (
                                                    <span style={{ color: '#ef4444', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <UserX size={15} /> ไม่เข้าร่วม
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#64748b', fontWeight: '500' }}>รอการยืนยัน</span>
                                                )}
                                            </td>

                                            {/* คอลัมน์จัดการ: ยกเลิกการสมัคร -> "-", บันทึกแล้ว -> ป้าย "บันทึกแล้ว",
                                                ยังไม่ถึงวันจัด -> ป้ายเตือน, นอกนั้น -> ปุ่มยืนยัน / ไม่เข้าร่วม */}
                                            <td style={{ padding: '14px', textAlign: 'center' }}>
                                                {isCancelled ? (
                                                    <span style={{ color: '#94a3b8', fontSize: '13px' }}>-</span>
                                                ) : (status && status !== 'Y') ? (
                                                    <span style={{ 
                                                        background: '#f1f5f9', 
                                                        color: '#64748b', 
                                                        padding: '4px 12px', 
                                                        borderRadius: '16px', 
                                                        fontSize: '12.5px', 
                                                        fontWeight: '500',
                                                        display: 'inline-block'
                                                    }}>
                                                        บันทึกแล้ว
                                                    </span>
                                                ) : !hasStarted ? (
                                                    // ป้ายแสดงเมื่อกิจกรรมยังไม่ถึงวันจัด
                                                    <span style={{ 
                                                        background: '#fef3c7', 
                                                        color: '#d97706', 
                                                        padding: '4px 12px', 
                                                        borderRadius: '16px', 
                                                        fontSize: '12px', 
                                                        fontWeight: '500',
                                                        display: 'inline-block'
                                                    }}>
                                                        ยังไม่ถึงวันจัดกิจกรรม
                                                    </span>
                                                ) : (
                                                    // ปุ่มยืนยัน / ไม่เข้าร่วม (แสดงเมื่อจัดกิจกรรมแล้วเท่านั้น)
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                                        <button
                                                            disabled={updatingId === regId}
                                                            onClick={() => handleUpdateStatus(regId, 'P')}
                                                            style={{
                                                                background: '#38bdf8',
                                                                color: '#fff',
                                                                border: 'none',
                                                                padding: '6px 14px',
                                                                borderRadius: '6px',
                                                                fontSize: '12.5px',
                                                                fontWeight: '600',
                                                                cursor: 'pointer',
                                                                opacity: updatingId === regId ? 0.6 : 1,
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            {updatingId === regId ? '...' : 'ยืนยัน'}
                                                        </button>
                                                        <button
                                                            disabled={updatingId === regId}
                                                            onClick={() => handleUpdateStatus(regId, 'F')}
                                                            style={{
                                                                background: '#f87171',
                                                                color: '#fff',
                                                                border: 'none',
                                                                padding: '6px 14px',
                                                                borderRadius: '6px',
                                                                fontSize: '12.5px',
                                                                fontWeight: '600',
                                                                cursor: 'pointer',
                                                                opacity: updatingId === regId ? 0.6 : 1,
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            {updatingId === regId ? '...' : 'ไม่เข้าร่วม'}
                                                        </button>
                                                    </div>
                                                )}
                                            </td>

                                            {/* ปุ่มเปิดแชตกับผู้สมัครรายนี้ (ไม่แสดงถ้ายกเลิกการสมัครแล้ว) */}
                                            <td style={{ padding: '14px', textAlign: 'center' }}>
                                                {isCancelled || !onChat ? (
                                                    <span style={{ color: '#94a3b8', fontSize: '13px' }}>-</span>
                                                ) : (
                                                    <button
                                                        onClick={() => onChat({
                                                            Activity_id: activity.Activity_id,
                                                            Activity_name: activity.Activity_name,
                                                            Activity_image: activity.Image,
                                                            Registration_id: regId,
                                                            Member_id: r.Member_id,
                                                            First_name: r.First_name || r.Registration_fname,
                                                            Last_name: r.Last_name || r.Registration_lname,
                                                        })}
                                                        style={{ ...mainBtnStyle, width: 'auto', padding: '8px 16px', margin: '0 auto' }}
                                                    >
                                                        <MessageCircle size={14} /> แชต
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                    </>)}
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Modal ยืนยันการยกเลิกกิจกรรม (เหตุผลไม่บังคับ — ใช้แจ้งผู้สมัครทางอีเมล)
 *    activity   กิจกรรมที่จะยกเลิก
 *    onConfirm  เรียกพร้อมเหตุผลเมื่อกดยืนยัน
 *    onClose    ปิด modal
 * --------------------------------------------------------------------- */
function CancelModal({ activity, onConfirm, onClose }) {
    const [reason, setReason] = useState(''); // เหตุผลที่ยกเลิก
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '28px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
                <div style={{ width: '50px', height: '50px', background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <X size={24} color="#ef4444" />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: '700', margin: '0 0 8px' }}>ยืนยันการยกเลิกกิจกรรม</h3>
                <p style={{ color: '#64748b', fontSize: '13.5px', lineHeight: '1.5', marginBottom: '14px' }}>ต้องการยกเลิก <strong>"{activity.Activity_name}"</strong> ?</p>
                <textarea
                    rows={3}
                    placeholder="เหตุผลที่ยกเลิก (ถ้ามี) เพื่อแจ้งให้ผู้สมัครทราบ..."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>ยกเลิก</button>
                    <button onClick={() => onConfirm(reason)} style={{ flex: 1, padding: '10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>ยืนยัน</button>
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  หน้าหลัก: รายการกิจกรรมของผู้จัด
 *    user           ผู้ใช้ที่ login อยู่
 *    onEditDraft    เปิดฟอร์มแก้ไขแบบร่าง
 *    onChat         เปิดหน้าแชตพร้อมห้องที่เลือก (ส่งต่อให้ AttendeesModal)
 *    initialFilter  แท็บเริ่มต้น ('all' | 'open' | 'closed') — มาจากการ์ดสถิติหน้าแรก
 * --------------------------------------------------------------------- */
export default function OrganizerActivities({ user, onEditDraft, onChat, initialFilter = 'all' }) {
    const [activities, setActivities] = useState([]);
    const [search, setSearch] = useState('');                  // คำค้นหา (ชื่อกิจกรรม / สถานที่)
    const [loading, setLoading] = useState(true);
    const [viewAttendees, setViewAttendees] = useState(null);  // กิจกรรมที่เปิดดูรายชื่อ (มีค่า = เปิด AttendeesModal)
    const [viewDetail, setViewDetail] = useState(null);        // กิจกรรมที่เปิดดูรายละเอียด
    const [cancelTarget, setCancelTarget] = useState(null);    // กิจกรรมที่กำลังจะยกเลิก (มีค่า = เปิด CancelModal)
    // แท็บกรองสถานะ — ตั้งต้นจากการ์ดสถิติหน้าแรกที่กดมา (ถ้ามี) ไม่งั้นเริ่มที่ "ทั้งหมด"
    const [statusFilter, setStatusFilter] = useState(initialFilter);
    // ตัวกรองวัน / เดือน / ปี (ดูจากวันเริ่มจัดกิจกรรม)
    const [dateFilter, setDateFilter] = useState(EMPTY_DATE_FILTER);

    // ดึงกิจกรรมทั้งหมดของผู้จัดคนนี้
    const fetch_ = () => {
        const id = user?.Member_id || user?.Organizer_id || user?.User_id || user?.id;
        if (!id) return;
        setLoading(true);
        fetch(`http://localhost:5000/api/organizer/activities/${id}`)
            .then(r => r.json())
            .then(d => { setActivities(d.data || []); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => { fetch_(); }, [user]);

    // ยืนยันยกเลิกกิจกรรม (เรียกจาก CancelModal) แล้วโหลดรายการใหม่
    // backend จะส่งอีเมลแจ้งผู้สมัครทุกคนให้เอง
    const handleCancel = (reason) => {
        if (!cancelTarget?.Activity_id) return;
        fetch(`http://localhost:5000/api/organizer/activities/${cancelTarget.Activity_id}/cancel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason?.trim() || null }),
        })
            .then(r => r.json())
            .then(d => {
                setCancelTarget(null);
                if (d.success === false) notify(d.message || 'ยกเลิกกิจกรรมไม่สำเร็จ', 'error');
                else notify('ยกเลิกกิจกรรมสำเร็จ', 'success');
                fetch_();
            })
            .catch(() => {
                setCancelTarget(null);
                notify('ยกเลิกกิจกรรมไม่สำเร็จ: ไม่สามารถเชื่อมต่อกับ Server ได้', 'error');
            });
    };

    // กรองตามคำค้นหาและแท็บสถานะ
    const filtered = activities.filter(a => {
        const matchesSearch =
            (a.Activity_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (a.Location || '').toLowerCase().includes(search.toLowerCase());
        const matchesFilter = statusFilter === 'all' || getStatusBucket(a) === statusFilter;
        const matchesDate = matchDateFilter(a.Activity_start, dateFilter);
        return matchesSearch && matchesFilter && matchesDate;
    });

    // ปีที่มีกิจกรรมจริง ใช้เป็นตัวเลือกในตัวกรองปี
    const activityYears = yearsOf(activities, a => a.Activity_start);

    // แบ่งหน้าละ 9 การ์ด (3 คอลัมน์ x 3 แถว) — เปลี่ยนคำค้นหา/แท็บแล้วกลับไปหน้า 1
    const { page, setPage, totalPages, pageItems } = usePagination(filtered, 9, `${search}|${statusFilter}|${dateFilterKey(dateFilter)}`);

    return (
        <div>
            <h2 className="section-title">จัดการกิจกรรมจิตอาสา</h2>
            <p className="section-sub">กิจกรรมทั้งหมดที่คุณสร้างไว้ในระบบ</p>

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

            <div className="table-card" style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}>
                {/* จำนวนกิจกรรม + ช่องค้นหา */}
                <div className="table-toolbar" style={{ background: '#fff', padding: '16px 20px', borderRadius: '14px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', flexWrap: 'wrap', gap: '12px' }}>
                    <h3>กิจกรรมของคุณ ({filtered.length} กิจกรรม)</h3>
                    <div className="toolbar-tools">
                        <DateFilter value={dateFilter} onChange={setDateFilter} years={activityYears} />
                        <div className="search-field">
                            <Search size={16} color="#94a3b8" />
                            <input placeholder="ค้นหากิจกรรม..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* กริดการ์ดกิจกรรม 3 คอลัมน์ */}
                {loading ? <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>กำลังโหลด...</div> : (<>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: '20px',
                        width: '100%'
                    }}>
                        {filtered.length === 0 && (
                            <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '14px' }}>
                                {activities.length === 0 ? 'ยังไม่มีกิจกรรม' : 'ไม่พบกิจกรรมที่ตรงกับตัวกรอง'}
                            </p>
                        )}

                        {pageItems.map(a => {
                            const statusStr = a.Activity_status || a.Status || '';
                            const approvalStr = a.Approval_status || '';

                            // 1. ตรวจสอบช่วงวันรับสมัคร และวันจัดกิจกรรมจริง (คนละอย่างกัน)
                            const now = new Date();
                            const regStart = a.Registration_start ? new Date(a.Registration_start) : null;
                            const regEnd = a.Registration_end ? new Date(a.Registration_end) : null;
                            if (regEnd) regEnd.setHours(23, 59, 59, 999);
                            // อยู่ในช่วงเปิดรับสมัครจริง ๆ (เริ่มแล้ว และยังไม่หมดเขต)
                            const isRegActive = (!regStart || now >= regStart) && (!regEnd || now <= regEnd);
                            // กิจกรรมจัดจบไปแล้วจริง ๆ (ดูจากวันจัดกิจกรรม ไม่ใช่วันปิดรับสมัคร)
                            const activityEnd = a.Activity_end ? new Date(a.Activity_end) : null;
                            const isFinished = activityEnd ? now > activityEnd : false;

                            // 2. ตรวจสอบสถานะกิจกรรม (ใช้เลือกป้ายสถานะและปุ่มที่แสดงบนการ์ด)
                            const isRejected = approvalStr === 'Rejected' || statusStr === 'Rejected' || statusStr === 'ไม่อนุมัติ';
                            const isDraft = (statusStr === 'Draft' || statusStr === 'ร่าง' || statusStr === 'แบบร่าง') && !isRejected;
                            const isPending = (approvalStr === 'Pending' || statusStr === 'Pending' || statusStr === 'รออนุมัติ' || statusStr === 'รอการอนุมัติ') && !isDraft && !isRejected;
                            const isCancelled = !!a.Activity_suspend_status;
                            const isApprovedActive = (statusStr === 'Open' || statusStr === 'Approved' || approvalStr === 'Approved')
                                && !isDraft && !isPending && !isRejected && !isCancelled;

                            const isOpen = isApprovedActive && !isFinished && isRegActive; // อยู่ในช่วงเปิดรับสมัคร
                            const isUpcoming = isApprovedActive && !isFinished && !isRegActive; // อนุมัติแล้วแต่ยังไม่ถึง/พ้นช่วงรับสมัคร รอวันจัดกิจกรรม
                            const isClosed = isApprovedActive && isFinished; // จัดกิจกรรมจบไปแล้วจริง
                            // ยกเลิกกิจกรรมได้ตราบใดที่อนุมัติแล้ว ยังไม่ถูกยกเลิก และยังไม่ถึงวันจัดจริง
                            const canCancel = isApprovedActive && !isFinished;

                            const img = a.Image || FALLBACK;

                            return (
                                <div key={a.Activity_id} style={{
                                    background: '#fff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {/* รูปภาพ + ป้ายสถานะ (แสดงป้ายเดียวตามสถานะของกิจกรรม) */}
                                    <div style={{ position: 'relative', height: '185px' }}>
                                        {isDraft && (
                                            <span style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, background: '#fef08a', color: '#854d0e', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                แบบร่าง
                                            </span>
                                        )}
                                        {isPending && (
                                            <span style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, background: '#fef3c7', color: '#d97706', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                รอการอนุมัติ
                                            </span>
                                        )}
                                        {isRejected && (
                                            <span style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, background: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                ไม่อนุมัติ
                                            </span>
                                        )}
                                        {isCancelled && (
                                            <span style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, background: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                ยกเลิกกิจกรรมแล้ว
                                            </span>
                                        )}
                                        {isOpen && (
                                            <span style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, background: '#e0f2fe', color: '#0369a1', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                อยู่ในช่วงเปิดรับสมัคร
                                            </span>
                                        )}
                                        {isUpcoming && (
                                            <span style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, background: '#ede9fe', color: '#6d28d9', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                รอถึงวันจัดกิจกรรม
                                            </span>
                                        )}
                                        {isClosed && (
                                            <span style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 2, background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                เสร็จสิ้นกิจกรรม
                                            </span>
                                        )}

                                        <img src={img} alt={a.Activity_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = FALLBACK; }} />
                                    </div>

                                    {/* เนื้อหาการ์ด: ชื่อ + ข้อมูลกิจกรรม + เหตุผล (ถ้าไม่อนุมัติ/ถูกยกเลิก) + ปุ่ม */}
                                    <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <h4 style={{ fontSize: '16.5px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                                            {a.Activity_name || 'ไม่ได้ระบุชื่อกิจกรรม'}
                                        </h4>

                                        <ActivityCardInfo activity={a} />

                                        {/* กล่องแสดงเหตุผลเมื่อไม่อนุมัติ */}
                                        {isRejected && (
                                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '10px 12px', color: '#991b1b', fontSize: '13px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', marginBottom: '2px' }}>
                                                    <AlertCircle size={15} color="#dc2626" />
                                                    <span>เหตุผลที่ไม่ผ่านการอนุมัติ:</span>
                                                </div>
                                                <p style={{ margin: 0, paddingLeft: '21px', color: '#7f1d1d', wordBreak: 'break-word' }}>
                                                    {a.Rejection_reason || 'ไม่ระบุเหตุผล'}
                                                </p>
                                            </div>
                                        )}

                                        {/* กล่องแสดงเหตุผลเมื่อยกเลิกกิจกรรม */}
                                        {isCancelled && a.Suspension_reason && (
                                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '10px 12px', color: '#991b1b', fontSize: '13px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', marginBottom: '2px' }}>
                                                    <AlertCircle size={15} color="#dc2626" />
                                                    <span>เหตุผลที่ยกเลิก:</span>
                                                </div>
                                                <p style={{ margin: 0, paddingLeft: '21px', color: '#7f1d1d', wordBreak: 'break-word' }}>
                                                    {a.Suspension_reason}
                                                </p>
                                            </div>
                                        )}

                                        {/* ปุ่มเรียงแนวตั้ง:
                                            รายละเอียด (เสมอ) / แก้ไขแบบร่าง (แบบร่าง) /
                                            ตรวจสอบรายชื่อ (อนุมัติแล้ว) / ยกเลิกกิจกรรม (อนุมัติแล้วและยังไม่จบ) */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>

                                            <button style={mainBtnStyle} onClick={() => setViewDetail(a)}>
                                                <Eye size={15} /> รายละเอียดกิจกรรม
                                            </button>

                                            {isDraft && (
                                                <button style={mainBtnStyle} onClick={() => onEditDraft && onEditDraft(a)}>
                                                    <Edit3 size={15} /> แก้ไขแบบร่าง
                                                </button>
                                            )}

                                            {(isOpen || isUpcoming || isClosed) && (
                                                <button style={mainBtnStyle} onClick={() => setViewAttendees(a)}>
                                                    <Clock size={15} /> ตรวจสอบรายชื่อ
                                                </button>
                                            )}

                                            {canCancel && (
                                                <button style={{ ...mainBtnStyle, background: '#ef4444' }} onClick={() => setCancelTarget(a)}>
                                                    <X size={15} /> ยกเลิกกิจกรรม
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                </>)}
            </div>

            {/* Modal ต่าง ๆ: รายละเอียดกิจกรรม / รายชื่อผู้สมัคร / ยืนยันยกเลิกกิจกรรม */}
            {viewDetail && (
                <ActivityDetailModal
                    activity={viewDetail}
                    organizerName={`${user?.First_name || ''} ${user?.Last_name || ''}`.trim() || null}
                    onClose={() => setViewDetail(null)}
                />
            )}
            {viewAttendees && <AttendeesModal activity={viewAttendees} onClose={() => setViewAttendees(null)} onChat={onChat} />}
            {cancelTarget && <CancelModal activity={cancelTarget} onConfirm={handleCancel} onClose={() => setCancelTarget(null)} />}
        </div>
    );
}