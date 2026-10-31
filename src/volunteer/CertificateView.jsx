import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Calendar, Clock, Award, ChevronDown } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { notify } from '../notice';
import Pagination from '../components/Pagination';
import usePagination from '../usePagination';
import './CertificateView.css';

/* =====================================================================
 *  หน้าใบประกาศนียบัตรของผู้เข้าร่วมกิจกรรม
 *  แสดงเฉพาะกิจกรรมที่ผู้จัดยืนยันว่าเข้าร่วมผ่านแล้ว (Participation_result = 'P')
 *  ค้นหา / กรองตามเดือนและปี -> กดดูใบประกาศ -> ดาวน์โหลดเป็นไฟล์ PDF
 *    user             ผู้ใช้ที่ login อยู่
 *    targetActivity   กิจกรรมที่ต้องการเปิดใบประกาศทันที (กดมาจากหน้ากิจกรรมที่เข้าร่วม)
 *    onConsumeTarget  แจ้งกลับว่าเปิด targetActivity แล้ว (ให้หน้าแม่ล้างค่า)
 * ===================================================================== */

// สีป้ายตามประเภทกิจกรรม
const CAT_COLORS = {
    'สิ่งแวดล้อม': '#0284c7', 'การศึกษา': '#7c3aed',
    'ชุมชน': '#d97706', 'สังคม': '#ea580c', 'สุขภาพ': '#dc2626',
};
// รูปสำรองตามประเภทกิจกรรม
const FALLBACK_IMAGES = {
    'สิ่งแวดล้อม': 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&q=80',
    'การศึกษา': 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&q=80',
    'สุขภาพ': 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=600&q=80',
    'default': 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&q=80',
};
// ตัวเลือกเดือน (value = เลขเดือนแบบ JS คือ 0-11) และปี (value = ค.ศ., label = พ.ศ.)
const MONTHS = [
    { value: 'all', label: 'ทุกเดือน' },
    { value: '0', label: 'มกราคม' }, { value: '1', label: 'กุมภาพันธ์' },
    { value: '2', label: 'มีนาคม' }, { value: '3', label: 'เมษายน' },
    { value: '4', label: 'พฤษภาคม' }, { value: '5', label: 'มิถุนายน' },
    { value: '6', label: 'กรกฎาคม' }, { value: '7', label: 'สิงหาคม' },
    { value: '8', label: 'กันยายน' }, { value: '9', label: 'ตุลาคม' },
    { value: '10', label: 'พฤศจิกายน' }, { value: '11', label: 'ธันวาคม' }
];
const YEARS = [
    { value: 'all', label: 'ทุกปี' },
    { value: '2026', label: '2569' }, { value: '2025', label: '2568' }, { value: '2024', label: '2567' }
];

