/* =====================================================================
 *  ระบบแจ้งเตือน (toast) และกล่องยืนยัน (confirm) ที่ใช้ทั้งแอป
 *  ใช้แทน window.alert() / window.confirm() ของเบราว์เซอร์ ซึ่งบล็อกทั้งหน้า
 *  หน้าตาไม่เข้าธีมแอป และแยกประเภทข้อความด้วยสีไม่ได้
 *
 *  เขียนเป็น vanilla JS (ไม่ใช่ React Context) เพราะ App.jsx แยกเป็นหลาย branch
 *  (AuthModal / AdminDashboard / OrganizerDashboard / UserDashboard / หน้า landing)
 *  ไม่มีจุดเดียวที่ครอบทุก branch ไว้ให้ห่อ Provider — เรียกเป็นฟังก์ชันได้จากทุกไฟล์
 *
 *  การใช้งาน:
 *    import { notify, confirmDialog } from '../notice';
 *    notify('บันทึกข้อมูลสำเร็จ', 'success');
 *    const ok = await confirmDialog('ต้องการลบรายการนี้ใช่หรือไม่?', { danger: true });
 * ===================================================================== */

const STYLE_ID = 'rm-notice-style';  // id ของ <style> ที่ฉีดเข้า <head>
const HOST_ID = 'rm-notice-host';    // id ของกล่องที่รวม toast ทั้งหมด

