'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { callAction, getAppData, getJSON } from './api';
import type { Patch } from './api-types';
import type { AppData, CodeType, Department, DisposeReason, MasterItem, PrintLog, Staff, Unit, UnitStatus } from './types';
import { cyclesUsed, generateSns, normSn, unitStatus } from './units';

/**
 * ข้อมูลกลางของโปรแกรม — เก็บใน SQL Server ที่เครื่องแม่ (ผ่าน /api/...)
 *
 * - เปิดหน้าเว็บ: โหลดข้อมูลทั้งหมดครั้งเดียว แล้วคำนวณสถานะ/รายงานในเครื่อง (เหมือนเดิม)
 * - บันทึก: ส่งไปให้เซิร์ฟเวอร์ตรวจและบันทึกใน transaction แล้วนำส่วนที่เปลี่ยนมาใส่ในข้อมูลที่โหลดไว้
 * - หลายเครื่องใช้พร้อมกัน: ทุก 4 วินาทีถามเลขรุ่นของข้อมูล ถ้าเครื่องอื่นบันทึกอะไรไป จะโหลดใหม่ให้เอง
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

interface StoreValue {
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
  /** นำเข้าข้อมูลจากไฟล์สำรอง (ได้เฉพาะตอนฐานข้อมูลยังว่าง) */
  importData: (data: AppData) => Promise<Result<{ skipped: number }>>;
  /** ย้อนการพิมพ์ (กรณีกดยกเลิกในหน้าต่างพิมพ์) — ลบได้เฉพาะดวงล่าสุดของชิ้นนั้น */
  removeLogs: (ids: number[]) => Promise<Result<void>>;
  /** ยกเลิกใบที่พิมพ์ผิด (เฉพาะดวงล่าสุดของชิ้นนั้น) — คืนรอบเดิม และบันทึกการยกเลิกในประวัติ */
  voidPrint: (logId: number, input: { reason: string; staffId: number }) => Promise<Result<PrintLog>>;
  /** ดวงล่าสุดของชิ้นที่ยกเลิกได้ (ไม่มี = ยกเลิกไม่ได้) */
  voidableLog: (unit: Unit) => PrintLog | undefined;
}

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY: AppData = { items: [], units: [], logs: [], staff: [], departments: [] };
const POLL_MS = 4000;

