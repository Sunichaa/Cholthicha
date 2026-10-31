import './HomeCharts.css';

// กราฟแท่ง: ความสูงยืดตามพื้นที่ที่การ์ดได้รับ (ไม่ตายตัวเป็นพิกเซล) แท่งที่สูงที่สุดเต็มความสูงพื้นที่กราฟ
// ใช้ร่วมกันทั้งหน้าแรกแอดมิน (สีน้ำเงิน) และผู้จัด (สีม่วง)
// data: [{ id?, label, count }] — ถ้าส่ง onSelect มา แท่งจะกดเลือกได้ (ใช้เลือกกิจกรรมให้กราฟสัดส่วน)
// selectedId: แท่งที่เลือกอยู่ (แท่งอื่นจะจางลง), กดแท่งเดิมซ้ำ = ยกเลิกการเลือก
// d.noSelect: แท่งที่กดเลือกไม่ได้ (เช่น กิจกรรมที่ถูกยกเลิก)
export function BarChart({ data, color = '#3b82f6', selectedId = null, onSelect }) {
    const max = Math.max(...data.map(d => d.count), 1); // ค่าสูงสุด ใช้เทียบความสูงแท่ง (อย่างน้อย 1 กันหารศูนย์)
    return (
        <div className="hc-bars" style={{ '--bar-color': color }}>
            {data.map((d, i) => {
                const selectable = !!(onSelect && d.id != null && !d.noSelect);
                const active = selectedId != null && String(selectedId) === String(d.id);
                const dim = selectedId != null && selectedId !== '' && !active;
                return (
                    <button
                        key={d.id ?? i}
                        type="button"
                        className={`hc-bar-col${active ? ' active' : ''}${dim ? ' dim' : ''}`}
                        disabled={!selectable}
                        onClick={() => selectable && onSelect(active ? '' : d.id)}
                        title={`${d.label} — ${d.count} คน${selectable ? ' (กดเพื่อดูสัดส่วนของกิจกรรมนี้)' : d.noSelect ? ' (กิจกรรมที่ยกเลิก ไม่นับในสัดส่วน)' : ''}`}
                    >
                        <div className="hc-bar-track">
                            <div className="hc-bar-wrap" style={{ height: `${Math.max((d.count / max) * 100, 0)}%` }}>
                                <span className="hc-bar-val">{d.count}</span>
                                <div className="hc-bar" />
                            </div>
                        </div>
                        <span className="hc-bar-label">{d.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// กราฟโดนัทสัดส่วนผู้มาเข้าร่วม — ตัวเลขทั้งหมดนับเป็น "จำนวนการสมัคร" (คนเดียวสมัครหลายกิจกรรมนับหลายครั้ง)
// passed = ผู้จัดยืนยันว่ามา (P), notPassed = ยืนยันว่าไม่มา (F), unmarked = ยังไม่ได้ยืนยันผล
// เปอร์เซ็นต์ตรงกลาง = มาเข้าร่วม / (มา + ไม่มา) ไม่นับคนที่ยังไม่ระบุผล
export function DonutChart({ passed, notPassed, unmarked = 0 }) {
    const decided = passed + notPassed;                                  // จำนวนที่ระบุผลแล้ว
    const pct = decided > 0 ? Math.round((passed / decided) * 100) : 0;
    const r = 60, circ = 2 * Math.PI * r;                                // รัศมีและเส้นรอบวงของวงกลม
    const dash = decided > 0 ? (passed / decided) * circ : 0;            // ความยาวเส้นสีเขียว
    return (
        <div className="hc-donut-wrap">
            <svg className="hc-donut-svg" viewBox="0 0 150 150">
                <defs>
                    <linearGradient id="hcDonutGreen" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#4ade80" />
                        <stop offset="100%" stopColor="#16a34a" />
                    </linearGradient>
                </defs>
                {/* วงพื้นหลังสีเทา + เส้นสีเขียวตามสัดส่วนที่มาเข้าร่วม (เริ่มจากด้านบน) */}
                <circle cx="75" cy="75" r={r} fill="none" stroke="#e2e8f0" strokeWidth="18" />
                {dash > 0 && (
                    <circle cx="75" cy="75" r={r} fill="none" stroke="url(#hcDonutGreen)" strokeWidth="18"
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                        transform="rotate(-90 75 75)" />
                )}
                <text x="75" y="76" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1e293b">{pct}%</text>
                <text x="75" y="96" textAnchor="middle" fontSize="10" fill="#64748b">มาเข้าร่วม</text>
            </svg>
            {/* คำอธิบายสีและจำนวนแต่ละกลุ่ม */}
            <div className="hc-legend">
                <div className="hc-legend-item"><span className="hc-dot" style={{ background: '#22c55e' }} />มาเข้าร่วม<b>{passed}</b></div>
                <div className="hc-legend-item"><span className="hc-dot" style={{ background: '#ef4444' }} />ไม่มาเข้าร่วม<b>{notPassed}</b></div>
                <div className="hc-legend-item"><span className="hc-dot" style={{ background: '#cbd5e1' }} />ยังไม่ระบุผล<b>{unmarked}</b></div>
                <p className="hc-legend-note">นับเป็นจำนวนการสมัคร · % คิดจากผู้ที่ผู้จัดยืนยันผลแล้ว</p>
            </div>
        </div>
    );
}
