import { useState, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import RegisterPage from '../components/RegisterPage';
import ActivityDetail from '../components/ActivityDetail.jsx';
import ActivityDetailModal from '../components/ActivityDetailModal';
import ActivityCardInfo from '../components/ActivityCardInfo';
import Pagination from '../components/Pagination';
import usePagination from '../usePagination';
import NavbarUser from './NavbarUser';
import Sidebar from './Sidebar';
import HeroBanner from '../components/HeroBanner';
import JoinedActivities from './JoinedActivities';
import CertificateView from './CertificateView';
import ChatView from '../components/ChatView';
import ProfileView from '../components/ProfileView';
import './UserDashboard.css';

/* =====================================================================
 *  แดชบอร์ดของผู้เข้าร่วมกิจกรรม (volunteer) — หน้าหลักหลัง login
 *  โครงหน้า: NavbarUser ด้านบน + Sidebar ด้านซ้าย + เนื้อหาตามเมนูที่เลือก
 *  เมนู: หน้าแรก / กิจกรรมที่เข้าร่วม / ใบประกาศนียบัตร / แชต / ข้อมูลส่วนตัว
 *    user          ผู้ใช้ที่ login อยู่
 *    onLogout      ออกจากระบบ
 *    onRoleChange  สลับบทบาท (ส่งต่อให้หน้าโปรไฟล์)
 * ===================================================================== */

// สีป้ายตามประเภทกิจกรรม (ประเภทอื่นใช้สีเทา)
const CAT_COLORS = {
    'สิ่งแวดล้อม': '#0284c7',
    'การศึกษา': '#7c3aed',
    'ชุมชน': '#d97706',
    'สังคม': '#ea580c',
    'สุขภาพ': '#dc2626',
};

// รูปสำรองตามประเภทกิจกรรม ใช้เมื่อกิจกรรมไม่มีรูปหรือโหลดรูปไม่ขึ้น
const FALLBACK_IMAGES = {
    'สิ่งแวดล้อม': 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&q=80',
    'การศึกษา': 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&q=80',
    'สุขภาพ': 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=600&q=80',
    'default': 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&q=80',
};

export default function UserDashboard({ user, onLogout, onRoleChange }) {
    const [activities, setActivities] = useState([]);                    // กิจกรรมทั้งหมดที่ดึงมา (ก่อนกรอง)
    const [searchQuery, setSearchQuery] = useState('');                  // คำค้นหาในหน้าแรก
    const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด'); // ประเภทที่เลือกใน dropdown
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeMenu, setActiveMenu] = useState('หน้าแรก');             // เมนูที่เปิดอยู่
    const [selectedActivity, setSelectedActivity] = useState(null);      // กิจกรรมที่กดสมัคร (มีค่า = เปิดฟอร์มสมัคร)
    const [detailActivity, setDetailActivity] = useState(null);          // กิจกรรมที่ดูรายละเอียด (มีค่า = เปิด modal)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);         // เปิด dropdown ประเภทอยู่หรือไม่
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // ย่อ Sidebar อยู่หรือไม่
    const [selectedChatUser, setSelectedChatUser] = useState(null);      // ห้องแชตที่จะเปิดทันทีเมื่อเข้าหน้าแชต
    const [certTarget, setCertTarget] = useState(null);                  // ใบประกาศที่จะเปิดทันทีเมื่อเข้าหน้าใบประกาศ

    // ตัวเลือกประเภทกิจกรรมใน dropdown
    const categories = ['ทั้งหมด', 'สิ่งแวดล้อม', 'การศึกษา', 'ชุมชน', 'สังคม', 'สุขภาพ'];

    // กด "ติดต่อผู้จัด" จากหน้ากิจกรรมที่เข้าร่วม -> เก็บข้อมูลห้องแชต แล้วสลับไปหน้าแชต
    const handleContactOrganizer = (organizerData) => {
        setSelectedChatUser(organizerData);
        setActiveMenu('แชต');
    };

    // กดดาวน์โหลดใบประกาศจากหน้ากิจกรรมที่เข้าร่วม -> พาไปหน้าใบประกาศพร้อมเปิด preview/บันทึกให้เลย
    const handleDownloadCertificate = (item) => {
        setCertTarget(item);
        setActiveMenu('ใบประกาศนียบัตร');
    };

    // ดึงรายการกิจกรรม (ส่งคำค้นหาและ member_id ไปด้วย เพื่อให้รู้ว่ากิจกรรมไหนสมัครแล้ว)
    const fetchActivitiesData = () => {
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams();
        if (searchQuery) qs.set('search', searchQuery);
        if (user?.Member_id) qs.set('member_id', user.Member_id);
        const url = `http://localhost:5000/api/activities${qs.toString() ? `?${qs.toString()}` : ''}`;

        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลกิจกรรมได้');
                return res.json();
            })
            .then(responseData => {
                const data = responseData.data || responseData;
                setActivities(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    };

    // โหลดใหม่ทุกครั้งที่คำค้นหาหรือผู้ใช้เปลี่ยน
    useEffect(() => { fetchActivitiesData(); }, [searchQuery, user]);

    // กรองให้เหลือเฉพาะกิจกรรมที่ยังเปิดรับสมัครได้จริง และตรงกับประเภทที่เลือก
    const filteredActivities = activities.filter(a => {
        const currentDate = new Date();
        const approval = a.Approval_status || '';
        const status = a.Activity_status || a.Status || a.status || '';

        // 1. เช็กสถานะทั่วไป (แบบร่าง / รออนุมัติ / ไม่อนุมัติ / ปิดรับสมัคร / Cancelled)
        const isDraft = status === 'Draft' || status === 'ร่าง' || status === 'แบบร่าง';
        const isPending = approval === 'Pending' || status === 'Pending' || status === 'รออนุมัติ' || status === 'รอการอนุมัติ';
        const isRejected = approval === 'Rejected' || status === 'Rejected' || status === 'ไม่อนุมัติ';
        const isClosedStatus = ['ปิดรับสมัคร', 'Closed', 'Inactive', 'Cancelled', 'Full'].includes(status);

        if (isDraft || isPending || isRejected || isClosedStatus) {
            return false;
        }

        // 2. เช็กวันปิดรับสมัคร (ถ้าเลยวันปิดสมัครแล้ว ให้ซ่อน)
        const rawEndDate = a.Registration_end || a.Reg_end_date || a.End_date || a.Application_deadline;
        if (rawEndDate) {
            const endDate = new Date(rawEndDate);
            endDate.setHours(23, 59, 59, 999);
            if (currentDate > endDate) return false;
        }

        // 3. เช็กวันเริ่มกิจกรรม (ถ้าเลยวันเริ่มจัดกิจกรรมไปแล้ว ให้ซ่อน)
        const rawStartDate = a.Activity_start || a.Start_date || a.Activity_date;
        if (rawStartDate) {
            const startDate = new Date(rawStartDate);
            startDate.setHours(0, 0, 0, 0);
            if (currentDate >= startDate) return false;
        }

        // 4. เช็กจำนวนผู้สมัครเต็ม
        const capacity = Number(a.Capacity || a.Max_participants || 0);
        const registered = Number(a.registered_count || a.Current_participants || 0);
        if (capacity > 0 && registered >= capacity) {
            return false;
        }

        // 5. เช็กหมวดหมู่ตาม Dropdown
        if (selectedCategory !== 'ทั้งหมด') {
            const cat = a.Category_name || a.Category;
            if (cat !== selectedCategory) return false;
        }

        return true;
    });

    // เรียงกิจกรรมที่ใกล้ปิดรับสมัครขึ้นก่อน (ไม่มีวันปิดรับสมัครไปอยู่ท้ายสุด)
    filteredActivities.sort((a, b) => {
        const getEndDate = (x) => {
            const rawEndDate = x.Registration_end || x.Reg_end_date || x.End_date || x.Application_deadline;
            return rawEndDate ? new Date(rawEndDate).getTime() : Infinity;
        };
        return getEndDate(a) - getEndDate(b);
    });

    // แบ่งหน้าละ 9 การ์ด — เปลี่ยนคำค้นหา/ประเภทแล้วกลับไปหน้า 1
    const { page, setPage, totalPages, pageItems } = usePagination(filteredActivities, 9, `${searchQuery}|${selectedCategory}`);

    return (
        <div className="dashboard-layout-container">
            <NavbarUser
                user={user}
                isSidebarCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
            />

            <div className="app-body-wrapper">
                <Sidebar
                    activeMenu={activeMenu}
                    setActiveMenu={setActiveMenu}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onLogout={onLogout}
                />

                <main className="app-main-content-area">

                    {/* ===== เมนู "หน้าแรก": ค้นหา + สไลด์ + การ์ดกิจกรรมที่เปิดรับสมัคร ===== */}
                    {activeMenu === 'หน้าแรก' && (
                        <>
                            {/* ข้อความต้อนรับ + ช่องค้นหา */}
                            <div className="welcome-banner-section">
                                <h2 className="welcome-title">ยินดีต้อนรับเข้าสู่การเข้าร่วมกิจกรรมจิตอาสา</h2>
                                <div className="search-box-panel-card">
                                    <h3 className="search-panel-label">ค้นหากิจกรรม</h3>
                                    <div className="search-bar-input-group">
                                        <Search size={18} className="search-inner-icon" />
                                        <input
                                            type="text"
                                            placeholder="ค้นหาชื่อกิจกรรม หรือ สถานที่"
                                            className="search-inner-input"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* สไลด์แบนเนอร์ (ซ่อนระหว่างค้นหา) */}
                            {!searchQuery && (
                                <div style={{ marginBottom: '24px' }}>
                                    <HeroBanner />
                                </div>
                            )}

                            <div className="activities-list-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
                                <div className="left-title-column">
                                    <h3 className="section-main-title">กิจกรรมจิตอาสา</h3>
                                    <p className="section-sub-title">เลือกกิจกรรมที่ตรงกับความสนใจของคุณ</p>
                                </div>

                                {/* dropdown เลือกประเภทกิจกรรม */}
                                <div className="category-dropdown-container" style={{ position: 'relative' }}>
                                    <button
                                        type="button"
                                        className="dropdown-toggle-button"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: '#e2f0e5', color: '#1e4620', border: 'none', borderRadius: '20px', fontWeight: '500', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                        <span>{selectedCategory}</span>
                                        <ChevronDown size={14} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                    </button>

                                    {isDropdownOpen && (
                                        <ul className="dropdown-menu-list" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#ffffff', listStyle: 'none', padding: '6px 0', margin: 0, border: '1px solid #e2e8f0', borderRadius: '12px', width: '160px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 999 }}>
                                            {categories.map((cat) => (
                                                <li key={cat} style={{ width: '100%' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSelectedCategory(cat); setIsDropdownOpen(false); }}
                                                        style={{ width: '100%', padding: '10px 16px', border: 'none', background: cat === selectedCategory ? '#e2f0e5' : 'none', color: cat === selectedCategory ? '#1e4620' : '#475569', textAlign: 'left', cursor: 'pointer', fontSize: '13px', fontWeight: cat === selectedCategory ? '600' : 'normal' }}
                                                    >
                                                        {cat}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* รายการการ์ดกิจกรรม (หรือข้อความกำลังโหลด / ผิดพลาด / ไม่พบกิจกรรม) */}
                            {loading ? (
                                <div className="center-status-msg">กำลังดึงข้อมูลกิจกรรมจิตอาสา...</div>
                            ) : error ? (
                                <div className="center-status-msg text-error">{error}</div>
                            ) : filteredActivities.length === 0 ? (
                                <div className="center-status-msg">ไม่พบกิจกรรมที่เปิดรับสมัครในขณะนี้</div>
                            ) : (<>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                                    {pageItems.map(a => {
                                        const capacity = a.Capacity || 0;
                                        const registered = parseInt(a.registered_count) || 0;
                                        const pct = capacity > 0 ? (registered / capacity) * 100 : 0;
                                        const cat = a.Category_name || a.Category || 'ทั่วไป';
                                        const badgeColor = CAT_COLORS[cat] || '#475569';
                                        const img = a.Image || FALLBACK_IMAGES[cat] || FALLBACK_IMAGES['default'];

                                        return (
                                            <div key={a.Activity_id} style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', border: '1px solid #f1f5f9' }}>
                                                {/* รูป + ป้าย "เปิดรับสมัคร" + ป้ายประเภท */}
                                                <div style={{ position: 'relative', height: '200px' }}>
                                                    <span style={{ position: 'absolute', top: '12px', left: '12px', background: '#f59e0b', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', zIndex: 2 }}>เปิดรับสมัคร</span>
                                                    <img src={img} alt={a.Activity_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = FALLBACK_IMAGES['default']; }} />
                                                    <span style={{ position: 'absolute', bottom: '12px', left: '12px', background: badgeColor, color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', zIndex: 2 }}>● {cat}</span>
                                                </div>

                                                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{a.Activity_name}</h4>
                                                    <ActivityCardInfo activity={a} />

                                                    {/* แถบจำนวนผู้สมัคร (แดงเมื่อเต็ม) */}
                                                    <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                                                        <div style={{ background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                                                            <div style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? '#ef4444' : '#22c55e', height: '100%' }} />
                                                        </div>
                                                        <span style={{ fontSize: '12px', fontWeight: '600', color: pct >= 100 ? '#ef4444' : '#22c55e' }}>{registered}/{capacity} คน</span>
                                                    </div>

                                                    {/* ปุ่มรายละเอียด + ปุ่มสมัคร (ปิดไว้ถ้าเป็นกิจกรรมของตัวเอง / สมัครแล้ว / เต็ม) */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                                                        <button type="button" onClick={() => setDetailActivity(a)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>รายละเอียด</button>
                                                        {(() => {
                                                            // ผู้จัดกิจกรรมห้ามสมัครเข้าร่วมกิจกรรมของตัวเอง (เผื่อสลับ role มาเป็นอาสาสมัคร)
                                                            const isOwnActivity = user?.Member_id && a.Member_id && String(user.Member_id) === String(a.Member_id);
                                                            const isRegistered = Number(a.Is_registered) > 0;
                                                            const isDisabled = pct >= 100 || isOwnActivity || isRegistered;
                                                            const label = isOwnActivity ? 'กิจกรรมของคุณ' : isRegistered ? 'สมัครแล้ว' : pct >= 100 ? 'เต็มแล้ว' : 'สมัครกิจกรรม';
                                                            return (
                                                                <button type="button" onClick={() => setSelectedActivity(a)} disabled={isDisabled} style={{ background: isDisabled ? '#e2e8f0' : '#0252a1', color: isDisabled ? '#94a3b8' : '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '600', cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                                                                    {label}
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                            </>)}
                        </>
                    )}

                    {/* ===== เมนู "กิจกรรมที่เข้าร่วม" ===== */}
                    {activeMenu === 'กิจกรรมที่เข้าร่วม' && (
                        <JoinedActivities
                            user={user}
                            onNavigate={setActiveMenu}
                            onContactOrganizer={handleContactOrganizer}
                            onDownloadCertificate={handleDownloadCertificate}
                        />
                    )}

                    {/* ===== เมนู "ใบประกาศนียบัตร" (certTarget = ใบที่จะเปิดให้ทันที) ===== */}
                    {activeMenu === 'ใบประกาศนียบัตร' && (
                        <CertificateView
                            user={user}
                            targetActivity={certTarget}
                            onConsumeTarget={() => setCertTarget(null)}
                        />
                    )}

                    {/* ===== เมนู "แชต" (selectedChatUser = ห้องที่จะเปิดให้ทันที) ===== */}
                    {activeMenu === 'แชต' && (
                        <ChatView
                            user={user}
                            targetUser={selectedChatUser}
                            viewAs="volunteer"
                        />
                    )}

                    {/* ===== เมนู "ข้อมูลส่วนตัว" ===== */}
                    {activeMenu === 'ข้อมูลส่วนตัว' && <ProfileView user={user} onRoleChange={onRoleChange} />}
                </main>
            </div>

            {/* ฟอร์มสมัครเข้าร่วมกิจกรรม — สมัครสำเร็จแล้วโหลดรายการใหม่ */}
            {selectedActivity && (
                <RegisterPage
                    activity={selectedActivity}
                    user={user}
                    onClose={() => setSelectedActivity(null)}
                    onSuccess={() => { fetchActivitiesData(); setSelectedActivity(null); }}
                />
            )}

            {/* Modal รายละเอียดกิจกรรม — ท้าย modal มีปุ่มปิด และปุ่มสมัคร (หรือ "กิจกรรมของคุณ" / "สมัครแล้ว") */}
            {detailActivity && (
                <ActivityDetailModal
                    activity={detailActivity}
                    organizerName={(detailActivity.Organizer_first_name || detailActivity.Organizer_last_name)
                        ? `${detailActivity.Organizer_first_name || ''} ${detailActivity.Organizer_last_name || ''}`.trim()
                        : null}
                    onClose={() => setDetailActivity(null)}
                    footer={
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button onClick={() => setDetailActivity(null)} style={{ padding: '11px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>ปิด</button>
                            {user?.Member_id && detailActivity.Member_id && String(user.Member_id) === String(detailActivity.Member_id) ? (
                                <button disabled style={{ padding: '11px', background: '#e2e8f0', color: '#94a3b8', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'not-allowed', fontFamily: 'inherit' }}>กิจกรรมของคุณ</button>
                            ) : Number(detailActivity.Is_registered) > 0 ? (
                                <button disabled style={{ padding: '11px', background: '#e2e8f0', color: '#94a3b8', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'not-allowed', fontFamily: 'inherit' }}>สมัครแล้ว</button>
                            ) : (
                                <button onClick={() => { setDetailActivity(null); setSelectedActivity(detailActivity); }} style={{ padding: '11px', background: '#0252a1', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>สมัครกิจกรรมนี้</button>
                            )}
                        </div>
                    }
                />
            )}
        </div>
    );
}