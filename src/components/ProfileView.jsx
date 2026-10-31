import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, ShieldCheck, Edit3, Save, RefreshCw, AlertCircle } from 'lucide-react';
import './ProfileView.css';

/* =====================================================================
 *  หน้าโปรไฟล์ (ใช้ทั้งฝั่งผู้เข้าร่วมและผู้จัดกิจกรรม)
 *  ดู/แก้ไข ชื่อ นามสกุล เบอร์โทร และสลับบทบาท (ผู้เข้าร่วม <-> ผู้จัดกิจกรรม)
 *  ถ้าเปลี่ยนบทบาท จะถามยืนยันก่อนสลับไปหน้าของบทบาทใหม่
 *    user          ผู้ใช้ที่ login อยู่
 *    onRoleChange  เรียกพร้อม (role ใหม่, token ใหม่) เมื่อยืนยันสลับบทบาท
 * ===================================================================== */

// บทบาทที่เลือกได้ในหน้าโปรไฟล์ (value ตรงกับคอลัมน์ Role ใน DB)
const ROLE_OPTIONS = [
    { value: 'Volunteer', label: 'สมาชิกผู้เข้าร่วมกิจกรรม' },
    { value: 'Organizer', label: 'สมาชิกผู้จัดกิจกรรม' },
];

// แปลงค่า role รูปแบบต่าง ๆ ให้เหลือ 'Volunteer' หรือ 'Organizer'
function normalizeRole(role) {
    if (!role) return 'Volunteer';
    const r = String(role).trim().toLowerCase();
    if (r.includes('organizer') || r.includes('ผู้จัด')) return 'Organizer';
    return 'Volunteer';
}

// ชื่อบทบาทภาษาไทยสำหรับแสดงผล
function getRoleLabel(val) {
    const normalized = normalizeRole(val);
    return ROLE_OPTIONS.find(r => r.value === normalized)?.label || val || '-';
}

