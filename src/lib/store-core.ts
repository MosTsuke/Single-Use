import { createContext } from 'react';
import type { AppData, CodeType, Department, DisposeReason, MasterItem, PrintLog, Staff, Unit, UnitStatus } from './types';
import { cyclesUsed, unitStatus } from './units';

/**
 * ส่วนกลางของ store ที่ใช้ร่วมกันทั้ง 2 โหมด (ดู mode.tsx)
 * - store.tsx        โหมด db: ข้อมูลอยู่ใน SQL Server ที่เครื่องแม่
 * - store-local.tsx  โหมด demo: ข้อมูลอยู่ในเบราว์เซอร์ (Vercel / ทดสอบ) เหมือนรุ่นแรก
 */

export interface UnitInfo {
  unit: Unit;
  item?: MasterItem;
  used: number;
  status: UnitStatus;
  /** รอบที่จะพิมพ์ครั้งถัดไป (null = พิมพ์ไม่ได้) */
  nextRound: number | null;
  lastLog?: PrintLog;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface StoreValue {
  ready: boolean;
  items: MasterItem[];
  units: Unit[];
  /** ประวัติการพิมพ์ที่มีผล (ไม่รวมดวงที่ถูกยกเลิก) — ใช้นับรอบ รายงาน แดชบอร์ด */
  logs: PrintLog[];
  /** ประวัติการพิมพ์ทั้งหมด รวมดวงที่ถูกยกเลิก — ใช้แสดงประวัติ / สำรองข้อมูล */
  allLogs: PrintLog[];
  staff: Staff[];
  departments: Department[];
  /** เชื่อมต่อเครื่องแม่/ฐานข้อมูลไม่ได้ (null = ปกติ) */
  saveError: string | null;
  /** โหลดข้อมูลทั้งหมดใหม่จากเครื่องแม่ */
  reload: () => Promise<void>;

  getUnitInfo: (unit: Unit) => UnitInfo;
  findUnitBySn: (sn: string) => Unit | undefined;
  suggestSns: (itemId: number, count: number) => string[];

  addItem: (data: Omit<MasterItem, 'id'>) => Promise<Result<MasterItem>>;
  updateItem: (id: number, data: Omit<MasterItem, 'id'>) => Promise<Result<MasterItem>>;
  deleteItem: (id: number) => Promise<Result<void>>;

  addStaff: (data: Omit<Staff, 'id'>) => Promise<Result<Staff>>;
  updateStaff: (id: number, data: Omit<Staff, 'id'>) => Promise<Result<Staff>>;
  /** ลบได้เฉพาะคนที่ยังไม่เคยพิมพ์ — ถ้าเคยพิมพ์แล้วให้ปิดใช้งานแทน */
  deleteStaff: (id: number) => Promise<Result<void>>;

  addDepartment: (data: Omit<Department, 'id'>) => Promise<Result<Department>>;
  updateDepartment: (id: number, data: Omit<Department, 'id'>) => Promise<Result<Department>>;
  /** ลบได้เฉพาะหน่วยงานที่ยังไม่เคยถูกใช้ในการพิมพ์ — ถ้าเคยใช้แล้วให้ปิดใช้งานแทน */
  deleteDepartment: (id: number) => Promise<Result<void>>;

  registerUnits: (input: { itemId: number; sns: string[]; manufacturerSn: boolean; replacesSn?: string }) => Promise<Result<Unit[]>>;
  disposeUnit: (unitId: number, reason: DisposeReason, note?: string) => Promise<Result<Unit>>;
  /**
   * sterilize เสร็จ → บันทึกรอบใหม่และคืนข้อมูลสำหรับพิมพ์
   * opts.round = พิมพ์ข้ามไปรอบที่ระบุ (ต้อง ≥ รอบถัดไป และ ≤ รอบสูงสุด) ต้องมี opts.note
   * staffId = เจ้าหน้าที่ผู้พิมพ์ (บังคับ)
   */
  sterilize: (
    unitId: number,
    mfg: string,
    exp: string,
    opts: {
      staffId: number;
      round?: number;
      note?: string;
      showMfg?: boolean;
      showExp?: boolean;
      codeType?: CodeType;
      /** หน่วยงานที่นำไปใช้ (ไม่บังคับ) */
      departmentId?: number;
      showDept?: boolean;
    },
  ) => Promise<Result<PrintLog>>;
  /** พิมพ์ซ้ำดวงเดิม — override.codeType ใช้กับดวงนี้ดวงเดียว */
  createReprint: (logId: number, override?: { codeType?: CodeType }) => Promise<Result<PrintLog>>;
  /** ย้อนการพิมพ์ (กรณีกดยกเลิกในหน้าต่างพิมพ์) — ลบได้เฉพาะดวงล่าสุดของชิ้นนั้น */
  removeLogs: (ids: number[]) => Promise<Result<void>>;
  /** ยกเลิกใบที่พิมพ์ผิด (เฉพาะดวงล่าสุดของชิ้นนั้น) — คืนรอบเดิม และบันทึกการยกเลิกในประวัติ */
  voidPrint: (logId: number, input: { reason: string; staffId: number }) => Promise<Result<PrintLog>>;
  /** ดวงล่าสุดของชิ้นที่ยกเลิกได้ (ไม่มี = ยกเลิกไม่ได้) */
  voidableLog: (unit: Unit) => PrintLog | undefined;
  /** โหมด demo เท่านั้น: แทนที่ข้อมูลทั้งหมด (นำเข้าไฟล์สำรอง / โหลดข้อมูลตัวอย่าง) */
  replaceAll?: (data: AppData) => void;
}

export const StoreContext = createContext<StoreValue | null>(null);

export function buildInfo(d: AppData, unit: Unit): UnitInfo {
  const used = cyclesUsed(d.logs, unit.id);
  const status = unitStatus(unit, used);
  let lastLog: PrintLog | undefined;
  for (let i = d.logs.length - 1; i >= 0; i--) {
    if (d.logs[i].unitId === unit.id && !d.logs[i].voidedAt) {
      lastLog = d.logs[i];
      break;
    }
  }
  return {
    unit,
    item: d.items.find((i) => i.id === unit.itemId),
    used,
    status,
    nextRound: status === 'new' || status === 'active' ? used + 1 : null,
    lastLog,
  };
}

/** ดวงล่าสุดของชิ้นที่ยกเลิกได้ (ไม่มี = ยกเลิกไม่ได้) */
export function findVoidable(d: AppData, unit: Unit): PrintLog | undefined {
  if (unit.disposedAt) return undefined;
  let last: PrintLog | undefined;
  for (const l of d.logs) if (l.unitId === unit.id && !l.isReprint && !l.voidedAt && (!last || l.id > last.id)) last = l;
  return last;
}
