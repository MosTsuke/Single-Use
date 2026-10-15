import type { MasterItem, PrintLog, Unit, UnitStatus } from './types';

export const normSn = (sn: string) => sn.trim().toUpperCase();

/**
 * จำนวนรอบที่ใช้ไปแล้ว = รอบสูงสุดที่เคยพิมพ์ปกติ (ไม่นับพิมพ์ซ้ำ)
 * ใช้รอบสูงสุดแทนการนับครั้ง เพราะหน้างานพิมพ์ข้ามรอบได้ (มีหมายเหตุกำกับ)
 */
export function cyclesUsed(logs: PrintLog[], unitId: number): number {
  let n = 0;
  for (const l of logs) if (l.unitId === unitId && !l.isReprint && l.round > n) n = l.round;
  return n;
}

export function unitStatus(unit: Unit, used: number): UnitStatus {
  if (unit.disposedAt) return 'disposed';
  if (used === 0) return 'new';
  if (used >= unit.maxRound) return 'last';
  return 'active';
}

export const STATUS_META: Record<UnitStatus, { label: string; color: string; hint: string }> = {
  new: { label: 'ชิ้นใหม่', color: 'cyan', hint: 'ลงทะเบียนแล้ว ยังไม่เคย sterilize' },
  active: { label: 'ใช้งานได้', color: 'green', hint: 'ยังเหลือรอบให้ใช้' },
  last: { label: 'ครบรอบ — รอทำลาย', color: 'red', hint: 'ใช้รอบสุดท้ายแล้ว เมื่อกลับมาให้ทำลายและเปลี่ยนชิ้นใหม่' },
  disposed: { label: 'ทำลายแล้ว', color: 'default', hint: 'ไม่สามารถนำมาใช้ได้อีก' },
};

/**
 * สร้าง SN ใหม่ตามคำนำหน้าของประเภท เช่น SUC-000001
 * เลขรันต่อจากเลขที่มากที่สุดที่มีอยู่แล้วของคำนำหน้านั้น
 */
export function generateSns(item: MasterItem, units: Unit[], count: number): string[] {
  const prefix = item.snPrefix || `T${item.id}`;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const u of units) {
    const m = re.exec(u.sn.toUpperCase());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(max + i + 1).padStart(6, '0')}`);
}

/** SN ใช้กับบาร์โคด CODE128 ได้ (ตัวอักษร/ตัวเลขภาษาอังกฤษและสัญลักษณ์พื้นฐาน) */
export const SN_PATTERN = /^[\x21-\x7E]{1,40}$/;
