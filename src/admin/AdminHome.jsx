import { useEffect, useState } from 'react';
import { FileText, Megaphone, CalendarX, Users, Clock } from 'lucide-react';
import { BarChart, DonutChart } from './HomeCharts';
import './AdminDashboard.css';

/* =====================================================================
 *  หน้าแรกของแอดมิน: แดชบอร์ดสรุปข้อมูลกิจกรรมทั้งระบบ
 *  - การ์ดสถิติ 4 ใบ (กดแล้วไปหน้าจัดการกิจกรรมพร้อมกรองตามหมวดนั้น)
 *  - กราฟแท่งจำนวนผู้สมัคร (เลือกช่วงเวลา: 6 เดือนล่าสุด / สัปดาห์ / เดือน / ครึ่งปี / ปี)
 *  - กราฟโดนัทสัดส่วนผู้มาเข้าร่วมจริง (ทุกกิจกรรม หรือเลือกกิจกรรมเดียว)
 *    onSelectFilter  เรียกพร้อมตัวกรอง ('all' | 'pending' | 'open' | 'closed') เมื่อกดการ์ดสถิติ
 * ===================================================================== */

const MONTH_NAMES = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export default function AdminHome({ onSelectFilter }) {
    const [stats, setStats]     = useState(null);   // { total, open, closed, pending }
    const [monthly, setMonthly] = useState([]);     // ข้อมูลกราฟแท่ง [{ label, count }]
    const [attend, setAttend]   = useState({ passed: 0, notPassed: 0, unmarked: 0 }); // ข้อมูลกราฟโดนัท
    const [activities, setActivities] = useState([]);   // รายการกิจกรรมสำหรับ dropdown เลือกดูสัดส่วนรายกิจกรรม
    const [activityId, setActivityId] = useState('');    // '' = ทุกกิจกรรม
    const [loading, setLoading] = useState(true);

    // ตัวกรองช่วงเวลาของกราฟ
    // mode: recent = 6 เดือนล่าสุด | week = รายสัปดาห์ | month = รายเดือน (แสดงรายวัน) |
    //       half = รายครึ่งปี | year = รายปี (แสดงรายเดือน)
    const [mode, setMode] = useState('recent');
    const [years, setYears] = useState([]);       // ปีที่มีข้อมูลการสมัคร (ตัวเลือกใน dropdown ปี)
    const [year, setYear] = useState('');
    const [month, setMonth] = useState('');
    const [half, setHalf] = useState('1');        // '1' = ครึ่งปีแรก, '2' = ครึ่งปีหลัง
    const todayStr = new Date().toISOString().slice(0, 10);
    const [weekDate, setWeekDate] = useState(todayStr); // วันที่ใดก็ได้ในสัปดาห์ที่ต้องการดู

    // ดึงรายการปีที่มีข้อมูลการสมัคร
    useEffect(() => {
        fetch('http://localhost:5000/api/admin/registration-years')
            .then(r => r.json())
            .then(res => setYears(res.data || []))
            .catch(() => {});
    }, []);

    // ดึงรายการกิจกรรมที่อนุมัติแล้ว (สำหรับ dropdown เลือกกิจกรรมของกราฟโดนัท)
    useEffect(() => {
        fetch('http://localhost:5000/api/admin/activities')
            .then(r => r.json())
            .then(res => setActivities((res.data || [])
                .filter(a => a.Approval_status === 'Approved' && !a.Activity_suspend_status) // ไม่รวมกิจกรรมที่ถูกยกเลิก
                .map(a => ({ id: a.Activity_id, label: a.Activity_name }))))
            .catch(() => {});
    }, []);

    // ดึงสถิติ กราฟแท่ง และกราฟโดนัทใหม่ทุกครั้งที่ตัวกรองเปลี่ยน
    // สร้าง query ตาม mode: ?date / ?year&month / ?year&half / ?year (recent = ไม่ส่ง)
    useEffect(() => {
        const qs = new URLSearchParams();
        if (mode === 'week' && weekDate) qs.set('date', weekDate);
        if (mode === 'month' && year && month) { qs.set('year', year); qs.set('month', month); }
        if (mode === 'half' && year) { qs.set('year', year); qs.set('half', half); }
        if (mode === 'year' && year) qs.set('year', year);
        const q = qs.toString() ? `?${qs}` : '';
        const qa = new URLSearchParams(qs);
        if (activityId) qa.set('activity_id', activityId);
        const attendQ = qa.toString() ? `?${qa}` : '';

        // ไม่ setLoading(true) ซ้ำตอนเปลี่ยนตัวกรอง — loading ใช้แค่ตอนโหลดครั้งแรก
        // ไม่งั้นหน้าจะกลายเป็น "กำลังโหลด" และตัวกรองจะหายไปทุกครั้งที่เปลี่ยนค่า
        Promise.all([
            fetch('http://localhost:5000/api/admin/stats').then(r=>r.json()),
            fetch(`http://localhost:5000/api/admin/monthly-registrations${q}`).then(r=>r.json()),
            fetch(`http://localhost:5000/api/admin/attendance${attendQ}`).then(r=>r.json()),
        ]).then(([s, m, a]) => {
            setStats(s.data);
            setMonthly(m.data || []);
            setAttend({ passed: 0, notPassed: 0, unmarked: 0, ...(a.data || {}) });
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [mode, year, month, half, weekDate, activityId]);

    // เปลี่ยนรูปแบบช่วงเวลา — ตั้งค่าเริ่มต้นให้ปี/เดือนที่ต้องใช้ (ปีล่าสุดที่มีข้อมูล, เดือนปัจจุบัน)
    const handleModeChange = (e) => {
        const m = e.target.value;
        setMode(m);
        if (m !== 'recent' && m !== 'week' && !year && years.length) setYear(String(years[0]));
        if (m === 'month' && !month) setMonth(String(new Date().getMonth() + 1));
    };

    // ข้อความบอกช่วงเวลาต่อท้ายหัวข้อกราฟแท่ง
    const periodLabel = mode === 'week' ? `(รายสัปดาห์ — สัปดาห์ของวันที่ ${weekDate})`
        : mode === 'month' && year && month ? `(รายวัน — ${MONTH_NAMES[month - 1]} ${year})`
        : mode === 'half' && year ? `(รายครึ่งปี — ${half === '1' ? 'ครึ่งปีแรก' : 'ครึ่งปีหลัง'} ${year})`
        : mode === 'year' && year ? `(รายเดือน — ปี ${year})`
        : '(รายเดือน — 6 เดือนล่าสุด)';

    if (loading) return <div style={{ color:'#94a3b8',padding:'40px',textAlign:'center' }}>กำลังโหลด...</div>;

    const selectedName = activities.find(a => String(a.id) === String(activityId))?.label;

    return (
        <div className="hc-page">
            <div style={{ flexShrink: 0 }}>
                <h2 className="section-title">แดชบอร์ดสรุปข้อมูลกิจกรรม</h2>
                <p className="section-sub">ภาพรวมการดำเนินงานกิจกรรมจิตอาสาทั้งหมดของคุณ</p>
            </div>

            {/* การ์ดสถิติ — กดเพื่อไปหน้า "จัดการกิจกรรม" พร้อมกรองตามหมวดที่กด */}
            <div className="stat-grid">
                {[
                    { label: 'ประกาศทั้งหมด',      val: stats?.total || 0,   icon: <FileText size={24} color="#fff"/>,   bg: '#3b82f6', filter: 'all' },
                    { label: 'กิจกรรมที่รอดำเนินการ', val: stats?.pending || 0, icon: <Clock size={24} color="#fff"/>,      bg: '#f59e0b', filter: 'pending' },
                    { label: 'กำลังเปิดรับสมัคร',   val: stats?.open || 0,    icon: <Megaphone size={24} color="#fff"/>,  bg: '#22c55e', filter: 'open' },
                    { label: 'ปิดรับสมัครแล้ว',     val: stats?.closed || 0,  icon: <CalendarX size={24} color="#fff"/>, bg: '#ef4444', filter: 'closed' },
                ].map((s, i) => (
                    <button
                        key={i}
                        type="button"
                        className={`stat-card${onSelectFilter ? ' clickable' : ''}`}
                        onClick={() => onSelectFilter?.(s.filter)}
                    >
                        <div className="stat-icon-box" style={{ background: s.bg }}>{s.icon}</div>
                        <div>
                            <div className="stat-num">{s.val}</div>
                            <div className="stat-label">{s.label}</div>
                        </div>
                    </button>
                ))}
            </div>

            <div className="charts-row">
                {/* กราฟแท่ง: จำนวนผู้สมัคร + ตัวกรองช่วงเวลา */}
                <div className="chart-card hc-bar-card">
                    <div className="hc-card-head">
                        <h4>
                            <Users size={16} color="#3b82f6" /> จำนวนผู้สมัครเข้าร่วมทั้งหมด
                            {' '}
                            {periodLabel}
                        </h4>
                        {/* ตัวกรองช่วงเวลา — เลือกรูปแบบก่อน (6 เดือนล่าสุด/สัปดาห์/เดือน/ครึ่งปี/ปี)
                            แล้วช่องที่เกี่ยวข้อง (วันที่/ปี/เดือน/ครึ่งปี) จะโผล่ต่อท้าย */}
                        <div className="hc-head-tools">
                            <select className="hc-select" value={mode} onChange={handleModeChange}>
                                <option value="recent">6 เดือนล่าสุด</option>
                                <option value="week">รายสัปดาห์</option>
                                <option value="month">รายเดือน</option>
                                <option value="half">รายครึ่งปี</option>
                                <option value="year">รายปี</option>
                            </select>
                            {mode === 'week' && (
                                <input className="hc-select" type="date" value={weekDate}
                                    onChange={(e) => e.target.value && setWeekDate(e.target.value)} />
                            )}
                            {(mode === 'month' || mode === 'half' || mode === 'year') && (
                                <select className="hc-select" value={year} onChange={(e) => setYear(e.target.value)}>
                                    {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
                                </select>
                            )}
                            {mode === 'month' && (
                                <select className="hc-select" value={month} onChange={(e) => setMonth(e.target.value)}>
                                    {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                            )}
                            {mode === 'half' && (
                                <select className="hc-select" value={half} onChange={(e) => setHalf(e.target.value)}>
                                    <option value="1">ครึ่งปีแรก (ม.ค.–มิ.ย.)</option>
                                    <option value="2">ครึ่งปีหลัง (ก.ค.–ธ.ค.)</option>
                                </select>
                            )}
                        </div>
                    </div>
                    {monthly.length > 0
                        ? <BarChart data={monthly} color="#3b82f6" />
                        : <p style={{ color:'#94a3b8',fontSize:'14px' }}>ไม่มีข้อมูล</p>}
                </div>
                {/* กราฟโดนัท: สัดส่วนผ่าน / ไม่ผ่าน / ยังไม่เช็กชื่อ */}
                <div className="chart-card hc-donut-card">
                    <div className="hc-card-head">
                        <h4><Users size={16} color="#22c55e" /> สัดส่วนผู้มาเข้าร่วมกิจกรรมจริง{selectedName ? '' : ' (ทุกกิจกรรม)'}</h4>
                        {/* เลือกดูสัดส่วนของกิจกรรมเดียว */}
                        <select className="hc-select" value={activityId} onChange={(e) => setActivityId(e.target.value)} title={selectedName || ''}>
                            <option value="">ทุกกิจกรรม</option>
                            {activities.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                    </div>
                    <DonutChart passed={attend.passed} notPassed={attend.notPassed} unmarked={attend.unmarked} />
                </div>
            </div>
        </div>
    );
}
