import { dayjs, ISO_DATE } from './date';
import type { AppData, DisposeReason, MasterItem, PrintLog, Unit } from './types';

/**
 * สร้างข้อมูลจำลองสำหรับสาธิตระบบ — ย้อนหลังประมาณ 5 เดือนนับจากวันนี้
 * ใช้ตัวสุ่มแบบกำหนด seed ได้ เพื่อให้กดโหลดกี่ครั้งก็ได้ข้อมูลชุดเดิม (เลื่อนตามวันที่ปัจจุบัน)
 */

const DEMO_ITEMS: MasterItem[] = [
  { id: 1, name: 'สาย Suction', shelf: 61, maxRound: 4, useBarcode: true, snPrefix: 'SUC' },
  { id: 2, name: 'ชุดทำแผล', shelf: 30, maxRound: 5, useBarcode: true, snPrefix: 'DRS' },
  { id: 3, name: 'ชุดเย็บแผล', shelf: 30, maxRound: 3, useBarcode: true, snPrefix: 'STU' },
  { id: 4, name: 'หน้ากาก Ambu bag', shelf: 90, maxRound: 10, useBarcode: true, snPrefix: 'AMB' },
  { id: 5, name: 'ใบ Laryngoscope', shelf: 180, maxRound: 20, useBarcode: true, snPrefix: 'LRY' },
  { id: 6, name: 'ชุดสวนปัสสาวะ', shelf: 30, maxRound: 3, useBarcode: false, snPrefix: 'FOL' },
];

/** ต่อประเภท: จำนวนชิ้นที่หมุนเวียน, ช่วงวันระหว่างรอบ, SN จากผู้ผลิตหรือไม่ */
const PLAN: Record<number, { units: number; gap: [number, number]; manufacturer?: boolean }> = {
  1: { units: 10, gap: [8, 20] },
  2: { units: 8, gap: [5, 14] },
  3: { units: 6, gap: [7, 18] },
  4: { units: 4, gap: [10, 25] },
  5: { units: 3, gap: [4, 9], manufacturer: true },
  6: { units: 5, gap: [10, 22] },
};