// ฉีด CSS ของ toast / confirm เข้าหน้าเว็บ (ทำครั้งเดียว)
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${HOST_ID} { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 4000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; width: min(92vw, 420px); }
    .rm-toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; background: #fff; border-radius: 12px; padding: 14px 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-family: Sarabun, sans-serif; font-size: 14px; color: #1e293b; border-left: 4px solid #94a3b8; opacity: 0; transform: translateY(-12px); transition: opacity 0.25s ease, transform 0.25s ease; position: relative; overflow: hidden; cursor: pointer; }
    .rm-toast.show { opacity: 1; transform: translateY(0); }
    .rm-toast.hide { opacity: 0; transform: translateY(-8px); }
    .rm-toast.success { border-left-color: #16a34a; }
    .rm-toast.error   { border-left-color: #ef4444; }
    .rm-toast.warning { border-left-color: #d97706; }
    .rm-toast.info    { border-left-color: #0284c7; }
    .rm-toast .rm-icon { flex-shrink: 0; margin-top: 1px; line-height: 0; }
    .rm-toast.success .rm-icon { color: #16a34a; }
    .rm-toast.error   .rm-icon { color: #ef4444; }
    .rm-toast.warning .rm-icon { color: #d97706; }
    .rm-toast.info    .rm-icon { color: #0284c7; }
    .rm-toast .rm-msg { flex: 1; line-height: 1.5; white-space: pre-line; word-break: break-word; }
    .rm-toast .rm-close { flex-shrink: 0; cursor: pointer; color: #94a3b8; background: none; border: none; padding: 2px; line-height: 0; font-size: 13px; font-family: inherit; }
    .rm-toast .rm-close:hover { color: #475569; }
    .rm-toast .rm-bar { position: absolute; left: 0; bottom: 0; height: 3px; background: currentColor; opacity: 0.3; animation: rm-shrink linear forwards; }
    .rm-toast.success .rm-bar { color: #16a34a; }
    .rm-toast.error   .rm-bar { color: #ef4444; }
    .rm-toast.warning .rm-bar { color: #d97706; }
    .rm-toast.info    .rm-bar { color: #0284c7; }
    @keyframes rm-shrink { from { width: 100%; } to { width: 0%; } }

    .rm-confirm-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); z-index: 4100; display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; transition: opacity 0.2s ease; }
    .rm-confirm-overlay.show { opacity: 1; }
    .rm-confirm-card { background: #fff; border-radius: 14px; padding: 24px; width: 100%; max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,0.25); font-family: Sarabun, sans-serif; transform: scale(0.95); transition: transform 0.2s ease; }
    .rm-confirm-overlay.show .rm-confirm-card { transform: scale(1); }
    .rm-confirm-title { font-size: 17px; font-weight: 800; color: #1e293b; margin: 0 0 8px; }
    .rm-confirm-msg { font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px; white-space: pre-line; }
    .rm-confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .rm-btn { padding: 9px 18px; border-radius: 8px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
    .rm-btn-cancel { background: #fff; color: #475569; border-color: #cbd5e1; }
    .rm-btn-cancel:hover { background: #f8fafc; }
    .rm-btn-confirm { background: #2D7D46; color: #fff; }
    .rm-btn-confirm:hover { background: #256b3b; }
    .rm-btn-confirm.danger { background: #ef4444; }
    .rm-btn-confirm.danger:hover { background: #dc2626; }
  `;
  document.head.appendChild(style);
}

// คืนกล่องที่รวม toast (สร้างใหม่ถ้ายังไม่มี)
function getHost() {
  injectStyle();
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }
  return host;
}

// ไอคอน SVG ของแต่ละประเภท (วงกลม + เครื่องหมายด้านใน) ใช้สีตาม CSS ของ .rm-icon
const svgIcon = (inner) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>${inner}</svg>`;
const ICONS = {
  success: svgIcon('<path d="m8 12 3 3 5-6"/>'),               // เครื่องหมายถูก
  error:   svgIcon('<path d="m15 9-6 6"/><path d="m9 9 6 6"/>'), // เครื่องหมายกากบาท
  warning: svgIcon('<path d="M12 7v6"/><path d="M12 17h.01"/>'), // เครื่องหมายตกใจ
  info:    svgIcon('<path d="M12 11v6"/><path d="M12 7h.01"/>'), // ตัว i
};

// ระยะเวลาที่ toast แต่ละประเภทแสดงก่อนปิดเอง (มิลลิวินาที)
const DURATIONS = { success: 3200, error: 4800, warning: 4200, info: 3200 };

/**
 * แจ้งเตือนแบบ toast มุมบนกึ่งกลางจอ ปิดเองอัตโนมัติ (คลิกที่การ์ดหรือปุ่มปิดเพื่อปิดก่อนเวลาได้)
 * @param {string} message ข้อความที่จะแสดง
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 */
export function notify(message, type = 'info') {
  if (!message) return;
  const host = getHost();
  const duration = DURATIONS[type] || DURATIONS.info;

  // สร้างการ์ด toast: ไอคอน + ข้อความ + ปุ่มปิด + แถบนับเวลาถอยหลังด้านล่าง
  const el = document.createElement('div');
  el.className = `rm-toast ${type}`;
  el.innerHTML = `
    <span class="rm-icon">${ICONS[type] || ICONS.info}</span>
    <span class="rm-msg"></span>
    <button type="button" class="rm-close" aria-label="ปิด">×</button>
    <div class="rm-bar" style="animation-duration:${duration}ms"></div>
  `;
  // ใช้ textContent เสมอ (ไม่ใช่ innerHTML) กับข้อความจริง กัน markup/สคริปต์แปลกปลอมที่อาจติดมา
  // กับข้อความจาก backend (เช่น err.message ที่ยิงตรงมาจาก MySQL error)
  el.querySelector('.rm-msg').textContent = message;
  host.appendChild(el);

  // เริ่ม animation แสดงผลในเฟรมถัดไป
  requestAnimationFrame(() => el.classList.add('show'));

  // ปิด toast (กันเรียกซ้ำ) — เล่น animation ซ่อนก่อนแล้วค่อยลบออกจากหน้า
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.classList.remove('show');
    el.classList.add('hide');
    setTimeout(() => el.remove(), 250);
  };

  // ปิดเองเมื่อครบเวลา หรือเมื่อคลิกปุ่มปิด / คลิกที่การ์ด
  const timer = setTimeout(remove, duration);
  el.querySelector('.rm-close').addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(timer);
    remove();
  });
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

/**
 * กล่องยืนยัน (แทน window.confirm()) — คืนค่าเป็น Promise<boolean> ต้อง await หรือ .then() รับค่า
 * เพราะเปิด/ปิดด้วยการ animate ไม่ใช่บล็อกทั้งหน้าแบบ confirm() ของเบราว์เซอร์
 * @param {string} message ข้อความที่จะถาม
 * @param {{title?: string, confirmText?: string, cancelText?: string, danger?: boolean}} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
  injectStyle();
  const {
    title = 'ยืนยันการทำรายการ',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    danger = false,
  } = opts;

  return new Promise((resolve) => {
    // สร้างพื้นหลังมืด + การ์ดยืนยัน (ใส่ข้อความด้วย textContent กัน HTML แปลกปลอม)
    const overlay = document.createElement('div');
    overlay.className = 'rm-confirm-overlay';
    overlay.innerHTML = `
      <div class="rm-confirm-card">
        <h3 class="rm-confirm-title"></h3>
        <p class="rm-confirm-msg"></p>
        <div class="rm-confirm-actions">
          <button type="button" class="rm-btn rm-btn-cancel"></button>
          <button type="button" class="rm-btn rm-btn-confirm${danger ? ' danger' : ''}"></button>
        </div>
      </div>
    `;
    overlay.querySelector('.rm-confirm-title').textContent = title;
    overlay.querySelector('.rm-confirm-msg').textContent = message;
    overlay.querySelector('.rm-btn-cancel').textContent = cancelText;
    overlay.querySelector('.rm-btn-confirm').textContent = confirmText;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    // ปิดกล่องแล้วคืนผลให้ Promise (true = ยืนยัน, false = ยกเลิก) — กันเรียกซ้ำ
    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); }; // กด Esc = ยกเลิก

    // ปุ่มยกเลิก / ยืนยัน และคลิกพื้นหลังนอกการ์ด = ยกเลิก
    overlay.querySelector('.rm-btn-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('.rm-btn-confirm').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);
  });
}
