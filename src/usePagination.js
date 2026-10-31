import { useState } from 'react';

/* =====================================================================
 *  hook แบ่งหน้ารายการฝั่งหน้าเว็บ (ใช้คู่กับ <Pagination />)
 *    items     รายการทั้งหมด (ผ่านตัวกรองแล้ว)
 *    pageSize  จำนวนรายการต่อหน้า
 *    resetKey  ค่าที่ถ้าเปลี่ยน (เช่น คำค้นหา / แท็บกรอง) จะกลับไปหน้า 1
 *  คืนค่า { page, setPage, totalPages, pageItems, startIndex }
 * ===================================================================== */
export default function usePagination(items, pageSize = 9, resetKey = '') {
    const [page, setPage] = useState(1);
    const [prevKey, setPrevKey] = useState(resetKey);

    // เงื่อนไขกรองเปลี่ยน -> กลับไปหน้าแรก (ปรับ state ระหว่าง render ตามแนวทางของ React แทนการใช้ useEffect)
    if (prevKey !== resetKey) {
        setPrevKey(resetKey);
        setPage(1);
    }

    // จำนวนหน้าทั้งหมด (อย่างน้อย 1) และหน้าปัจจุบันที่ไม่เกินหน้าสุดท้าย
    // กันกรณีรายการลดลง เช่น ลบ/ยกเลิกรายการสุดท้ายของหน้าสุดท้าย
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const current = Math.min(page, totalPages);
    const startIndex = (current - 1) * pageSize;

    return {
        page: current,
        setPage,
        totalPages,
        pageItems: items.slice(startIndex, startIndex + pageSize),
        startIndex,
    };
}
