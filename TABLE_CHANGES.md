# Table — สิ่งที่เพิ่มและแก้ไข

## ภาพรวม

แก้ไขและเสริมระบบ table ใน 3 จุดหลัก:

1. **Layout Engine** — แก้ rowspan ให้คำนวณ height ถูกต้อง
2. **Column Add** — รองรับการเพิ่ม column ที่ตำแหน่งที่กำหนดได้
3. **Column Remove** — แก้ให้นับ column position ถูกต้องเมื่อมี colspan

---

## 1. Layout Engine — `packages/core/src/layout/flow.ts`

### ปัญหาเดิม

`flowTable` มี TODO ค้างอยู่:

```
// rowspan > 1 จะไม่นับ height เข้า row เดียว — TODO: distribute across rows
```

เมื่อ cell มี `rowspan > 1` (เช่น cell ที่กินพื้นที่ 2 แถว) ความสูงของ content ใน cell นั้นไม่ถูกนำมาคิดเลย ทำให้ cell ถูก render เตี้ยเกินไปและ content ล้น

### สิ่งที่แก้

แปลง `flowTable` เป็น **3-pass layout**:

**Pass 1 — วัด row height จาก rowspan=1 cells**
วัด content height ของ cell ที่ไม่ข้ามแถว แล้วหา row height ที่เหมาะสม

**Pass 2 — ปรับ row height ให้รองรับ rowspan > 1**
สำหรับ cell ที่ข้ามหลายแถว ถ้า content สูงกว่าผลรวมของแถวที่กินอยู่ → เพิ่มความสูงไปที่แถวสุดท้ายของ span

**Pass 3 — วาง cell ทุกตัวด้วย height ที่ถูกต้อง**
Cell ที่มี `rowspan > 1` จะได้ `height = ผลรวมความสูงของทุกแถวที่ span`

### ผลลัพธ์

- Cell ที่ span หลายแถวแสดงขอบ (border) ได้ถูกต้องใน PDF
- DOCX ยังใช้ `rowSpan` จาก `cellRenderProps` ซึ่งผ่าน pagination มาแล้ว ไม่ต้องแก้
- เพิ่ม helper functions 2 ตัว:
  - `resolveTableCellWidth()` — คำนวณ width และ padding ของ cell (รวม colspan)
  - `measureTableCellHeight()` — วัด content height ของ cell

---

## 2. addTableColumn — `packages/core/src/document/operations.ts`

### ปัญหาเดิม

`addTableColumn` เพิ่ม column ท้ายสุดเสมอ ไม่รองรับการกำหนดตำแหน่ง

นอกจากนี้ยังใช้ array index ตรงๆ ในการหาที่แทรก cell ซึ่งผิดเมื่อมี cell ที่มี colspan > 1

### สิ่งที่แก้

- เพิ่ม parameter `afterColIndex?: number` — ถ้าไม่ส่ง = เพิ่มท้ายสุด
- การหาตำแหน่งแทรก cell ใน `cellIds` ใช้ **column cursor** แทน array index:

```
ตัวอย่าง: แถวมี 2 cells โดย cell แรก colspan=2
  cellIds = [A, B]
  column positions: A = [0,1], B = [2]

ถ้าต้องการแทรก column ที่ position 1:
  เดิม: cellIds[1] = B  ← ผิด
  ใหม่: นับ cursor → A ครอง col 0-1, แทรกก่อน B → cellInsertIdx = 1  ← ยังผิดอยู่ในกรณีนี้
  จริงๆ: A มี colspan=2 ครอง col 0 และ 1 → แทรกหลัง A = idx 1  ← ถูก
```

---

## 3. removeTableColumn — `packages/core/src/document/operations.ts`

### ปัญหาเดิม

```typescript
// เดิม (ผิด)
const cellId = row.cellIds[colIndex]
```

ใช้ `colIndex` เป็น array index ตรงๆ ซึ่งผิดเมื่อมี cell ที่มี `colspan > 1`

ตัวอย่าง: แถวมี cell A (colspan=2) และ cell B (colspan=1)
- `cellIds = [A, B]`
- ต้องการลบ column 2 (ซึ่งคือ B)
- เดิม: `cellIds[2]` = undefined → ไม่ลบอะไรเลย

### สิ่งที่แก้

ติดตาม column position ด้วย cursor แทน:

```
colCursor เริ่มที่ 0
  A มี colspan=2 → ครอง col 0, 1 → colCursor = 2
  B มี colspan=1 → ครอง col 2 → ตรงกับ colIndex=2 → ลบ B
```

นอกจากนี้ยังเพิ่ม logic กรณีพิเศษ: ถ้า cell ที่ต้องลบมี **colspan > 1** (เช่น cell ที่กิน 3 column และเราลบแค่ 1 column) → **ลด colspan ลง 1** แทนการลบ cell ทิ้ง

---

## สรุป

| จุด | ปัญหาเดิม | สถานะใหม่ |
|-----|-----------|-----------|
| rowspan layout height | ไม่นับ content height → cell เตี้ย | คำนวณถูก ทั้ง layout และ PDF border |
| addTableColumn position | เพิ่มท้ายสุดเสมอ | รองรับ `afterColIndex` |
| addTableColumn + colspan | ไม่ได้ใช้ column cursor | ใช้ cursor นับ colspan ถูกต้อง |
| removeTableColumn + colspan | ใช้ array index → ลบผิด cell | ใช้ cursor → ลบถูก cell หรือลด colspan |

---

## ข้อจำกัดที่ยังเหลืออยู่

- **removeTableRow + rowspan**: ถ้า cell ในแถวที่จะลบมี rowspan ข้ามไปแถวอื่น การลบแถวจะทำให้โครงสร้างเสีย `assertDocument` จะจับได้ แต่ยังไม่ได้ auto-fix
- **addTableColumn + rowspan**: ถ้ามี cell ที่ rowspan ข้ามแถวอยู่ การเพิ่ม column ยังไม่ได้เพิ่ม cell ให้แถวที่ถูก span ด้วย
