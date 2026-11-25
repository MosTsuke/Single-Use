'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nowStamp } from './date';
import { storage } from './storage';
import { buildInfo, findVoidable, StoreContext, type Result, type StoreValue } from './store-core';
import type { AppData, CodeType, Department, MasterItem, PrintLog, Staff, Unit } from './types';
import { generateSns, normSn } from './units';

/**
 * โหมด demo (Vercel / ทดสอบ — ไม่ได้ต่อฐานข้อมูล): ข้อมูลเก็บใน localStorage ของเบราว์เซอร์เครื่องนั้น
 * ทำงานแบบเดียวกับรุ่นแรกทุกอย่าง (ตรวจกฎในเบราว์เซอร์ บันทึกทันที) มีปุ่มโหลดข้อมูลตัวอย่าง / นำเข้าไฟล์สำรอง
 * โหมด db (หน้างานจริง) ใช้ store.tsx — กฎต้องตรงกันทั้งสองที่ (ฝั่ง db ตรวจซ้ำใน src/server/repo.ts)
 */

/** action ของ StoreValue แต่คืนผลทันที (ไม่ใช่ Promise) */
type Sync<K extends keyof StoreValue> = StoreValue[K] extends (...a: infer A) => Promise<infer R> ? (...a: A) => R : never;

const nextId = (list: { id: number }[]) => (list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1);

