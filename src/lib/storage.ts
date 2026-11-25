import type { AppData, Department, MasterItem, PrintLog, Staff, Unit } from './types';

/**
 * แปลงข้อมูล (จากไฟล์สำรอง / ฐานข้อมูล) ให้เข้ากับโครงสร้างปัจจุบัน
 * ข้อมูลจริงเก็บใน SQL Server ที่เครื่องแม่ — ดู src/server/ และ src/lib/store.tsx
 */

export const cleanPrefix = (p: unknown) =>
  String(p ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

/** แปลงข้อมูลเก่า (โปรแกรมเวอร์ชันก่อน) ให้เข้ากับโครงสร้างปัจจุบัน */
export function normalizeLog(raw: Partial<PrintLog> & Record<string, unknown>): PrintLog {
  const barcodeRaw = String(raw.barcode ?? '');
  const legacyNoBarcode = barcodeRaw.startsWith('-');
  const useBarcode = typeof raw.useBarcode === 'boolean' ? raw.useBarcode : !!barcodeRaw && !legacyNoBarcode;
  return {
    id: Number(raw.id),
    unitId: raw.unitId != null ? Number(raw.unitId) : undefined,
    itemId: Number(raw.itemId),
    name: String(raw.name ?? '').replace(/\s*\(พิมพ์ซ้ำ\)/g, ''),
    useBarcode,
    barcode: legacyNoBarcode ? '' : barcodeRaw,
    mfg: String(raw.mfg ?? ''),
    exp: String(raw.exp ?? ''),
    round: Number(raw.round) || 1,
    maxRound: Number(raw.maxRound) || 1,
    isReprint: !!raw.isReprint,
    sourceId: raw.sourceId != null ? Number(raw.sourceId) : undefined,
    skippedFrom: raw.skippedFrom != null ? Number(raw.skippedFrom) : undefined,
    note: raw.note ? String(raw.note) : undefined,
    codeType: raw.codeType === 'barcode' || raw.codeType === 'qr' || raw.codeType === 'none' ? raw.codeType : undefined,
    showMfg: raw.showMfg === false ? false : undefined,
    showExp: raw.showExp === false ? false : undefined,
    departmentId: raw.departmentId != null ? Number(raw.departmentId) : undefined,
    departmentName: raw.departmentName ? String(raw.departmentName) : undefined,
    showDept: raw.showDept === false ? false : undefined,
    staffId: raw.staffId != null ? Number(raw.staffId) : undefined,
    staffName: raw.staffName ? String(raw.staffName) : undefined,
    time: String(raw.time ?? ''),
    voidedAt: raw.voidedAt ? String(raw.voidedAt) : undefined,
    voidReason: raw.voidReason ? String(raw.voidReason) : undefined,
    voidByStaffId: raw.voidByStaffId != null ? Number(raw.voidByStaffId) : undefined,
    voidBy: raw.voidBy ? String(raw.voidBy) : undefined,
  };
}

export function normalizeData(raw: { items?: unknown; units?: unknown; logs?: unknown; staff?: unknown; departments?: unknown }): AppData {
  const items: MasterItem[] = Array.isArray(raw.items)
    ? (raw.items as Partial<MasterItem>[]).map((i) => ({
        id: Number(i.id),
        name: String(i.name ?? ''),
        shelf: Number(i.shelf) || 0,
        maxRound: Math.max(1, Number(i.maxRound) || 1),
        useBarcode: !!i.useBarcode,
        snPrefix: cleanPrefix(i.snPrefix) || `T${i.id}`,
      }))
    : [];
  const units: Unit[] = Array.isArray(raw.units)
    ? (raw.units as Unit[]).map((u) => ({
        id: Number(u.id),
        sn: String(u.sn ?? '').trim(),
        itemId: Number(u.itemId),
        maxRound: Math.max(1, Number(u.maxRound) || 1),
        manufacturerSn: !!u.manufacturerSn,
        registeredAt: String(u.registeredAt ?? ''),
        replacesSn: u.replacesSn || undefined,
        disposedAt: u.disposedAt || undefined,
        disposeReason: u.disposeReason || undefined,
        disposeNote: u.disposeNote || undefined,
      }))
    : [];
  const logs = Array.isArray(raw.logs) ? (raw.logs as PrintLog[]).map((l) => normalizeLog(l as never)) : [];
  const staff: Staff[] = Array.isArray(raw.staff)
    ? (raw.staff as Partial<Staff>[])
        .map((s) => ({
          id: Number(s.id),
          name: String(s.name ?? '').trim(),
          code: s.code ? String(s.code).trim() : undefined,
          active: s.active !== false,
        }))
        .filter((s) => s.name)
    : [];
  const departments: Department[] = Array.isArray(raw.departments)
    ? (raw.departments as Partial<Department>[])
        .map((d) => ({
          id: Number(d.id),
          name: String(d.name ?? '').trim(),
          code: d.code ? String(d.code).trim() : undefined,
          active: d.active !== false,
        }))
        .filter((d) => d.name)
    : [];
  return { items, units, logs, staff, departments };
}
