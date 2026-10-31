import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { Search, Check, MapPin } from 'lucide-react';
import { notify } from '../notice';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

/* =====================================================================
 *  แผนที่เลือกตำแหน่งสถานที่จัดกิจกรรม (ใช้ในฟอร์มสร้าง/แก้ไขกิจกรรม)
 *  เลือกตำแหน่งได้ 4 วิธี: คลิกบนแผนที่, ลากหมุด, ค้นหาชื่อสถานที่, ใช้ตำแหน่งปัจจุบัน
 *  ทุกวิธีแค่ย้ายหมุดพรีวิว ต้องกดปุ่มยืนยันด้านล่างจึงจะส่งค่ากลับเข้าฟอร์ม
 *    value     ลิงก์ Google Maps เดิม (ถ้ามี) ใช้กำหนดตำแหน่งเริ่มต้น
 *    onSelect  เรียกพร้อมลิงก์ Google Maps ของตำแหน่งที่ยืนยัน
 *    onClose   ปิดแผนที่
 * ===================================================================== */

// ไอคอนหมุดของ Leaflet อ้างอิงไฟล์รูปด้วย path ที่ใช้กับ bundler ของ Vite ไม่ได้
// (path จะเพี้ยนหลัง build) จึงต้อง import รูปแล้ว merge เข้า Icon.Default เอง
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const DEFAULT_CENTER = [13.7563, 100.5018]; // กรุงเทพฯ — จุดเริ่มต้นเมื่อยังไม่มีตำแหน่ง

// แกะพิกัด lat,lng จาก URL Google Maps 
// https://www.google.com/maps?q=13.75,100.50 หรือ https://maps.google.com/?q=13.75,100.50
// หรือ https://www.google.com/maps/@13.75,100.50,15z
function parseLatLngFromUrl(url) {
    if (!url) return null;
    let m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    return null;
}

// สร้างลิงก์ Google Maps จากพิกัด (ทศนิยม 6 ตำแหน่ง)
function toGoogleMapsUrl([lat, lng]) {
    return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

// รับการคลิกบนแผนที่ แล้วส่งพิกัดที่คลิกให้ onPick
function ClickHandler({ onPick }) {
    useMapEvents({
        click(e) { onPick([e.latlng.lat, e.latlng.lng]); },
    });
    return null;
}

// เลื่อนแผนที่ตามหมุดเวลาผู้ใช้กด/ลาก/ค้นหา/ใช้ตำแหน่งปัจจุบัน — ข้ามครั้งแรกเพราะ
// MapContainer เซ็นเตอร์ให้แล้วตอนสร้างแผนที่
function FlyTo({ pos, zoom }) {
    const map = useMap();
    const isFirst = useRef(true);
    useEffect(() => {
        if (isFirst.current) { isFirst.current = false; return; }
        map.flyTo(pos, zoom || (map.getZoom() < 12 ? 15 : map.getZoom()));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pos]);
    return null;
}

// ให้แผนที่คำนวณขนาดใหม่หลัง mount 100 ms — ถ้าตอน Leaflet คำนวณขนาดครั้งแรก container
// ยังจัดวางไม่เสร็จ แผนที่จะเพี้ยนและคลิกแล้วได้พิกัดไม่ตรงกับที่เห็น
function InvalidateSizeOnMount() {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => map.invalidateSize(), 100);
        return () => clearTimeout(t);
    }, [map]);
    return null;
}

