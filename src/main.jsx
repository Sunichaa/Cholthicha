/* =====================================================================
 *  จุดเริ่มต้นของแอปฝั่งหน้าเว็บ (React)
 *  - ติดตั้งตัวแนบ token ให้ทุก fetch() ที่เรียก backend
 *  - render <App /> ลงใน <div id="root"> ของ index.html
 * ===================================================================== */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getToken } from './authSession.js'

// แนบ token ให้อัตโนมัติกับทุก fetch() ที่เรียก path ที่มี /api/
// backend บังคับให้ส่ง header Authorization สำหรับ /api/admin/*, /api/organizer/*, /api/profile/*
// จึงครอบ window.fetch ไว้ที่นี่ที่เดียว แทนการแก้ fetch() ทีละจุดในทุกไฟล์
// (endpoint สาธารณะไม่ได้รับผลกระทบ เพราะ backend ไม่ได้ตรวจ header นี้)
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (url.includes('/api/')) {
    const token = getToken();
    if (token) {
      init = {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
      };
    }
  }
  return originalFetch(input, init);
};

// เริ่ม render แอป
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