const HISTORY_DAYS = 150;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoData(seed = 20261014): AppData {
  const rnd = mulberry32(seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const today = dayjs().startOf('day');
  const start = today.subtract(HISTORY_DAYS, 'day');
  const stamp = (d: dayjs.Dayjs) => d.hour(int(8, 16)).minute(int(0, 59)).format('YYYY-MM-DD HH:mm');

  type DraftUnit = Omit<Unit, 'id'> & { key: number };
  type DraftLog = Omit<PrintLog, 'id' | 'unitId' | 'sourceId'> & { unitKey: number; srcKey?: number; key: number };
  const units: DraftUnit[] = [];
  const logs: DraftLog[] = [];
  let key = 0;
  const counters: Record<string, number> = {};

  const newSn = (item: MasterItem, manufacturer?: boolean) => {
    if (manufacturer) return `LB${int(2023, 2025)}-${int(10000, 99999)}`;
    counters[item.snPrefix] = (counters[item.snPrefix] ?? 0) + 1;
    return `${item.snPrefix}-${String(counters[item.snPrefix]).padStart(6, '0')}`;
  };

  for (const item of DEMO_ITEMS) {
    const plan = PLAN[item.id];
    for (let slot = 0; slot < plan.units; slot++) {
      // แต่ละ "ช่อง" คือตำแหน่งอุปกรณ์ที่หมุนเวียนอยู่ — ทำลายแล้วมีชิ้นใหม่มาแทนในช่องเดิม
      let day = start.add(int(0, 40), 'day');
      let replaces: string | undefined;
      let regAt: string | undefined;
      while (day.isBefore(today)) {
        const unitKey = ++key;
        const sn = newSn(item, plan.manufacturer);
        const unit: DraftUnit = {
          key: unitKey,
          sn,
          itemId: item.id,
          maxRound: item.maxRound,
          manufacturerSn: !!plan.manufacturer,
          registeredAt: regAt ?? stamp(day),
          replacesSn: replaces,
        };
        units.push(unit);

        let used = 0;
        let cursor = day.add(1, 'day'); // sterilize ครั้งแรกวันถัดจากลงทะเบียน
        let disposed: { at: dayjs.Dayjs; reason: DisposeReason; note?: string } | null = null;
        while (true) {
          if (cursor.isAfter(today)) break;
          // sterilize & พิมพ์ 1 รอบ
          used++;
          const mfg = cursor.format(ISO_DATE);
          const logKey = ++key;
          const base = {
            itemId: item.id,
            name: item.name,
            useBarcode: item.useBarcode,
            barcode: sn,
            mfg,
            exp: cursor.add(item.shelf, 'day').format(ISO_DATE),
            round: used,
            maxRound: item.maxRound,
            unitKey,
          };
          const t = cursor.hour(int(8, 13)).minute(int(0, 59));
          logs.push({ ...base, key: logKey, isReprint: false, time: t.format('YYYY-MM-DD HH:mm') });
          // สติ๊กเกอร์ชำรุด ต้องพิมพ์ซ้ำ ~6%
          if (rnd() < 0.06)
            logs.push({ ...base, key: ++key, srcKey: logKey, isReprint: true, time: t.add(int(1, 3), 'hour').format('YYYY-MM-DD HH:mm') });

          const next = cursor.add(int(plan.gap[0], plan.gap[1]), 'day');
          // ชำรุดก่อนครบรอบ ~4% ต่อรอบ
          if (used < item.maxRound && rnd() < 0.04 && next.isBefore(today)) {
            disposed = { at: next, reason: rnd() < 0.75 ? 'damaged' : 'lost', note: rnd() < 0.5 ? 'พบรอยแตกระหว่างตรวจสภาพ' : undefined };
            break;
          }
          if (used >= item.maxRound) {
            // ใช้รอบสุดท้ายแล้ว — ถ้ากลับมาก่อนวันนี้ให้ทำลาย ไม่งั้นค้างสถานะ "รอทำลาย"
            if (next.isBefore(today)) disposed = { at: next, reason: 'max_round' };
            break;
          }
          cursor = next;
        }

        if (!disposed) break; // ชิ้นนี้ยังอยู่ในระบบ
        unit.disposedAt = stamp(disposed.at);
        unit.disposeReason = disposed.reason;
        unit.disposeNote = disposed.note;
        replaces = sn;
        day = disposed.at; // ชิ้นใหม่ลงทะเบียนวันเดียวกับที่ทำลาย
        regAt = unit.disposedAt;
      }
    }
  }

  // ชิ้นใหม่ที่เพิ่งลงทะเบียน ยังไม่เคย sterilize
  for (const item of [DEMO_ITEMS[0], DEMO_ITEMS[1]]) {
    units.push({
      key: ++key,
      sn: newSn(item),
      itemId: item.id,
      maxRound: item.maxRound,
      manufacturerSn: false,
      registeredAt: stamp(today),
    });
  }

  // เรียงตามเวลาแล้วจึงกำหนด id เพื่อให้ลำดับประวัติถูกต้อง
  units.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt) || a.key - b.key);
  logs.sort((a, b) => a.time.localeCompare(b.time) || a.key - b.key);
  const unitId = new Map<number, number>();
  const finalUnits: Unit[] = units.map(({ key: k, ...u }, i) => {
    unitId.set(k, i + 1);
    return { ...u, id: i + 1 };
  });
  const logId = new Map<number, number>();
  logs.forEach((l, i) => logId.set(l.key, i + 1));
  const finalLogs: PrintLog[] = logs.map(({ key: k, unitKey, srcKey, ...l }) => ({
    ...l,
    id: logId.get(k)!,
    unitId: unitId.get(unitKey),
    sourceId: srcKey != null ? logId.get(srcKey) : undefined,
  }));

  return { items: DEMO_ITEMS, units: finalUnits, logs: finalLogs };
}