export default function ProfileView({ user, onRoleChange }) {
    const [profile, setProfile] = useState(null);       // ข้อมูลที่บันทึกแล้ว (ใช้แสดงผล)
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);  // อยู่ในโหมดแก้ไขหรือไม่
    const [formData, setFormData] = useState({});       // ข้อมูลในช่องกรอกระหว่างแก้ไข
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');             // ข้อความบันทึกสำเร็จ

    // Modal ยืนยันการสลับบทบาท
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingRole, setPendingRole] = useState('');     // บทบาทใหม่ที่รอยืนยัน
    const [pendingToken, setPendingToken] = useState(null); // token ใหม่จาก backend ที่รอยืนยัน

    // ---------- โหลดข้อมูลโปรไฟล์ ----------
    // ดึงข้อมูลล่าสุดจาก /api/member/:id ถ้าไม่มี Member_id หรือโหลดไม่สำเร็จ ใช้ข้อมูลจาก user แทน
    useEffect(() => {
        const initialStatus = normalizeRole(user?.Role || user?.role || user?.Member_type);

        if (!user?.Member_id) {
            if (user) {
                const d = {
                    firstName: user.First_name || user.first_name || '',
                    lastName: user.Last_name || user.last_name || '',
                    email: user.Email || user.email || '',
                    phone: user.Phone_number || user.phone || '',
                    status: initialStatus,
                };
                setProfile(d); setFormData(d);
            }
            setIsLoading(false);
            return;
        }

        fetch(`http://localhost:5000/api/member/${user.Member_id}`)
            .then(r => r.json())
            .then(res => {
                if (res.success && res.data) {
                    const fetchedStatus = normalizeRole(res.data.Role || res.data.role || initialStatus);
                    const d = {
                        firstName: res.data.First_name || user.First_name || '',
                        lastName: res.data.Last_name || user.Last_name || '',
                        email: res.data.Email || user.Email || '',
                        phone: res.data.Phone_number || user.Phone_number || '',
                        status: fetchedStatus,
                    };
                    setProfile(d); setFormData(d);
                }
            })
            .catch(() => {
                const d = {
                    firstName: user.First_name || '',
                    lastName: user.Last_name || '',
                    email: user.Email || '',
                    phone: user.Phone_number || '',
                    status: initialStatus,
                };
                setProfile(d); setFormData(d);
            })
            .finally(() => setIsLoading(false));
    }, [user]);

    // ---------- บันทึกข้อมูลโปรไฟล์ ----------
    // บันทึกสำเร็จ: ถ้าเปลี่ยนบทบาท -> เปิด Modal ยืนยันการสลับหน้า, ถ้าไม่เปลี่ยน -> แสดงข้อความสำเร็จ
    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            const res = await fetch('http://localhost:5000/api/profile/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: profile.email,
                    first_name: formData.firstName,
                    last_name: formData.lastName,
                    phone: formData.phone,
                    status: formData.status,
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'บันทึกไม่สำเร็จ');

            const isStatusChanged = formData.status !== profile.status;
            const newProfile = { ...profile, ...formData };

            setProfile(newProfile);
            setIsEditing(false);

            // เปลี่ยนบทบาท: เก็บ token ใหม่ที่ backend ออกให้ตาม role ล่าสุดไว้ใช้ตอนยืนยันสลับหน้า
            // (token เดิมยังมี role เก่าติดอยู่ จะถูก backend ปฏิเสธถ้าใช้เข้าเมนูของ role ใหม่)
            if (isStatusChanged) {
                setPendingRole(formData.status);
                setPendingToken(result.token || null);
                setShowConfirmModal(true);
            } else {
                setToast('บันทึกข้อมูลสำเร็จ');
                setTimeout(() => setToast(''), 3000);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // ปุ่ม "ตกลง" ใน Modal: สลับไปหน้าของบทบาทใหม่
    const handleConfirmSwitch = () => {
        setShowConfirmModal(false);
        if (onRoleChange && pendingRole) {
            onRoleChange(pendingRole, pendingToken);
        }
    };

    // ปุ่ม "ยกเลิก" ใน Modal: อยู่หน้าเดิม (ข้อมูลบันทึกไปแล้ว บทบาทใหม่มีผลเมื่อ login ครั้งถัดไป)
    const handleCancelSwitch = () => {
        setShowConfirmModal(false);
        setToast('บันทึกข้อมูลเรียบร้อยแล้ว');
        setTimeout(() => setToast(''), 3000);
    };

    // กำลังโหลด / ไม่พบข้อมูลผู้ใช้
    if (isLoading) return (
        <div className="profile-viewport-container">
            <div style={{ textAlign: 'center', padding: '60px', color: '#6B7280' }}>
                กำลังโหลดข้อมูล...
            </div>
        </div>
    );

    if (!profile) return (
        <div className="profile-viewport-container">
            <div style={{ textAlign: 'center', padding: '60px', color: '#EF4444' }}>
                ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่
            </div>
        </div>
    );

    const avatarLetter = profile.firstName?.charAt(0).toUpperCase() || profile.email?.charAt(0).toUpperCase() || 'U'; // ตัวอักษรในวงกลมรูปโปรไฟล์
    const roleChanged = isEditing && formData.status !== profile.status; // กำลังเลือกบทบาทใหม่อยู่

    return (
        <div className="profile-viewport-container">
            <div className="profile-main-card">

                {/* รูปโปรไฟล์ (ตัวอักษรแรกของชื่อ) + ชื่อ + ป้ายบทบาท */}
                <div className="profile-hero-section">
                    <div className="profile-avatar-circle">
                        <span>{avatarLetter}</span>
                    </div>
                    <div className="profile-hero-info">
                        <h2>{profile.firstName} {profile.lastName}</h2>
                        <span className="profile-status-badge">
                            <ShieldCheck size={14} />
                            {getRoleLabel(profile.status)}
                        </span>
                    </div>
                </div>

                <hr className="profile-divider-line" />

                {/* ข้อความบันทึกสำเร็จ */}
                {toast && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '10px 14px', borderRadius: '10px', marginBottom: '16px', fontSize: '14px', fontWeight: '600' }}>
                        {toast}
                    </div>
                )}

                {/* ข้อมูลโปรไฟล์: โหมดดู = กล่องข้อความ, โหมดแก้ไข = ช่องกรอก (อีเมลแก้ไม่ได้) */}
                <form onSubmit={handleSave}>
                    <div className="profile-details-grid">

                        <div className="profile-info-item">
                            <label><User size={15} /> ชื่อ</label>
                            {isEditing
                                ? <input className="info-input-field" type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} required />
                                : <div className="info-value-box">{profile.firstName || '-'}</div>}
                        </div>

                        <div className="profile-info-item">
                            <label><User size={15} /> นามสกุล</label>
                            {isEditing
                                ? <input className="info-input-field" type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
                                : <div className="info-value-box">{profile.lastName || '-'}</div>}
                        </div>

                        {/* สถานะสมาชิก (บทบาท) — ถ้าเลือกบทบาทใหม่จะแสดงข้อความแจ้งว่าจะสลับหน้าหลังบันทึก */}
                        <div className="profile-info-item">
                            <label><ShieldCheck size={15} /> สถานะสมาชิก</label>
                            {isEditing ? (
                                <div>
                                    <select
                                        className="info-input-field"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {ROLE_OPTIONS.map(r => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                    {roleChanged && (
                                        <div style={{ marginTop: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <RefreshCw size={12} />
                                            หลังบันทึก จะมีการยืนยันเพื่อสลับไปหน้า{getRoleLabel(formData.status)}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="info-value-box highlight-status">
                                    {getRoleLabel(profile.status)}
                                </div>
                            )}
                        </div>

                        <div className="profile-info-item">
                            <label><Mail size={15} /> อีเมล <span className="required-star">*</span></label>
                            <div className="info-value-box">{profile.email}</div>
                        </div>

                        {/* เบอร์โทรศัพท์: เก็บเฉพาะตัวเลข ไม่เกิน 10 หลัก */}
                        <div className="profile-info-item full-width-field">
                            <label><Phone size={15} /> เบอร์โทรศัพท์</label>
                            {isEditing
                                ? <input className="info-input-field" type="text" maxLength={10} value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                                : <div className="info-value-box">{profile.phone || '-'}</div>}
                        </div>

                    </div>

                    {error && (
                        <div style={{ color: '#EF4444', background: '#FEF2F2', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px' }}>
                            {error}
                        </div>
                    )}

                    {/* ปุ่ม: โหมดดู = "แก้ไขข้อมูล", โหมดแก้ไข = "ยกเลิก" (คืนค่าเดิม) + "บันทึกข้อมูล" */}
                    <div className="profile-actions-area">
                        {isEditing ? (
                            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                                <button type="button" className="btn-profile-cancel" style={{ flex: 1 }}
                                    onClick={() => { setIsEditing(false); setFormData(profile); setError(''); }}>
                                    ยกเลิก
                                </button>
                                <button type="submit" className="btn-profile-save" style={{ flex: 1 }} disabled={saving}>
                                    <Save size={16} /> {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                                </button>
                            </div>
                        ) : (
                            <button type="button" className="btn-edit-profile-submit" onClick={() => setIsEditing(true)}>
                                <Edit3 size={16} /> <span>แก้ไขข้อมูล</span>
                            </button>
                        )}
                    </div>
                </form>

            </div>

            {/* Modal ยืนยันการสลับไปหน้าของบทบาทใหม่ */}
            {showConfirmModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(3px)',
                    animation: 'fadeIn 0.2s ease-in-out'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '24px',
                        maxWidth: '420px',
                        width: '90%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        textAlign: 'center',
                        fontFamily: 'Sarabun, sans-serif'
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            background: '#FEF3C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px auto',
                            color: '#D97706'
                        }}>
                            <AlertCircle size={32} />
                        </div>

                        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '700', color: '#1F2937' }}>
                            ยืนยันการสลับหน้าใช้งาน
                        </h3>

                        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#4B5563', lineHeight: '1.5' }}>
                            เมื่อทำการบันทึกข้อมูล ระบบจะสลับไปหน้า <strong style={{ color: '#1B5E35' }}>"{getRoleLabel(pendingRole)}"</strong> คุณต้องการดำเนินการต่อหรือไม่?
                        </p>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={handleCancelSwitch}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #D1D5DB',
                                    background: '#FFFFFF',
                                    color: '#374151',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSwitch}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#1B5E35',
                                    color: '#FFFFFF',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                ตกลง
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}