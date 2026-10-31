import { useState } from 'react';
import OrganizerSidebar from './OrganizerSidebar';
import OrganizerNavbar from './OrganizerNavbar';
import OrganizerHome from './OrganizerHome';
import OrganizerActivities from './OrganizerActivities';
import OrganizerAddActivity from './OrganizerAddActivity';
import ChatView from '../components/ChatView';
import ProfileView from '../components/ProfileView';
import '../admin/AdminDashboard.css';
import './OrganizerDashboard.css';

/* =====================================================================
 *  แดชบอร์ดของผู้จัดกิจกรรม (organizer) — หน้าหลักหลัง login
 *  โครงหน้า: OrganizerNavbar ด้านบน + OrganizerSidebar ด้านซ้าย + เนื้อหาตามเมนูที่เลือก
 *  เมนู: หน้าแรก / จัดการกิจกรรม / เพิ่มกิจกรรม / แชต / ข้อมูลส่วนตัว
 *    user          ผู้ใช้ที่ login อยู่
 *    onLogout      ออกจากระบบ
 *    onRoleChange  สลับบทบาท (ส่งต่อให้หน้าโปรไฟล์)
 * ===================================================================== */
export default function OrganizerDashboard({ user, onLogout, onRoleChange }) {
    const [activeMenu, setActiveMenu] = useState('หน้าแรก'); // เมนูที่เปิดอยู่
    const [collapsed, setCollapsed] = useState(false);       // ย่อ Sidebar อยู่หรือไม่

    // กิจกรรมที่จะนำไปแก้ไขในฟอร์ม (แบบร่าง หรือกิจกรรมที่ไม่ผ่านการอนุมัติ) — null = เพิ่มกิจกรรมใหม่
    const [editingActivity, setEditingActivity] = useState(null);

    // ตัวกรองสถานะของหน้า "จัดการกิจกรรม" (all/open/closed) — ตั้งได้จากการ์ดสถิติในหน้าแรก
    const [activitiesFilter, setActivitiesFilter] = useState('all');

    // ห้องแชตที่เปิดตรงมาจากปุ่ม "แชต" ในหน้าตรวจสอบรายชื่อผู้สมัคร
    const [chatTarget, setChatTarget] = useState(null);

    // เปิดหน้าแชตพร้อมเลือกห้องที่ระบุ
    const handleOpenChat = (target) => {
        setChatTarget(target);
        setActiveMenu('แชต');
    };

    // กดปุ่ม "แก้ไข" ในหน้าจัดการกิจกรรม -> เปิดฟอร์มพร้อมข้อมูลกิจกรรมนั้น
    const handleEditActivity = (activity) => {
        setEditingActivity(activity);   // เก็บข้อมูลกิจกรรมที่เลือก (รวมข้อมูล Rejection_reason)
        setActiveMenu('เพิ่มกิจกรรม');  // สลับไปยังหน้าฟอร์มแก้ไขทันที
    };

    // เปลี่ยนเมนูจาก Sidebar: ล้างกิจกรรมที่กำลังแก้ไข (ถ้าไม่ได้ไปหน้าเพิ่มกิจกรรม)
    // และรีเซ็ตตัวกรองกิจกรรม / ห้องแชตที่เปิดค้างไว้
    const handleMenuChange = (menu) => {
        if (menu !== 'เพิ่มกิจกรรม') {
            setEditingActivity(null);
        }
        setActivitiesFilter('all');
        setChatTarget(null);
        setActiveMenu(menu);
    };

    // กดการ์ดสถิติในหน้าแรก -> ไปหน้าจัดการกิจกรรมพร้อมกรองตามหมวดที่กดทันที
    const goToActivities = (filter) => {
        setActivitiesFilter(filter);
        setActiveMenu('จัดการกิจกรรม');
    };

    return (
        <div className="admin-layout">
            <OrganizerNavbar user={user} collapsed={collapsed} setCollapsed={setCollapsed} />
            <div className="admin-body">
                <OrganizerSidebar
                    activeMenu={activeMenu}
                    setActiveMenu={handleMenuChange}
                    collapsed={collapsed}
                    onLogout={onLogout}
                />
                <main className="admin-main">
                    {/* หน้าแรก: สถิติและกราฟ */}
                    {activeMenu === 'หน้าแรก' && (
                        <OrganizerHome user={user} onSelectFilter={goToActivities} />
                    )}

                    {/* จัดการกิจกรรม: แก้ไขได้ทั้งแบบร่าง (onEditDraft) และแบบไม่อนุมัติ (onEditActivity) */}
                    {activeMenu === 'จัดการกิจกรรม' && (
                        <OrganizerActivities
                            user={user}
                            onEditDraft={handleEditActivity}
                            onEditActivity={handleEditActivity}
                            onChat={handleOpenChat}
                            initialFilter={activitiesFilter}
                        />
                    )}

                    {/* เพิ่ม/แก้ไขกิจกรรม: บันทึกสำเร็จแล้วกลับไปหน้าจัดการกิจกรรม */}
                    {activeMenu === 'เพิ่มกิจกรรม' && (
                        <OrganizerAddActivity
                            user={user}
                            editingActivity={editingActivity}
                            onSuccess={() => {
                                setEditingActivity(null);
                                setActiveMenu('จัดการกิจกรรม');
                            }}
                        />
                    )}

                    {/* แชตกับผู้สมัคร (ไม่เลือกห้องแรกอัตโนมัติ) */}
                    {activeMenu === 'แชต' && (
                        <ChatView user={user} targetUser={chatTarget} autoSelectFirst={false} viewAs="organizer" />
                    )}

                    {/* ข้อมูลส่วนตัว */}
                    {activeMenu === 'ข้อมูลส่วนตัว' && (
                        <ProfileView user={user} onRoleChange={onRoleChange} />
                    )}
                </main>
            </div>
        </div>
    );
}