// จัดรูปแบบวันที่เป็นภาษาไทย เช่น "29 กันยายน 2569"
function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}
// จัดรูปแบบเวลาเป็น ชั่วโมง:นาที
function formatTime(d) {
    if (!d) return '-';
    return new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export default function CertificateView({ user, targetActivity, onConsumeTarget }) {
    const [certificates, setCertificates] = useState([]);    // กิจกรรมที่ได้ใบประกาศทั้งหมด
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');       // คำค้นหา (ชื่อกิจกรรม / สถานที่)
    const [selectedMonth, setSelectedMonth] = useState('all'); // เดือนที่กรอง
    const [selectedYear, setSelectedYear] = useState('all');   // ปีที่กรอง
    const [previewCert, setPreviewCert] = useState(null);     // ใบประกาศที่กำลังดู (มีค่า = แสดงหน้า preview)
    const [downloading, setDownloading] = useState(false);    // กำลังสร้างไฟล์ PDF
    const printRef = useRef();                                // กล่องใบประกาศที่จะแปลงเป็น PDF

    // ---------- ดึงรายการกิจกรรมที่ได้ใบประกาศ ----------
    useEffect(() => {
        if (!user?.Member_id) {
            setError('กรุณาเข้าสู่ระบบก่อน');
            setLoading(false);
            return;
        }
        fetch(`http://localhost:5000/api/my-activities/${user.Member_id}`)
            .then(res => { if (!res.ok) throw new Error('ดึงข้อมูลไม่สำเร็จ'); return res.json(); })
            .then(data => {
                // แสดงเฉพาะกิจกรรมที่ผู้จัดยืนยันการเข้าร่วมแล้ว (Participation_result = 'P')
                // และต้องไม่ใช่การสมัครที่ผู้ใช้ยกเลิก (Cancel_date) หรือกิจกรรมที่ถูกยกเลิก (Activity_suspend_status)
                const passed = (data.data || []).filter(
                    r => r.Participation_result === 'P' && !r.Cancel_date && !r.Activity_suspend_status
                );
                setCertificates(passed);
                setLoading(false);
            })
            .catch(err => { setError(err.message); setLoading(false); });
    }, [user]);

    // เข้ามาจากปุ่ม "ดาวน์โหลดใบประกาศนียบัตร" ในหน้ากิจกรรมที่เข้าร่วม -> เปิด preview ใบนั้นให้ทันที
    // (หาจาก Registration_id ก่อน ถ้าไม่เจอหาจาก Activity_id)
    useEffect(() => {
        if (!targetActivity || loading) return;
        const match = certificates.find(c => String(c.Registration_id) === String(targetActivity.Registration_id))
            || certificates.find(c => targetActivity.Activity_id && String(c.Activity_id) === String(targetActivity.Activity_id));
        if (match) setPreviewCert(match);
        onConsumeTarget?.();
    }, [targetActivity, loading, certificates]);

    // กรองตามคำค้นหา เดือน และปี (ดูจากวันที่จัดกิจกรรม)
    const filtered = certificates.filter(item => {
        const d = new Date(item.Activity_start);
        const matchSearch = (item.Activity_name || '').toLowerCase().includes(searchQuery.toLowerCase())
            || (item.Location || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchMonth = selectedMonth === 'all' || d.getMonth().toString() === selectedMonth;
        const matchYear = selectedYear === 'all' || d.getFullYear().toString() === selectedYear;
        return matchSearch && matchMonth && matchYear;
    });

    // แบ่งหน้าละ 9 การ์ด — เปลี่ยนคำค้นหา/เดือน/ปีแล้วกลับไปหน้า 1
    const { page, setPage, totalPages, pageItems } = usePagination(filtered, 9, `${searchQuery}|${selectedMonth}|${selectedYear}`);

    // ---------- ดาวน์โหลด PDF ----------
    // จับภาพใบประกาศด้วย html2canvas (ความละเอียด 2 เท่า) แล้ววางเต็มหน้า A4 แนวนอนด้วย jsPDF
    // และบันทึกเป็นไฟล์ "ใบประกาศนียบัตร-<ชื่อกิจกรรม>.pdf"
    const handleDownloadPdf = async () => {
        if (!printRef.current || downloading) return;
        setDownloading(true);
        try {
            const canvas = await html2canvas(printRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });
            const imgData = canvas.toDataURL('image/png');

            // ใบประกาศเป็นสัดส่วนกระดาษแนวนอน A4 (aspect-ratio 1.414/1 ใน CSS) อยู่แล้ว
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);

            // ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ออก
            const safeName = (previewCert?.Activity_name || 'กิจกรรม').replace(/[\\/:*?"<>|]/g, '');
            pdf.save(`ใบประกาศนียบัตร-${safeName}.pdf`);
        } catch (err) {
            console.error('Error generating PDF:', err);
            notify('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF กรุณาลองใหม่อีกครั้ง', 'error');
        } finally {
            setDownloading(false);
        }
    };

    // กำลังโหลด / โหลดไม่สำเร็จ
    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontFamily: 'Sarabun, sans-serif' }}>กำลังโหลดใบประกาศนียบัตร...</div>;
    if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444', fontFamily: 'Sarabun, sans-serif' }}>{error}</div>;

    // ---------- หน้า preview ใบประกาศ + ปุ่มย้อนกลับ / ดาวน์โหลด PDF ----------
    if (previewCert) {
        // ใช้ชื่อ-นามสกุลที่บันทึกไว้ตอนลงทะเบียน (Registration_fname/Registration_lname) แทนชื่อ
        // ในโปรไฟล์ปัจจุบันของ user — กันกรณีผู้ใช้เปลี่ยนชื่อในโปรไฟล์ทีหลัง ชื่อบนใบประกาศจะได้
        // ยังตรงกับตอนที่เข้าร่วมกิจกรรมจริง
        const fullName = `${previewCert.Registration_fname || ''} ${previewCert.Registration_lname || ''}`.trim()
            || `${user?.First_name || ''} ${user?.Last_name || ''}`.trim()
            || 'ผู้เข้าร่วมกิจกรรม';
        return (
            <div className="cert-preview-overlay">
                <div className="cert-preview-wrapper">
                    {/* ตัวใบประกาศ (ส่วนนี้ถูกแปลงเป็น PDF) */}
                    <div ref={printRef} className="cert-document-paper">
                        <div className="cert-doc-border">
                            <div className="cert-doc-logo-section">
                                <img src="/logo.png" alt="โลโก้" className="cert-logo-img" onError={e => { e.target.style.display = 'none'; }} />
                            </div>
                            <h4 className="cert-doc-sub-system">ระบบสารสนเทศการเข้าร่วมกิจกรรมจิตอาสา</h4>
                            <p className="cert-doc-give-text">ขอมอบเกียรติบัตรฉบับนี้ไว้เพื่อแสดงว่า</p>
                            {/* ชื่อผู้เข้าร่วม (ชื่อที่กรอกตอนสมัคร) */}
                            <h1 className="cert-doc-username">{fullName}</h1>
                            <p className="cert-doc-under-project">ได้เข้าร่วมกิจกรรมภายใต้โครงการ</p>
                            <h3 className="cert-doc-activity-title">{previewCert.Activity_name}</h3>
                            <p className="cert-doc-date">วันที่ {formatDate(previewCert.Activity_start)}</p>
                            <p className="cert-doc-date" style={{ color: '#475569' }}>สถานที่ {previewCert.Location || '-'}</p>
                            {/* ลายเซ็นผู้จัดกิจกรรม (ไม่มีหรือโหลดไม่ขึ้นใช้ลายเซ็นตัวอย่าง /Signature.gif) + ชื่อผู้จัด */}
                            <div className="cert-doc-signature-area">
                                <div className="sig-line">
                                    <img
                                        src={previewCert.Signature || '/Signature.gif'}
                                        alt="ลายเซ็นผู้จัดกิจกรรม"
                                        className="sig-img"
                                        onError={e => { e.target.onerror = null; e.target.src = '/Signature.gif'; }}
                                    />
                                    <p className="sig-name">
                                        {`${previewCert.Organizer_first_name || ''} ${previewCert.Organizer_last_name || ''}`.trim() || '(ผู้จัดกิจกรรม)'}
                                    </p>
                                    <p className="sig-position">ผู้จัดกิจกรรมจิตอาสา</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="cert-preview-actions-bar">
                        <button type="button" className="btn-cert-back" onClick={() => setPreviewCert(null)} disabled={downloading}>ย้อนกลับ</button>
                        <button type="button" className="btn-cert-download-pdf" onClick={handleDownloadPdf} disabled={downloading}>
                            {downloading ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด PDF'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ---------- หน้ารายการใบประกาศ ----------
    return (
        <div className="certificate-container">
            <div className="cert-header">
                <h2 className="cert-title">ใบประกาศนียบัตรของคุณ</h2>
                <p className="cert-subtitle">ค้นหา ตรวจสอบ และดาวน์โหลดเกียรติบัตรกิจกรรมจิตอาสาที่คุณเข้าร่วมเรียบร้อยแล้ว</p>
            </div>

            {/* ช่องค้นหา + ตัวเลือกเดือน / ปี */}
            <div className="cert-filter-panel">
                <div className="search-box-wrapper">
                    <Search size={18} className="search-inner-icon" />
                    <input type="text" placeholder="ค้นหาชื่อกิจกรรม หรือ สถานที่..." className="search-inner-input"
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <div className="dropdown-select-group">
                    <div className="select-container">
                        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <ChevronDown size={14} className="select-arrow" />
                    </div>
                    <div className="select-container">
                        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                            {YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                        </select>
                        <ChevronDown size={14} className="select-arrow" />
                    </div>
                </div>
            </div>

            {/* การ์ดใบประกาศ (หรือข้อความเมื่อไม่มี / ไม่ตรงเงื่อนไข) */}
            {filtered.length === 0 ? (
                <div className="no-cert-box">
                    {certificates.length === 0
                        ? 'คุณยังไม่มีใบประกาศนียบัตร (ต้องเข้าร่วมกิจกรรมและได้รับการยืนยันก่อน)'
                        : 'ไม่พบใบประกาศนียบัตรที่ตรงตามเงื่อนไขที่เลือก'}
                </div>
            ) : (<>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                    {pageItems.map(item => {
                        const cat = item.Category_name || 'ทั่วไป';
                        const img = item.Image || FALLBACK_IMAGES[cat] || FALLBACK_IMAGES['default'];
                        return (
                            <div key={item.Registration_id} style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ position: 'relative', height: '180px' }}>
                                    <img src={img} alt={item.Activity_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        onError={e => { e.target.src = FALLBACK_IMAGES['default']; }} />
                                    <span style={{ position: 'absolute', bottom: '10px', left: '10px', background: CAT_COLORS[cat] || '#475569', color: '#fff', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>● {cat}</span>
                                </div>
                                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{item.Activity_name}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#475569', fontSize: '13px' }}>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><MapPin size={13} color="#2D7D46" /><span>{item.Location || '-'}</span></div>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><Calendar size={13} color="#2D7D46" /><span>{formatDate(item.Activity_start)}</span></div>
                                    </div>
                                    <button type="button" onClick={() => setPreviewCert(item)}
                                        style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '11px', background: '#1a365d', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                        <Award size={16} /> ดูและดาวน์โหลดใบประกาศ
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>)}
        </div>
    );
}
