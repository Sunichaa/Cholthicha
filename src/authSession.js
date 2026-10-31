/* =====================================================================
 *  จัดเก็บ session ของผู้ใช้ที่ login อยู่ (ข้อมูลผู้ใช้ + token) ใน localStorage
 *  - ทำให้รีเฟรชหน้าแล้วไม่หลุด login
 *  - main.jsx และ api.js ใช้ getToken() หยิบ token ไปแนบกับทุก request
 * ===================================================================== */

const STORAGE_KEY = 'ruamasa_session';

// บันทึก session หลัง login หรือหลังได้ token ใหม่
export function saveSession(user, token) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  } catch {
    // localStorage ใช้ไม่ได้ (เช่น โหมด private) ก็ปล่อยผ่าน ผู้ใช้แค่ต้อง login ใหม่ตอนรีเฟรช
  }
}

// อ่าน session ที่บันทึกไว้ คืน { user, token } หรือ null ถ้าไม่มี
export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ลบ session ตอนออกจากระบบ
export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // เพิกเฉย
  }
}

// token ของผู้ใช้ที่ login อยู่ (ไม่มีคืน null)
export function getToken() {
  return loadSession()?.token || null;
}
