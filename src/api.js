/* =====================================================================
 *  ฟังก์ชันเรียก API ของ backend ผ่าน axios
 *  baseURL เป็น '/api' (Vite dev server proxy ต่อไปที่ backend)
 *  ทุกฟังก์ชันคืน Promise ของ axios — ข้อมูลจริงอยู่ที่ res.data
 * ===================================================================== */

import axios from 'axios';
import { getToken } from './authSession.js';

const api = axios.create({ baseURL: '/api' });

// แนบ token (ถ้ามี) ไปกับทุก request ที่ยิงผ่าน instance นี้ ให้สอดคล้องกับ fetch() ที่ถูก patch
// ไว้ใน main.jsx — endpoint สาธารณะที่ไม่ได้บังคับ login (เช่น /activities, /login) ไม่ได้รับผลกระทบ
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---------- กิจกรรม ----------
export const getActivities = (params = {}) => api.get('/activities', { params });              // รายการกิจกรรม (รองรับตัวกรอง)
export const getActivity = (id, params = {}) => api.get(`/activities/${id}`, { params });       // รายละเอียดกิจกรรมเดียว
export const registerActivity = (id, data) => api.post(`/activities/${id}/register`, data);   // สมัครเข้าร่วมกิจกรรม

// ---------- สถิติและประเภทกิจกรรม ----------
export const getStats = () => api.get('/stats');
export const getCategories = () => api.get('/categories');

// ---------- จังหวัด / อำเภอ / ตำบล ----------
export const getProvinces = () => api.get('/provinces');
export const getDistricts = (pid) => api.get(`/districts/${pid}`);
export const getSubdistricts = (did) => api.get(`/subdistricts/${did}`);

// ---------- เข้าสู่ระบบ / สมัครสมาชิก ----------
export const login = (data) => api.post('/login', data);
export const registerMember = (data) => api.post('/register-member', data);   // บันทึกสมาชิกใหม่ (สถานะรอยืนยัน OTP)
export const verifyMember = (email) => api.post('/verify-member', { email }); // ยืนยัน OTP สำเร็จ -> เปิดใช้งานบัญชี

// ---------- กิจกรรมของฉัน ----------
export const getMyActivities = (memberId) => api.get(`/my-activities/${memberId}`);
