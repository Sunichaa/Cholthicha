import React from 'react';
import { Menu, User, ChevronDown } from 'lucide-react';
import './NavbarUser.css';

/* =====================================================================
 *  แถบด้านบนของแดชบอร์ดผู้เข้าร่วมกิจกรรม
 *  ซ้าย: ปุ่มย่อ/ขยายเมนู + โลโก้ | ขวา: ชื่อ-นามสกุลผู้ใช้ + บทบาท
 *    user                   ผู้ใช้ที่ login อยู่
 *    isSidebarCollapsed     สถานะย่อเมนูปัจจุบัน
 *    setIsSidebarCollapsed  สลับย่อ/ขยายเมนู
 * ===================================================================== */
export default function Navbar({ user, isSidebarCollapsed, setIsSidebarCollapsed }) {
    return (
        <header className="app-top-navbar">
            <div className="nav-left-section">
                {/* ปุ่ม Hamburger ควบคุมสเตตการย่อ/ขยาย Sidebar */}
                <button 
                    className="hamburger-menu-btn" 
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                >
                    <Menu size={22} />
                </button>
                <div className="brand-icon">
                    <img 
                        src="/logo.png" 
                        alt="Logo" 
                        className="brand-logo-img"
                        onError={e => { e.target.style.display = 'none'; }} 
                    />
                </div>
                <div className="brand-text">
                    <span className="brand-th">ระบบสารสนเทศ</span>
                    <span className="brand-sub">การเข้าร่วมกิจกรรมจิตอาสา</span>
                </div>
            </div>

            {/* ส่วนโปรไฟล์ผู้ใช้งานด้านขวา (ไม่มีชื่อผู้ใช้จะแสดงชื่อตัวอย่างแทน) */}
            <div className="nav-right-section">
                <div className="user-profile-widget">
                    <div className="avatar-circle-box">
                        <User size={20} className="avatar-svg" />
                    </div>
                    <div className="user-meta-info">
                        <div className="profile-display-name">
                            {user?.First_name
                                ? `${user.First_name} ${user.Last_name || ''}`.trim()
                                : 'น้องเอย เองจ้า'}
                        </div>
                        <div className="profile-display-role">ผู้เข้าร่วมกิจกรรม</div>
                    </div>
                    <ChevronDown size={16} className="profile-arrow" />
                </div>
            </div>
        </header>
    );
}