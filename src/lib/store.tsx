'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nowStamp } from './date';
import { storage } from './storage';
import type { AppData, DisposeReason, MasterItem, PrintLog, Staff, Unit, UnitStatus } from './types';
import { cyclesUsed, generateSns, normSn, unitStatus } from './units';

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
  logs: PrintLog[];
  staff: Staff[];
  saveError: string | null;

  getUnitInfo: (unit: Unit) => UnitInfo;
  findUnitBySn: (sn: string) => Unit | undefined;
  suggestSns: (itemId: number, count: number) => string[];

  addItem: (data: Omit<MasterItem, 'id'>) => void;
  updateItem: (id: number, data: Omit<MasterItem, 'id'>) => void;
  deleteItem: (id: number) => Result<void>;

  addStaff: (data: Omit<Staff, 'id'>) => Result<Staff>;
  updateStaff: (id: number, data: Omit<Staff, 'id'>) => Result<Staff>;
  /** ลบได้เฉพาะคนที่ยังไม่เคยพิมพ์ — ถ้าเคยพิมพ์แล้วให้ปิดใช้งานแทน */
  deleteStaff: (id: number) => Result<void>;

  registerUnits: (input: { itemId: number; sns: string[]; manufacturerSn: boolean; replacesSn?: string }) => Result<Unit[]>;
  disposeUnit: (unitId: number, reason: DisposeReason, note?: string) => Result<Unit>;
  /**
   * sterilize เสร็จ → บันทึกรอบใหม่และคืนข้อมูลสำหรับพิมพ์
   * opts.round = พิมพ์ข้ามไปรอบที่ระบุ (ต้อง ≥ รอบถัดไป และ ≤ รอบสูงสุด) ต้องมี opts.note
   * staffId = เจ้าหน้าที่ผู้พิมพ์ (บังคับ)
   */
  sterilize: (unitId: number, mfg: string, exp: string, opts: { staffId: number; round?: number; note?: string }) => Result<PrintLog>;
  /** พิมพ์ซ้ำดวงเดิม — override.useBarcode ใช้กับดวงนี้ดวงเดียว */
  createReprint: (logId: number, override?: { useBarcode?: boolean }) => PrintLog | null;
  replaceAll: (data: AppData) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const nextId = (list: { id: number }[]) => (list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1);

