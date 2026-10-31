import { useEffect, useState } from 'react';
import { FileText, Megaphone, CalendarX, Users, Calendar } from 'lucide-react';
import { BarChart, DonutChart } from '../admin/HomeCharts';
import '../admin/AdminDashboard.css';

/* =====================================================================
 *  หน้าแรกของผู้จัดกิจกรรม: แดชบอร์ดสรุปข้อมูลกิจกรรมของตัวเอง
 *  - การ์ดสถิติ 3 ใบ (กดแล้วไปหน้าจัดการกิจกรรมพร้อมกรองตามหมวดนั้น)
 *  - กราฟแท่งเปรียบเทียบจำนวนผู้สมัครแต่ละกิจกรรม (กรองตามปี/เดือน)
 *  - กราฟโดนัทสัดส่วนผู้มาเข้าร่วมจริง (ทุกกิจกรรม หรือเลือกกิจกรรมเดียว)
 *    user            ผู้ใช้ที่ login อยู่
 *    onSelectFilter  เรียกพร้อมตัวกรอง ('all' | 'open' | 'closed') เมื่อกดการ์ดสถิติ
 * ===================================================================== */

const MONTH_NAMES = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export default function OrganizerHome({ user, onSelectFilter }) {
    const [stats, setStats]       = useState(null);            // { total, open, closed }
    const [activityData, setActivityData] = useState([]);      // ข้อมูลกราฟแท่ง
    const [attend, setAttend]     = useState({ passed: 0, notPassed: 0, unmarked: 0 }); // ข้อมูลกราฟโดนัท
    const [loading, setLoading]   = useState(true);

    // ตัวกรองช่วงเวลาของกราฟ — ไม่เลือกปี = ทุกกิจกรรม, เลือกปี = ทั้งปี, เลือกปี+เดือน = เดือนเดียว
    // (ตัวเลือกปีดึงจากปีที่มีกิจกรรมจริง)
    const [years, setYears] = useState([]);
    const [year, setYear] = useState('');
    const [month, setMonth] = useState('');
    // ดูสัดส่วนมา/ไม่มาเฉพาะกิจกรรมเดียว ('' = ทุกกิจกรรมตามช่วงเวลาที่กรอง)
    const [activityId, setActivityId] = useState('');

    // ดึงรายการปีที่มีกิจกรรม (สำหรับ dropdown ปี)
    useEffect(() => {
        if (!user?.Member_id) return;
        fetch(`http://localhost:5000/api/organizer/activity-years/${user.Member_id}`)
            .then(r => r.json())
            .then(res => setYears(res.data || []))
            .catch(() => {});
    }, [user]);

    // สร้าง query ช่วงเวลา: ?month=YYYY-MM หรือ ?year=YYYY (ไม่เลือกปี = ไม่ส่ง)
    const periodQuery = () => {
        const qs = new URLSearchParams();
        if (year && month) qs.set('month', `${year}-${String(month).padStart(2, '0')}`);
        else if (year) qs.set('year', year);
        return qs;
    };

    // สถิติ + กราฟแท่ง (ขึ้นกับช่วงเวลาเท่านั้น) — ไม่ setLoading(true) ซ้ำตอนเปลี่ยนตัวกรอง
    // กันตัวกรองปี/เดือนหายไปทุกครั้งที่เปลี่ยนค่า
    useEffect(() => {
        if (!user?.Member_id) return;
        const q = periodQuery().toString();
        Promise.all([
            fetch(`http://localhost:5000/api/organizer/stats/${user.Member_id}`).then(r => r.json()),
            fetch(`http://localhost:5000/api/organizer/monthly-activities/${user.Member_id}${q ? `?${q}` : ''}`).then(r => r.json()),
        ]).then(([s, m]) => {
            setStats(s.data);
            // แกน X = ชื่อกิจกรรม (label), แกน Y = จำนวนผู้เข้าร่วม (count)
            setActivityData((m.data || []).map(item => ({
                id: item.Activity_id,
                label: item.Activity_name || item.name,
                count: parseInt(item.registered_count || item.count || 0),
                cancelled: !!item.Activity_suspend_status, // กิจกรรมที่ยกเลิกแล้ว: ไม่นับในสัดส่วน
            })));
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [user, year, month]);

    // กราฟสัดส่วน (ขึ้นกับช่วงเวลา + กิจกรรมที่เลือก)
    useEffect(() => {
        if (!user?.Member_id) return;
        const qs = periodQuery();
        if (activityId) qs.set('activity_id', activityId);
        const q = qs.toString();
        fetch(`http://localhost:5000/api/organizer/attendance/${user.Member_id}${q ? `?${q}` : ''}`)
            .then(r => r.json())
            .then(a => setAttend({ passed: 0, notPassed: 0, unmarked: 0, ...(a.data || {}) }))
            .catch(() => {});
    }, [user, year, month, activityId]);

    // ถ้ากิจกรรมที่เลือกอยู่หลุดจากช่วงเวลาที่กรองใหม่ ให้กลับไปดูทุกกิจกรรม
    useEffect(() => {
        if (activityId && !activityData.some(a => !a.cancelled && String(a.id) === String(activityId))) setActivityId('');
    }, [activityData, activityId]);

    // เปลี่ยนปีแล้วรีเซ็ตเดือนที่เลือกไว้เสมอ กันค้างเดือนของปีก่อนหน้า
    const handleYearChange = (e) => {
        setYear(e.target.value);
        setMonth('');
    };

    if (loading) return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>กำลังโหลด...</div>;

    // กราฟสัดส่วนนับเฉพาะกิจกรรมที่ไม่ถูกยกเลิก จึงเลือกดูรายกิจกรรมได้เฉพาะกลุ่มนี้
    const activeActivities = activityData.filter(a => !a.cancelled);
    const selectedName = activeActivities.find(a => String(a.id) === String(activityId))?.label;

    return (
        <div className="hc-page">
            <div style={{ flexShrink: 0 }}>
                <h2 className="section-title">แดชบอร์ดสรุปข้อมูลกิจกรรม</h2>
                <p className="section-sub">ภาพรวมการดำเนินงานกิจกรรมจิตอาสาทั้งหมดของคุณ</p>
            </div>

            {/* กดการ์ดสถิติเพื่อไปหน้า "จัดการกิจกรรม" พร้อมกรองตามหมวดที่กดทันที */}
            <div className="stat-grid">
                {[
                    { label: 'ประกาศทั้งหมด',     val: stats?.total || 0,  icon: <FileText size={24} color="#fff" />,   bg: '#7c3aed', filter: 'all' },
                    { label: 'กำลังเปิดรับสมัคร', val: stats?.open || 0,   icon: <Megaphone size={24} color="#fff" />, bg: '#22c55e', filter: 'open' },
                    { label: 'ปิดรับสมัครแล้ว',   val: stats?.closed || 0, icon: <CalendarX size={24} color="#fff" />, bg: '#ef4444', filter: 'closed' },
                ].map((s, i) => (
                    <button
                        key={i}
                        type="button"
                        className={`stat-card${onSelectFilter ? ' clickable' : ''}`}
                        onClick={() => onSelectFilter?.(s.filter)}
                    >
                        <div className="stat-icon-box" style={{ background: s.bg }}>{s.icon}</div>
                        <div><div className="stat-num">{s.val}</div><div className="stat-label">{s.label}</div></div>
                    </button>
                ))}
            </div>

            <div className="charts-row">
                {/* กราฟแท่ง: จำนวนผู้สมัครแต่ละกิจกรรม + ตัวเลือกปี/เดือน (กดแท่งเพื่อเลือกกิจกรรมให้กราฟโดนัท) */}
                <div className="chart-card hc-bar-card">
                    <div className="hc-card-head">
                        <h4><Users size={16} color="#7c3aed" /> เปรียบเทียบผู้เข้าร่วมกิจกรรม</h4>
                        <div className="hc-head-tools">
                            <Calendar size={14} color="#64748b" />
                            <select className="hc-select" value={year} onChange={handleYearChange}>
                                <option value="">ทั้งหมด</option>
                                {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
                            </select>
                            {year && (
                                <select className="hc-select" value={month} onChange={(e) => setMonth(e.target.value)}>
                                    <option value="">ทั้งปี</option>
                                    {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                            )}
                        </div>
                    </div>

                    {activityData.length > 0 ? (
                        <BarChart data={activityData.map(a => ({ ...a, noSelect: a.cancelled }))} color="#7c3aed" selectedId={activityId} onSelect={setActivityId} />
                    ) : (
                        <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
                            {year && month ? 'ไม่มีกิจกรรมในเดือนนี้'
                                : year ? 'ไม่มีกิจกรรมในปีนี้'
                                : 'ไม่มีกิจกรรม'}
                        </p>
                    )}
                </div>

                {/* กราฟโดนัท: สัดส่วนผ่าน / ไม่ผ่าน / ยังไม่เช็กชื่อ */}
                <div className="chart-card hc-donut-card">
                    <div className="hc-card-head">
                        <h4><Users size={16} color="#22c55e" /> สัดส่วนผู้มาเข้าร่วมกิจกรรมจริง{selectedName ? '' : ' (ทุกกิจกรรม)'}</h4>
                        {/* เลือกดูสัดส่วนของกิจกรรมเดียว (หรือกดที่แท่งในกราฟด้านบนก็ได้) */}
                        <select className="hc-select" value={activityId} onChange={(e) => setActivityId(e.target.value)} title={selectedName || ''}>
                            <option value="">ทุกกิจกรรม</option>
                            {activeActivities.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                    </div>
                    <DonutChart passed={attend.passed} notPassed={attend.notPassed} unmarked={attend.unmarked} />
                </div>
            </div>
        </div>
    );
}
