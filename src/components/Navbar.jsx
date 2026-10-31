import { useState } from 'react';
import { Search, Menu, X, LogOut, User } from 'lucide-react';
import './Navbar.css';

/* =====================================================================
 *  แถบนำทางด้านบนของหน้า landing (ผู้ที่ยังไม่ได้ login)
 *  โลโก้ + ช่องค้นหา + ปุ่มสมัครสมาชิก/เข้าสู่ระบบ (หรือชื่อผู้ใช้ + ปุ่มออกจากระบบ)
 *  จอเล็กจะย่อเป็นปุ่ม hamburger ที่กดเปิดเมนูมือถือ
 *    onSearch         ส่งคำค้นหาให้หน้าแรก
 *    user             ผู้ใช้ที่ login อยู่ (ถ้ามี)
 *    onLoginClick     เปิดหน้าเข้าสู่ระบบ
 *    onRegisterClick  เปิดหน้าสมัครสมาชิก
 *    onLogout         ออกจากระบบ
 * ===================================================================== */
export default function Navbar({ onSearch, user, onLoginClick, onRegisterClick, onLogout }) {
  const [query, setQuery] = useState('');           // ข้อความในช่องค้นหา
  const [menuOpen, setMenuOpen] = useState(false);  // เปิดเมนูมือถืออยู่หรือไม่

  // กด Enter ในช่องค้นหา: ส่งคำค้นหาแล้วปิดเมนูมือถือ
  const handleSearch = (e) => {
    e.preventDefault();
    onSearch?.(query);
    setMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="nav-inner">
        {/* โลโก้และชื่อระบบ (ซ่อนรูปถ้าโหลดโลโก้ไม่ได้) */}
        <a href="/" className="nav-brand">
          <div className="brand-icon">
            <img src="/logo.png" alt="Logo" className="brand-logo-img"
              onError={e => { e.target.style.display='none'; }} />
          </div>
          <div className="brand-text">
            <span className="brand-th">ระบบสารสนเทศ</span>
            <span className="brand-sub">การเข้าร่วมกิจกรรมจิตอาสา</span>
          </div>
        </a>

        {/* ช่องค้นหา (จอใหญ่) */}
        <form className="nav-search" onSubmit={handleSearch}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="ค้นหากิจกรรม หรือ สถานที่"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </form>

        {/* ปุ่มด้านขวา (จอใหญ่): login แล้ว -> ชื่อผู้ใช้ + ออกจากระบบ, ยังไม่ login -> สมัครสมาชิก + เข้าสู่ระบบ */}
        <div className="nav-actions">
          {user ? (
            <>
              <div className="user-chip">
                <User size={14} />
                <span>{user.First_name} {user.Last_name}</span>
              </div>
              <button className="btn-outline" onClick={onLogout}>
                <LogOut size={14} /> ออกจากระบบ
              </button>
            </>
          ) : (
            <>
              <button className="btn-outline" onClick={onRegisterClick}>สมัครสมาชิก</button>
              <button className="btn-primary" onClick={onLoginClick}>เข้าสู่ระบบ</button>
            </>
          )}
        </div>

        {/* ปุ่มเปิด/ปิดเมนูมือถือ */}
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* เมนูมือถือ: ช่องค้นหา + ปุ่มเดียวกับด้านบน (กดแล้วปิดเมนู) */}
      {menuOpen && (
        <div className="mobile-menu">
          <form className="mobile-search" onSubmit={handleSearch}>
            <Search size={16} />
            <input placeholder="ค้นหากิจกรรม" value={query} onChange={e => setQuery(e.target.value)} />
          </form>
          {user ? (
            <button className="btn-outline w-full" onClick={onLogout}><LogOut size={14} /> ออกจากระบบ</button>
          ) : (
            <>
              <button className="btn-outline w-full" onClick={() => { onRegisterClick(); setMenuOpen(false); }}>สมัครสมาชิก</button>
              <button className="btn-primary w-full" onClick={() => { onLoginClick(); setMenuOpen(false); }}>เข้าสู่ระบบ</button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
