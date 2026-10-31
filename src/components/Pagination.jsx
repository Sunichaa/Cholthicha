import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './Pagination.css';

/* =====================================================================
 *  แถบเปลี่ยนหน้า: ปุ่มก่อนหน้า / เลขหน้า / ปุ่มถัดไป
 *    page, totalPages, onChange  มาจาก usePagination()
 *  แสดงเสมอแม้มีหน้าเดียว (ปุ่มก่อนหน้า/ถัดไปจะกดไม่ได้)
 *  วางไว้ต่อจากรายการทันที — เปลี่ยนหน้าแล้วจะเลื่อนจอขึ้นไปที่ต้นรายการ (element ก่อนหน้า)
 * ===================================================================== */

// สร้างลำดับเลขหน้าที่จะแสดง เช่น [1, '...', 4, 5, 6, '...', 10]
function buildPages(page, totalPages) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages = [1];
    const from = Math.max(2, page - 1);
    const to = Math.min(totalPages - 1, page + 1);
    if (from > 2) pages.push('...');
    for (let p = from; p <= to; p++) pages.push(p);
    if (to < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
}

export default function Pagination({ page, totalPages, onChange }) {
    const navRef = useRef(null);

    // เปลี่ยนหน้า แล้วเลื่อนให้เห็นต้นรายการ
    const go = (p) => {
        if (p < 1 || p > totalPages || p === page) return;
        onChange(p);
        navRef.current?.previousElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <nav className="pagination" ref={navRef} aria-label="เปลี่ยนหน้า">
            <button type="button" className="pg-btn" onClick={() => go(page - 1)} disabled={page === 1} aria-label="หน้าก่อนหน้า">
                <ChevronLeft size={16} />
            </button>

            {buildPages(page, totalPages).map((p, i) => (
                p === '...'
                    ? <span key={`gap-${i}`} className="pg-gap">...</span>
                    : (
                        <button
                            key={p}
                            type="button"
                            className={`pg-btn${p === page ? ' active' : ''}`}
                            onClick={() => go(p)}
                            aria-current={p === page ? 'page' : undefined}
                        >
                            {p}
                        </button>
                    )
            ))}

            <button type="button" className="pg-btn" onClick={() => go(page + 1)} disabled={page === totalPages} aria-label="หน้าถัดไป">
                <ChevronRight size={16} />
            </button>
        </nav>
    );
}
