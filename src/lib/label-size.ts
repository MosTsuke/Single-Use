/**
 * ขนาดสติ๊กเกอร์ที่หน้างานใช้ — กรอบสีพิมพ์มาจากโรงงานบนม้วนแล้ว โปรแกรมพิมพ์เฉพาะเนื้อหาสีดำด้านใน
 * เลือกตอนพิมพ์ (ตามม้วนที่ใส่ในเครื่องพิมพ์ตอนนั้น) ไม่เก็บในฐานข้อมูล
 */
export type LabelSize = '50x25' | '50x48';

export const DEFAULT_LABEL_SIZE: LabelSize = '50x25';

export interface LabelSizeInfo {
  /** กว้าง x สูง หน่วย มม. */
  w: number;
  h: number;
  /** "50 × 25 มม." */
  text: string;
  /** สีกรอบของม้วน (ใช้จำลองบนจอเท่านั้น) */
  frame: string;
  /** สีตัวอักษรตอนถูกเลือก (เข้มกว่ากรอบ อ่านง่าย) */
  ink: string;
  /** "ส้ม" / "เขียว" */
  color: string;
}

export const LABEL_SIZES: Record<LabelSize, LabelSizeInfo> = {
  '50x25': { w: 50, h: 25, text: '50 × 25 มม.', frame: '#f59e0b', ink: '#b45309', color: 'ส้ม' },
  '50x48': { w: 50, h: 48, text: '50 × 48 มม.', frame: '#16a34a', ink: '#15803d', color: 'เขียว' },
};

export const LABEL_SIZE_LIST = Object.keys(LABEL_SIZES) as LabelSize[];

/** คำอธิบายใต้ตัวอย่างบนจอ เช่น "ขนาดจริง 5.0 × 2.5 ซม. · กรอบสีส้มเป็นของม้วน..." */
export function previewNote(size: LabelSize): string {
  const s = LABEL_SIZES[size];
  return `ขนาดจริง ${(s.w / 10).toFixed(1)} × ${(s.h / 10).toFixed(1)} ซม. · กรอบสี${s.color}เป็นของม้วนสติ๊กเกอร์ ไม่ได้พิมพ์ออกไป`;
}
