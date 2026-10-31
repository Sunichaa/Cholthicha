import React, { useState } from 'react';
import { Home, ClipboardList, Award, MessageSquare, User, LogOut } from 'lucide-react';
import './Sidebar.css';

/* =====================================================================
 *  เมนูด้านซ้ายของแดชบอร์ดผู้เข้าร่วมกิจกรรม
 *    activeMenu          เมนูที่เปิดอยู่ (ใช้ไฮไลต์ปุ่ม)
 *    setActiveMenu       เปลี่ยนเมนู
 *    isSidebarCollapsed  ย่อเมนูเหลือแค่ไอคอนหรือไม่
 *    onLogout            ออกจากระบบ (เรียกหลังผู้ใช้ยืนยันใน Modal)
 * ===================================================================== */
export default function Sidebar({ activeMenu, setActiveMenu, isSidebarCollapsed, onLogout }) {
    // เปิด Modal ยืนยันการออกจากระบบอยู่หรือไม่
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    return (
        <>
            <aside className={`app-side-navigation ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                {/* ปุ่มเมนูหลัก (ปุ่มที่ตรงกับ activeMenu จะมีคลาส active) */}
                <div className="sidebar-links-wrapper">
                    <button 
                        className={`side-nav-item ${activeMenu === 'หน้าแรก' ? 'active' : ''}`} 
                        onClick={() => setActiveMenu('หน้าแรก')}
                    >
                        <Home size={18} /> <span>หน้าแรก</span>
                    </button>
                    <button 
                        className={`side-nav-item ${activeMenu === 'กิจกรรมที่เข้าร่วม' ? 'active' : ''}`} 
                        onClick={() => setActiveMenu('กิจกรรมที่เข้าร่วม')}
                    >
                        <ClipboardList size={18} /> <span>กิจกรรมที่เข้าร่วม</span>
                    </button>
                    <button 
                        className={`side-nav-item ${activeMenu === 'ใบประกาศนียบัตร' ? 'active' : ''}`} 
                        onClick={() => setActiveMenu('ใบประกาศนียบัตร')}
                    >
                        <Award size={18} /> <span>ใบประกาศนียบัตร</span>
                    </button>
                    <button 
                        className={`side-nav-item ${activeMenu === 'แชต' ? 'active' : ''}`} 
                        onClick={() => setActiveMenu('แชต')}
                    >
                        <MessageSquare size={18} /> <span>แชต</span>
                    </button>
                    <button 
                        className={`side-nav-item ${activeMenu === 'ข้อมูลส่วนตัว' ? 'active' : ''}`} 
                        onClick={() => setActiveMenu('ข้อมูลส่วนตัว')}
                    >
                        <User size={18} /> <span>ข้อมูลส่วนตัว</span>
                    </button>
                </div>

                {/* ปุ่มออกจากระบบ */}
                <div className="sidebar-footer-section">
                    <button 
                        className="side-nav-item logout-action-btn" 
                        onClick={() => setShowConfirmModal(true)} // เปิด Modal ถามยืนยันก่อนออกจากระบบ
                    >
                        <LogOut size={18} /> <span>ออกจากระบบ</span>
                    </button>
                </div>
            </aside>

            {/* Modal ยืนยันการออกจากระบบ */}
            {showConfirmModal && (
                <div className="logout-modal-backdrop">
                    <div className="logout-modal-card">
                        <h3 className="logout-modal-title">ยืนยันการออกจากระบบ</h3>
                        <p className="logout-modal-text">คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?</p>
                        <div className="logout-modal-actions">
                            <button 
                                className="logout-btn-cancel" 
                                onClick={() => setShowConfirmModal(false)}
                            >
                                ยกเลิก
                            </button>
                            <button 
                                className="logout-btn-confirm" 
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    onLogout(); // ทำงานฟังก์ชัน logout จริงที่ส่งมาจาก App.jsx
                                }}
                            >
                                ยืนยัน
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}