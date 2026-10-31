import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { notify } from '../notice';
import { loadSession } from '../authSession.js';
import Pagination from '../components/Pagination';
import usePagination from '../usePagination';
import './AdminDashboard.css';

/* =====================================================================
 *  หน้าจัดการบัญชีผู้ใช้ (แอดมิน)
 *  ตารางสมาชิกทั้งหมด + ช่องค้นหา -> ปุ่ม "ดูประวัติ" เปิด Modal ประวัติการระงับบัญชี
 *  ใน Modal ประวัติมีปุ่มระงับบัญชี / เปิดใช้งาน ซึ่งต้องกรอกเหตุผลก่อนเสมอ
 * ===================================================================== */
export default function AdminUsers() {
    const [members, setMembers] = useState([]);   // สมาชิกทั้งหมด
    const [search, setSearch]   = useState('');   // คำค้นหา (ชื่อ / นามสกุล / อีเมล)
    const [loading, setLoading] = useState(true);
    const [acting, setActing]   = useState(null); // Member_id ที่กำลังทำรายการ (ใช้ปิดปุ่มชั่วคราว)

    // Modal ประวัติการระงับ/เปิดใช้งานบัญชี (โหลดประวัติทุกรอบจากตาราง member_suspension)
    const [historyModal, setHistoryModal] = useState({ open: false, member: null });
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Modal กรอกเหตุผลที่ระงับ — ต้องกรอกก่อนถึงจะบันทึกลงตาราง member_suspension ได้
    const [suspendModal, setSuspendModal] = useState({ open: false, memberId: null, reason: '' });

    // Modal กรอกเหตุผลที่ยกเลิกการระงับ — บันทึกลงคอลัมน์ Activated_reason
    const [activateModal, setActivateModal] = useState({ open: false, memberId: null, reason: '' });

    // ดึง Admin ID จาก User Session (ruamasa_session ใน localStorage — ดู src/authSession.js)
    // ใช้บันทึกว่าแอดมินคนไหนเป็นคนกดระงับ/เปิดใช้งาน ลงตาราง member_suspension
    const adminUser = loadSession()?.user || {};
    const adminId = adminUser.Admin_id || adminUser.User_id || 1;

    // ดึงประวัติการระงับของสมาชิกคนหนึ่ง
    const loadHistory = (memberId) => {
        setHistoryLoading(true);
        fetch(`http://localhost:5000/api/admin/members/${memberId}/suspension-history`)
            .then(r => r.json())
            .then(d => { setHistory(d.data || []); setHistoryLoading(false); })
            .catch(() => setHistoryLoading(false));
    };

    // โหลดรายชื่อใหม่เสมอ และถ้า Modal ประวัติเปิดอยู่สำหรับสมาชิกคนที่เพิ่งทำรายการ
    // อัปเดตสถานะใน Modal + โหลดประวัติใหม่ (กันต้องปิด-เปิด Modal เองทุกครั้ง)
    const refreshAll = (memberId) => {
        setLoading(true);
        fetch('http://localhost:5000/api/admin/members')
            .then(r => r.json())
            .then(d => {
                const list = d.data || [];
                setMembers(list);
                setLoading(false);
                if (memberId) {
                    const updated = list.find(x => x.Member_id === memberId);
                    setHistoryModal(prev =>
                        (prev.open && prev.member?.Member_id === memberId)
                            ? { ...prev, member: updated || prev.member }
                            : prev
                    );
                    loadHistory(memberId);
                }
            })
            .catch(() => setLoading(false));
    };
    useEffect(() => { refreshAll(); }, []);

    // เปิด / ปิด Modal ประวัติ
    const openHistory = (m) => {
        setHistoryModal({ open: true, member: m });
        loadHistory(m.Member_id);
    };
    const closeHistory = () => setHistoryModal({ open: false, member: null });

    // ---------- ระงับบัญชี ----------
    // กดปุ่ม "ระงับบัญชี" -> เปิด Modal กรอกเหตุผล -> ยืนยัน -> PUT /suspend -> โหลดข้อมูลใหม่
    const suspend = (id) => setSuspendModal({ open: true, memberId: id, reason: '' });

    const handleSuspendSubmit = () => {
        if (!suspendModal.reason.trim()) {
            notify('กรุณากรอกเหตุผลที่ระงับการใช้งาน', 'warning');
            return;
        }

        const { memberId, reason } = suspendModal;
        setActing(memberId);
        setSuspendModal({ open: false, memberId: null, reason: '' });
        fetch(`http://localhost:5000/api/admin/members/${memberId}/suspend`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId, reason }),
        })
            .then(r => r.json())
            .then(d => {
                if (!d.success) notify(`ระงับบัญชีไม่สำเร็จ: ${d.message || d.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`, 'error');
                else notify('ระงับบัญชีสำเร็จ', 'success');
                refreshAll(memberId);
                setActing(null);
            })
            .catch(() => { notify('ระงับบัญชีไม่สำเร็จ: เชื่อมต่อ server ไม่ได้', 'error'); setActing(null); });
    };

    // ---------- เปิดใช้งานบัญชี (ยกเลิกการระงับ) ----------
    // กดปุ่ม "เปิดใช้งาน" -> เปิด Modal กรอกเหตุผล -> ยืนยัน -> PUT /activate -> โหลดข้อมูลใหม่
    const activate = (id) => setActivateModal({ open: true, memberId: id, reason: '' });

    const handleActivateSubmit = () => {
        if (!activateModal.reason.trim()) {
            notify('กรุณากรอกเหตุผลที่ยกเลิกการระงับ', 'warning');
            return;
        }

        const { memberId, reason } = activateModal;
        setActing(memberId);
        setActivateModal({ open: false, memberId: null, reason: '' });
        fetch(`http://localhost:5000/api/admin/members/${memberId}/activate`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId, reason }),
        })
            .then(r => r.json())
            .then(d => {
                if (!d.success) notify(`เปิดใช้งานบัญชีไม่สำเร็จ: ${d.message || d.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`, 'error');
                else notify('เปิดใช้งานบัญชีสำเร็จ', 'success');
                refreshAll(memberId);
                setActing(null);
            })
            .catch(() => { notify('เปิดใช้งานบัญชีไม่สำเร็จ: เชื่อมต่อ server ไม่ได้', 'error'); setActing(null); });
    };

    // กรองสมาชิกตามคำค้นหา
    const filtered = members.filter(m =>
        `${m.First_name} ${m.Last_name} ${m.Email}`.toLowerCase().includes(search.toLowerCase())
    );

    // แบ่งหน้าละ 10 แถว — เปลี่ยนคำค้นหาแล้วกลับไปหน้า 1
    const { page, setPage, totalPages, pageItems } = usePagination(filtered, 10, search);

    // ชื่อและคลาสสีของป้ายบทบาท
    const roleLabel = (s) => s === 'Organizer' ? 'ผู้จัดกิจกรรม' : 'ผู้เข้าร่วมกิจกรรม';
    const roleCls   = (s) => s === 'Organizer' ? 'badge-org' : 'badge-vol';

    // จัดรูปแบบวันที่/เวลาในประวัติ
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('th-TH') : '';
    const fmtTime = (t) => t ? String(t).slice(0, 5) : '';

    const historyMember = historyModal.member;              // สมาชิกที่เปิดดูประวัติอยู่
    const historyIsSuspended = !!historyMember?.Suspended;  // ถูกระงับอยู่หรือไม่ (เลือกปุ่มที่แสดง)

    return (
        <div>
            <h2 className="section-title">จัดการบัญชีผู้ใช้</h2>
            <p className="section-sub">ค้นหา ระงับการใช้งาน หรือแก้ไขข้อมูลผู้ใช้งานระบบ</p>

            {/* ตารางสมาชิก: ชื่อ / อีเมล / บทบาท / สถานะ / ปุ่มดูประวัติ */}
            <div className="table-card">
                <div className="table-toolbar">
                    <h3>รายชื่อผู้ใช้ทั้งหมด ({filtered.length} คน)</h3>
                    <div className="search-field">
                        <Search size={16} color="#94a3b8" />
                        <input placeholder="พิมพ์ชื่อหรืออีเมลที่ต้องการค้นหา..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>
                {loading ? (
                    <div style={{ padding:'40px',textAlign:'center',color:'#94a3b8' }}>กำลังโหลด...</div>
                ) : (<>
                    <table>
                        <thead>
                            <tr>
                                <th>ชื่อ-นามสกุล</th>
                                <th>อีเมล</th>
                                <th>บทบาท</th>
                                <th>สถานะ</th>
                                <th>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr className="empty-row"><td colSpan={5}>ไม่พบข้อมูลผู้ใช้</td></tr>
                            )}
                            {pageItems.map(m => {
                                // บทบาทอยู่คอลัมน์ Role (Volunteer/Organizer) ส่วนสถานะระงับอยู่คอลัมน์
                                // Suspended (tinyint) — คนละคอลัมน์กับ Member_status (Active/Inactive/Pending)
                                const isSuspended = !!m.Suspended;
                                return (
                                <tr key={m.Member_id}>
                                    <td style={{ fontWeight:'600' }}>{m.First_name} {m.Last_name}</td>
                                    <td style={{ color:'#64748b' }}>{m.Email}</td>
                                    <td><span className={`badge ${roleCls(m.Role)}`}>{roleLabel(m.Role)}</span></td>
                                    <td>
                                        <span className={`badge ${isSuspended ? 'badge-closed' : 'badge-active'}`}>
                                            {isSuspended ? 'ถูกระงับ' : 'ใช้งานปกติ'}
                                        </span>
                                    </td>
                                    <td>
                                        {/* ระงับ/เปิดใช้งานทำใน Modal ประวัติ */}
                                        <button className="btn-sm" disabled={acting===m.Member_id}
                                            onClick={() => openHistory(m)}>
                                            ดูประวัติ
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                </>)}
            </div>

            {/* MODAL ประวัติการระงับ/เปิดใช้งานบัญชี: หัว + สถานะ + ปุ่มระงับ/เปิดใช้งาน + รายการประวัติ */}
            {historyModal.open && historyMember && (
                <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
                    <div style={{ background:'#fff', borderRadius:'12px', padding:'24px', width:'100%', maxWidth:'560px', maxHeight:'80vh', overflowY:'auto', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
                            <div>
                                <h3 style={{ margin:0, fontSize:'18px', color:'#1e293b' }}>
                                    ประวัติการระงับบัญชี — {historyMember.First_name} {historyMember.Last_name}
                                </h3>
                                <span className={`badge ${historyIsSuspended ? 'badge-closed' : 'badge-active'}`} style={{ marginTop:'6px', display:'inline-block' }}>
                                    {historyIsSuspended ? 'ถูกระงับ' : 'ใช้งานปกติ'}
                                </span>
                            </div>
                            <X size={20} style={{ cursor:'pointer', color:'#64748b' }} onClick={closeHistory} />
                        </div>

                        <div style={{ margin:'16px 0' }}>
                            {historyIsSuspended ? (
                                <button className="btn-sm btn-approve" disabled={acting===historyMember.Member_id}
                                    onClick={() => activate(historyMember.Member_id)}>
                                    {acting===historyMember.Member_id ? '...' : 'เปิดใช้งาน'}
                                </button>
                            ) : (
                                <button className="btn-sm btn-suspend" disabled={acting===historyMember.Member_id}
                                    onClick={() => suspend(historyMember.Member_id)}>
                                    {acting===historyMember.Member_id ? '...' : 'ระงับบัญชี'}
                                </button>
                            )}
                        </div>

                        {historyLoading ? (
                            <div style={{ padding:'24px', textAlign:'center', color:'#94a3b8' }}>กำลังโหลด...</div>
                        ) : history.length === 0 ? (
                            <div style={{ padding:'24px', textAlign:'center', color:'#94a3b8' }}>ยังไม่เคยถูกระงับบัญชี</div>
                        ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                                {/* 1 กล่อง = 1 รอบการระงับ (ใหม่สุดอยู่บน): ส่วนเปิดใช้งานคืน (ถ้ามี) + ส่วนระงับ */}
                                {history.map(h => (
                                    <div key={h.Suspension_id} style={{ border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px' }}>
                                        {h.Activated_at ? (
                                            <div>
                                                <div style={{ fontSize:'13px', color:'#1e293b' }}>
                                                    <strong>เปิดใช้งาน</strong> — {fmtDate(h.Activated_at)} {fmtTime(h.Activated_time)} น.
                                                </div>
                                                {h.Activated_reason && (
                                                    <div style={{ fontSize:'13px', color:'#64748b', marginTop:'2px' }}>เหตุผล: {h.Activated_reason}</div>
                                                )}
                                                <div style={{ fontSize:'12px', color:'#94a3b8', marginTop:'2px' }}>โดย: {h.Activated_by_email}</div>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize:'12px', color:'#ef4444' }}>ยังคงถูกระงับอยู่</div>
                                        )}

                                        <div style={{ marginTop:'8px', paddingTop:'8px', borderTop:'1px dashed #e2e8f0' }}>
                                            <div style={{ fontSize:'13px', color:'#1e293b' }}>
                                                <strong>ระงับ</strong> — {fmtDate(h.Suspended_at)} {fmtTime(h.Suspended_time)} น.
                                            </div>
                                            {h.Suspension_reason && (
                                                <div style={{ fontSize:'13px', color:'#64748b', marginTop:'2px' }}>เหตุผล: {h.Suspension_reason}</div>
                                            )}
                                            <div style={{ fontSize:'12px', color:'#94a3b8', marginTop:'2px' }}>โดย: {h.Suspended_by_email}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL ระบุเหตุผลที่ระงับบัญชี — เปิดซ้อนทับ Modal ประวัติ */}
            {suspendModal.open && (
                <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1001 }}>
                    <div style={{ background:'#fff', borderRadius:'12px', padding:'24px', width:'100%', maxWidth:'450px', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                            <h3 style={{ margin:0, fontSize:'18px', color:'#1e293b' }}>ระบุเหตุผลที่ระงับการใช้งาน</h3>
                            <X size={20} style={{ cursor:'pointer', color:'#64748b' }} onClick={() => setSuspendModal({ open: false, memberId: null, reason: '' })} />
                        </div>

                        <textarea
                            rows={4}
                            placeholder="พิมพ์เหตุผลที่ระงับการใช้งานบัญชีนี้..."
                            value={suspendModal.reason}
                            onChange={(e) => setSuspendModal({ ...suspendModal, reason: e.target.value })}
                            style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', boxSizing:'border-box', marginBottom:'16px', fontFamily:'inherit' }}
                        />

                        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
                            <button
                                onClick={() => setSuspendModal({ open: false, memberId: null, reason: '' })}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', cursor:'pointer' }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSuspendSubmit}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', fontWeight:'600' }}
                            >
                                ยืนยันระงับการใช้งาน
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL ระบุเหตุผลที่ยกเลิกการระงับ — เปิดซ้อนทับ Modal ประวัติ */}
            {activateModal.open && (
                <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1001 }}>
                    <div style={{ background:'#fff', borderRadius:'12px', padding:'24px', width:'100%', maxWidth:'450px', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                            <h3 style={{ margin:0, fontSize:'18px', color:'#1e293b' }}>ระบุเหตุผลที่ยกเลิกการระงับ</h3>
                            <X size={20} style={{ cursor:'pointer', color:'#64748b' }} onClick={() => setActivateModal({ open: false, memberId: null, reason: '' })} />
                        </div>

                        <textarea
                            rows={4}
                            placeholder="พิมพ์เหตุผลที่ยกเลิกการระงับบัญชีนี้..."
                            value={activateModal.reason}
                            onChange={(e) => setActivateModal({ ...activateModal, reason: e.target.value })}
                            style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', boxSizing:'border-box', marginBottom:'16px', fontFamily:'inherit' }}
                        />

                        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
                            <button
                                onClick={() => setActivateModal({ open: false, memberId: null, reason: '' })}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', cursor:'pointer' }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleActivateSubmit}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'none', background:'#2D7D46', color:'#fff', cursor:'pointer', fontWeight:'600' }}
                            >
                                ยืนยันเปิดใช้งาน
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
