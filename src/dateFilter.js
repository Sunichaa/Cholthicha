/* =====================================================================
 *  ตัวช่วยกรองรายการตามวัน / เดือน / ปี (ใช้คู่กับ <DateFilter />)
 *  ค่าตัวกรองเก็บเป็นสตริง: 'all' = ไม่กรอง
 *    day    '1' - '31'
 *    month  '0' - '11' (เลขเดือนแบบ JS)
 *    year   ค.ศ. เช่น '2026' (แสดงผลเป็น พ.ศ.)
 * ===================================================================== */

// ค่าเริ่มต้น: ไม่กรองเลย
export const EMPTY_DATE_FILTER = { day: 'all', month: 'all', year: 'all' };

// วันที่ตรงกับตัวกรองหรือไม่ (ไม่มีวันที่ -> ผ่านเฉพาะตอนไม่ได้เลือกกรองอะไร)
export function matchDateFilter(dateValue, filter) {
    const { day, month, year } = filter;
    if (day === 'all' && month === 'all' && year === 'all') return true;
    if (!dateValue) return false;

    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return false;
    return (day === 'all' || d.getDate() === Number(day))
        && (month === 'all' || d.getMonth() === Number(month))
        && (year === 'all' || d.getFullYear() === Number(year));
}

// รายการปี (ค.ศ.) ที่มีอยู่จริงในข้อมูล เรียงใหม่ไปเก่า — ใช้เป็นตัวเลือกใน dropdown ปี
export function yearsOf(items, getDate) {
    const years = new Set();
    items.forEach(item => {
        const raw = getDate(item);
        if (!raw) return; // ไม่มีวันที่ (new Date(null) จะกลายเป็นปี 1970)
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    });
    return [...years].sort((a, b) => b - a);
}

// สตริงสำหรับส่งเป็น resetKey ของ usePagination (เปลี่ยนตัวกรองแล้วกลับไปหน้า 1)
export function dateFilterKey(filter) {
    return `${filter.day}-${filter.month}-${filter.year}`;
}
