import { Menu } from 'lucide-react';
import './AdminDashboard.css';

/* =====================================================================
 *  แถบด้านบนของแดชบอร์ดแอดมิน
 *  ซ้าย: ปุ่มย่อ/ขยายเมนู + โลโก้ | ขวา: ตัวอักษรแรกของชื่อ + ชื่อ-นามสกุล + บทบาท
 *    user          แอดมินที่ login อยู่
 *    collapsed     สถานะย่อเมนูปัจจุบัน
 *    setCollapsed  สลับย่อ/ขยายเมนู
 * ===================================================================== */
export default function AdminNavbar({ user, collapsed, setCollapsed }) {
    const initial = user?.First_name?.charAt(0).toUpperCase() || 'A'; // ตัวอักษรในวงกลมรูปโปรไฟล์
    return (
        <header className="admin-navbar">
            <div className="admin-nav-left">
                <button className="hamburger-btn" onClick={() => setCollapsed(!collapsed)}>
                    <Menu size={22} />
                </button>
                <img src="/logo.png" alt="logo" className="brand-logo" onError={e => e.target.style.display='none'} />
                <span className="brand-label">ระบบสารสนเทศจิตอาสา</span>
            </div>
            <div className="admin-nav-right">
                <div className="user-badge">
                    <div className="user-avatar-sm">{initial}</div>
                    <div>
                        <div className="user-name-sm">{user?.First_name} {user?.Last_name}</div>
                        <div className="user-role-sm">ผู้ดูแลระบบ</div>
                    </div>
                </div>
            </div>
        </header>
    );
}