export function LocalStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>({ items: [], units: [], logs: [], staff: [], departments: [] });
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
    (d: Omit<MasterItem, 'id'>): MasterItem => {
      const cur = ref.current;
      const item = { ...d, id: nextId(cur.items) };
      commit({ ...cur, items: [...cur.items, item] });
      return item;
    },
    [commit],
  );

  const updateItem = useCallback(
    (id: number, d: Omit<MasterItem, 'id'>): MasterItem => {
      const cur = ref.current;
      commit({ ...cur, items: cur.items.map((i) => (i.id === id ? { ...d, id } : i)) });
      return { ...d, id };
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

  const addStaff = useCallback<Sync<'addStaff'>>(
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

  const updateStaff = useCallback<Sync<'updateStaff'>>(
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

  const deleteStaff = useCallback<Sync<'deleteStaff'>>(
    (id) => {
      const cur = ref.current;
      const used = cur.logs.filter((l) => l.staffId === id).length;
      if (used) return { ok: false, error: `เจ้าหน้าที่คนนี้มีประวัติการพิมพ์ ${used} ดวง — ลบไม่ได้ ให้ปิดใช้งานแทน` };
      commit({ ...cur, staff: cur.staff.filter((s) => s.id !== id) });
      return { ok: true, value: undefined };
    },
    [commit],
  );

  const deptNameTaken = (list: Department[], name: string, exceptId?: number) =>
    list.some((d) => d.id !== exceptId && d.name.replace(/\s+/g, ' ').toLowerCase() === name.replace(/\s+/g, ' ').toLowerCase());

  const addDepartment = useCallback<Sync<'addDepartment'>>(
    (d) => {
      const cur = ref.current;
      const name = d.name.trim();
      if (!name) return { ok: false, error: 'กรุณากรอกชื่อหน่วยงาน' };
      if (deptNameTaken(cur.departments, name)) return { ok: false, error: `มีหน่วยงาน "${name}" อยู่แล้ว` };
      const x: Department = { id: nextId(cur.departments), name, code: d.code?.trim() || undefined, active: d.active };
      commit({ ...cur, departments: [...cur.departments, x] });
      return { ok: true, value: x };
    },
    [commit],
  );

  const updateDepartment = useCallback<Sync<'updateDepartment'>>(
    (id, d) => {
      const cur = ref.current;
      const name = d.name.trim();
      if (!name) return { ok: false, error: 'กรุณากรอกชื่อหน่วยงาน' };
      if (deptNameTaken(cur.departments, name, id)) return { ok: false, error: `มีหน่วยงาน "${name}" อยู่แล้ว` };
      const x: Department = { id, name, code: d.code?.trim() || undefined, active: d.active };
      commit({ ...cur, departments: cur.departments.map((y) => (y.id === id ? x : y)) });
      return { ok: true, value: x };
    },
    [commit],
  );

  const deleteDepartment = useCallback<Sync<'deleteDepartment'>>(
    (id) => {
      const cur = ref.current;
      const used = cur.logs.filter((l) => l.departmentId === id).length;
      if (used) return { ok: false, error: `หน่วยงานนี้มีประวัติการพิมพ์ ${used} ดวง — ลบไม่ได้ ให้ปิดใช้งานแทน` };
      commit({ ...cur, departments: cur.departments.filter((d) => d.id !== id) });
      return { ok: true, value: undefined };
    },
    [commit],
  );

  const registerUnits = useCallback<Sync<'registerUnits'>>(
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

  const disposeUnit = useCallback<Sync<'disposeUnit'>>(
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

  const sterilize = useCallback<Sync<'sterilize'>>(
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
        // ชนิดรหัสของดวงนี้ (ไม่ระบุ = ตามค่าของรายการอุปกรณ์)
        codeType: opts.codeType ?? ((item?.useBarcode ?? true) ? 'barcode' : 'none'),
        useBarcode: (opts.codeType ?? ((item?.useBarcode ?? true) ? 'barcode' : 'none')) === 'barcode',
        barcode: u.sn,
        mfg,
        exp,
        round,
        maxRound: u.maxRound,
        isReprint: false,
        skippedFrom: skipped ? info.nextRound : undefined,
        note: note || undefined,
        showMfg: opts.showMfg === false ? false : undefined,
        showExp: opts.showExp === false ? false : undefined,
        ...(() => {
          const dept = opts.departmentId != null ? cur.departments.find((d) => d.id === opts.departmentId) : undefined;
          return dept
            ? { departmentId: dept.id, departmentName: dept.name, showDept: opts.showDept === false ? false : undefined }
            : {};
        })(),
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
    (logId: number, override?: { codeType?: CodeType }) => {
      const cur = ref.current;
      const src = cur.logs.find((l) => l.id === logId);
      if (!src) return null;
      const log: PrintLog = {
        ...src,
        id: nextId(cur.logs),
        sourceId: src.sourceId ?? src.id,
        codeType: override?.codeType ?? src.codeType,
        useBarcode: override?.codeType ? override.codeType === 'barcode' : src.useBarcode,
        isReprint: true, // ใช้ SN วันที่ และรอบเดิม ไม่นับรอบเพิ่ม
        time: nowStamp(),
      };
      commit({ ...cur, logs: [...cur.logs, log] });
      return log;
    },
    [commit],
  );

  const replaceAll = useCallback((d: AppData) => commit(d), [commit]);

  const voidableLog = useCallback((unit: Unit) => findVoidable(data, unit), [data]);

  const voidPrint = useCallback<Sync<'voidPrint'>>(
    (logId, { reason, staffId }) => {
      const cur = ref.current;
      const log = cur.logs.find((l) => l.id === logId);
      if (!log) return { ok: false, error: 'ไม่พบใบที่พิมพ์' };
      if (log.voidedAt) return { ok: false, error: 'ใบนี้ถูกยกเลิกไปแล้ว' };
      if (log.isReprint) return { ok: false, error: 'ยกเลิกได้เฉพาะใบที่พิมพ์ปกติ (พิมพ์ซ้ำจะถูกยกเลิกตามใบหลัก)' };
      const unit = cur.units.find((u) => u.id === log.unitId);
      if (!unit) return { ok: false, error: 'ไม่พบอุปกรณ์' };
      if (unit.disposedAt) return { ok: false, error: 'ชิ้นนี้ถูกทำลายแล้ว ยกเลิกการพิมพ์ไม่ได้' };
      if (findVoidable(cur, unit)?.id !== log.id) return { ok: false, error: 'ยกเลิกได้เฉพาะใบล่าสุดของชิ้นนี้' };
      const why = reason.trim();
      if (!why) return { ok: false, error: 'กรุณาระบุเหตุผลที่ยกเลิก' };
      const staff = cur.staff.find((s) => s.id === staffId);
      if (!staff) return { ok: false, error: 'กรุณาเลือกเจ้าหน้าที่ผู้ยกเลิก' };
      const mark = { voidedAt: nowStamp(), voidReason: why, voidByStaffId: staff.id, voidBy: staff.name };
      const logs = cur.logs.map((l) => (l.id === log.id || (l.isReprint && l.sourceId === log.id) ? { ...l, ...mark } : l));
      commit({ ...cur, logs });
      return { ok: true, value: { ...log, ...mark } };
    },
    [commit],
  );

  const removeLogs = useCallback<Sync<'removeLogs'>>(
    (ids) => {
      const cur = ref.current;
      const del = new Set(ids);
      for (const id of ids) {
        const l = cur.logs.find((x) => x.id === id);
        if (!l) continue;
        // มีการพิมพ์ของชิ้นนี้ต่อจากดวงนี้แล้ว → ย้อนไม่ได้ (กันรอบเพี้ยน)
        const later = cur.logs.some((x) => !del.has(x.id) && x.id > l.id && (x.unitId === l.unitId || x.sourceId === l.id));
        if (later) return { ok: false, error: `${l.barcode} มีการพิมพ์ต่อจากนี้แล้ว — ย้อนกลับไม่ได้` };
      }
      commit({ ...cur, logs: cur.logs.filter((x) => !del.has(x.id)) });
      return { ok: true, value: undefined };
    },
    [commit],
  );

  const activeLogs = useMemo(() => data.logs.filter((l) => !l.voidedAt), [data.logs]);

  // หน้าเว็บเรียก action แบบ async (เหมือนโหมด db) — ที่นี่ทำเสร็จทันที
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
      reload: async () => {},
      getUnitInfo,
      findUnitBySn,
      suggestSns,
      voidableLog,
      addItem: async (d) => ({ ok: true, value: addItem(d) }),
      updateItem: async (id, d) => ({ ok: true, value: updateItem(id, d) }),
      deleteItem: async (id) => deleteItem(id),
      addStaff: async (d) => addStaff(d),
      updateStaff: async (id, d) => updateStaff(id, d),
      deleteStaff: async (id) => deleteStaff(id),
      addDepartment: async (d) => addDepartment(d),
      updateDepartment: async (id, d) => updateDepartment(id, d),
      deleteDepartment: async (id) => deleteDepartment(id),
      registerUnits: async (input) => registerUnits(input),
      disposeUnit: async (unitId, reason, note) => disposeUnit(unitId, reason, note),
      sterilize: async (unitId, mfg, exp, opts) => sterilize(unitId, mfg, exp, opts),
      createReprint: async (logId, override) => {
        const r = createReprint(logId, override);
        return r ? { ok: true, value: r } : { ok: false, error: 'ไม่พบใบที่พิมพ์' };
      },
      removeLogs: async (ids) => removeLogs(ids),
      voidPrint: async (logId, input) => voidPrint(logId, input),
      replaceAll,
    }),
    [ready, data, activeLogs, saveError, getUnitInfo, findUnitBySn, suggestSns, voidableLog, addItem, updateItem, deleteItem, addStaff, updateStaff, deleteStaff, addDepartment, updateDepartment, deleteDepartment, registerUnits, disposeUnit, sterilize, createReprint, removeLogs, voidPrint, replaceAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
