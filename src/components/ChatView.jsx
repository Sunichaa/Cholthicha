import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, CheckCheck, MessageCircle, User } from 'lucide-react';
import { notify } from '../notice';
import './ChatView.css';

/* =====================================================================
 *  หน้าแชต (ใช้ทั้งฝั่งผู้เข้าร่วมและผู้จัดกิจกรรม)
 *  ห้องแชต 1 ห้อง = การลงทะเบียน 1 รายการ (ผู้สมัคร 1 คน <-> ผู้จัดกิจกรรม)
 *  ซ้าย: รายการห้องแชต + ช่องค้นหา | ขวา: ข้อความในห้องที่เลือก + ช่องพิมพ์
 *    user             ผู้ใช้ที่ login อยู่
 *    targetUser       ห้องแชตที่ต้องการเปิดทันที (เช่น กด "ติดต่อผู้จัด" มาจากหน้ากิจกรรม)
 *    autoSelectFirst  เลือกห้องแรกให้อัตโนมัติเมื่อเข้าหน้าแชต (ค่าเริ่มต้น true)
 *    viewAs           'volunteer' = ห้องของกิจกรรมที่ฉันสมัคร, 'organizer' = ห้องของผู้สมัครในกิจกรรมที่ฉันจัด
 *
 *  ── การทำงาน ──────────────────────────────────────────────────
 *   1. เปิดหน้า       -> ดึงรายการห้อง (GET /api/chat/contacts/:member_id) แล้วเลือกห้องเริ่มต้น
 *   2. เลือกห้อง      -> ดึงข้อความในห้อง (GET /api/chat/messages/:activity_id?registration_id=)
 *                      และถือว่าห้องนั้นอ่านแล้ว
 *   3. กดส่งข้อความ   -> POST /api/chat/send แล้วต่อข้อความท้ายห้องทันที + ย้ายห้องขึ้นบนสุด
 *
 *   ไม่ใช่ระบบ real-time: ข้อความใหม่จากอีกฝ่ายจะเห็นเมื่อเลือกห้องใหม่หรือรีเฟรชหน้า
 *   สถานะ "อ่านแล้ว" จำไว้แค่ในหน้านี้ (readKeys) ไม่ได้บันทึกลงฐานข้อมูล รีเฟรชแล้วจะหายไป
 * ===================================================================== */

// แปลง path รูปให้เป็น URL เต็ม (path ภายในจะเติมที่อยู่ backend ไว้ข้างหน้า)
const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `http://localhost:5000${cleanPath}`;
};