export default function LocationPicker({ value, onSelect, onClose }) {
    // ตำแหน่งเริ่มต้น: จากลิงก์เดิม ถ้าไม่มีใช้กรุงเทพฯ (คำนวณครั้งเดียวตอนเปิด)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initial = useMemo(() => parseLatLngFromUrl(value) || DEFAULT_CENTER, []);
    const [pos, setPos] = useState(initial); // ตำแหน่งหมุดที่กำลังดูอยู่ (พรีวิว ยังไม่บันทึกจนกว่าจะกดยืนยัน)
    const [zoomTo, setZoomTo] = useState(null);      // ระดับซูมที่จะบินไป (null = ใช้ค่าอัตโนมัติ)
    const [locating, setLocating] = useState(false); // กำลังขอตำแหน่งปัจจุบันจากเบราว์เซอร์
    const [picked, setPicked] = useState(false); // ผู้ใช้เคยคลิก/ลาก/ค้นหาเลือกตำแหน่งแล้วหรือยัง
    const hasPosFromUrl = initial !== DEFAULT_CENTER;

    // ค้นหาสถานที่จากชื่อผ่าน Nominatim (OpenStreetMap) แล้วเลือกจากรายการผลลัพธ์
    const [query, setQuery] = useState('');           // คำค้นหา
    const [results, setResults] = useState([]);       // ผลการค้นหา (สูงสุด 5 รายการ)
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');

    // ย้ายหมุดพรีวิวไปตำแหน่งใหม่ (ยังไม่บันทึกเข้าฟอร์ม)
    const preview = (p, zoom) => {
        setPos(p);
        setZoomTo(zoom || null);
        setPicked(true);
    };

    // ปุ่มยืนยัน: ส่งลิงก์ Google Maps ของตำแหน่งหมุดกลับเข้าฟอร์ม แล้วปิดแผนที่
    const confirm = () => {
        onSelect(toGoogleMapsUrl(pos));
        onClose?.();
    };

    // ปุ่ม "ใช้ตำแหน่งปัจจุบัน": ขอพิกัดจากเบราว์เซอร์ (รอสูงสุด 8 วินาที)
    const useMyLocation = () => {
        if (!navigator.geolocation) {
            notify('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่งปัจจุบัน', 'warning');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (p) => { preview([p.coords.latitude, p.coords.longitude], 15); setLocating(false); },
            () => { notify('ไม่สามารถเข้าถึงตำแหน่งปัจจุบันได้ กรุณาคลิกเลือกตำแหน่งบนแผนที่แทน', 'warning'); setLocating(false); },
            { timeout: 8000 }
        );
    };

    // ค้นหาสถานที่ (จำกัดเฉพาะในประเทศไทย)
    const runSearch = (e) => {
        e?.preventDefault();
        const q = query.trim();
        if (!q) return;
        setSearching(true);
        setSearchError('');
        fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=th&q=${encodeURIComponent(q)}`)
            .then(r => r.json())
            .then(data => {
                setResults(data || []);
                if (!data || !data.length) setSearchError('ไม่พบสถานที่ที่ค้นหา ลองพิมพ์ชื่อให้ชัดเจนขึ้น');
            })
            .catch(() => setSearchError('ค้นหาไม่สำเร็จ กรุณาลองใหม่ หรือคลิกเลือกตำแหน่งบนแผนที่แทน'))
            .finally(() => setSearching(false));
    };

    // เลือกผลการค้นหา: ย้ายหมุดไปที่นั่น ปิดรายการ และใส่ชื่อเต็มลงช่องค้นหา
    const pickResult = (r) => {
        preview([parseFloat(r.lat), parseFloat(r.lon)], 16);
        setResults([]);
        setQuery(r.display_name);
    };

    return (
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', marginTop: '8px' }}>
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {/* ช่องค้นหาสถานที่ — ใช้ div + ปุ่ม type="button" และดักปุ่ม Enter เอง ไม่ใช้ <form>
                เพราะ LocationPicker อยู่ใน <form> ของฟอร์มเพิ่มกิจกรรม ถ้าซ้อน <form> อีกชั้น
                การกดค้นหาจะทำให้ฟอร์มเพิ่มกิจกรรมถูกส่งไปด้วย */}
                <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') runSearch(e); }}
                        placeholder="ค้นหาชื่อสถานที่ เช่น วัด, โรงเรียน, ตลาด..."
                        style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                    <button type="button" onClick={runSearch} disabled={searching}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        <Search size={14} /> {searching ? 'กำลังค้นหา...' : 'ค้นหา'}
                    </button>

                    {/* รายการผลการค้นหา (ลอยอยู่ใต้ช่องค้นหา) */}
                    {results.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 6px 16px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: '180px', overflowY: 'auto' }}>
                            {results.map((r, i) => (
                                <div key={i} onClick={() => pickResult(r)}
                                    style={{ padding: '8px 10px', fontSize: '12.5px', color: '#334155', cursor: 'pointer', borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                    {r.display_name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {searchError && <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#ef4444' }}>{searchError}</p>}

                {/* คำแนะนำ + พิกัดปัจจุบันของหมุด + ปุ่มใช้ตำแหน่งปัจจุบัน / ปิดแผนที่ */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <MapPin size={14} color="#2D7D46" /> คลิกบนแผนที่หรือลากหมุดเพื่อเลือกตำแหน่ง
                        <span style={{ marginLeft: 8, color: '#94a3b8' }}>({pos[0].toFixed(5)}, {pos[1].toFixed(5)})</span>
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" onClick={useMyLocation} disabled={locating}
                            style={{ fontSize: '12px', padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>
                            {locating ? 'กำลังค้นหา...' : 'ใช้ตำแหน่งปัจจุบัน'}
                        </button>
                        <button type="button" onClick={onClose}
                            style={{ fontSize: '12px', padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>
                            ปิดแผนที่
                        </button>
                    </div>
                </div>
            </div>

            {/* แผนที่ OpenStreetMap: ซูม 15 ถ้ามีตำแหน่งเดิม, ซูม 6 (ทั้งประเทศ) ถ้ายังไม่มี */}
            <MapContainer center={pos} zoom={hasPosFromUrl ? 15 : 6} style={{ height: '280px', width: '100%' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler onPick={preview} />
                <FlyTo pos={pos} zoom={zoomTo} />
                <InvalidateSizeOnMount />
                <Marker
                    position={pos}
                    draggable
                    eventHandlers={{ dragend: (e) => preview([e.target.getLatLng().lat, e.target.getLatLng().lng]) }}
                />
            </MapContainer>

            {/* ปุ่มยืนยันตำแหน่ง — ต้องกดปุ่มนี้ตำแหน่งจึงจะถูกบันทึกเข้าฟอร์ม */}
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" onClick={confirm}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: '#2D7D46', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Check size={16} /> {picked || hasPosFromUrl ? 'ยืนยันเลือกตำแหน่งนี้' : 'ใช้ตำแหน่งกลางจอนี้'}
                </button>
            </div>
        </div>
    );
}
