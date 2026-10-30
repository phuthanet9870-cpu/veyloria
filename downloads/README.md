# รุ่นล่าสุด: บ้าน เมือง ร้านค้า และปราสาท มุมหน้าตรง 45°

- [ดาวน์โหลดเกม](https://github.com/phuthanet9870-cpu/veyloria/raw/refs/heads/downloads/map-art-2026-10-30/downloads/Veyloria-Architecture-45deg.zip)
- [ดาวน์โหลดเฉพาะชุดภาพอาคาร 56 ชิ้น](https://github.com/phuthanet9870-cpu/veyloria/raw/refs/heads/downloads/map-art-2026-10-30/downloads/Veyloria-Architecture-Assets.zip)
- [ภาพตัวอย่างในเกม](Architecture-Preview.png)

อาคารหันหน้าตรงทางทิศใต้ มุมก้ม 45 องศา ไม่มีการหมุนหรือกลับภาพ ครบ 7 ธีมเมือง
แทนภาพอาคาร 132 หลัง และเพิ่ม keep ใน Castle Veyl รวม 133 หลัง พร้อมประตู/กำแพงที่รักษาทางเดินเดิม

ตรวจ 140 กรอบภาพ; unit/integration ผ่าน 1,057 ข้อ; browser gameplay 39/39
เกมยังเป็น index.html ไฟล์เดียว ให้แตก ZIP ในโฟลเดอร์ใหม่แล้วเปิด index.html

---

# ดาวน์โหลด Veyloria — ภาพแมพใหม่

ภาพใหม่ครบ 136 แมพ / 21 ธีม พร้อมพื้น 64 รูปแบบต่อวัสดุ

- [ดาวน์โหลดเกม](https://github.com/phuthanet9870-cpu/veyloria/raw/refs/heads/downloads/map-art-2026-10-30/downloads/Veyloria-Architecture-45deg.zip)
- [ดาวน์โหลด Tileset และ Assets](https://github.com/phuthanet9870-cpu/veyloria/raw/refs/heads/downloads/map-art-2026-10-30/downloads/Veyloria-Tilesets-Assets.zip)
- [ดาวน์โหลดซอร์สโค้ด](https://github.com/phuthanet9870-cpu/veyloria/raw/refs/heads/downloads/map-art-2026-10-30/downloads/Veyloria-Source-Updated.zip)
- [ดาวน์โหลดภาพและผลตรวจ](https://github.com/phuthanet9870-cpu/veyloria/raw/refs/heads/downloads/map-art-2026-10-30/downloads/Veyloria-Map-QA.zip)

หากลิงก์ตรงไม่ดาวน์โหลด ให้เปิดไฟล์ ZIP ใน GitHub แล้วกด Download raw
Repository ส่วนตัวต้องล็อกอิน GitHub ด้วยบัญชีที่มีสิทธิ์เข้าถึง

แก้หน้าจอขาวแล้ว: แตก ZIP ในโฟลเดอร์ใหม่ แล้วดับเบิลคลิก index.html ได้เลย รุ่นนี้รวม JavaScript, CSS และภาพทั้งหมดเป็นไฟล์เดียว ไม่ต้องปิด CORS และไม่ต้องเปิดเซิร์ฟเวอร์
ออนไลน์ต้องเปิด backend จากซอร์สแยก ตัวละครและ inventory ยังอยู่ฝั่ง client

ผลตรวจ: unit/integration 1,054 ข้อผ่าน; Chromium gameplay 39/39;
ตรวจรอยต่อ 7,467 ชุดบน 136 แมพ และ prop variants 3,864 รูปแบบ
ตรวจ checksum ของ ZIP ได้จาก SHA256SUMS.txt

ไฟล์ชุดนี้เผยแพร่ใน branch ดาวน์โหลดแยก ยังไม่ได้ merge เข้า main

## การตรวจรุ่นแก้หน้าจอขาว

ตรวจการเข้าเกม เดิน เซฟ/โหลด และ render ภาพ 21 ธีมจาก HTML ไฟล์เดียวผ่าน Chromium โดยไม่มี asset request ภายนอกหรือ console/page errors การเปิด file:// โดยตรงในเครื่องทดสอบถูกนโยบายผู้ดูแล browser บล็อก จึงใช้ local HTTP สำหรับ runtime checks และตรวจโครงสร้าง HTML ว่าไม่มี module script หรือ CSS/ภาพภายนอก ข้อจำกัดนี้ไม่ถูกนับเป็นผลทดสอบ file:// ผ่าน
