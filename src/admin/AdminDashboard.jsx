import { useState } from 'react';
import AdminSidebar from './AdminSidebar';
import AdminNavbar from './AdminNavbar';
import AdminHome from './AdminHome';
import AdminManageActivities from './AdminManageActivities';
import AdminUsers from './AdminUsers';
import AdminAddUser from './AdminAddUser';
import './AdminDashboard.css';

/* =====================================================================
 *  แดชบอร์ดของแอดมิน — หน้าหลักหลัง login ด้วยบัญชีผู้ดูแลระบบ
 *  โครงหน้า: AdminNavbar ด้านบน + AdminSidebar ด้านซ้าย + เนื้อหาตามเมนูที่เลือก
 *  เมนู: หน้าแรก / จัดการกิจกรรม / จัดการบัญชีผู้ใช้ / เพิ่มผู้ดูแลระบบ
 *    user      แอดมินที่ login อยู่
 *    onLogout  ออกจากระบบ
 * ===================================================================== */
export default function AdminDashboard({ user, onLogout }) {
    const [activeMenu, setActiveMenu] = useState('หน้าแรก'); // เมนูที่เปิดอยู่
    const [collapsed, setCollapsed] = useState(false);       // ย่อ Sidebar อยู่หรือไม่

    // ตัวกรองสถานะของหน้า "จัดการกิจกรรม" (all/open/closed) — ตั้งได้จากการ์ดสถิติในหน้าแรก
    const [activitiesFilter, setActivitiesFilter] = useState('all');

    // สลับเมนูจาก sidebar ตามปกติ ให้รีเซ็ตตัวกรองกลับเป็น "ทั้งหมด" เสมอ (ไม่ให้ค้างตัวกรอง
    // จากครั้งก่อนที่กดผ่านการ์ดสถิติ) ต่างจาก goToActivities ด้านล่างที่ตั้งใจกำหนดตัวกรองเอง
    const handleMenuChange = (menu) => {
        setActivitiesFilter('all');
        setActiveMenu(menu);
    };

    // กดการ์ดสถิติในหน้าแรก -> ไปหน้าจัดการกิจกรรมพร้อมกรองตามหมวดที่กดทันที
    const goToActivities = (filter) => {
        setActivitiesFilter(filter);
        setActiveMenu('จัดการกิจกรรม');
    };

    return (
        <div className="admin-layout">
            <AdminNavbar user={user} collapsed={collapsed} setCollapsed={setCollapsed} />
            <div className="admin-body">
                <AdminSidebar activeMenu={activeMenu} setActiveMenu={handleMenuChange}
                    collapsed={collapsed} onLogout={onLogout} />
                {/* เนื้อหาตามเมนูที่เลือก */}
                <main className="admin-main">
                    {activeMenu === 'หน้าแรก'        && <AdminHome user={user} onSelectFilter={goToActivities} />}
                    {activeMenu === 'จัดการกิจกรรม'    && <AdminManageActivities initialFilter={activitiesFilter} />}
                    {activeMenu === 'จัดการบัญชีผู้ใช้' && <AdminUsers />}
                    {activeMenu === 'เพิ่มผู้ดูแลระบบ'  && <AdminAddUser />}
                </main>
            </div>
        </div>
    );
}
