/** ประเภทอุปกรณ์ (ข้อมูลถาวร) เช่น "สาย Suction" */
export interface MasterItem {
  id: number;
  name: string;
  /** อายุหลัง sterilize (วัน) — ใช้คำนวณวันหมดอายุบนสติ๊กเกอร์ */
  shelf: number;
  /** จำนวนรอบสูงสุดที่อุปกรณ์ 1 ชิ้นใช้ได้ ก่อนต้องทำลาย */
  maxRound: number;
  /** พิมพ์บาร์โคด SN บนสติ๊กเกอร์หรือไม่ */
  useBarcode: boolean;
  /** คำนำหน้า SN ที่ระบบสร้างให้ เช่น "SUC" → SUC-000001 */
  snPrefix: string;
}

export type DisposeReason = 'max_round' | 'damaged' | 'lost' | 'other';

/** อุปกรณ์ 1 ชิ้น ติดตามด้วย SN */
export interface Unit {
  id: number;
  /** Serial Number — ไม่ซ้ำกันทั้งระบบ, เป็นค่าบนบาร์โคด */
  sn: string;
  itemId: number;
  /** รอบสูงสุดของชิ้นนี้ (บันทึกไว้ตอนลงทะเบียน แก้ประเภทภายหลังไม่กระทบชิ้นเดิม) */
  maxRound: number;
  /** SN มาจากผู้ผลิต (true) หรือระบบสร้างให้ (false) */
  manufacturerSn: boolean;
  /** YYYY-MM-DD HH:mm */
  registeredAt: string;
  /** SN ของชิ้นเดิมที่ชิ้นนี้มาทดแทน */
  replacesSn?: string;
  disposedAt?: string;
  disposeReason?: DisposeReason;
  disposeNote?: string;
}

/** สถานะของอุปกรณ์ 1 ชิ้น (คำนวณจากประวัติ) */
export type UnitStatus =
  | 'new' // ลงทะเบียนแล้ว ยังไม่เคยพิมพ์
  | 'active' // ใช้งานอยู่ ยังเหลือรอบ
  | 'last' // พิมพ์รอบสุดท้ายไปแล้ว — กลับมาครั้งหน้าต้องทำลาย
  | 'disposed'; // ทำลายแล้ว

/** ประวัติการพิมพ์สติ๊กเกอร์ 1 ดวง (= sterilize 1 ครั้ง ยกเว้นพิมพ์ซ้ำ) */
export interface PrintLog {
  id: number;
  /** ไม่มีในข้อมูลเก่าก่อนระบบ SN */
  unitId?: number;
  itemId: number;
  name: string;
  useBarcode: boolean;
  /** SN ของชิ้น (ข้อมูลเก่าคือเลขบาร์โคด) */
  barcode: string;
  /** วันที่ sterilize / ผลิต YYYY-MM-DD */
  mfg: string;
  /** YYYY-MM-DD */
  exp: string;
  round: number;
  maxRound: number;
  isReprint: boolean;
  /** id ของการพิมพ์ต้นฉบับ (เฉพาะการพิมพ์ซ้ำ) */
  sourceId?: number;
  /** YYYY-MM-DD HH:mm ตามเวลาเครื่อง */
  time: string;
}

/** ข้อมูลที่ใช้วาดสติ๊กเกอร์ */
export interface StickerData {
  name: string;
  useBarcode: boolean;
  barcode: string;
  mfg: string;
  exp: string;
  round: number;
  maxRound: number;
}

export interface AppData {
  items: MasterItem[];
  units: Unit[];
  logs: PrintLog[];
}

export const DISPOSE_REASON_LABEL: Record<DisposeReason, string> = {
  max_round: 'ครบจำนวนรอบ',
  damaged: 'ชำรุด / เสียหาย',
  lost: 'สูญหาย',
  other: 'อื่น ๆ',
};
