import { useState, useEffect } from 'react';
import { Home, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { login, registerMember, verifyMember } from '../api';
import './Navbar.css';
import './AuthModal.css';

/* =====================================================================
 *  หน้าเข้าสู่ระบบ / สมัครสมาชิก (เต็มจอ)
 *
 *  ขั้นตอนสมัครสมาชิก:
 *    1. กรอกฟอร์ม -> บันทึกลง DB ด้วยสถานะ Pending (/api/register-member)
 *    2. สุ่ม OTP 6 หลัก แล้วให้ Google Apps Script ส่งเข้าอีเมลที่กรอก
 *    3. กรอก OTP ให้ตรง -> เปลี่ยนสถานะเป็น Active (/api/verify-member)
 *    4. แสดงการ์ดสมัครสำเร็จ แล้วพากลับไปหน้าเข้าสู่ระบบ
 *
 *    mode     โหมดเริ่มต้น: 'login' | 'register'
 *    onClose  ปิดหน้านี้ (กลับหน้าแรก)
 *    onLogin  เรียกพร้อม (user, token) เมื่อเข้าสู่ระบบสำเร็จ
 * ===================================================================== */
export default function AuthModal({ mode: initialMode, onClose, onLogin }) {
  const [currentMode, setCurrentMode] = useState(initialMode || 'login'); // 'login' | 'register'

  // จัดการขั้นตอนย่อยในหน้าสมัครสมาชิก: 'fill_form' (กรอกข้อมูล) -> 'verify_otp' (กรอก OTP)
  const [registerStep, setRegisterStep] = useState('fill_form');
  const [generatedOtp, setGeneratedOtp] = useState(''); // เก็บ OTP ที่สุ่มขึ้นมาฝั่ง Frontend

  // ข้อมูลในฟอร์ม (ใช้ร่วมกันทั้งหน้าเข้าสู่ระบบและสมัครสมาชิก)
  const [formData, setFormData] = useState({
    role: '', // เก็บประเภทสมาชิก: 'participant' หรือ 'organizer'
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: ''
  });

  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']); // รหัส OTP ที่ผู้ใช้กรอก 6 ช่อง
  const [showPassword, setShowPassword] = useState(false);          // แสดง/ซ่อนรหัสผ่าน
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [phoneError, setPhoneError] = useState('');                 // เตือนเมื่อพิมพ์เบอร์โทรที่ไม่ใช่ตัวเลข
  const [otpNotice, setOtpNotice] = useState('');                   // แจ้งว่าเพิ่งส่ง OTP ไปที่อีเมลแล้ว
  const [registerDone, setRegisterDone] = useState(false);          // สมัครสำเร็จ -> แสดงการ์ดสำเร็จ

  // เปลี่ยนโหมดตาม prop ที่ส่งเข้ามา และกลับไปขั้นกรอกฟอร์มเสมอ
  useEffect(function () {
    if (initialMode) {
      setCurrentMode(initialMode);
      setRegisterStep('fill_form'); // รีเซ็ตสเต็ปกลับมาหน้าฟอร์มเมื่อเปลี่ยนโหมด
    }
  }, [initialMode]);

  // อัปเดตค่าช่องใดช่องหนึ่งในฟอร์ม
  const handleInputChange = function (inputKey, inputValue) {
    setFormData(function (previousFormState) {
      return { ...previousFormState, [inputKey]: inputValue };
    });
  };

  // ─── 1. เข้าสู่ระบบ ───
  // สำเร็จ: ส่ง user และ token ให้ App.jsx บันทึก session แล้วปิดหน้านี้
  // ไม่สำเร็จ: แสดงข้อความจาก backend (เช่น รหัสผิด / บัญชีถูกระงับ / ยังไม่ยืนยัน OTP)
const handleLoginSubmit = async function (event) {
  event.preventDefault();
  if (!formData.email || !formData.password) {
    setErrorMessage('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน');
    return;
  }
  setIsLoading(true);
  setErrorMessage('');

  try {
    const response = await login({
      email: formData.email,
      password: formData.password
    });

    if (onLogin) onLogin(response.data.user, response.data.token);
    if (onClose) onClose();
  } catch (error) {
    const serverMessage = error.response?.data?.message;
    setErrorMessage(serverMessage || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  } finally {
    setIsLoading(false);
  }
};

  // ─── 2. ส่งข้อมูลสมัครสมาชิก (และส่ง OTP ทางอีเมล) ───
  // URL ของ Google Apps Script ที่ใช้ส่งอีเมล OTP (ถ้า deploy สคริปต์ใหม่ต้องเปลี่ยนตรงนี้)
  // เป็นคนละสคริปต์กับที่ server ใช้ส่งอีเมลแจ้งเตือนกิจกรรม (server/gas/cancel-notify.gs)
  // อีเมล OTP ส่งจากหน้าเว็บตรงไปที่ Apps Script เลย ไม่ผ่าน server ของเรา
  // สคริปต์รับ { email, otp, first_name } แล้วส่งอีเมลที่มีรหัส OTP ไปให้ผู้สมัคร
  const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxcNFW3b4204k-pKOEz0dQRIjU5v5Rtsmvun2V9cbUv2DY829VWafOmrs30_JWYoseJ/exec";

  // ตรวจฟอร์ม -> บันทึกสมาชิก (Pending) -> สุ่ม OTP -> ส่งอีเมล -> ไปขั้นกรอก OTP
  // ปุ่ม "ส่งอีกครั้ง" ในขั้นกรอก OTP ก็เรียกฟังก์ชันนี้ (ได้ OTP ชุดใหม่)
  const handleRegisterFormSubmit = async function (event) {
    event.preventDefault();
    if (!formData.role) {
      setErrorMessage('กรุณาเลือกประเภทสมาชิก');
      return;
    }
    if (!formData.first_name || !formData.last_name || !formData.email || !formData.password || !formData.phone) {
      setErrorMessage('กรุณากรอกข้อมูลในช่องที่จำเป็นให้ครบถ้วน'); 
      return;
    }

    setIsLoading(true); 
    setErrorMessage('');

    // 1. บันทึกลงฐานข้อมูลก่อนด้วยสถานะ Pending — ถ้าอีเมลซ้ำ server จะตอบกลับมาตรงนี้
    //    และเราจะไม่ส่งอีเมล OTP ต่อ
    try {
      await registerMember(formData);
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
      setIsLoading(false);
      return;
    }

    // 2. สุ่มรหัส OTP 6 หลักฝั่งหน้าเว็บ แล้วเก็บไว้ตรวจในขั้นถัดไป
    const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(randomOtp); // จำค่ารหัสนี้ไว้ใน State เอาไว้ตรวจตอนหน้าถัดไป
    setOtpCode(['', '', '', '', '', '']); // ล้างค่าในช่องกรอก OTP ให้ว่างก่อนเสมอ

    try {
      // 3. ให้ Google Apps Script ส่งอีเมล OTP ไปที่อีเมลที่กรอกในฟอร์ม
      //    mode: "no-cors" ทำให้เบราว์เซอร์ยอมส่งคำขอข้ามโดเมนไปที่ Google ได้
      //    แต่อ่านผลตอบกลับไม่ได้ จึงไม่รู้ว่าอีเมลส่งสำเร็จจริงหรือไม่ —
      //    ถ้าส่งคำขอออกไปได้ก็ถือว่าสำเร็จ และไปขั้นกรอก OTP ต่อเลย
      await fetch(GAS_WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,      // อีเมลที่ผู้ใช้กรอกในหน้าจอสมัคร
          otp: randomOtp,             // รหัส OTP ที่สุ่มขึ้นเมื่อกี้
          first_name: formData.first_name
        }),
      });

      // 4. ส่งเสร็จ -> สลับไปหน้ากรอก OTP
      setOtpNotice('ส่งรหัส OTP ฉบับใหม่ไปที่ ' + formData.email + ' แล้ว ');
      setRegisterStep('verify_otp');
    } catch (error) {
      setErrorMessage('เกิดข้อผิดพลาดในการส่งรหัสยืนยัน กรุณาลองใหม่อีกครั้ง');
    } finally { 
      setIsLoading(false); 
    }
  };

  // ─── 3. ยืนยันรหัส OTP ───
  // เทียบกับ OTP ที่สุ่มไว้ ถ้าตรง -> เปิดใช้งานบัญชี -> แสดงการ์ดสำเร็จ -> กลับหน้าเข้าสู่ระบบ
