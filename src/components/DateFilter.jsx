import { ChevronDown, X } from 'lucide-react';
import { EMPTY_DATE_FILTER } from '../dateFilter';
import './DateFilter.css';

/* =====================================================================
 *  ตัวกรองวัน / เดือน / ปี (dropdown 3 ช่อง + ปุ่มล้างตัวกรอง)
 *    value     { day, month, year } ดูรูปแบบใน dateFilter.js
 *    onChange  รับค่าตัวกรองชุดใหม่
 *    years     ปี ค.ศ. ที่ให้เลือก (มักได้จาก yearsOf())
 * ===================================================================== */

const MONTH_NAMES = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// จำนวนวันในเดือนที่เลือก (ยังไม่เลือกเดือน -> 31 วัน, เลือกเดือนแต่ไม่เลือกปี -> ใช้ปีอธิกสุรทินเพื่อให้มี 29 ก.พ.)
function daysIn(month, year) {
    if (month === 'all') return 31;
    const y = year === 'all' ? 2024 : Number(year);
    return new Date(y, Number(month) + 1, 0).getDate();
}

export default function DateFilter({ value, onChange, years = [] }) {
    const maxDay = daysIn(value.month, value.year);
    const isActive = value.day !== 'all' || value.month !== 'all' || value.year !== 'all';

    // เปลี่ยนค่าช่องใดช่องหนึ่ง — ถ้าวันที่เลือกไว้เกินจำนวนวันของเดือน/ปีใหม่ ให้ล้างช่องวัน
    const set = (field, v) => {
        const next = { ...value, [field]: v };
        if (next.day !== 'all' && Number(next.day) > daysIn(next.month, next.year)) next.day = 'all';
        onChange(next);
    };

    return (
        <div className="date-filter">
            <div className="df-select">
                <select value={value.day} onChange={e => set('day', e.target.value)} aria-label="วันที่">
                    <option value="all">ทุกวัน</option>
                    {Array.from({ length: maxDay }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                    ))}
                </select>
                <ChevronDown size={14} className="df-arrow" />
            </div>

            <div className="df-select">
                <select value={value.month} onChange={e => set('month', e.target.value)} aria-label="เดือน">
                    <option value="all">ทุกเดือน</option>
                    {MONTH_NAMES.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
                </select>
                <ChevronDown size={14} className="df-arrow" />
            </div>

            <div className="df-select">
                <select value={value.year} onChange={e => set('year', e.target.value)} aria-label="ปี">
                    <option value="all">ทุกปี</option>
                    {years.map(y => <option key={y} value={String(y)}>{y + 543}</option>)}
                </select>
                <ChevronDown size={14} className="df-arrow" />
            </div>

            {/* ปุ่มล้างตัวกรอง แสดงเมื่อมีการเลือกกรองอยู่ */}
            {isActive && (
                <button type="button" className="df-clear" onClick={() => onChange(EMPTY_DATE_FILTER)} title="ล้างตัวกรองวันที่">
                    <X size={14} /> ล้าง
                </button>
            )}
        </div>
    );
}
