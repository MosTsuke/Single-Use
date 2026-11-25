'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { callAction, getAppData, getJSON } from './api';
import type { Patch } from './api-types';
import { useMode } from './mode';
import { buildInfo, findVoidable, StoreContext, type StoreValue } from './store-core';
import { LocalStoreProvider } from './store-local';
import type { AppData, CodeType, Department, DisposeReason, MasterItem, PrintLog, Staff, Unit } from './types';
import { cyclesUsed, generateSns, normSn } from './units';

export type { Result, StoreValue, UnitInfo } from './store-core';

/**
 * ข้อมูลกลางของโปรแกรม — โหมด db: เก็บใน SQL Server ที่เครื่องแม่ (ผ่าน /api/...)
 * (โหมด demo ใช้ store-local.tsx เก็บในเบราว์เซอร์ — เลือกให้เองใน StoreProvider ด้านล่าง)
 *
 * - เปิดหน้าเว็บ: โหลดข้อมูลทั้งหมดครั้งเดียว แล้วคำนวณสถานะ/รายงานในเครื่อง (เหมือนเดิม)
 * - บันทึก: ส่งไปให้เซิร์ฟเวอร์ตรวจและบันทึกใน transaction แล้วนำส่วนที่เปลี่ยนมาใส่ในข้อมูลที่โหลดไว้
 * - หลายเครื่องใช้พร้อมกัน: ทุก 4 วินาทีถามเลขรุ่นของข้อมูล ถ้าเครื่องอื่นบันทึกอะไรไป จะโหลดใหม่ให้เอง
 */

const EMPTY: AppData = { items: [], units: [], logs: [], staff: [], departments: [] };
const POLL_MS = 4000;

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

/** เลือกที่เก็บข้อมูลตามโหมด: ต่อ SQL Server (หน้างาน) / เก็บในเบราว์เซอร์ (ทดสอบ) */
export function StoreProvider({ children }: { children: ReactNode }) {
  return useMode() === 'demo' ? <LocalStoreProvider>{children}</LocalStoreProvider> : <DbStoreProvider>{children}</DbStoreProvider>;
}

function DbStoreProvider({ children }: { children: ReactNode }) {
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
    async <T,>(name: string, args: unknown): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
      const before = versionRef.current;
      const res = await callAction<T>(name, args);
      if (!res.ok) {
        if (res.version === -1) setSaveError(res.error);
        // มีเครื่องอื่นบันทึกไปก่อน (มักเป็นสาเหตุที่ไม่ผ่าน) → โหลดข้อมูลล่าสุด
        else if (res.version !== before) void reload();
        return { ok: false, error: res.error };
      }
      setSaveError(null);
      const next = applyPatch(ref.current, res.patch);
      ref.current = next;
      setData(next);
      // ระหว่างนี้เครื่องอื่นบันทึกอะไรไปด้วย → โหลดใหม่ทั้งหมด
      if (before != null && res.version === before + 1) versionRef.current = res.version;
      else void reload();
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
