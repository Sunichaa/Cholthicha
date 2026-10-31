import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Lock, Edit3, RotateCcw, MapPin } from 'lucide-react';
import '../admin/AdminDashboard.css';
import LocationPicker from '../components/LocationPicker';

/* =====================================================================
 *  ฟอร์มเพิ่ม / แก้ไขกิจกรรมของผู้จัดกิจกรรม
 *  - ไม่มี editingActivity = เพิ่มกิจกรรมใหม่ (POST)
 *  - มี editingActivity    = แก้ไขกิจกรรมเดิม (PUT) — ถ้าส่งอนุมัติแล้วจะล็อกแก้ไขไม่ได้
 *  บันทึกได้ 2 แบบ: "บันทึกร่าง" (Draft) หรือ "บันทึกข้อมูล" ส่งให้แอดมินอนุมัติ (Pending)
 *    user             ผู้ใช้ที่ login อยู่
 *    onSuccess        เรียกหลังบันทึกสำเร็จ (กลับไปหน้าจัดการกิจกรรม)
 *    editingActivity  กิจกรรมที่จะแก้ไข (null = เพิ่มใหม่)
 * ===================================================================== */
export default function OrganizerAddActivity({ user, onSuccess, editingActivity = null }) {
    const [activityId, setActivityId]         = useState(null); // มีค่า = กำลังแก้ไขกิจกรรมเดิม (บันทึกด้วย PUT)
    const [activityStatus, setActivityStatus] = useState(''); // 'Draft', 'Pending', 'Approved'

    // ค่าเริ่มต้นของทุกช่องในฟอร์ม
    const initialFormState = {
        activity_name: '', location: '', province_id: '', district_id: '', subdistrict_id: '',
        category_id: '', location_url: '', reg_start: '', reg_end: '',
        activity_start: '', activity_end: '', time_start: '', time_end: '',
        capacity: '', description: '',
    };

    const [form, setForm]                 = useState(initialFormState);
    const [image, setImage]               = useState(null);  // ไฟล์รูปกิจกรรมที่เลือกใหม่ (ยังไม่อัปโหลด)
    const [preview, setPreview]           = useState(null);  // URL รูปกิจกรรมที่แสดง (รูปเดิม หรือรูปที่เพิ่งเลือก)
    const [signature, setSignature]       = useState(null);  // ไฟล์ลายเซ็นที่เลือกใหม่ (ยังไม่อัปโหลด)
    const [signaturePreview, setSignaturePreview] = useState(null); // URL ลายเซ็นที่แสดง
    const [provinces, setProvinces]       = useState([]);    // ตัวเลือกจังหวัด
    const [districts, setDistricts]       = useState([]);    // ตัวเลือกอำเภอ (ตามจังหวัดที่เลือก)
    const [subdistricts, setSubdistricts] = useState([]);    // ตัวเลือกตำบล (ตามอำเภอที่เลือก)
    const [categories, setCategories]     = useState([]);    // ตัวเลือกประเภทกิจกรรม
    const [loading, setLoading]           = useState(false); // กำลังบันทึก
    const [done, setDone]                 = useState(false); // บันทึกสำเร็จ -> แสดงข้อความสำเร็จ
    const [toastMsg, setToastMsg]         = useState('');
    const [error, setError]               = useState('');
    const [showMapPicker, setShowMapPicker] = useState(false); // เปิดแผนที่เลือกตำแหน่งอยู่หรือไม่

    // อัปเดตค่าช่องใดช่องหนึ่งในฟอร์ม
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    // วันนี้ (YYYY-MM-DD ตามเวลาเครื่องผู้ใช้) — ใช้จำกัด date picker ของ "วันเปิดรับสมัคร"
    // ไม่ให้เลือกวันที่ย้อนหลังได้ตั้งแต่แรก
    const todayStr = () => {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // วันถัดไปของวันที่ที่ระบุ (YYYY-MM-DD) — ใช้จำกัด date picker ของ "วันที่จัดกิจกรรม"
    // ไม่ให้เลือกวันที่ ≤ วันปิดรับสมัครได้ตั้งแต่แรก
    const nextDay = (dateStr) => {
        if (!dateStr) return undefined;
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return undefined;
        d.setDate(d.getDate() + 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // ล้างฟอร์มทั้งหมดรวมถึงรหัสกิจกรรม -> กลับเป็นฟอร์มเพิ่มกิจกรรมใหม่
    // (ใช้หลังบันทึกสำเร็จ และตอนเปิดฟอร์มโดยไม่มี editingActivity)
    const handleResetNewForm = () => {
        setActivityId(null);
        setActivityStatus('');
        setPreview(null);
        setImage(null);
        setSignature(null);
        setSignaturePreview(null);
        setForm(initialFormState);
        setError('');
        setShowMapPicker(false);
    };

    // ปุ่ม "เคลียร์ฟอร์ม" — ล้างเฉพาะข้อมูลในช่องกรอก แต่คง activityId / activityStatus ไว้
    // ถ้ากำลังแก้ไขร่างอยู่ พอบันทึกใหม่จะเป็นการ PUT ทับร่างเดิม ไม่ใช่ POST สร้างกิจกรรมใหม่ซ้อน
    const handleClearFields = () => {
        setPreview(null);
        setImage(null);
        setSignature(null);
        setSignaturePreview(null);
        setForm(initialFormState);
        setError('');
        setShowMapPicker(false);
    };

    // โหลดตัวเลือก จังหวัด และ ประเภทกิจกรรม เท่านั้น
    useEffect(() => {
        fetch('http://localhost:5000/api/provinces').then(r=>r.json()).then(d=>setProvinces(d.data||[]));
        fetch('http://localhost:5000/api/activitytypes').then(r=>r.json()).then(d=>setCategories(d.data||[])).catch(()=>{});
    }, []);

    // มี editingActivity (กดแก้ไขมาจากหน้าจัดการกิจกรรม) -> ใส่ข้อมูลเดิมลงฟอร์ม
    // ไม่มี -> ล้างฟอร์มเป็นฟอร์มเพิ่มกิจกรรมใหม่
    useEffect(() => {
        if (editingActivity) {
            const status = editingActivity.Activity_status || editingActivity.Status || '';
            setActivityStatus(status);
            setActivityId(editingActivity.Activity_id || editingActivity.activity_id);

            // แปลงวันที่จาก backend เป็น YYYY-MM-DD สำหรับ <input type="date">
            // อ่านปี/เดือน/วันแบบเวลาท้องถิ่น ไม่ใช้ toISOString() เพราะแปลงเป็น UTC แล้ว
            // เที่ยงคืนเวลาไทย (UTC+7) จะกลายเป็นวันก่อนหน้า ทำให้วันที่เลื่อนถอยหลัง 1 วัน
            const formatDate = (str) => {
                if (!str) return '';
                const d = new Date(str);
                if (isNaN(d.getTime())) return '';
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };
            setForm({
                activity_name:  editingActivity.Activity_name  || editingActivity.activity_name  || '',
                location:       editingActivity.Location       || editingActivity.location       || '',
                province_id:    editingActivity.Province_id    || editingActivity.province_id    || '',
                district_id:    editingActivity.District_id    || editingActivity.district_id    || '',
                subdistrict_id: editingActivity.Subdistrict_id || editingActivity.subdistrict_id || '',
                category_id:    editingActivity.Category_id    || editingActivity.category_id    || '',
                location_url:   editingActivity.Location_url   || editingActivity.location_url   || '',
                reg_start:      formatDate(editingActivity.Registration_start || editingActivity.reg_start),
                reg_end:        formatDate(editingActivity.Registration_end || editingActivity.reg_end),
                activity_start: formatDate(editingActivity.Activity_start || editingActivity.activity_start),
                activity_end:   formatDate(editingActivity.Activity_end || editingActivity.activity_end),
                time_start:     editingActivity.Activity_start_time || editingActivity.time_start || '',
                time_end:       editingActivity.Activity_end_time   || editingActivity.time_end   || '',
                capacity:       editingActivity.Capacity       || editingActivity.capacity       || '',
                description:    editingActivity.Activity_description || editingActivity.description || '',
            });

            // แสดงรูปกิจกรรมและลายเซ็นเดิม (ถ้ามี)
            if (editingActivity.Image || editingActivity.image) {
                setPreview(editingActivity.Image || editingActivity.image);
            }
            if (editingActivity.Signature || editingActivity.signature) {
                setSignaturePreview(editingActivity.Signature || editingActivity.signature);
            }
        } else {
            handleResetNewForm();
        }
    }, [editingActivity]);

    // โหลด อำเภอ ตาม จังหวัด
    useEffect(() => {
        if (!form.province_id) { setDistricts([]); return; }
        fetch(`http://localhost:5000/api/districts/${form.province_id}`)
            .then(r=>r.json()).then(d=>setDistricts(d.data||[]));
    }, [form.province_id]);

    // โหลด ตำบล ตาม อำเภอ
    useEffect(() => {
        if (!form.district_id) { setSubdistricts([]); return; }
        fetch(`http://localhost:5000/api/subdistricts/${form.district_id}`)
            .then(r=>r.json()).then(d=>setSubdistricts(d.data||[]));
    }, [form.district_id]);

    // เลือกไฟล์รูปกิจกรรม: เก็บไฟล์ไว้อัปโหลดตอนบันทึก และแสดงตัวอย่างทันที
    const handleImage = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImage(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    // เลือกไฟล์ลายเซ็น: เก็บไฟล์ไว้อัปโหลดตอนบันทึก และแสดงตัวอย่างทันที
    const handleSignature = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSignature(file);
            setSignaturePreview(URL.createObjectURL(file));
        }
    };

    // ---------- บันทึกข้อมูล ----------
    // targetStatus: 'Draft' (บันทึกร่าง) หรือ 'Pending' (ส่งอนุมัติ)
    // ขั้นตอน: ตรวจข้อมูล -> อัปโหลดรูป/ลายเซ็นใหม่ (ถ้ามี) -> POST (ใหม่) หรือ PUT (แก้ไข)
    //          -> ล้างฟอร์ม -> แสดงข้อความสำเร็จ 1.5 วินาที -> onSuccess
    const handleSave = async (targetStatus) => {
        // ส่งอนุมัติต้องกรอกช่องที่จำเป็นครบ, บันทึกร่างต้องมีอย่างน้อยชื่อกิจกรรม
        if (targetStatus === 'Pending') {
            if (!form.activity_name || !form.location || !form.category_id || !form.activity_start || !form.capacity || !form.description) {
                setError('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วนก่อนส่งอนุมัติ');
                return;
            }
        } else if (targetStatus === 'Draft') {
            if (!form.activity_name) {
                setError('กรุณาระบุ "ชื่อกิจกรรม" อย่างน้อยเพื่อบันทึกร่าง');
                return;
            }
        }

        // วันเปิดรับสมัครต้องไม่ใช่วันที่ผ่านมาแล้ว
        if (form.reg_start && form.reg_start < todayStr()) {
            setError('วันเปิดรับสมัครต้องไม่ใช่วันที่ผ่านมาแล้ว');
            return;
        }

        // วันปิดรับสมัครต้องเป็นวันเดียวกับ หรือหลังวันเปิดรับสมัครเท่านั้น
        if (form.reg_start && form.reg_end && form.reg_end < form.reg_start) {
            setError('วันปิดรับสมัครต้องเป็นวันเดียวกับ หรือหลังวันเปิดรับสมัคร');
            return;
        }

        // วันที่จัดกิจกรรมต้องอยู่หลังวันปิดรับสมัคร — เช็กเฉพาะตอนกรอกครบทั้งสองช่อง
        // (รูปแบบเป็น YYYY-MM-DD จาก <input type="date"> เทียบด้วย string ได้ตรงตามลำดับวันที่จริง)
        if (form.reg_end && form.activity_start && form.activity_start <= form.reg_end) {
            setError('วันที่จัดกิจกรรมต้องเป็นวันหลังวันปิดรับสมัคร');
            return;
        }

        // วันสิ้นสุดกิจกรรมต้องไม่น้อยกว่าวันที่จัดกิจกรรม
        if (form.activity_start && form.activity_end && form.activity_end < form.activity_start) {
            setError('วันสิ้นสุดกิจกรรมต้องไม่น้อยกว่าวันที่จัดกิจกรรม');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // อัปโหลดรูปกิจกรรมใหม่ (ถ้าเลือกไว้) ไม่งั้นใช้ URL รูปเดิม
            let imageUrl = preview;

            if (image) {
                const fd = new FormData();
                fd.append('image', image);
                const r = await fetch('http://localhost:5000/api/upload/image', { method:'POST', body:fd });
                const d = await r.json();
                if (d.success) imageUrl = d.url;
            }

            // อัปโหลดลายเซ็นใหม่ (ถ้าเลือกไว้) ไม่งั้นใช้ URL ลายเซ็นเดิม
            let signatureUrl = signaturePreview;

            if (signature) {
                const fd = new FormData();
                fd.append('image', signature);
                const r = await fetch('http://localhost:5000/api/upload/image', { method:'POST', body:fd });
                const d = await r.json();
                if (d.success) signatureUrl = d.url;
            }

            const payload = {
                ...form,
                image: imageUrl,
                signature: signatureUrl,
                member_id: user?.Member_id,
                status: targetStatus
            };

            // มี activityId = แก้ไขกิจกรรมเดิม (PUT), ไม่มี = สร้างกิจกรรมใหม่ (POST)
            const isUpdate = Boolean(activityId);
            const url = isUpdate 
                ? `http://localhost:5000/api/organizer/activities/${activityId}`
                : 'http://localhost:5000/api/organizer/activities';
            
            const method = isUpdate ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.message || data.error || 'บันทึกข้อมูลไม่สำเร็จ');

            // บันทึกสำเร็จ: ล้างฟอร์ม แสดงข้อความสำเร็จ แล้วกลับหน้าจัดการกิจกรรม
            handleResetNewForm();

            setDone(true);
            setToastMsg(
                targetStatus === 'Draft' 
                    ? 'บันทึกร่างเรียบร้อยแล้ว!' 
                    : 'ส่งข้อมูลกิจกรรมให้ผู้ดูแลระบบเรียบร้อยแล้ว!'
            );

            setTimeout(() => { 
                setDone(false); 
                if (onSuccess) onSuccess(); 
            }, 1500);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ส่งอนุมัติแล้ว / อนุมัติแล้ว -> ล็อกทุกช่อง แก้ไขไม่ได้
    const isLocked = activityStatus === 'Pending' || activityStatus === 'Approved' || activityStatus === 'รออนุมัติ' || activityStatus === 'อนุมัติแล้ว';
    // props ที่ใช้ร่วมกันของช่องกรอกส่วนใหญ่ (ปิดใช้งานเมื่อล็อกหรือกำลังบันทึก)
    const inp = { className: 'form-input', style: { width: '100%' }, disabled: isLocked || loading };

    return (
        /* กล่องหลัก: กว้างไม่เกิน 760px และจัดกึ่งกลาง */
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 16px 40px 16px' }}>
            
            {/* หัวหน้า: ชื่อหน้า (เพิ่ม/แก้ไข) + ปุ่มเคลียร์ฟอร์ม */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="section-title" style={{ margin: 0 }}>
                    {activityId ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมใหม่'}
                </h2>
                
                <button 
                    type="button"
                    onClick={handleClearFields}
                    disabled={isLocked || loading}
                    style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 14px', background:'#f1f5f9', color:'#334155', border:'1px solid #cbd5e1', borderRadius:'8px', cursor: (isLocked || loading) ? 'not-allowed' : 'pointer', opacity: (isLocked || loading) ? 0.5 : 1, fontSize:'13px', fontFamily:'Sarabun,sans-serif', fontWeight:'600' }}>
                    <RotateCcw size={15} /> เคลียร์ฟอร์ม
                </button>
            </div>

            {/* การ์ดฟอร์ม */}
            <div className="form-card" style={{ width: '100%' }}>

                {/* แถบแจ้งว่าล็อกแล้ว (ส่งอนุมัติแล้วแก้ไขไม่ได้) */}
                {isLocked && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px' }}>
                        <Lock size={18} />
                        <div>
                            <strong>กิจกรรมนี้ถูกส่งรออนุมัติแล้ว (ไม่สามารถแก้ไขได้)</strong>
                        </div>
                    </div>
                )}

                {/* แถบแจ้งว่ากำลังแก้ไขฉบับร่าง */}
                {activityStatus === 'Draft' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbe3', border: '1px solid #fde047', color: '#854d0e', padding: '10px 14px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>
                        <Edit3 size={16} /> กำลังแก้ไขข้อมูล "ฉบับร่าง"
                    </div>
                )}

                {/* ข้อความบันทึกสำเร็จ */}
                {done && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
                        <CheckCircle size={16} /> {toastMsg}
                    </div>
                )}

                {/* กด "บันทึกข้อมูล" (submit) = ส่งอนุมัติ */}
                <form onSubmit={(e) => { e.preventDefault(); handleSave('Pending'); }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* รูปภาพ */}
                        <div className="form-group full">
                            <label>รูปภาพกิจกรรม (1 รูป) <span style={{ color: '#ef4444' }}>*</span></label>
                            <label style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}>
                                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', overflow: 'hidden', height: preview ? '200px' : '100px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                    {preview ? <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '+ คลิกเพื่ออัปโหลดรูปภาพ'}
                                </div>
                                {!isLocked && <input type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />}
                            </label>
                        </div>

                        {/* ลายเซ็นผู้จัดกิจกรรม (สำหรับใช้ในใบประกาศนียบัตร) */}
                        <div className="form-group full">
                            <label>ลายเซ็นผู้จัดกิจกรรม (สำหรับใบประกาศนียบัตร)<span style={{ color: '#ef4444' }}>*</span></label>
                            <label style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}>
                                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', overflow: 'hidden', height: signaturePreview ? '120px' : '80px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                    {signaturePreview ? <img src={signaturePreview} alt="signature preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : '+ คลิกเพื่ออัปโหลดรูปลายเซ็น'}
                                </div>
                                {!isLocked && <input type="file" accept="image/*" onChange={handleSignature} style={{ display: 'none' }} />}
                            </label>
                        </div>

                        {/* ชื่อกิจกรรม */}
                        <div className="form-group full">
                            <label>ชื่อกิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
                            <input {...inp} placeholder="ระบุชื่อกิจกรรม" value={form.activity_name} onChange={e => set('activity_name', e.target.value)} required />
                        </div>

                        {/* สถานที่ + จังหวัด / อำเภอ / ตำบล */}
                        <div className="form-grid">
                            <div className="form-group">
                                <label>สถานที่ (ข้อความ) <span style={{ color: '#ef4444' }}>*</span></label>
                                <input {...inp} placeholder="เช่น อุทยานแห่งชาติ" value={form.location} onChange={e => set('location', e.target.value)} required />
                            </div>

                            <div className="form-group">
                                <label>จังหวัด <span style={{ color: '#ef4444' }}>*</span></label>
                                {/* เปลี่ยนจังหวัดแล้วล้างอำเภอ/ตำบลที่เลือกไว้ */}
                                <select {...inp} value={form.province_id} onChange={e => { set('province_id', e.target.value); set('district_id', ''); set('subdistrict_id', ''); }}>
                                    <option value="">-- เลือกจังหวัด --</option>
                                    {provinces.map(p => <option key={p.Province_id} value={p.Province_id}>{p.Province_name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>อำเภอ/เขต <span style={{ color: '#ef4444' }}>*</span></label>
                                {/* เปลี่ยนอำเภอแล้วล้างตำบลที่เลือกไว้ */}
                                <select {...inp} value={form.district_id} onChange={e => { set('district_id', e.target.value); set('subdistrict_id', ''); }}>
                                    <option value="">-- เลือกอำเภอ --</option>
                                    {districts.map(d => <option key={d.District_id} value={d.District_id}>{d.District_name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>ตำบล/แขวง <span style={{ color: '#ef4444' }}>*</span></label>
                                <select {...inp} value={form.subdistrict_id} onChange={e => set('subdistrict_id', e.target.value)}>
                                    <option value="">-- เลือกตำบล --</option>
                                    {subdistricts.map(s => <option key={s.Subdistrict_id} value={s.Subdistrict_id}>{s.Subdistrict_name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>ประเภทกิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
                                <select {...inp} value={form.category_id} onChange={e => set('category_id', e.target.value)} required>
                                    <option value="">-- เลือกประเภท --</option>
                                    {categories.map(c => <option key={c.Category_id} value={c.Category_id}>{c.Category_name}</option>)}
                                </select>
                            </div>

                            {/* ลิงก์ Google Maps: พิมพ์เอง หรือกดเลือกจากแผนที่ (LocationPicker) */}
                            <div className="form-group full">
                                <label>URL สถานที่ (Google Maps)<span style={{ color: '#ef4444' }}>*</span></label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input {...inp} placeholder="https://goo.gl/maps/... (หรือกดเลือกจากแผนที่)" value={form.location_url} onChange={e => set('location_url', e.target.value)} style={{ flex: 1 }} />
                                    <button type="button"
                                        onClick={() => setShowMapPicker(s => !s)}
                                        disabled={isLocked}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', background: showMapPicker ? '#e0f2fe' : '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: isLocked ? 'not-allowed' : 'pointer', fontSize: '13px', fontFamily: 'Sarabun,sans-serif', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                        <MapPin size={15} /> {showMapPicker ? 'ซ่อนแผนที่' : 'เลือกจากแผนที่'}
                                    </button>
                                </div>
                                {showMapPicker && !isLocked && (
                                    <LocationPicker
                                        value={form.location_url}
                                        onSelect={(url) => set('location_url', url)}
                                        onClose={() => setShowMapPicker(false)}
                                    />
                                )}
                            </div>

                            <div className="form-group">
                                <label>วันเปิดรับสมัคร <span style={{ color: '#ef4444' }}>*</span></label>
                                {/* min = วันนี้ — กันเลือกวันที่ย้อนหลังตั้งแต่ในตัว date picker เอง */}
                                <input {...inp} type="date" min={todayStr()} value={form.reg_start}
                                    onChange={e => {
                                        const v = e.target.value;
                                        set('reg_start', v);
                                        // ถ้าวันปิดรับสมัครที่เลือกไว้เดิมย้อนหลังกว่าวันเปิดรับสมัครใหม่ ให้เคลียร์ทิ้ง
                                        // กันค่าเก่าค้างเป็นช่วงวันที่ไม่สมเหตุสมผล (ปิดก่อนเปิด)
                                        if (form.reg_end && v && form.reg_end < v) set('reg_end', '');
                                    }} required />
                            </div>

                            <div className="form-group">
                                <label>วันปิดรับสมัคร <span style={{ color: '#ef4444' }}>*</span></label>
                                {/* min = วันเปิดรับสมัคร (หรือวันนี้ถ้ายังไม่ได้เลือกวันเปิดรับ) —
                                    วันปิดรับสมัครต้องเป็นวันเดียวกับหรือหลังวันเปิดรับสมัครเท่านั้น */}
                                <input {...inp} type="date" min={form.reg_start || todayStr()} value={form.reg_end} onChange={e => set('reg_end', e.target.value)} required />
                            </div>

                            <div className="form-group">
                                <label>วันที่จัดกิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
                                {/* min = วันถัดจากวันปิดรับสมัคร */}
                                <input {...inp} type="date" min={nextDay(form.reg_end)} value={form.activity_start}
                                    onChange={e => {
                                        const v = e.target.value;
                                        set('activity_start', v);
                                        // ถ้าวันสิ้นสุดกิจกรรมที่เลือกไว้เดิมย้อนหลังกว่าวันที่จัดกิจกรรมใหม่ ให้เคลียร์ทิ้ง
                                        // กันค่าเก่าค้างเป็นช่วงวันที่ไม่สมเหตุสมผล (จบก่อนเริ่ม)
                                        if (form.activity_end && v && form.activity_end < v) set('activity_end', '');
                                    }} required />
                                <small style={{ color: '#94a3b8' }}>ต้องเป็นวันหลังวันปิดรับสมัคร</small>
                            </div>

                            <div className="form-group">
                                <label>วันที่สิ้นสุดกิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
                                {/* min = วันที่จัดกิจกรรม — วันสิ้นสุดกิจกรรมต้องไม่น้อยกว่าวันที่จัดกิจกรรม */}
                                <input {...inp} type="date" min={form.activity_start || undefined} value={form.activity_end} onChange={e => set('activity_end', e.target.value)} required />
                            </div>

                            <div className="form-group">
                                <label>เวลาทำกิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input className="form-input" type="time" disabled={isLocked || loading} value={form.time_start} onChange={e => set('time_start', e.target.value)} style={{ flex: 1 }} required />
                                    <span style={{ color: '#64748b', fontSize: '13px' }}>ถึง</span>
                                    <input className="form-input" type="time" disabled={isLocked || loading} value={form.time_end} onChange={e => set('time_end', e.target.value)} style={{ flex: 1 }} required />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>จำนวนที่รับสมัคร (คน) <span style={{ color: '#ef4444' }}>*</span></label>
                                <input {...inp} type="number" min="1" placeholder="ระบุจำนวน" value={form.capacity} onChange={e => set('capacity', e.target.value)} required />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>รายละเอียดกิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
                            <textarea {...inp} rows={4} placeholder="อธิบายรายละเอียดกิจกรรม" value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'vertical', fontFamily: 'Sarabun,sans-serif' }} required />
                        </div>

                        {/* ข้อความ error จากการตรวจข้อมูลหรือจาก backend */}
                        {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '14px' }}>{error}</div>}

                        {/* ปุ่มบันทึกร่าง / บันทึกข้อมูลส่งอนุมัติ (ซ่อนเมื่อล็อก) */}
                        {!isLocked && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => handleSave('Draft')}
                                    disabled={loading}
                                    style={{ padding: '11px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Sarabun,sans-serif', fontSize: '14px' }}>
                                    บันทึกร่าง
                                </button>
                                
                                <button 
                                    type="submit" 
                                    className="btn-primary" 
                                    disabled={loading} 
                                    style={{ opacity: loading ? 0.7 : 1 }}>
                                    {loading ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                                </button>
                            </div>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}