import type { AppData, MasterItem, PrintLog, Staff, Unit } from './types';

/**
 * ชั้นจัดเก็บข้อมูล — ตอนนี้ใช้ localStorage ของเบราว์เซอร์
 * ถ้าภายหลังจะย้ายไปฐานข้อมูลจริง ให้เขียนคลาสใหม่ที่ implement interface นี้
 * (เช่น เรียก API) แล้วเปลี่ยนที่ `storage` ด้านล่างจุดเดียว
 */
export interface DataStorage {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}

const KEY_ITEMS = 'sticker_masterItems';
const KEY_UNITS = 'sticker_units';
const KEY_LOGS = 'sticker_printLogs';
const KEY_STAFF = 'sticker_staff';

export const DEFAULT_ITEMS: MasterItem[] = [
  { id: 1, name: 'สาย Suction', shelf: 61, maxRound: 4, useBarcode: true, snPrefix: 'SUC' },
  { id: 2, name: 'Set B (ชุดอุปกรณ์เสริม)', shelf: 30, maxRound: 2, useBarcode: false, snPrefix: 'SETB' },
  { id: 3, name: 'Set C (ชุดผ่าตัดเล็ก)', shelf: 3, maxRound: 5, useBarcode: true, snPrefix: 'SETC' },
];

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

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
    staffId: raw.staffId != null ? Number(raw.staffId) : undefined,
    staffName: raw.staffName ? String(raw.staffName) : undefined,
    time: String(raw.time ?? ''),
  };
}

export function normalizeData(raw: { items?: unknown; units?: unknown; logs?: unknown; staff?: unknown }): AppData {
  const items: MasterItem[] = Array.isArray(raw.items)
    ? (raw.items as Partial<MasterItem>[]).map((i) => ({
        id: Number(i.id),
        name: String(i.name ?? ''),
        shelf: Number(i.shelf) || 0,
        maxRound: Math.max(1, Number(i.maxRound) || 1),
        useBarcode: !!i.useBarcode,
        snPrefix: cleanPrefix(i.snPrefix) || `T${i.id}`,
      }))
    : DEFAULT_ITEMS;
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
  return { items, units, logs, staff };
}

class LocalStorageDataStorage implements DataStorage {
  async load(): Promise<AppData> {
    return normalizeData({
      items: readJSON<MasterItem[]>(KEY_ITEMS) ?? undefined,
      units: readJSON<Unit[]>(KEY_UNITS) ?? [],
      logs: readJSON<PrintLog[]>(KEY_LOGS) ?? [],
      staff: readJSON<Staff[]>(KEY_STAFF) ?? [],
    });
  }

  async save(data: AppData): Promise<void> {
    window.localStorage.setItem(KEY_ITEMS, JSON.stringify(data.items));
    window.localStorage.setItem(KEY_UNITS, JSON.stringify(data.units));
    window.localStorage.setItem(KEY_LOGS, JSON.stringify(data.logs));
    window.localStorage.setItem(KEY_STAFF, JSON.stringify(data.staff));
  }
}

export const storage: DataStorage = new LocalStorageDataStorage();
