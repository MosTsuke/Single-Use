import type { Department, MasterItem, PrintLog, Staff, Unit } from './types';

/**
 * ส่วนที่เปลี่ยนหลังทำ action หนึ่ง — หน้าเว็บนำไปใส่ในข้อมูลที่โหลดไว้ (ไม่ต้องโหลดทั้งหมดใหม่)
 * reload = ให้โหลดข้อมูลทั้งหมดใหม่ (เช่น หลังนำเข้าข้อมูล)
 */
export interface Patch {
  items?: MasterItem[];
  units?: Unit[];
  logs?: PrintLog[];
  staff?: Staff[];
  departments?: Department[];
  removed?: { items?: number[]; logs?: number[]; staff?: number[]; departments?: number[] };
  reload?: boolean;
}

/**
 * ผลของ action ที่เซิร์ฟเวอร์ส่งกลับ
 * version = เลขรุ่นของข้อมูลหลังทำ (เพิ่มทีละ 1 ทุกครั้งที่มีการบันทึก จากเครื่องไหนก็ตาม)
 */
export type ActionResponse<T> =
  | { ok: true; value: T; patch: Patch; version: number }
  | { ok: false; error: string; version: number };
