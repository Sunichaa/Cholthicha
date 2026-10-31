import { useState } from 'react';
import { UserPlus, Eye, EyeOff, CheckCircle } from 'lucide-react';
import './AdminDashboard.css';

/* =====================================================================
 *  หน้าเพิ่มผู้ดูแลระบบใหม่ (แอดมิน)
 *  กรอก ชื่อ / นามสกุล / อีเมล / รหัสผ่าน (อย่างน้อย 8 ตัว) แล้วบันทึกลงตาราง admin
 * ===================================================================== */
export default function AdminAddUser() {
    const [form, setForm] = useState({ first_name:'', last_name:'', email:'', password:'' });
    const [showPw, setShowPw] = useState(false); // แสดง/ซ่อนรหัสผ่าน
    const [loading, setLoading] = useState(false);
    const [error, setError]   = useState('');
    const [done, setDone]     = useState(false); // เพิ่มสำเร็จ -> แสดงข้อความสำเร็จ

    // อัปเดตค่าช่องใดช่องหนึ่งในฟอร์ม
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    // ส่งฟอร์ม: ตรวจความยาวรหัสผ่าน -> POST /api/admin/add-admin -> สำเร็จแล้วล้างฟอร์ม
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.password.length < 8) { setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
        setLoading(true); setError('');
        try {
            const res = await fetch('http://localhost:5000/api/admin/add-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            setDone(true);
            setForm({ first_name:'', last_name:'', email:'', password:'' });
        } catch(err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2 className="section-title">เพิ่มผู้ดูแลระบบใหม่</h2>
            <p className="section-sub">กรุณากรอกข้อมูลให้ครบถ้วนเพื่อสร้างสิทธิ์การเข้าถึงระบบ</p>

            <div className="form-card" style={{ margin: '0 auto' }}>
                {/* ไอคอน + หัวข้อการ์ด */}
                <div style={{ textAlign:'center', marginBottom:'24px' }}>
                    <div style={{ width:'64px',height:'64px',background:'#dbeafe',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px' }}>
                        <UserPlus size={28} color="#3b82f6" />
                    </div>
                    <h3 style={{ fontSize:'18px',fontWeight:'700',color:'#1e293b' }}>เพิ่มผู้ดูแลระบบใหม่</h3>
                    <p style={{ fontSize:'13px',color:'#64748b',marginTop:'4px' }}>กรุณากรอกข้อมูลให้ครบถ้วนเพื่อสร้างสิทธิ์การเข้าถึงระบบ</p>
                </div>

                {/* ข้อความเพิ่มสำเร็จ */}
                {done && (
                    <div style={{ display:'flex',alignItems:'center',gap:'8px',background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#16a34a',padding:'12px 16px',borderRadius:'10px',marginBottom:'20px',fontSize:'14px',fontWeight:'600' }}>
                        <CheckCircle size={16} /> เพิ่มผู้ดูแลระบบสำเร็จแล้ว
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>ชื่อ <span style={{ color:'#ef4444' }}>*</span></label>
                            <input className="form-input" placeholder="กรุณากรอกชื่อ" value={form.first_name} onChange={e=>set('first_name',e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>นามสกุล <span style={{ color:'#ef4444' }}>*</span></label>
                            <input className="form-input" placeholder="กรุณากรอกนามสกุล" value={form.last_name} onChange={e=>set('last_name',e.target.value)} required />
                        </div>
                        <div className="form-group full">
                            <label>อีเมล (Email) <span style={{ color:'#ef4444' }}>*</span></label>
                            <input className="form-input" type="email" placeholder="example@mail.com" value={form.email} onChange={e=>set('email',e.target.value)} required />
                        </div>
                        <div className="form-group full">
                            <label>รหัสผ่าน (Password) <span style={{ color:'#ef4444' }}>*</span></label>
                            <div style={{ position:'relative' }}>
                                <input className="form-input" type={showPw?'text':'password'} placeholder="ระบุรหัสผ่านอย่างน้อย 8 ตัวอักษร" value={form.password} onChange={e=>set('password',e.target.value)} style={{ width:'100%',paddingRight:'40px' }} required />
                                <button type="button" onClick={()=>setShowPw(!showPw)}
                                    style={{ position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#64748b' }}>
                                    {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div style={{ background:'#fef2f2',border:'1px solid #fca5a5',color:'#dc2626',padding:'10px 14px',borderRadius:'8px',fontSize:'14px',margin:'16px 0' }}>
                            {error}
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={loading} style={{ width:'100%',marginTop:'20px',opacity:loading?0.7:1 }}>
                        {loading ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                    </button>
                </form>
            </div>
        </div>
    );
}
