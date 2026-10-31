/* =====================================================================
 *  App — ตัวเลือกหน้าหลักตามสถานะการเข้าสู่ระบบและบทบาทผู้ใช้
 *
 *  ลำดับการเลือกหน้า:
 *    1. กำลังเปิดหน้าเข้าสู่ระบบ/สมัครสมาชิก  -> AuthModal (เต็มจอ)
 *    2. login เป็นแอดมิน                  -> AdminDashboard
 *    3. login เป็นผู้จัดกิจกรรม              -> OrganizerDashboard
 *    4. login เป็นผู้เข้าร่วมกิจกรรม          -> UserDashboard
 *    5. ยังไม่ได้ login                    -> หน้า landing (หน้าแรก / รายละเอียดกิจกรรม)
 * ===================================================================== */

import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import Home from './pages/Home';
import RegisterPage from './components/RegisterPage.jsx';
import ActivityDetail from './components/ActivityDetail.jsx';
import UserDashboard from './volunteer/UserDashboard.jsx';
import AdminDashboard from './admin/AdminDashboard.jsx';
import OrganizerDashboard from './organizer/OrganizerDashboard.jsx';
import { loadSession, saveSession, clearSession } from './authSession.js';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');  // คำค้นหาจากช่องค้นหาใน Navbar (หน้า landing)
  // ผู้ใช้ที่ login อยู่ — ตั้งต้นจาก session ที่บันทึกไว้ใน localStorage เพื่อให้รีเฟรชแล้วไม่หลุด login
  const [user, setUser] = useState(() => loadSession()?.user || null);
  const [authModal, setAuthModal] = useState(null);    // 'login' | 'register' | null (ไม่เปิด)

  // เข้าสู่ระบบสำเร็จ: บันทึก session แล้วปิดหน้า login
  const handleLogin = (userData, token) => {
    saveSession(userData, token);
    setUser(userData);
    setAuthModal(null);
  };

  // ออกจากระบบ: ลบ session แล้วกลับหน้า landing
  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  // สลับบทบาท (Volunteer <-> Organizer) จากหน้าโปรไฟล์
  // อัปเดตทั้ง role และ Role ใน state และบันทึก token ใหม่ที่ backend ออกให้ตาม role ล่าสุด
  // (token เก่ายังมี role เดิมติดอยู่ จะถูก backend ปฏิเสธตอนเข้าเมนูของ role ใหม่)
  const handleRoleChange = (newRole, token) => {
    setUser(prev => {
      const next = { ...prev, role: newRole, Role: newRole };
      saveSession(next, token || loadSession()?.token);
      return next;
    });
  };

  // role ของผู้ใช้เป็นตัวพิมพ์เล็ก (รองรับทั้งคีย์ role และ Role)
  const getRoleString = () => {
    return String(user?.role || user?.Role || '').toLowerCase();
  };

  // เช็กบทบาท (รองรับทั้งชื่อภาษาอังกฤษและภาษาไทย)
  const isAdmin = getRoleString().includes('admin') || getRoleString().includes('แอดมิน');
  const isOrganizer = getRoleString().includes('organizer') || getRoleString().includes('ผู้จัด');

  // ---------- 1. หน้าเข้าสู่ระบบ / สมัครสมาชิก (เต็มจอ) ----------
  if (authModal) {
    return (
      <AuthModal
        mode={authModal}
        onClose={() => setAuthModal(null)}
        onLogin={handleLogin}
      />
    );
  }

  // ---------- 2. แอดมิน ----------
  if (user && isAdmin) {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  // ---------- 3. ผู้จัดกิจกรรม ----------
  if (user && isOrganizer) {
    return (
      <OrganizerDashboard
        user={user}
        onLogout={handleLogout}
        onRoleChange={handleRoleChange}
      />
    );
  }

  // ---------- 4. ผู้เข้าร่วมกิจกรรม ----------
  if (user) {
    return (
      <UserDashboard
        user={user}
        onLogout={handleLogout}
        onRoleChange={handleRoleChange}
      />
    );
  }

  // ---------- 5. หน้า landing (ยังไม่ได้ login) ----------
  //   /                หน้าแรก รายการกิจกรรม
  //   /register        ฟอร์มสมัครเข้าร่วมกิจกรรม
  //   /activities/:id  รายละเอียดกิจกรรม
  return (
    <Router>
      <Navbar
        onSearch={setSearchQuery}
        user={user}
        onLoginClick={() => setAuthModal('login')}
        onRegisterClick={() => setAuthModal('register')}
        onLogout={handleLogout}
      />
      <div style={{ minHeight: 'calc(100vh - 140px)' }}>
        <Routes>
          <Route path="/" element={<Home searchQuery={searchQuery} user={user} onOpenAuth={setAuthModal} />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/activities/:id" element={<ActivityDetail user={user} onOpenAuth={setAuthModal} />} />
        </Routes>
      </div>
      {/* ส่วนท้ายเว็บ */}
      <footer style={{ background:'#1B5E35', color:'rgba(255,255,255,0.7)', textAlign:'center', padding:'24px 20px', fontSize:'13px', fontFamily:'Sarabun,sans-serif' }}>
        © {new Date().getFullYear()} ระบบสารสนเทศจิตอาสา ร่วมอาสา
      </footer>
    </Router>
  );
}
