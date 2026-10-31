import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal, RefreshCw } from 'lucide-react';
import HeroBanner from '../components/HeroBanner';
import ActivityCard from '../components/ActivityCard';
import RegisterPage from '../components/RegisterPage';
import Pagination from '../components/Pagination';
import usePagination from '../usePagination';
import { getActivities, getStats, getCategories } from '../api';
import './Home.css';

/* =====================================================================
 *  หน้าแรก (landing) สำหรับผู้ที่ยังไม่ได้ login
 *  แสดงสไลด์แบนเนอร์ + รายการกิจกรรมที่ยังเปิดรับสมัคร พร้อมตัวกรองประเภทกิจกรรม
 *    searchQuery  คำค้นหาจาก Navbar
 *    user         ผู้ใช้ที่ login อยู่ (ถ้ามี)
 *    onOpenAuth   เปิดหน้าเข้าสู่ระบบ/สมัครสมาชิก ('login' | 'register')
 * ===================================================================== */
export default function Home({ searchQuery, user, onOpenAuth }) {
  const [activities, setActivities] = useState([]);              // กิจกรรมที่แสดงบนหน้า (ผ่านตัวกรองแล้ว)
  const [stats, setStats] = useState(null);                      // สถิติภาพรวมของระบบ
  const [categories, setCategories] = useState(['ทั้งหมด']);     // ตัวเลือกประเภทกิจกรรมใน dropdown
  const [selectedCat, setSelectedCat] = useState('ทั้งหมด');     // ประเภทที่เลือกอยู่
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null); // กิจกรรมที่กดสมัคร (มีค่า = เปิดฟอร์มสมัคร)

  // ---------- ดึงกิจกรรม สถิติ และประเภทกิจกรรมพร้อมกัน ----------
  // เรียกใหม่ทุกครั้งที่เปลี่ยนประเภท คำค้นหา หรือผู้ใช้
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedCat !== 'ทั้งหมด') params.category = selectedCat;
      if (searchQuery) params.search = searchQuery;
      if (user?.Member_id) params.member_id = user.Member_id;

      const [acRes, statsRes, catRes] = await Promise.all([
        getActivities(params),
        getStats(),
        getCategories()
      ]);

      const rawActivities = acRes?.data?.data || acRes?.data || [];
      const rawStats = statsRes?.data?.data || statsRes?.data || null;
      const rawCategories = catRes?.data?.data || catRes?.data || [];

      // กรองกิจกรรมที่ไม่พร้อมเปิดรับสมัครออก
      if (Array.isArray(rawActivities)) {
        const currentDate = new Date();

        const activeActivities = rawActivities.filter(a => {
          // 1. เช็กสถานะกิจกรรม (รองรับทั้ง Activity_status และ Status)
          const status = a.Activity_status || a.Status || a.status;
          const isClosedStatus = status && ['ปิดรับสมัคร', 'Closed', 'Inactive', 'Cancelled', 'Full'].includes(status);
          if (isClosedStatus) return false;

          // 2. เช็กวันปิดรับสมัคร (ตั้งเวลาเป็น 23:59:59 น.)
          const rawEndDate = a.Registration_end || a.Reg_end_date || a.End_date || a.Application_deadline;
          if (rawEndDate) {
            const endDate = new Date(rawEndDate);
            endDate.setHours(23, 59, 59, 999);
            if (currentDate > endDate) return false;
          }

          // 3. เช็กว่ากิจกรรมเริ่มจัดไปแล้วหรือยัง
          const rawStartDate = a.Activity_start || a.Start_date || a.Activity_date;
          if (rawStartDate) {
            const startDate = new Date(rawStartDate);
            startDate.setHours(0, 0, 0, 0);
            if (currentDate >= startDate) return false;
          }

          // 4. เช็กจำนวนผู้สมัครเต็มหรือยัง
          const maxCapacity = Number(a.Capacity || a.Max_participants || 0);
          const currentCount = Number(a.registered_count || a.Current_participants || 0);
          if (maxCapacity > 0 && currentCount >= maxCapacity) {
            return false;
          }

          return true; // แสดงเฉพาะกิจกรรมที่ผ่านทุกเงื่อนไข
        });

        // เรียงกิจกรรมที่ใกล้ปิดรับสมัครขึ้นก่อน (ไม่มีวันปิดรับสมัครไปอยู่ท้ายสุด)
        const getEndDate = (a) => {
          const rawEndDate = a.Registration_end || a.Reg_end_date || a.End_date || a.Application_deadline;
          return rawEndDate ? new Date(rawEndDate).getTime() : Infinity;
        };
        activeActivities.sort((a, b) => getEndDate(a) - getEndDate(b));

        setActivities(activeActivities);
      } else {
        setActivities([]);
      }

      setStats(rawStats);

      // รวมรายชื่อประเภทกิจกรรม ("ทั้งหมด" อยู่หน้าสุดเสมอ และตัดชื่อซ้ำออก)
      let processedCats = ['ทั้งหมด'];
      if (Array.isArray(rawCategories)) {
        rawCategories.forEach(c => {
          if (typeof c === 'string' && c !== 'ทั้งหมด') processedCats.push(c);
          else if (c && typeof c === 'object' && c.Category_name) processedCats.push(c.Category_name);
        });
      }
      setCategories([...new Set(processedCats)]);

    } catch (err) {
      console.error(err);
      setError('ไม่สามารถเชื่อมต่อ Backend ได้ — ตรวจสอบว่า server รันที่ port 5000 แล้วหรือยัง');
    } finally {
      setLoading(false);
    }
  }, [selectedCat, searchQuery, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // เมื่อกดสมัครจากการ์ด: ถ้ายังไม่ login → เปิด login modal, ถ้า login แล้ว → เปิด RegisterPage
  const handleRegister = (activity) => {
    if (!user) {
      onOpenAuth('login');
    } else {
      setSelectedActivity(activity);
    }
  };

  // แบ่งหน้าละ 9 การ์ด — เปลี่ยนคำค้นหา/ประเภทแล้วกลับไปหน้า 1
  const { page, setPage, totalPages, pageItems } = usePagination(activities, 9, `${searchQuery}|${selectedCat}`);

  return (
    <div className="home">
      {/* สไลด์แบนเนอร์ด้านบน */}
      <HeroBanner stats={stats} />

      <div className="main-content">
        {/* หัวข้อส่วนกิจกรรม + dropdown เลือกประเภท */}
        <div className="section-header">
          <div>
            <h2 className="section-title">กิจกรรมจิตอาสา</h2>
            <p className="section-sub">เลือกกิจกรรมที่ตรงกับความสนใจของคุณ</p>
          </div>
          <div className="filter-row-dropdown">
            <SlidersHorizontal size={16} className="filter-icon" style={{ color: '#718096' }} />
            <select
              className="category-dropdown-select"
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* สรุปผลการค้นหา (แสดงเมื่อมีคำค้นหา) */}
        {searchQuery && (
          <div className="search-info">
            ผลการค้นหา "<strong>{searchQuery}</strong>" — พบ {activities.length} กิจกรรม
          </div>
        )}

        {/* โหลดข้อมูลไม่สำเร็จ + ปุ่มลองใหม่ */}
        {error && (
          <div className="error-box">
            <p>{error}</p>
            <button onClick={fetchData} className="retry-btn"><RefreshCw size={14} /> ลองใหม่</button>
          </div>
        )}

        {/* กำลังโหลด -> การ์ดโครงร่าง 6 ใบ, โหลดเสร็จ -> การ์ดกิจกรรม หรือข้อความไม่พบกิจกรรม */}
        {loading ? (
          <div className="cards-grid">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="card-skeleton" />)}
          </div>
        ) : !error && (
          activities.length === 0
            ? <div className="empty-state"><p>ไม่พบกิจกรรมที่ตรงกับการค้นหา</p></div>
            : <>
            <div className="cards-grid">
              {pageItems.map(a => (
                <ActivityCard
                  key={a.Activity_id || a.id}
                  activity={a}
                  onRegister={handleRegister}
                  isLoggedIn={!!user}
                />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
        )}
      </div>

      {/* ฟอร์มสมัครเข้าร่วมกิจกรรม — สมัครสำเร็จแล้วโหลดรายการใหม่ */}
      {selectedActivity && (
        <RegisterPage
          activity={selectedActivity}
          user={user}
          onClose={() => setSelectedActivity(null)}
          onSuccess={() => { fetchData(); setSelectedActivity(null); }}
        />
      )}
    </div>
  );
}