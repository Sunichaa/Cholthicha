import { useEffect, useState } from 'react';
import './HeroBanner.css';

/* =====================================================================
 *  สไลด์แบนเนอร์ด้านบนหน้าแรก
 *  ดึงกิจกรรมที่มีรูปและเปิดรับสมัครอยู่ (สุ่ม 3 รายการจาก /api/slides)
 *  เลื่อนรูปอัตโนมัติทุก 5 วินาที และกดจุดด้านล่างเพื่อเปลี่ยนรูปเองได้
 * ===================================================================== */

// รูปสำรอง ใช้เมื่อกิจกรรมไม่มีรูปหรือลิงก์รูปเสีย
const DEFAULT_BANNER = 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1400&q=80';

export default function HeroSlider() {
  const [slides, setSlides] = useState([]);            // ข้อมูลสไลด์ { Activity_id, img, title, sub }
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0); // ลำดับสไลด์ที่แสดงอยู่

  // 1. ดึงข้อมูลสไลด์จาก backend
  useEffect(() => {
    fetch('http://localhost:5000/api/slides') 
      .then((res) => {
        if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อดึงข้อมูลจาก API สไลด์ได้");
        return res.json();
      })
      .then((resData) => {
        if (resData.success) {
          setSlides(resData.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching slides:', err);
        setLoading(false);
      });
  }, []);

  // 2. เลื่อนไปสไลด์ถัดไปอัตโนมัติทุก 5 วินาที (วนกลับรูปแรกเมื่อถึงรูปสุดท้าย)
  useEffect(() => {
    if (slides.length <= 1) return; // ถ้ามีรูปเดียวไม่ต้องเลื่อน
    
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [slides]);

  // กำลังโหลด / ไม่มีสไลด์ให้แสดง
  if (loading) {
    return <div className="loading-slider" style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>กำลังโหลดสไลด์กิจกรรม...</div>;
  }

  if (slides.length === 0) {
    return <div className="no-slider" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>ไม่พบกิจกรรมที่มีรูปภาพบน Banner</div>;
  }

  return (
    <div className="hero" style={{ position: 'relative', width: '100%', height: '400px', overflow: 'hidden', borderRadius: '12px', marginBottom: '20px' }}>
      <div className="hero-slides" style={{ width: '100%', height: '100%', position: 'relative' }}>
        
        {/* ซ้อนทุกสไลด์ไว้ตำแหน่งเดียวกัน แล้วแสดงเฉพาะสไลด์ปัจจุบัน (สลับด้วย fade) */}
        {slides.map((slide, index) => {
          const bannerImg = slide.img ? slide.img : DEFAULT_BANNER;
          const isActive = index === currentSlide; // เป็นสไลด์ที่แสดงอยู่หรือไม่

          return (
            <div 
              key={slide.Activity_id || index} 
              className={`hero-slide ${isActive ? 'active' : ''}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: isActive ? 1 : 0,           // สไลด์ปัจจุบันแสดงชัด สไลด์อื่นโปร่งใส
                transition: 'opacity 0.8s ease-in-out', // เอฟเฟกต์ fade ตอนสลับรูป
                pointerEvents: isActive ? 'auto' : 'none'
              }}
            >
              <img 
                src={bannerImg} 
                alt={slide.title || "กิจกรรมจิตอาสา"} 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.target.src = DEFAULT_BANNER; }}
              />
              
              {/* ชั้นไล่เงาด้านล่างให้อ่านข้อความออก + ชื่อและคำอธิบายกิจกรรม */}
              <div className="hero-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 100%)' }} />
              
              <div className="hero-content" style={{ position: 'absolute', bottom: '40px', left: '40px', color: 'white', zIndex: 2, maxWidth: '80%' }}>
                <h1 className="hero-title" style={{ margin: '0 0 10px 0', fontSize: '32px', fontWeight: 'bold', textShadow: '1px 1px 4px rgba(0,0,0,0.6)' }}>{slide.title}</h1>
                <p className="hero-sub" style={{ margin: 0, fontSize: '16px', opacity: 0.9, textShadow: '1px 1px 3px rgba(0,0,0,0.6)' }}>{slide.sub || 'ไม่มีรายละเอียดคำอธิบายกิจกรรม'}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* จุดนำทางด้านล่าง 1 จุดต่อ 1 สไลด์ (จุดสีเขียว = สไลด์ปัจจุบัน) */}
      <div className="slide-dots" style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', zIndex: 10 }}>
        {slides.map((_, i) => (
          <button
            key={i}
            className={`dot ${i === currentSlide ? 'active' : ''}`}
            onClick={() => setCurrentSlide(i)} // กดปุ่มเพื่อเปลี่ยนสไลด์ได้ด้วยตนเอง
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              border: 'none',
              background: i === currentSlide ? '#2D7D46' : 'rgba(255, 255, 255, 0.5)', // เปลี่ยนสีปุ่มเมื่อรูปแอคทีฟ
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          />
        ))}
      </div>
    </div>
  );
}