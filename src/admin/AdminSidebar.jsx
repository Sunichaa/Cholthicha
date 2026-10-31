import { useState } from 'react';
import { Home, ClipboardList, Users, UserPlus, Map, LogOut } from 'lucide-react';
import './AdminDashboard.css';

/* =====================================================================
 *  เมนูด้านซ้ายของแดชบอร์ดแอดมิน
 *    activeMenu     เมนูที่เปิดอยู่ (ใช้ไฮไลต์ปุ่ม)
 *    setActiveMenu  เปลี่ยนเมนู
 *    collapsed      ย่อเมนูเหลือแค่ไอคอนหรือไม่
 *    onLogout       ออกจากระบบ (เรียกหลังผู้ใช้ยืนยัน)
 * ===================================================================== */

// รายการเมนู (label ใช้เป็นทั้งชื่อที่แสดงและค่า activeMenu)
const MENUS = [
    { label: 'หน้าแรก',           icon: <Home size={18} /> },
    { label: 'จัดการกิจกรรม',    icon: <ClipboardList size={18} /> },
    { label: 'จัดการบัญชีผู้ใช้', icon: <Users size={18} /> },
    { label: 'เพิ่มผู้ดูแลระบบ',  icon: <UserPlus size={18} /> },
];

export default function AdminSidebar({ activeMenu, setActiveMenu, collapsed, onLogout }) {
    const [showConfirm, setShowConfirm] = useState(false); // เปิด Modal ยืนยันออกจากระบบอยู่หรือไม่
    return (
        <>
            <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
                <nav className="sidebar-nav">
                    {MENUS.map(m => (
                        <button key={m.label} className={`sidebar-btn ${activeMenu === m.label ? 'active' : ''}`}
                            onClick={() => setActiveMenu(m.label)}>
                            {m.icon}
                            {!collapsed && <span>{m.label}</span>}
                        </button>
                    ))}
                </nav>
                {/* ปุ่มออกจากระบบ (เปิด Modal ยืนยันก่อน) */}
                <div className="sidebar-footer">
                    <button className="sidebar-btn logout" onClick={() => setShowConfirm(true)}>
                        <LogOut size={18} />
                        {!collapsed && <span>ออกจากระบบ</span>}
                    </button>
                </div>
            </aside>
            {/* Modal ยืนยันออกจากระบบ (คลิกพื้นหลัง = ยกเลิก) */}
            {showConfirm && (
                <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center' }}
                    onClick={() => setShowConfirm(false)}>
                    <div onClick={e=>e.stopPropagation()} style={{ background:'#fff',borderRadius:'16px',padding:'32px',maxWidth:'360px',width:'90%',fontFamily:'Sarabun,sans-serif',textAlign:'center' }}>
                        <h3 style={{ fontSize:'18px',fontWeight:'700',marginBottom:'8px' }}>ยืนยันออกจากระบบ?</h3>
                        <p style={{ color:'#64748b',fontSize:'14px',marginBottom:'24px' }}>คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?</p>
                        <div style={{ display:'flex',gap:'10px',justifyContent:'center' }}>
                            <button onClick={() => setShowConfirm(false)} style={{ padding:'10px 24px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:'10px',fontWeight:'600',cursor:'pointer',fontFamily:'inherit' }}>ยกเลิก</button>
                            <button onClick={() => { setShowConfirm(false); onLogout(); }} style={{ padding:'10px 24px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'10px',fontWeight:'600',cursor:'pointer',fontFamily:'inherit' }}>ยืนยัน</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