const handleVerifyOtpSubmit = async function (event) {
  event.preventDefault();
  const userEnteredOtp = otpCode.join('');
  
  if (userEnteredOtp.length < 6) {
    setErrorMessage('กรุณากรอกรหัส OTP ให้ครบทั้ง 6 หลัก');
    return;
  }

  setIsLoading(true);
  setErrorMessage('');

  // ตรวจเช็คความถูกต้องของ OTP
  if (userEnteredOtp === generatedOtp) {
    
    try {
      // 1. OTP ถูกต้อง -> เปลี่ยน Member_status จาก Pending เป็น Active
      await verifyMember(formData.email);

      // 2. แสดงการ์ดสมัครสำเร็จ
      setRegisterDone(true);

      // 3. รอ 1.8 วินาทีให้เห็นการ์ด แล้วล้างฟอร์มและกลับไปหน้าเข้าสู่ระบบ
      setTimeout(() => {
        setRegisterDone(false);
        setCurrentMode('login');
        setRegisterStep('fill_form');
        setErrorMessage('');
        setOtpCode(['', '', '', '', '', '']);
        setFormData({
          role: '',
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          password: ''
        });
      }, 1800);

    } catch (error) {
      const serverMessage = error.response?.data?.message;
      setErrorMessage(serverMessage || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }

  } else {
    setErrorMessage('รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบจากอีเมลของคุณอีกครั้ง');
    setIsLoading(false);
  }
};

  // พิมพ์ตัวเลขในช่อง OTP: รับเฉพาะตัวเลข 1 หลักต่อช่อง แล้วเลื่อนไปช่องถัดไปอัตโนมัติ
  const handleOtpInputChange = function (index, value) {
    if (value && isNaN(value)) return; // รับเฉพาะตัวเลขเท่านั้น

    const newOtp = [...otpCode];
    newOtp[index] = value.substring(value.length - 1); // เอาเฉพาะตัวอักษรล่าสุดที่พิมพ์
    setOtpCode(newOtp);

    // Auto Focus ขยับไปข้างหน้าเมื่อพิมพ์เลขเสร็จ
    if (value && index < 5) {
      const nextInput = document.querySelector(`input[name="otp-${index + 1}"]`);
      if (nextInput) nextInput.focus();
    }
  };

  // กด Backspace ในช่องที่ว่างอยู่: ถอยกลับไปช่องก่อนหน้า
  const handleOtpKeyDown = function (index, event) {
    if (event.key === 'Backspace' && !otpCode[index] && index > 0) {
      const previousInput = document.querySelector(`input[name="otp-${index - 1}"]`);
      if (previousInput) {
        previousInput.focus();
      }
    }
  };

  return (
    <div className="fullscreen-auth-container">
      {/* ─── แถบด้านบน: โลโก้ + ปุ่มกลับหน้าแรก ─── */}
      <nav className="navbar auth-top-navbar">
        <div className="nav-inner">
          <a href="/" className="nav-brand">
            <div className="brand-icon">
              <img src="/logo.png" alt="Logo" className="brand-logo-img"
                onError={e => { e.target.style.display = 'none'; }} />
            </div>
            <div className="brand-text">
              <span className="brand-th">ระบบสารสนเทศ</span>
              <span className="brand-sub">การเข้าร่วมกิจกรรมจิตอาสา</span>
            </div>
          </a>
          <button className="btn-home-nav" onClick={onClose}>
            <Home size={16} />
          </button>
        </div>
      </nav>

      {/* ─── พื้นที่จัดการฟอร์มเนื้อหาตรงกลาง ─── */}
      <div className="auth-center-content">

        {/* โหมดเข้าสู่ระบบ: อีเมล + รหัสผ่าน */}
        {currentMode === 'login' && (
          <div className="auth-card-wrapper login-card-width">
            <div className="auth-card-title">เข้าสู่ระบบ</div>
            <form className="auth-core-form" onSubmit={handleLoginSubmit}>
              <label className="form-item-block">
                <div className="label-wrapper-row">
                  <span>อีเมล</span><span className="req">*</span>
                </div>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={function (e) { handleInputChange('email', e.target.value); }}
                />
              </label>

              <label className="form-item-block password-input-container">
                <div className="label-wrapper-row">
                  <span>รหัสผ่าน</span><span className="req">*</span>
                </div>
                <div className="input-with-icon-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="รหัสผ่าน"
                    value={formData.password}
                    onChange={function (e) { handleInputChange('password', e.target.value); }}
                  />
                  <button
                    type="button"
                    className="btn-toggle-eye"
                    onClick={function () { setShowPassword(!showPassword); }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              {errorMessage && <p className="form-error-msg">{errorMessage}</p>}

              <button type="submit" className="btn-blue-submit" disabled={isLoading}>
                {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>

              <p className="switch-auth-mode-text">
                ยังไม่มีบัญชี? <button type="button" className="btn-link" onClick={function () { setCurrentMode('register'); setRegisterStep('fill_form'); setErrorMessage(''); }}>สมัครสมาชิกที่นี่</button>
              </p>
            </form>
          </div>
        )}

        {/* โหมดสมัครสมาชิก: กรอกฟอร์ม -> กรอก OTP -> การ์ดสำเร็จ */}
        {currentMode === 'register' && (
          <div className="auth-card-wrapper register-card-width">

            {registerStep === 'fill_form' ? (
              /* ─── ขั้นตอนย่อยที่ 1: หน้ากรอกฟอร์มสมัครสมาชิก ─── */
              <>
                <div className="auth-card-title">สมัครสมาชิก</div>
                <form className="auth-core-form" onSubmit={handleRegisterFormSubmit}>

                  {/* Dropdown ประเภทสมาชิก */}
                  <label className="form-item-block">
                    <div className="label-wrapper-row">
                      <span>ประเภทสมาชิก</span><span className="req">*</span>
                    </div>
                    <select
                      className="auth-dropdown-select"
                      value={formData.role}
                      onChange={function (e) { handleInputChange('role', e.target.value); }}
                    >
                      <option value="">-- เลือกประเภทสมาชิก --</option>
                      <option value="participant">สมาชิกผู้เข้าร่วมกิจกรรมจิตอาสา</option>
                      <option value="organizer">สมาชิกผู้จัดกิจกรรมจิตอาสา</option>
                    </select>
                  </label>

                  {/* แถวคู่ ชื่อ - นามสกุล */}
                  <div className="form-item-row-grid">
                    <label className="form-item-block">
                      <div className="label-wrapper-row">
                        <span>ชื่อ</span><span className="req">*</span>
                      </div>
                      <input
                        type="text"
                        placeholder="ชื่อ"
                        value={formData.first_name}
                        onChange={function (e) { handleInputChange('first_name', e.target.value); }}
                      />
                    </label>
                    <label className="form-item-block">
                      <div className="label-wrapper-row">
                        <span>นามสกุล</span><span className="req">*</span>
                      </div>
                      <input
                        type="text"
                        placeholder="นามสกุล"
                        value={formData.last_name}
                        onChange={function (e) { handleInputChange('last_name', e.target.value); }}
                      />
                    </label>
                  </div>

                  {/* เบอร์โทรศัพท์: เก็บเฉพาะตัวเลข ไม่เกิน 10 หลัก */}
                  <label className="form-item-block">
                    <div className="label-wrapper-row">
                      <span>เบอร์โทรศัพท์</span><span className="req">*</span>
                    </div>
                    <input
                      type="tel"
                      placeholder="เช่น 0812345678"
                      maxLength={10}
                      value={formData.phone}
                      onChange={function (e) {
                        var raw = e.target.value;
                        // ถ้ามีตัวอักษรที่ไม่ใช่ตัวเลขปนมา ให้แจ้งเตือน (และตัดออกไม่ให้เก็บลงช่อง)
                        setPhoneError(/\D/.test(raw) ? 'เบอร์โทรศัพท์ต้องเป็นตัวเลขเท่านั้น' : '');
                        handleInputChange('phone', raw.replace(/\D/g, '').slice(0, 10));
                      }}
                    />
                    {phoneError && <p className="form-error-msg">{phoneError}</p>}
                  </label>

                  <label className="form-item-block">
                    <div className="label-wrapper-row">
                      <span>อีเมล</span><span className="req">*</span>
                    </div>
                    <input
                      type="email"
                      placeholder="example@mail.com"
                      value={formData.email}
                      onChange={function (e) { handleInputChange('email', e.target.value); }}
                    />
                  </label>

                  <label className="form-item-block password-input-container">
                    <div className="label-wrapper-row">
                      <span>รหัสผ่าน</span><span className="req">*</span>
                    </div>
                    <div className="input-with-icon-wrapper">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="รหัสผ่าน 8 ตัวขึ้นไป"
                        value={formData.password}
                        onChange={function (e) { handleInputChange('password', e.target.value); }}
                      />
                      <button
                        type="button"
                        className="btn-toggle-eye"
                        onClick={function () { setShowPassword(!showPassword); }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>

                  {errorMessage && <p className="form-error-msg">{errorMessage}</p>}

                  <button type="submit" className="btn-blue-submit" disabled={isLoading}>
                    {isLoading ? 'กำลังประมวลผล...' : 'ยืนยัน'}
                  </button>

                  <p className="switch-auth-mode-text">
                    มีบัญชีแล้ว? <button type="button" className="btn-link" onClick={function () { setCurrentMode('login'); setErrorMessage(''); }}>เข้าสู่ระบบที่นี่</button>
                  </p>
                </form>
              </>
            ) : registerDone ? (
              /* ─── การ์ดแจ้งสมัครสมาชิกสำเร็จ ─── */
              <div className="otp-view-wrapper" style={{ textAlign: 'center', padding: '32px 16px' }}>
                <CheckCircle size={56} color="#16a34a" style={{ marginBottom: '16px' }} />
                <div className="auth-card-title">สมัครสมาชิกสำเร็จ</div>
                <p className="otp-subheading-text">ยืนยันอีเมลเรียบร้อยแล้ว กำลังพาไปหน้าเข้าสู่ระบบ...</p>
              </div>
            ) : (
              /* ─── ขั้นตอนย่อยที่ 2: หน้ากรอกรหัส OTP เต็มจอ ─── */
              <div className="otp-view-wrapper">
                <div className="auth-card-title">ยืนยันรหัส OTP</div>
                <p className="otp-subheading-text">รหัสผ่านชั่วคราวถูกส่งไปที่อีเมลของคุณแล้ว</p>
                {otpNotice && <p className="otp-subheading-text" style={{ color: '#16a34a' }}>{otpNotice}</p>}

                <form onSubmit={handleVerifyOtpSubmit}>
                  <div className="otp-fields-row-container">
                    {otpCode.map(function (digit, idx) {
                      return (
                        <input
                          key={idx}
                          name={`otp-${idx}`} /* ใช้ name ให้ฟังก์ชันเลื่อน focus หาช่องถัดไป/ก่อนหน้าเจอ */
                          className="otp-single-box"
                          type="text"
                          maxLength="1"
                          value={digit}
                          onChange={function (e) { handleOtpInputChange(idx, e.target.value); }}
                          onKeyDown={function (e) { handleOtpKeyDown(idx, e); }}
                          onFocus={function (e) { e.target.select(); }} /* โฟกัสแล้วเลือกตัวเลขเดิม พิมพ์ทับได้เลย */
                        />
                      );
                    })}
                  </div>

                  {errorMessage && <p className="form-error-msg">{errorMessage}</p>}

                  <button type="submit" className="btn-blue-submit" disabled={isLoading}>
                    {isLoading ? 'กำลังตรวจสอบ...' : 'ยืนยันการสมัคร'}
                  </button>

                  <p className="otp-resend-footer-text">
                    ไม่ได้รับรหัส? <button type="button" className="btn-link-resend" onClick={handleRegisterFormSubmit}>ส่งอีกครั้ง</button>
                  </p>
                </form>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}