export default function ChatView({ user, targetUser, autoSelectFirst = true, viewAs = 'volunteer' }) {
    const [contacts, setContacts]             = useState([]);    // รายการห้องแชต (แถบซ้าย)
    const [selectedChat, setSelectedChat]     = useState(null); // เก็บ Object ของห้องแชตที่เลือก
    const [messages, setMessages]             = useState([]);    // ข้อความในห้องที่เลือก
    const [typedMessage, setTypedMessage]     = useState('');    // ข้อความที่กำลังพิมพ์
    const [searchQuery, setSearchQuery]       = useState('');    // คำค้นหาในรายการห้องแชต
    const [loadingContacts, setLoadingContacts] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [readKeys, setReadKeys]             = useState(() => new Set()); // ห้องแชตที่เปิดอ่านแล้วในเซสชันนี้
    const messagesEndRef = useRef(null);                                  // จุดท้ายรายการข้อความ (ใช้เลื่อนลงล่างสุด)

    const myMemberId = user?.Member_id || user?.member_id || user?.id; // รหัสของฉัน (ใช้แยกข้อความของฉัน/อีกฝ่าย)

    // ── 1. ดึงรายการห้องแชต ──────────────────────────────────────────────
    // ทำใหม่ทุกครั้งที่ผู้ใช้, ห้องเป้าหมาย (targetUser) หรือมุมมองเปลี่ยน
    // ขั้นตอน: ดึงรายการห้อง -> แปลงเป็นรูปแบบเดียวกัน -> เพิ่มห้องเป้าหมาย (ถ้ายังไม่มี)
    //          -> เลือกห้องเริ่มต้น
    useEffect(() => {
        if (!myMemberId) { setLoadingContacts(false); return; }

        // ฝั่งผู้จัดต้องส่ง ?as=organizer เพื่อดึงห้องของผู้สมัครในกิจกรรมที่ตัวเองจัด
        // (ดู organizer/OrganizerDashboard.jsx และ volunteer/UserDashboard.jsx)
        const asParam = viewAs === 'organizer' ? '?as=organizer' : '';
        fetch(`http://localhost:5000/api/chat/contacts/${myMemberId}${asParam}`)
            .then(r => r.json())
            .then(data => {
                const rawList = data.data || [];
                
                // แปลงข้อมูลจาก API ให้อยู่ในรูปแบบห้องแชตเดียวกันหมด
                // (รองรับชื่อฟิลด์หลายแบบ เช่น Registration_id / registration_id)
                // chatKey = รหัสประจำห้องฝั่งหน้าเว็บ: "reg-<Registration_id>"
                //           ถ้าไม่มี Registration_id ใช้ "act-<Activity_id>-user-<Partner_id>" แทน
                const formattedContacts = rawList.map(item => {
                    const regId = item.Registration_id || item.registration_id;
                    const actId = item.Activity_id || item.activity_id;
                    const partnerId = item.Partner_id || item.Member_id || item.member_id;

                    // สร้าง Unique Key สำหรับแต่ละห้องสนทนา
                    const chatKey = regId ? `reg-${regId}` : `act-${actId}-user-${partnerId}`;

                    return {
                        chatKey:          chatKey,
                        Registration_id: regId,       // รหัสห้อง (ใช้ดึง/ส่งข้อความ)
                        Activity_id:     actId,
                        Activity_name:   item.Activity_name || item.activity_name || 'กิจกรรม',
                        Activity_image:  getImageUrl(item.Activity_image || item.Image || item.Cover_image || item.image_path),
                        Partner_id:      partnerId,   // คู่สนทนา (ผู้จัด หรือผู้สมัคร ขึ้นกับมุมมอง)
                        Partner_name:    item.Partner_name || (item.First_name ? `${item.First_name} ${item.Last_name || ''}`.trim() : 'ผู้ใช้งาน'),
                        Organizer_id:    item.Organizer_id,
                        last_message:    item.last_message || 'เริ่มการสนทนา', // ข้อความล่าสุด (แสดงใต้ชื่อห้อง)
                        last_message_time: item.last_message_time || null,
                        last_sender_id:  item.last_sender_id || null,        // ผู้ส่งล่าสุด (ใช้เช็ก "ยังไม่ได้อ่าน")
                    };
                });

                // เปิดแชตตรงมาจากหน้าอื่น (targetUser) แต่ห้องนี้ยังไม่เคยมีข้อความ
                // -> สร้างห้องใหม่ไว้บนสุดของรายการ
                if (targetUser?.Activity_id) {
                    const targetRegId = targetUser.Registration_id || null;
                    const targetActId = targetUser.Activity_id;
                    const targetKey = targetRegId ? `reg-${targetRegId}` : `act-${targetActId}-target`;

                    const exists = formattedContacts.find(c => c.chatKey === targetKey);
                    if (!exists) {
                        const newContact = {
                            chatKey:          targetKey,
                            Registration_id: targetRegId,
                            Activity_id:     targetActId,
                            Activity_name:   targetUser.Activity_name || targetUser.title || 'กิจกรรม',
                            Activity_image:  getImageUrl(targetUser.Activity_image || targetUser.Image || targetUser.image),
                            Partner_id:      targetUser.Organizer_id || targetUser.Member_id,
                            Partner_name:    targetUser.Organizer_name || (targetUser.First_name ? `${targetUser.First_name} ${targetUser.Last_name || ''}`.trim() : 'ผู้จัดกิจกรรม'),
                            last_message:    'เริ่มการสนทนา'
                        };
                        formattedContacts.unshift(newContact);
                    }
                }

                setContacts(formattedContacts);

                // เลือกห้องที่จะเปิดเป็นค่าเริ่มต้น
                if (targetUser?.Activity_id) {
                    // มีเจตนาเปิดห้องแชตที่ระบุมาชัดเจน (เช่นกดมาจากหน้ากิจกรรมที่เข้าร่วม) เลือกให้เลย
                    const targetRegId = targetUser.Registration_id || null;
                    const targetActId = targetUser.Activity_id;
                    const targetKey = targetRegId ? `reg-${targetRegId}` : `act-${targetActId}-target`;
                    const targetContact = formattedContacts.find(c => c.chatKey === targetKey);
                    if (targetContact) setSelectedChat(targetContact);
                } else if (autoSelectFirst && formattedContacts.length > 0) {
                    // เลือกห้องแชตแรกเป็นค่าเริ่มต้น (ปิดได้ด้วย autoSelectFirst={false} เช่นฝั่งผู้จัด
                    // ที่ต้องการให้เลือกกิจกรรมเอง ไม่ auto-select ตอนเข้าหน้าแชตครั้งแรก)
                    setSelectedChat(formattedContacts[0]);
                }

                setLoadingContacts(false);
            })
            .catch(err => {
                console.error("Error fetching contacts:", err);
                setLoadingContacts(false);
            });
    }, [user, targetUser, viewAs]);

    // ── 2. ดึงข้อความของห้องแชตที่เลือก ────────────────────────────────
    // ทำใหม่ทุกครั้งที่เลือกห้อง (ห้องชั่วคราวที่ยังไม่มี Registration_id จะได้รายการว่าง)
    useEffect(() => {
        if (!selectedChat) { setMessages([]); return; }
        setLoadingMessages(true);

        // ถือว่าอ่านแล้วเมื่อเปิดห้องแชตนี้ขึ้นมาดู
        setReadKeys(prev => prev.has(selectedChat.chatKey) ? prev : new Set(prev).add(selectedChat.chatKey));

        // ระบุห้องด้วย registration_id (backend ใช้ค่านี้กรองข้อความของห้องนี้)
        // member_id / partner_id ส่งไปด้วยแต่ backend ไม่ได้ใช้ (ตัวตนผู้ใช้อ่านจาก token)
        const queryParams = new URLSearchParams({
            member_id: myMemberId,
            registration_id: selectedChat.Registration_id || '',
            partner_id: selectedChat.Partner_id || ''
        });

        fetch(`http://localhost:5000/api/chat/messages/${selectedChat.Activity_id}?${queryParams.toString()}`)
            .then(r => r.json())
            .then(data => {
                if (data.closed) notify(data.message, 'error'); // กิจกรรมถูกยกเลิก ห้องแชตถูกปิด
                setMessages(data.data || []);
                setLoadingMessages(false); 
            })
            .catch(err => {
                console.error("Error fetching messages:", err);
                setLoadingMessages(false);
            });
    }, [selectedChat]);

    // เลื่อนลงไปข้อความล่าสุดทุกครั้งที่รายการข้อความเปลี่ยน
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── 3. ส่งข้อความ ────────────────────────────────────────────────────
    // ล้างช่องพิมพ์ทันที ถ้าส่งสำเร็จเพิ่มข้อความต่อท้ายและย้ายห้องขึ้นบนสุด
    // ถ้าส่งไม่สำเร็จแจ้งเตือนและคืนข้อความกลับเข้าช่องพิมพ์
    const handleSend = (e) => {
        e.preventDefault();
        // ข้อความว่าง / ยังไม่ได้เลือกห้อง -> ไม่ส่ง
        if (!typedMessage.trim() || !myMemberId || !selectedChat) return;

        // ข้อมูลที่ส่งไป backend (backend ใช้ activity_id, registration_id, message
        // ส่วนผู้ส่งอ่านจาก token แทน member_id)
        const payload = {
            member_id:       myMemberId,
            activity_id:     selectedChat.Activity_id,
            registration_id: selectedChat.Registration_id || null,
            receiver_id:     selectedChat.Partner_id || null,
            message:         typedMessage.trim(),
        };

        // จำข้อความไว้ แล้วล้างช่องพิมพ์ทันทีให้พิมพ์ข้อความถัดไปได้เลย
        const sentMsgText = typedMessage;
        setTypedMessage('');

        fetch('http://localhost:5000/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    // ส่งสำเร็จ: ต่อข้อความใหม่ท้ายห้องทันที (ใช้ chat_id และเวลาจาก backend)
                    setMessages(prev => [...prev, {
                        Chat_id:    data.chat_id || Date.now(),
                        Member_id:  myMemberId,
                        Message:    sentMsgText,
                        Sent_at:    data.sent_at || new Date().toLocaleDateString('en-CA'), // วันที่ตามเวลาเครื่อง (YYYY-MM-DD)
                        Sent_time:  data.sent_time || new Date().toTimeString().slice(0, 8),
                        First_name: user?.First_name || user?.first_name || 'ฉัน',
                        Last_name:  user?.Last_name || user?.last_name || '',
                    }]);

                    // ย้ายห้องแชตที่เพิ่งส่งข้อความไปล่าสุดขึ้นบนสุดของรายการ
                    setContacts(prev => {
                        const updated = prev.map(c =>
                            c.chatKey === selectedChat.chatKey
                                ? { ...c, last_message: sentMsgText }
                                : c
                        );
                        const idx = updated.findIndex(c => c.chatKey === selectedChat.chatKey);
                        if (idx > 0) {
                            const [moved] = updated.splice(idx, 1);
                            updated.unshift(moved);
                        }
                        return updated;
                    });
                } else {
                    // backend ปฏิเสธ (เช่น ไม่มีสิทธิ์ / ห้องถูกปิด) -> แจ้งเตือน และคืนข้อความเข้าช่องพิมพ์
                    notify(`ส่งข้อความไม่สำเร็จ: ${data.message || 'เกิดข้อผิดพลาด'}`, 'error');
                    setTypedMessage(sentMsgText);
                }
            })
            .catch(err => {
                // เชื่อมต่อ server ไม่ได้ -> แจ้งเตือน และคืนข้อความเข้าช่องพิมพ์
                console.error('Error sending message:', err);
                notify('ไม่สามารถเชื่อมต่อกับ Server ได้', 'error');
                setTypedMessage(sentMsgText);
            });
    };

    // กรองรายการห้องแชตตามคำค้นหา (ชื่อกิจกรรม หรือชื่อคู่สนทนา)
    const filteredContacts = contacts.filter(c =>
        `${c.Activity_name} ${c.Partner_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="chat-viewport-wrapper">
            <div className="chat-main-container">

                {/* ── ด้านซ้าย: ช่องค้นหา + รายการห้องแชต ── */}
                <div className="chat-sidebar">
                    <div className="sidebar-search-box">
                        <h3 className="sidebar-title">แชตกิจกรรม</h3>
                        <div className="search-input-wrapper">
                            <Search size={16} className="icon-search" />
                            <input 
                                type="text" 
                                placeholder="ค้นหากิจกรรม หรือชื่อผู้ติดต่อ..."
                                value={searchQuery} 
                                onChange={e => setSearchQuery(e.target.value)} 
                            />
                        </div>
                    </div>

                    <div className="contacts-list-wrapper">
                        {loadingContacts ? (
                            <div style={{ padding:'20px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>
                                กำลังโหลด...
                            </div>
                        ) : filteredContacts.length === 0 ? (
                            <div style={{ padding:'24px', textAlign:'center', color:'#94a3b8', fontSize:'13px' }}>
                                <MessageCircle size={32} style={{ margin:'0 auto 8px', display:'block', opacity:0.4 }} />
                                ยังไม่มีรายการแชต
                            </div>
                        ) : (
                            filteredContacts.map(c => {
                                // ยังไม่ได้อ่าน = ข้อความล่าสุดมาจากอีกฝ่าย และยังไม่เคยเปิดห้องนี้ดูในเซสชันนี้
                                const isUnread = c.last_sender_id
                                    && String(c.last_sender_id) !== String(myMemberId)
                                    && !readKeys.has(c.chatKey);
                                return (
                                <div
                                    key={c.chatKey}
                                    className={`contact-item-row ${selectedChat?.chatKey === c.chatKey ? 'active' : ''}`}
                                    onClick={() => setSelectedChat(c)}
                                >
                                    {/* รูปกิจกรรม (ไม่มีรูปแสดงตัวอักษรแรกของชื่อกิจกรรม) */}
                                    <div className="avatar-container">
                                        <div className="avatar-circle" style={{ overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                                            {c.Activity_image ? (
                                                <img 
                                                    src={c.Activity_image} 
                                                    alt={c.Activity_name} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                            ) : (
                                                <span style={{ fontSize:'14px', fontWeight:'700' }}>
                                                    {c.Activity_name?.charAt(0).toUpperCase() || '?'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* ชื่อกิจกรรม + ชื่อคู่สนทนา + ข้อความล่าสุด (ตัวหนาถ้ายังไม่ได้อ่าน) */}
                                    <div className="contact-item-info">
                                        <div className="contact-name-row">
                                            <h4>{c.Activity_name}</h4>
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#64748b', margin: '2px 0', display:'flex', alignItems:'center', gap:'4px' }}>
                                            <User size={12} /> {c.Partner_name}
                                        </div>
                                        <div className="contact-preview-msg">
                                            <p className={isUnread ? 'unread' : ''}>{c.last_message || 'เริ่มการสนทนา'}</p>
                                        </div>
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ── ด้านขวา: ห้องแชตที่เลือก (ยังไม่เลือกแสดงข้อความแนะนำ) ── */}
                <div className="chat-window-box">
                    {!selectedChat ? (
                        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', flexDirection:'column', gap:'12px' }}>
                            <MessageCircle size={48} opacity={0.3} />
                            <p>เลือกรายการเพื่อเริ่มสนทนา</p>
                        </div>
                    ) : (
                        <>
                            {/* หัวห้องแชต: รูป + ชื่อกิจกรรม + ชื่อคู่สนทนา */}
                            <div className="chat-window-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                                <div className="header-avatar" style={{ overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                                    {selectedChat.Activity_image ? (
                                        <img 
                                            src={selectedChat.Activity_image} 
                                            alt={selectedChat.Activity_name} 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                    ) : (
                                        <span style={{ fontSize:'14px', fontWeight:'700' }}>
                                            {selectedChat.Activity_name?.charAt(0).toUpperCase() || '?'}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <h4>{selectedChat.Activity_name}</h4>
                                    <p style={{ color:'#64748b', fontSize:'12px' }}>คู่สนทนา: {selectedChat.Partner_name}</p>
                                </div>
                            </div>

                            {/* รายการข้อความ: ของฉันชิดขวา (outgoing), ของอีกฝ่ายชิดซ้ายพร้อมชื่อ (incoming) */}
                            <div className="chat-messages-body">
                                {loadingMessages ? (
                                    <div style={{ textAlign:'center', padding:'20px', color:'#94a3b8' }}>
                                        กำลังโหลดข้อความ...
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8' }}>
                                        เริ่มการสนทนาในกิจกรรม "{selectedChat.Activity_name}"
                                    </div>
                                ) : (
                                    messages.map((msg, idx) => {
                                        const isMe = String(msg.Member_id) === String(myMemberId);
                                        return (
                                            <div key={msg.Chat_id || idx}
                                                className={`message-bubble-row ${isMe ? 'outgoing' : 'incoming'}`}>
                                                {!isMe && (
                                                    <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'2px', paddingLeft:'4px' }}>
                                                        {msg.First_name} {msg.Last_name}
                                                    </div>
                                                )}
                                                <div className="message-content-box">
                                                    <p className="message-text">{msg.Message}</p>
                                                    <span className="message-time-stamp">
                                                        {msg.Sent_time ? String(msg.Sent_time).slice(0, 5) : ''}
                                                        {isMe && <CheckCheck size={13} className="icon-read" />}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* ช่องพิมพ์ข้อความ + ปุ่มส่ง */}
                            <form className="chat-input-footer-form" onSubmit={handleSend}>
                                <input 
                                    type="text" 
                                    placeholder={`พิมพ์ข้อความถึง ${selectedChat.Partner_name}...`}
                                    value={typedMessage}
                                    onChange={e => setTypedMessage(e.target.value)} 
                                />
                                <button type="submit" className="btn-send-message">
                                    <Send size={18} /><span>ส่ง</span>
                                </button>
                            </form>
                        </>
                    )}
                </div>

            </div>
        </div>
    );
}