function buildInfo(d: AppData, unit: Unit): UnitInfo {
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

/** ใส่แถวที่เปลี่ยน/เพิ่ม และเอาแถวที่ถูกลบออก (เรียงตาม id เสมอ) */
function merge<T extends { id: number }>(list: T[], rows?: T[], removed?: number[]): T[] {
  if (!rows?.length && !removed?.length) return list;
  const rm = new Set(removed ?? []);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const out = list.filter((x) => !rm.has(x.id)).map((x) => byId.get(x.id) ?? x);
  const have = new Set(out.map((x) => x.id));
  const added = (rows ?? []).filter((r) => !have.has(r.id));
  if (!added.length) return out;
  return [...out, ...added].sort((a, b) => a.id - b.id);
}

const applyPatch = (d: AppData, p: Patch): AppData => ({
  items: merge(d.items, p.items, p.removed?.items),
  units: merge(d.units, p.units),
  logs: merge(d.logs, p.logs, p.removed?.logs),
  staff: merge(d.staff, p.staff, p.removed?.staff),
  departments: merge(d.departments, p.departments, p.removed?.departments),
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // ค่าล่าสุดเสมอ ให้ action อ่านได้ทันทีโดยไม่รอ re-render
  const ref = useRef(data);
  const versionRef = useRef<number | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const reload = useCallback(async (): Promise<void> => {
    // โหลดอยู่แล้ว → โหลดซ้ำอีกรอบหลังรอบนี้เสร็จ (กันพลาดการเปลี่ยนแปลงระหว่างโหลด)
    if (loading.current) {
      again.current = true;
      return loading.current;
    }
    loading.current = (async () => {
      do {
        again.current = false;
        try {
          const r = await getAppData<{ data: AppData; version: number }>();
          ref.current = r.data;
          versionRef.current = r.version;
          setData(r.data);
          setReady(true);
          setSaveError(null);
        } catch (e) {
          setSaveError(e instanceof Error ? e.message : String(e));
        }
      } while (again.current);
    })().finally(() => {
      loading.current = null;
    });
    return loading.current;
  }, []);

  useEffect(() => {
    void reload();
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { version } = await getJSON<{ version: number }>('/api/version');
        if (version !== versionRef.current) await reload();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [reload]);

  /** ส่งงานให้เซิร์ฟเวอร์ แล้วอัปเดตข้อมูลในเครื่องตามผล */
  const run = useCallback(
    async <T,>(name: string, args: unknown): Promise<Result<T>> => {
      const before = versionRef.current;
      const res = await callAction<T>(name, args);
      if (!res.ok) {
        if (res.version === -1) setSaveError(res.error);
        // มีเครื่องอื่นบันทึกไปก่อน (มักเป็นสาเหตุที่ไม่ผ่าน) → โหลดข้อมูลล่าสุด
        else if (res.version !== before) void reload();
        return { ok: false, error: res.error };
      }
      setSaveError(null);
      if (res.patch.reload) {
        await reload();
      } else {
        const next = applyPatch(ref.current, res.patch);
        ref.current = next;
        setData(next);
        // ระหว่างนี้เครื่องอื่นบันทึกอะไรไปด้วย → โหลดใหม่ทั้งหมด
        if (before != null && res.version === before + 1) versionRef.current = res.version;
        else void reload();
      }
      return { ok: true, value: res.value };
    },
    [reload],
  );

  // ฟังก์ชันอ่านข้อมูลผูกกับ data เพื่อให้คอมโพเนนต์ re-render เมื่อข้อมูลเปลี่ยน
  const getUnitInfo = useCallback((u: Unit) => buildInfo(data, u), [data]);
  const findUnitBySn = useCallback(
    (sn: string) => {
      const k = normSn(sn);
      return k ? data.units.find((u) => normSn(u.sn) === k) : undefined;
    },
    [data],
  );
  const suggestSns = useCallback(
    (itemId: number, count: number) => {
      const item = data.items.find((i) => i.id === itemId);
      return item ? generateSns(item, data.units, count) : [];
    },
    [data],
  );

  const findVoidable = (d: AppData, unit: Unit): PrintLog | undefined => {
    if (unit.disposedAt) return undefined;
    let last: PrintLog | undefined;
    for (const l of d.logs) if (l.unitId === unit.id && !l.isReprint && !l.voidedAt && (!last || l.id > last.id)) last = l;
    return last;
  };
  const voidableLog = useCallback((unit: Unit) => findVoidable(data, unit), [data]);

  const actions = useMemo(
    () => ({
      addItem: (d: Omit<MasterItem, 'id'>) => run<MasterItem>('addItem', { data: d }),
      updateItem: (id: number, d: Omit<MasterItem, 'id'>) => run<MasterItem>('updateItem', { id, data: d }),
      deleteItem: (id: number) => run<void>('deleteItem', { id }),
      addStaff: (d: Omit<Staff, 'id'>) => run<Staff>('saveStaff', { data: d }),
      updateStaff: (id: number, d: Omit<Staff, 'id'>) => run<Staff>('saveStaff', { id, data: d }),
      deleteStaff: (id: number) => run<void>('deleteStaff', { id }),
      addDepartment: (d: Omit<Department, 'id'>) => run<Department>('saveDepartment', { data: d }),
      updateDepartment: (id: number, d: Omit<Department, 'id'>) => run<Department>('saveDepartment', { id, data: d }),
      deleteDepartment: (id: number) => run<void>('deleteDepartment', { id }),
      registerUnits: (input: { itemId: number; sns: string[]; manufacturerSn: boolean; replacesSn?: string }) => run<Unit[]>('registerUnits', input),
      disposeUnit: (unitId: number, reason: DisposeReason, note?: string) => run<Unit>('disposeUnit', { unitId, reason, note }),
      sterilize: (unitId: number, mfg: string, exp: string, opts: Parameters<StoreValue['sterilize']>[3]) =>
        // รอบที่ใช้ไปตามที่หน้าจอนี้เห็น — เซิร์ฟเวอร์ปฏิเสธถ้าเครื่องอื่นพิมพ์ชิ้นนี้ไปก่อน
        run<PrintLog>('sterilize', { unitId, mfg, exp, ...opts, expectedUsed: cyclesUsed(ref.current.logs, unitId) }),
      createReprint: (logId: number, override?: { codeType?: CodeType }) => run<PrintLog>('createReprint', { logId, codeType: override?.codeType }),
      importData: (d: AppData) => run<{ skipped: number }>('importData', { data: d }),
      removeLogs: (ids: number[]) => run<void>('removeLogs', { ids }),
      voidPrint: (logId: number, input: { reason: string; staffId: number }) => run<PrintLog>('voidPrint', { logId, ...input }),
    }),
    [run],
  );

  const activeLogs = useMemo(() => data.logs.filter((l) => !l.voidedAt), [data.logs]);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      items: data.items,
      units: data.units,
      logs: activeLogs,
      allLogs: data.logs,
      staff: data.staff,
      departments: data.departments,
      saveError,
      reload,
      getUnitInfo,
      findUnitBySn,
      suggestSns,
      voidableLog,
      ...actions,
    }),
    [ready, data, saveError, reload, getUnitInfo, findUnitBySn, suggestSns, voidableLog, actions, activeLogs],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
