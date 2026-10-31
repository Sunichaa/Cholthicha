import { Menu } from 'lucide-react';
import '../admin/AdminDashboard.css';

/* =====================================================================
 *  แถบด้านบนของแดชบอร์ดผู้จัดกิจกรรม
 *  ซ้าย: ปุ่มย่อ/ขยายเมนู + โลโก้ | ขวา: ตัวอักษรแรกของชื่อ + ชื่อ-นามสกุล + บทบาท
 *    user          ผู้ใช้ที่ login อยู่
 *    collapsed     สถานะย่อเมนูปัจจุบัน
 *    setCollapsed  สลับย่อ/ขยายเมนู
 * ===================================================================== */
export default function OrganizerNavbar({ user, collapsed, setCollapsed }) {
    const initial = user?.First_name?.charAt(0).toUpperCase() || 'O'; // ตัวอักษรในวงกลมรูปโปรไฟล์
    return (
        <header className="admin-navbar" style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', borderBottomColor:'#f9a8d4' }}>
            <div className="admin-nav-left">
                <button className="hamburger-btn" onClick={() => setCollapsed(!collapsed)}><Menu size={22} /></button>
                <img src="/logo.png" alt="logo" className="brand-logo" onError={e => e.target.style.display='none'} />
                <span className="brand-label" style={{ color:'#7c3aed' }}>ระบบสารสนเทศจิตอาสา</span>
            </div>
            <div className="admin-nav-right">
                <div className="user-badge" style={{ background:'#ede9fe' }}>
                    <div className="user-avatar-sm" style={{ background:'#7c3aed' }}>{initial}</div>
                    <div>
                        <div className="user-name-sm">{user?.First_name} {user?.Last_name}</div>
                        <div className="user-role-sm">ผู้จัดกิจกรรม</div>
                    </div>
                </div>
            </div>
        </header>
    );
}