function buildInfo(d: AppData, unit: Unit): UnitInfo {
  const used = cyclesUsed(d.logs, unit.id);
  const status = unitStatus(unit, used);
  let lastLog: PrintLog | undefined;
  for (let i = d.logs.length - 1; i >= 0; i--) {
    if (d.logs[i].unitId === unit.id) {
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>({ items: [], units: [], logs: [], staff: [] });
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // ค่าล่าสุดเสมอ ให้ action อ่าน/คืนค่าได้ทันทีโดยไม่รอ re-render
  const ref = useRef(data);

  useEffect(() => {
    storage.load().then((d) => {
      ref.current = d;
      setData(d);
      setReady(true);
    });
  }, []);

  const commit = useCallback((next: AppData) => {
    ref.current = next;
    setData(next);
    storage
      .save(next)
      .then(() => setSaveError(null))
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  }, []);

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

  const addItem = useCallback(
    (d: Omit<MasterItem, 'id'>) => {
      const cur = ref.current;
      commit({ ...cur, items: [...cur.items, { ...d, id: nextId(cur.items) }] });
    },
    [commit],
  );

  const updateItem = useCallback(
    (id: number, d: Omit<MasterItem, 'id'>) => {
      const cur = ref.current;
      commit({ ...cur, items: cur.items.map((i) => (i.id === id ? { ...d, id } : i)) });
    },
    [commit],
  );

  const deleteItem = useCallback(
    (id: number): Result<void> => {
      const cur = ref.current;
      const live = cur.units.filter((u) => u.itemId === id && !u.disposedAt).length;
      if (live) return { ok: false, error: `ยังมีอุปกรณ์ของรายการนี้ที่ยังไม่ถูกทำลาย ${live} ชิ้น` };
      commit({ ...cur, items: cur.items.filter((i) => i.id !== id) });
      return { ok: true, value: undefined };
    },
    [commit],
  );

  const staffNameTaken = (list: Staff[], name: string, exceptId?: number) =>
    list.some((s) => s.id !== exceptId && s.name.replace(/\s+/g, ' ').toLowerCase() === name.replace(/\s+/g, ' ').toLowerCase());

  const addStaff = useCallback<StoreValue['addStaff']>(
    (d) => {
      const cur = ref.current;
      const name = d.name.trim();
      if (!name) return { ok: false, error: 'กรุณากรอกชื่อ' };
      if (staffNameTaken(cur.staff, name)) return { ok: false, error: `มีชื่อ "${name}" อยู่แล้ว` };
      const s: Staff = { id: nextId(cur.staff), name, code: d.code?.trim() || undefined, active: d.active };
      commit({ ...cur, staff: [...cur.staff, s] });
      return { ok: true, value: s };
    },
    [commit],
  );

  const updateStaff = useCallback<StoreValue['updateStaff']>(
    (id, d) => {
      const cur = ref.current;
      const name = d.name.trim();
      if (!name) return { ok: false, error: 'กรุณากรอกชื่อ' };
      if (staffNameTaken(cur.staff, name, id)) return { ok: false, error: `มีชื่อ "${name}" อยู่แล้ว` };
      const s: Staff = { id, name, code: d.code?.trim() || undefined, active: d.active };
      commit({ ...cur, staff: cur.staff.map((x) => (x.id === id ? s : x)) });
      return { ok: true, value: s };
    },
    [commit],
  );

  const deleteStaff = useCallback<StoreValue['deleteStaff']>(
    (id) => {
      const cur = ref.current;
      const used = cur.logs.filter((l) => l.staffId === id).length;
      if (used) return { ok: false, error: `เจ้าหน้าที่คนนี้มีประวัติการพิมพ์ ${used} ดวง — ลบไม่ได้ ให้ปิดใช้งานแทน` };
      commit({ ...cur, staff: cur.staff.filter((s) => s.id !== id) });
      return { ok: true, value: undefined };
    },
    [commit],
  );

  const registerUnits = useCallback<StoreValue['registerUnits']>(
    ({ itemId, sns, manufacturerSn, replacesSn }) => {
      const cur = ref.current;
      const item = cur.items.find((i) => i.id === itemId);
      if (!item) return { ok: false, error: 'ไม่พบรายการอุปกรณ์' };
      const cleaned = sns.map((s) => s.trim()).filter(Boolean);
      if (!cleaned.length) return { ok: false, error: 'กรุณาระบุ SN' };
      const seen = new Set(cur.units.map((u) => normSn(u.sn)));
      for (const s of cleaned) {
        const k = normSn(s);
        if (seen.has(k)) return { ok: false, error: `SN ${s} มีอยู่ในระบบแล้ว` };
        seen.add(k);
      }
      const time = nowStamp();
      const units = [...cur.units];
      const created: Unit[] = cleaned.map((sn) => {
        const u: Unit = {
          id: nextId(units),
          sn,
          itemId,
          maxRound: item.maxRound,
          manufacturerSn,
          registeredAt: time,
          replacesSn,
        };
        units.push(u);
        return u;
      });
      commit({ ...cur, units });
      return { ok: true, value: created };
    },
    [commit],
  );

  const disposeUnit = useCallback<StoreValue['disposeUnit']>(
    (unitId, reason, note) => {
      const cur = ref.current;
      const u = cur.units.find((x) => x.id === unitId);
      if (!u) return { ok: false, error: 'ไม่พบอุปกรณ์' };
      if (u.disposedAt) return { ok: false, error: 'อุปกรณ์ชิ้นนี้ถูกทำลายไปแล้ว' };
      const updated: Unit = { ...u, disposedAt: nowStamp(), disposeReason: reason, disposeNote: note?.trim() || undefined };
      commit({ ...cur, units: cur.units.map((x) => (x.id === unitId ? updated : x)) });
      return { ok: true, value: updated };
    },
    [commit],
  );

  const sterilize = useCallback<StoreValue['sterilize']>(
    (unitId, mfg, exp, opts) => {
      const cur = ref.current;
      const u = cur.units.find((x) => x.id === unitId);
      if (!u) return { ok: false, error: 'ไม่พบอุปกรณ์' };
      const info = buildInfo(cur, u);
      if (info.nextRound == null) {
        return {
          ok: false,
          error: info.status === 'disposed' ? 'อุปกรณ์ชิ้นนี้ถูกทำลายแล้ว' : `ใช้ครบ ${u.maxRound} รอบแล้ว ต้องทำลาย`,
        };
      }
      const item = info.item;
      const round = opts?.round ?? info.nextRound;
      if (!Number.isInteger(round) || round < info.nextRound || round > u.maxRound) {
        return { ok: false, error: `รอบต้องอยู่ระหว่าง ${info.nextRound} ถึง ${u.maxRound}` };
      }
      const staff = cur.staff.find((s) => s.id === opts.staffId);
      if (!staff) return { ok: false, error: 'กรุณาเลือกเจ้าหน้าที่ผู้พิมพ์' };
      const skipped = round > info.nextRound;
      const note = opts?.note?.trim();
      if (skipped && !note) return { ok: false, error: 'พิมพ์ข้ามรอบต้องกรอกหมายเหตุ' };
      const log: PrintLog = {
        id: nextId(cur.logs),
        unitId: u.id,
        itemId: u.itemId,
        name: item?.name ?? '(รายการถูกลบ)',
        useBarcode: item?.useBarcode ?? true,
        barcode: u.sn,
        mfg,
        exp,
        round,
        maxRound: u.maxRound,
        isReprint: false,
        skippedFrom: skipped ? info.nextRound : undefined,
        note: note || undefined,
        staffId: staff.id,
        staffName: staff.name,
        time: nowStamp(),
      };
      commit({ ...cur, logs: [...cur.logs, log] });
      return { ok: true, value: log };
    },
    [commit],
  );

  const createReprint = useCallback(
    (logId: number, override?: { useBarcode?: boolean }) => {
      const cur = ref.current;
      const src = cur.logs.find((l) => l.id === logId);
      if (!src) return null;
      const log: PrintLog = {
        ...src,
        id: nextId(cur.logs),
        sourceId: src.sourceId ?? src.id,
        useBarcode: override?.useBarcode ?? src.useBarcode,
        isReprint: true, // ใช้ SN วันที่ และรอบเดิม ไม่นับรอบเพิ่ม
        time: nowStamp(),
      };
      commit({ ...cur, logs: [...cur.logs, log] });
      return log;
    },
    [commit],
  );

  const replaceAll = useCallback((d: AppData) => commit(d), [commit]);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      items: data.items,
      units: data.units,
      logs: data.logs,
      staff: data.staff,
      saveError,
      getUnitInfo,
      findUnitBySn,
      suggestSns,
      addItem,
      updateItem,
      deleteItem,
      addStaff,
      updateStaff,
      deleteStaff,
      registerUnits,
      disposeUnit,
      sterilize,
      createReprint,
      replaceAll,
    }),
    [ready, data, saveError, getUnitInfo, findUnitBySn, suggestSns, addItem, updateItem, deleteItem, addStaff, updateStaff, deleteStaff, registerUnits, disposeUnit, sterilize, createReprint, replaceAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
