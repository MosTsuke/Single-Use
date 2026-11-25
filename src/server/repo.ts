import { cleanPrefix, normalizeLog } from '@/lib/storage';
import type { AppData, CodeType, Department, DisposeReason, MasterItem, PrintLog, Staff, Unit } from '@/lib/types';
import type { Patch } from '@/lib/api-types';
import { generateSns, normSn, SN_PATTERN } from '@/lib/units';
import { getPool, sql } from './db';

/**
 * อ่าน/เขียนข้อมูลหลักในฐานข้อมูล — กฎเดียวกับที่หน้าเว็บรุ่นก่อนทำในเบราว์เซอร์
 * แต่ตรวจซ้ำที่นี่ภายใน transaction เพื่อให้ถูกต้องแม้หลายเครื่องใช้งานพร้อมกัน
 * (เช่น 2 เครื่องยิง SN เดียวกัน → เครื่องที่สองได้ข้อความแจ้ง ไม่บันทึกซ้ำ)
 */

/** ข้อผิดพลาดที่แสดงให้ผู้ใช้ได้ — transaction ถูกยกเลิก */
export class UserError extends Error {}
function fail(msg: string): never {
  throw new UserError(msg);
}

export interface ActionOk<T> {
  value: T;
  patch: Patch;
}

type Tx = sql.Transaction;

async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const t = new sql.Transaction(pool);
  await t.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const r = await fn(t);
    await t.commit();
    return r;
  } catch (e) {
    await t.rollback().catch(() => {});
    throw e;
  }
}

const rq = (t: Tx) => new sql.Request(t);

/* ---------- SELECT ที่แปลงเป็นรูปแบบเดียวกับในโปรแกรม ---------- */

const ITEM_SELECT = `SELECT ItemId AS id, Name AS name, ShelfDays AS shelf, MaxRound AS maxRound, SnPrefix AS snPrefix, DefaultCodeType AS codeType FROM dbo.Items`;
const UNIT_SELECT = `SELECT u.UnitId AS id, u.Sn AS sn, u.ItemId AS itemId, u.MaxRound AS maxRound, u.ManufacturerSn AS manufacturerSn,
  CONVERT(char(16), u.RegisteredAt, 120) AS registeredAt, r.Sn AS replacesSn,
  CONVERT(char(16), u.DisposedAt, 120) AS disposedAt, u.DisposeReason AS disposeReason, u.DisposeNote AS disposeNote
  FROM dbo.Units u LEFT JOIN dbo.Units r ON r.UnitId = u.ReplacesUnitId`;
const LOG_SELECT = `SELECT l.PrintLogId AS id, l.UnitId AS unitId, l.ItemId AS itemId, l.ItemName AS name, l.Sn AS barcode, l.CodeType AS codeType,
  CONVERT(char(10), l.MfgDate, 23) AS mfg, CONVERT(char(10), l.ExpDate, 23) AS exp, l.Round AS round, l.MaxRound AS maxRound,
  l.IsReprint AS isReprint, l.SourcePrintLogId AS sourceId, l.SkippedFrom AS skippedFrom, l.Note AS note,
  l.ShowMfg AS showMfg, l.ShowExp AS showExp, l.DepartmentId AS departmentId, l.DepartmentName AS departmentName, l.ShowDept AS showDept,
  l.StaffId AS staffId, l.StaffName AS staffName, CONVERT(char(16), l.PrintedAt, 120) AS time,
  CONVERT(char(16), l.VoidedAt, 120) AS voidedAt, l.VoidReason AS voidReason, l.VoidByStaffId AS voidByStaffId, l.VoidByName AS voidBy
  FROM dbo.PrintLogs l`;
const STAFF_SELECT = `SELECT StaffId AS id, Name AS name, Code AS code, IsActive AS active FROM dbo.Staff`;
const DEPT_SELECT = `SELECT DepartmentId AS id, Name AS name, Code AS code, IsActive AS active FROM dbo.Departments`;

type Row = Record<string, unknown>;
const toItem = (r: Row): MasterItem => ({
  id: Number(r.id),
  name: String(r.name),
  shelf: Number(r.shelf),
  maxRound: Number(r.maxRound),
  useBarcode: r.codeType !== 'none',
  snPrefix: String(r.snPrefix).trim(),
});
const toUnit = (r: Row): Unit => ({
  id: Number(r.id),
  sn: String(r.sn),
  itemId: Number(r.itemId),
  maxRound: Number(r.maxRound),
  manufacturerSn: !!r.manufacturerSn,
  registeredAt: String(r.registeredAt ?? ''),
  replacesSn: r.replacesSn ? String(r.replacesSn) : undefined,
  disposedAt: r.disposedAt ? String(r.disposedAt) : undefined,
  disposeReason: r.disposeReason ? (String(r.disposeReason) as DisposeReason) : undefined,
  disposeNote: r.disposeNote ? String(r.disposeNote) : undefined,
});
const toLog = (r: Row): PrintLog => ({ ...normalizeLog(r as never), useBarcode: r.codeType === 'barcode' });
const toPerson = (r: Row) => ({ id: Number(r.id), name: String(r.name), code: r.code ? String(r.code) : undefined, active: !!r.active });

export async function loadAll(): Promise<AppData> {
  const pool = await getPool();
  const [items, units, logs, staff, departments] = await Promise.all([
    pool.request().query(`${ITEM_SELECT} WHERE IsActive = 1 ORDER BY ItemId`),
    pool.request().query(`${UNIT_SELECT} ORDER BY u.UnitId`),
    pool.request().query(`${LOG_SELECT} ORDER BY l.PrintLogId`),
    pool.request().query(`${STAFF_SELECT} ORDER BY StaffId`),
    pool.request().query(`${DEPT_SELECT} ORDER BY DepartmentId`),
  ]);
  return {
    items: items.recordset.map(toItem),
    units: units.recordset.map(toUnit),
    logs: logs.recordset.map(toLog),
    staff: staff.recordset.map(toPerson),
    departments: departments.recordset.map(toPerson),
  };
}

async function selectUnits(t: Tx, ids: number[]): Promise<Unit[]> {
  if (!ids.length) return [];
  const r = await rq(t).query(`${UNIT_SELECT} WHERE u.UnitId IN (${ids.map(Number).join(',')}) ORDER BY u.UnitId`);
  return r.recordset.map(toUnit);
}
async function selectLogs(t: Tx, where: string, bind?: (r: sql.Request) => sql.Request): Promise<PrintLog[]> {
  const r = await (bind ? bind(rq(t)) : rq(t)).query(`${LOG_SELECT} WHERE ${where} ORDER BY l.PrintLogId`);
  return r.recordset.map(toLog);
}

/** บันทึกว่าใครทำอะไร (ตาราง AuditLog) */
async function audit(
  t: Tx,
  a: { actor: 'admin' | 'staff' | 'system'; actorId?: number; actorName?: string; action: string; entity?: string; entityId?: string | number; detail?: unknown },
) {
  await rq(t)
    .input('at', sql.VarChar(10), a.actor)
    .input('ai', sql.Int, a.actorId ?? null)
    .input('an', sql.NVarChar(100), a.actorName?.slice(0, 100) ?? null)
    .input('ac', sql.VarChar(50), a.action)
    .input('et', sql.VarChar(30), a.entity ?? null)
    .input('ei', sql.NVarChar(50), a.entityId != null ? String(a.entityId) : null)
    .input('d', sql.NVarChar(sql.MAX), a.detail !== undefined ? JSON.stringify(a.detail) : null)
    .query(`INSERT INTO dbo.AuditLog (ActorType, ActorId, ActorName, Action, EntityType, EntityId, Detail) VALUES (@at, @ai, @an, @ac, @et, @ei, @d)`);
}

export interface Actor {
  id: number;
  name: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : NaN);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const sameName = (a: string, b: string) => a.replace(/\s+/g, ' ').toLowerCase() === b.replace(/\s+/g, ' ').toLowerCase();

/** ข้อผิดพลาดจาก constraint ของฐานข้อมูล → ข้อความภาษาไทย (null = ไม่รู้จัก) */
export function constraintMessage(e: unknown): string | null {
  const err = e as { number?: number; message?: string };
  const m = err?.message ?? '';
  if (err?.number === 2601 || err?.number === 2627) {
    if (m.includes('UX_PrintLogs_UnitRound_Active')) return 'รอบนี้ของชิ้นนี้ถูกพิมพ์ไปแล้ว (อาจพิมพ์จากเครื่องอื่น) — ข้อมูลอัปเดตแล้ว ลองยิงใหม่';
    if (m.includes('UQ_Units_Sn')) return 'SN นี้มีอยู่ในระบบแล้ว';
    if (m.includes('UX_Items_SnPrefix_Active')) return 'คำนำหน้า SN ซ้ำกับรายการอุปกรณ์อื่น';
    if (m.includes('UX_Staff_Code')) return 'รหัสพนักงานซ้ำกับคนอื่น';
    if (m.includes('UX_Staff_Name')) return 'มีชื่อเจ้าหน้าที่นี้อยู่แล้ว';
    if (m.includes('UX_Departments_Code')) return 'รหัสหน่วยงานซ้ำกับหน่วยงานอื่น';
    if (m.includes('UX_Departments_Name')) return 'มีชื่อหน่วยงานนี้อยู่แล้ว';
    return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
  }
  if (err?.number === 547) return 'ข้อมูลไม่ผ่านเงื่อนไขของฐานข้อมูล — ตรวจสอบค่าที่กรอก';
  if (err?.number === 8152 || err?.number === 2628) return 'ข้อความยาวเกินที่กำหนด';
  return null;
}

/* =====================================================================
   รายการอุปกรณ์ (แอดมิน)
   ===================================================================== */

function checkItem(d: Omit<MasterItem, 'id'>) {
  const name = text(d.name);
  if (!name) fail('กรุณากรอกชื่ออุปกรณ์');
  if (name.length > 200) fail('ชื่ออุปกรณ์ยาวเกิน 200 ตัวอักษร');
  const shelf = int(d.shelf);
  if (!(shelf >= 0 && shelf <= 3650)) fail('อายุหลัง sterilize ต้องอยู่ระหว่าง 0–3650 วัน');
  const maxRound = int(d.maxRound);
  if (!(maxRound >= 1 && maxRound <= 999)) fail('รอบสูงสุดต้องอยู่ระหว่าง 1–999');
  return { name, shelf, maxRound, prefix: cleanPrefix(d.snPrefix), codeType: d.useBarcode ? 'barcode' : 'none' };
}

export async function addItem(admin: Actor, d: Omit<MasterItem, 'id'>): Promise<ActionOk<MasterItem>> {
  const v = checkItem(d);
  return tx(async (t) => {
    const ins = await rq(t)
      .input('n', sql.NVarChar(200), v.name)
      .input('s', sql.Int, v.shelf)
      .input('m', sql.Int, v.maxRound)
      .input('p', sql.VarChar(8), v.prefix || 'TMP')
      .input('c', sql.VarChar(10), v.codeType)
      .query(`INSERT INTO dbo.Items (Name, ShelfDays, MaxRound, SnPrefix, DefaultCodeType) OUTPUT INSERTED.ItemId AS id VALUES (@n, @s, @m, @p, @c)`);
    const id = Number(ins.recordset[0].id);
    if (!v.prefix) await rq(t).input('id', sql.Int, id).query(`UPDATE dbo.Items SET SnPrefix = 'T' + CAST(ItemId AS varchar(7)) WHERE ItemId = @id`);
    const item = toItem((await rq(t).input('id', sql.Int, id).query(`${ITEM_SELECT} WHERE ItemId = @id`)).recordset[0]);
    await audit(t, { actor: 'admin', actorId: admin.id, actorName: admin.name, action: 'item.create', entity: 'Item', entityId: id, detail: item });
    return { value: item, patch: { items: [item] } };
  });
}

export async function updateItem(admin: Actor, id: number, d: Omit<MasterItem, 'id'>): Promise<ActionOk<MasterItem>> {
  const v = checkItem(d);
  return tx(async (t) => {
    const r = await rq(t)
      .input('id', sql.Int, id)
      .input('n', sql.NVarChar(200), v.name)
      .input('s', sql.Int, v.shelf)
      .input('m', sql.Int, v.maxRound)
      .input('p', sql.VarChar(8), v.prefix || `T${id}`.slice(0, 8))
      .input('c', sql.VarChar(10), v.codeType)
      .query(
        `UPDATE dbo.Items SET Name = @n, ShelfDays = @s, MaxRound = @m, SnPrefix = @p,
           DefaultCodeType = CASE WHEN @c = 'none' THEN 'none' WHEN DefaultCodeType = 'qr' THEN 'qr' ELSE 'barcode' END,
           UpdatedAt = SYSDATETIME()
         WHERE ItemId = @id AND IsActive = 1`,
      );
    if (!r.rowsAffected[0]) fail('ไม่พบรายการอุปกรณ์');
    const item = toItem((await rq(t).input('id', sql.Int, id).query(`${ITEM_SELECT} WHERE ItemId = @id`)).recordset[0]);
    await audit(t, { actor: 'admin', actorId: admin.id, actorName: admin.name, action: 'item.update', entity: 'Item', entityId: id, detail: item });
    return { value: item, patch: { items: [item] } };
  });
}

/** ลบได้เมื่อไม่มีชิ้นที่ยังไม่ถูกทำลาย — ถ้ามีประวัติอยู่ จะปิดใช้งาน (ซ่อน) แทนการลบจริง */
export async function deleteItem(admin: Actor, id: number): Promise<ActionOk<void>> {
  return tx(async (t) => {
    const r = await rq(t)
      .input('id', sql.Int, id)
      .query(
        `SELECT (SELECT COUNT(*) FROM dbo.Units WHERE ItemId = @id AND DisposedAt IS NULL) AS live,
                (SELECT COUNT(*) FROM dbo.Units WHERE ItemId = @id) + (SELECT COUNT(*) FROM dbo.PrintLogs WHERE ItemId = @id) AS refs`,
      );
    const { live, refs } = r.recordset[0];
    if (live) fail(`ยังมีอุปกรณ์ของรายการนี้ที่ยังไม่ถูกทำลาย ${live} ชิ้น`);
    await rq(t)
      .input('id', sql.Int, id)
      .query(refs ? `UPDATE dbo.Items SET IsActive = 0, UpdatedAt = SYSDATETIME() WHERE ItemId = @id` : `DELETE FROM dbo.Items WHERE ItemId = @id`);
    await audit(t, { actor: 'admin', actorId: admin.id, actorName: admin.name, action: refs ? 'item.deactivate' : 'item.delete', entity: 'Item', entityId: id });
    return { value: undefined, patch: { removed: { items: [id] } } };
  });
}

/* =====================================================================
   เจ้าหน้าที่ / หน่วยงาน (แอดมิน) — โครงเดียวกัน
   ===================================================================== */

const PEOPLE = {
  staff: {
    table: 'dbo.Staff',
    key: 'StaffId',
    select: STAFF_SELECT,
    maxName: 100,
    label: 'เจ้าหน้าที่',
    emptyName: 'กรุณากรอกชื่อ',
    dupName: (n: string) => `มีชื่อ "${n}" อยู่แล้ว`,
    usage: `SELECT (SELECT COUNT(*) FROM dbo.PrintLogs WHERE StaffId = @id OR VoidByStaffId = @id)
                 + (SELECT COUNT(*) FROM dbo.Units WHERE RegisteredByStaffId = @id OR DisposedByStaffId = @id) AS n`,
    inUse: (n: number) => `เจ้าหน้าที่คนนี้มีประวัติการพิมพ์ ${n} ดวง — ลบไม่ได้ ให้ปิดใช้งานแทน`,
    patchKey: 'staff' as const,
  },
  departments: {
    table: 'dbo.Departments',
    key: 'DepartmentId',
    select: DEPT_SELECT,
    maxName: 100,
    label: 'หน่วยงาน',
    emptyName: 'กรุณากรอกชื่อหน่วยงาน',
    dupName: (n: string) => `มีหน่วยงาน "${n}" อยู่แล้ว`,
    usage: `SELECT COUNT(*) AS n FROM dbo.PrintLogs WHERE DepartmentId = @id`,
    inUse: (n: number) => `หน่วยงานนี้มีประวัติการพิมพ์ ${n} ดวง — ลบไม่ได้ ให้ปิดใช้งานแทน`,
    patchKey: 'departments' as const,
  },
};
type PeopleKind = keyof typeof PEOPLE;

export async function savePerson(
  admin: Actor,
  kind: PeopleKind,
  id: number | null,
  d: Omit<Staff | Department, 'id'>,
): Promise<ActionOk<Staff | Department>> {
  const k = PEOPLE[kind];
  const name = text(d.name);
  const code = text(d.code) || null;
  if (!name) fail(k.emptyName);
  if (name.length > k.maxName) fail(`ชื่อยาวเกิน ${k.maxName} ตัวอักษร`);
  if (code && code.length > 20) fail('รหัสยาวเกิน 20 ตัวอักษร');
  return tx(async (t) => {
    const all = await rq(t).query(`SELECT ${k.key} AS id, Name AS name FROM ${k.table} WITH (UPDLOCK, HOLDLOCK)`);
    if (all.recordset.some((r: Row) => Number(r.id) !== id && sameName(String(r.name), name))) fail(k.dupName(name));
    let rowId = id;
    if (id == null) {
      const ins = await rq(t)
        .input('n', sql.NVarChar(100), name)
        .input('c', sql.NVarChar(20), code)
        .input('a', sql.Bit, d.active !== false)
        .query(`INSERT INTO ${k.table} (Name, Code, IsActive) OUTPUT INSERTED.${k.key} AS id VALUES (@n, @c, @a)`);
      rowId = Number(ins.recordset[0].id);
    } else {
      const r = await rq(t)
        .input('id', sql.Int, id)
        .input('n', sql.NVarChar(100), name)
        .input('c', sql.NVarChar(20), code)
        .input('a', sql.Bit, d.active !== false)
        .query(`UPDATE ${k.table} SET Name = @n, Code = @c, IsActive = @a, UpdatedAt = SYSDATETIME() WHERE ${k.key} = @id`);
      if (!r.rowsAffected[0]) fail(`ไม่พบ${k.label}`);
    }
    const row = toPerson((await rq(t).input('id', sql.Int, rowId).query(`${k.select} WHERE ${k.key} = @id`)).recordset[0]);
    await audit(t, {
      actor: 'admin',
      actorId: admin.id,
      actorName: admin.name,
      action: `${kind === 'staff' ? 'staff' : 'department'}.${id == null ? 'create' : 'update'}`,
      entity: kind === 'staff' ? 'Staff' : 'Department',
      entityId: rowId!,
      detail: row,
    });
    return { value: row, patch: { [k.patchKey]: [row] } as Patch };
  });
}

export async function deletePerson(admin: Actor, kind: PeopleKind, id: number): Promise<ActionOk<void>> {
  const k = PEOPLE[kind];
  return tx(async (t) => {
    const n = (await rq(t).input('id', sql.Int, id).query(k.usage)).recordset[0].n;
    if (n) fail(k.inUse(n));
    await rq(t).input('id', sql.Int, id).query(`DELETE FROM ${k.table} WHERE ${k.key} = @id`);
    await audit(t, {
      actor: 'admin',
      actorId: admin.id,
      actorName: admin.name,
      action: `${kind === 'staff' ? 'staff' : 'department'}.delete`,
      entity: kind === 'staff' ? 'Staff' : 'Department',
      entityId: id,
    });
    return { value: undefined, patch: { removed: { [k.patchKey]: [id] } } as Patch };
  });
}

/* =====================================================================
   อุปกรณ์รายชิ้น
   ===================================================================== */

/** ล็อกแถวของชิ้นนั้นจนจบ transaction — เครื่องอื่นที่ทำกับชิ้นเดียวกันจะรอคิว */
async function lockUnit(t: Tx, unitId: number) {
  const r = await rq(t)
    .input('id', sql.Int, unitId)
    .query(`SELECT UnitId AS id, Sn AS sn, ItemId AS itemId, MaxRound AS maxRound, DisposedAt AS disposedAt FROM dbo.Units WITH (UPDLOCK, HOLDLOCK) WHERE UnitId = @id`);
  const u = r.recordset[0];
  if (!u) fail('ไม่พบอุปกรณ์');
  return { id: Number(u.id), sn: String(u.sn), itemId: Number(u.itemId), maxRound: Number(u.maxRound), disposed: u.disposedAt != null };
}

async function usedRounds(t: Tx, unitId: number): Promise<number> {
  const r = await rq(t)
    .input('id', sql.Int, unitId)
    .query(`SELECT ISNULL(MAX(Round), 0) AS used FROM dbo.PrintLogs WHERE UnitId = @id AND IsReprint = 0 AND VoidedAt IS NULL`);
  return Number(r.recordset[0].used);
}

export async function registerUnits(input: { itemId: number; sns: string[]; manufacturerSn: boolean; replacesSn?: string }): Promise<ActionOk<Unit[]>> {
  return tx(async (t) => {
    const ir = await rq(t)
      .input('id', sql.Int, int(input.itemId))
      .query(`SELECT ItemId AS id, SnPrefix AS snPrefix, MaxRound AS maxRound FROM dbo.Items WITH (UPDLOCK, HOLDLOCK) WHERE ItemId = @id AND IsActive = 1`);
    const item = ir.recordset[0];
    if (!item) fail('ไม่พบรายการอุปกรณ์');
    let sns = (Array.isArray(input.sns) ? input.sns : []).map((s) => text(s)).filter(Boolean);
    if (!sns.length) fail('กรุณาระบุ SN');
    if (sns.length > 500) fail('ลงทะเบียนได้ครั้งละไม่เกิน 500 ชิ้น');
    const prefix = String(item.snPrefix).trim();
    if (!input.manufacturerSn) {
      // ให้ระบบสร้าง SN: คำนวณจากฐานข้อมูลใหม่ (กันเลขชนกับเครื่องอื่นที่ลงทะเบียนพร้อมกัน)
      const ex = await rq(t).input('p', sql.VarChar(20), `${prefix}-%`).query(`SELECT Sn AS sn FROM dbo.Units WHERE Sn LIKE @p`);
      sns = generateSns({ id: item.id, snPrefix: prefix } as MasterItem, ex.recordset as Unit[], sns.length);
    }
    const seen = new Set<string>();
    for (const s of sns) {
      if (!SN_PATTERN.test(s)) fail(`SN ${s} ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข และสัญลักษณ์ (ไม่เกิน 40 ตัว ไม่มีช่องว่าง)`);
      const k = normSn(s);
      if (seen.has(k)) fail(`SN ${s} ซ้ำในรายการ`);
      seen.add(k);
    }
    const dupReq = rq(t);
    sns.forEach((s, i) => dupReq.input(`s${i}`, sql.VarChar(40), s));
    const dup = await dupReq.query(`SELECT TOP 1 Sn AS sn FROM dbo.Units WHERE Sn IN (${sns.map((_, i) => `@s${i}`).join(',')})`);
    if (dup.recordset[0]) fail(`SN ${dup.recordset[0].sn} มีอยู่ในระบบแล้ว`);
    let replacesId: number | null = null;
    if (input.replacesSn) {
      const rr = await rq(t).input('s', sql.VarChar(40), text(input.replacesSn)).query(`SELECT UnitId AS id FROM dbo.Units WHERE Sn = @s`);
      replacesId = rr.recordset[0] ? Number(rr.recordset[0].id) : null;
    }
    const ids: number[] = [];
    for (const s of sns) {
      const ins = await rq(t)
        .input('sn', sql.VarChar(40), s)
        .input('item', sql.Int, item.id)
        .input('max', sql.Int, item.maxRound)
        .input('m', sql.Bit, !!input.manufacturerSn)
        .input('r', sql.Int, replacesId)
        .query(`INSERT INTO dbo.Units (Sn, ItemId, MaxRound, ManufacturerSn, ReplacesUnitId) OUTPUT INSERTED.UnitId AS id VALUES (@sn, @item, @max, @m, @r)`);
      ids.push(Number(ins.recordset[0].id));
    }
    const units = await selectUnits(t, ids);
    return { value: units, patch: { units } };
  });
}

const DISPOSE_REASONS: DisposeReason[] = ['max_round', 'damaged', 'worn', 'lost', 'other'];

export async function disposeUnit(input: { unitId: number; reason: DisposeReason; note?: string }): Promise<ActionOk<Unit>> {
  if (!DISPOSE_REASONS.includes(input.reason)) fail('กรุณาเลือกสาเหตุ');
  const note = text(input.note).slice(0, 300) || null;
  if (input.reason !== 'max_round' && !note) fail('กรุณาระบุรายละเอียดประกอบการทำลาย');
  return tx(async (t) => {
    const u = await lockUnit(t, int(input.unitId));
    if (u.disposed) fail('อุปกรณ์ชิ้นนี้ถูกทำลายไปแล้ว');
    await rq(t)
      .input('id', sql.Int, u.id)
      .input('r', sql.VarChar(20), input.reason)
      .input('n', sql.NVarChar(300), note)
      .query(`UPDATE dbo.Units SET DisposedAt = SYSDATETIME(), DisposeReason = @r, DisposeNote = @n WHERE UnitId = @id`);
    await audit(t, { actor: 'staff', action: 'unit.dispose', entity: 'Unit', entityId: u.sn, detail: { reason: input.reason, note } });
    const [unit] = await selectUnits(t, [u.id]);
    return { value: unit, patch: { units: [unit] } };
  });
}

/* =====================================================================
   การพิมพ์
   ===================================================================== */

export interface SterilizeInput {
  unitId: number;
  mfg: string;
  exp: string;
  staffId: number;
  /** รอบที่ใช้ไปแล้วตามที่หน้าจอเห็น — ไม่ตรงกับฐานข้อมูล = มีเครื่องอื่นเปลี่ยนไปแล้ว */
  expectedUsed?: number;
  round?: number;
  note?: string;
  showMfg?: boolean;
  showExp?: boolean;
  codeType?: CodeType;
  departmentId?: number;
  showDept?: boolean;
}

const CODE_TYPES: CodeType[] = ['barcode', 'qr', 'none'];

export async function sterilize(input: SterilizeInput): Promise<ActionOk<PrintLog>> {
  const mfg = text(input.mfg);
  const exp = text(input.exp);
  if (!ISO.test(mfg) || !ISO.test(exp)) fail('วันผลิต/วันหมดอายุไม่ถูกต้อง');
  if (exp < mfg) fail('วันหมดอายุต้องไม่ก่อนวันผลิต');
  if (input.codeType && !CODE_TYPES.includes(input.codeType)) fail('ชนิดรหัสไม่ถูกต้อง');
  return tx(async (t) => {
    const u = await lockUnit(t, int(input.unitId));
    const used = await usedRounds(t, u.id);
    if (u.disposed) fail(`${u.sn} ถูกทำลายแล้ว`);
    if (used >= u.maxRound) fail(`${u.sn} ใช้ครบ ${u.maxRound} รอบแล้ว ต้องทำลาย`);
    if (input.expectedUsed != null && input.expectedUsed !== used) {
      fail(`${u.sn} มีการเปลี่ยนแปลงจากเครื่องอื่น (ตอนนี้ใช้ไป ${used}/${u.maxRound} รอบ) — ข้อมูลอัปเดตแล้ว ตรวจสอบแล้วกดพิมพ์อีกครั้ง`);
    }
    const next = used + 1;
    const round = input.round ?? next;
    if (!Number.isInteger(round) || round < next || round > u.maxRound) fail(`รอบต้องอยู่ระหว่าง ${next} ถึง ${u.maxRound}`);
    const skipped = round > next;
    const note = text(input.note).slice(0, 200);
    if (skipped && !note) fail('พิมพ์ข้ามรอบต้องกรอกหมายเหตุ');
    const st = await rq(t).input('id', sql.Int, int(input.staffId)).query(`SELECT StaffId AS id, Name AS name FROM dbo.Staff WHERE StaffId = @id`);
    const staff = st.recordset[0];
    if (!staff) fail('กรุณาเลือกเจ้าหน้าที่ผู้พิมพ์');
    const it = await rq(t).input('id', sql.Int, u.itemId).query(`SELECT Name AS name, DefaultCodeType AS codeType FROM dbo.Items WHERE ItemId = @id`);
    const item = it.recordset[0];
    const codeType: CodeType = input.codeType ?? (item?.codeType === 'none' ? 'none' : 'barcode');
    let dept: { id: number; name: string } | null = null;
    if (input.departmentId != null) {
      const d = await rq(t).input('id', sql.Int, int(input.departmentId)).query(`SELECT DepartmentId AS id, Name AS name FROM dbo.Departments WHERE DepartmentId = @id`);
      dept = d.recordset[0] ?? null;
    }
    const ins = await rq(t)
      .input('unit', sql.Int, u.id)
      .input('item', sql.Int, u.itemId)
      .input('sn', sql.VarChar(40), u.sn)
      .input('name', sql.NVarChar(200), item?.name ?? '(รายการถูกลบ)')
      .input('round', sql.Int, round)
      .input('max', sql.Int, u.maxRound)
      .input('mfg', sql.VarChar(10), mfg)
      .input('exp', sql.VarChar(10), exp)
      .input('code', sql.VarChar(10), codeType)
      .input('smfg', sql.Bit, input.showMfg !== false)
      .input('sexp', sql.Bit, input.showExp !== false)
      .input('skip', sql.Int, skipped ? next : null)
      .input('note', sql.NVarChar(200), note || null)
      .input('staff', sql.Int, staff.id)
      .input('staffName', sql.NVarChar(100), staff.name)
      .input('dept', sql.Int, dept?.id ?? null)
      .input('deptName', sql.NVarChar(100), dept?.name ?? null)
      .input('sdept', sql.Bit, dept ? input.showDept !== false : true)
      .query(
        `INSERT INTO dbo.PrintLogs (UnitId, ItemId, Sn, ItemName, Round, MaxRound, MfgDate, ExpDate, CodeType, ShowMfg, ShowExp,
           IsReprint, SkippedFrom, Note, StaffId, StaffName, DepartmentId, DepartmentName, ShowDept)
         OUTPUT INSERTED.PrintLogId AS id
         VALUES (@unit, @item, @sn, @name, @round, @max, CONVERT(date, @mfg, 23), CONVERT(date, @exp, 23), @code, @smfg, @sexp,
           0, @skip, @note, @staff, @staffName, @dept, @deptName, @sdept)`,
      );
    const id = Number(ins.recordset[0].id);
    const [log] = await selectLogs(t, 'l.PrintLogId = @id', (r) => r.input('id', sql.BigInt, id));
    return { value: log, patch: { logs: [log] } };
  });
}

export async function createReprint(input: { logId: number; codeType?: CodeType }): Promise<ActionOk<PrintLog>> {
  if (input.codeType && !CODE_TYPES.includes(input.codeType)) fail('ชนิดรหัสไม่ถูกต้อง');
  return tx(async (t) => {
    const sr = await rq(t)
      .input('id', sql.BigInt, int(input.logId))
      .query(`SELECT PrintLogId AS id, UnitId AS unitId, VoidedAt AS voidedAt FROM dbo.PrintLogs WHERE PrintLogId = @id`);
    const src = sr.recordset[0];
    if (!src) fail('ไม่พบใบที่พิมพ์');
    if (src.voidedAt) fail('ใบนี้ถูกยกเลิกแล้ว พิมพ์ซ้ำไม่ได้');
    const u = await lockUnit(t, Number(src.unitId));
    if (u.disposed) fail(`${u.sn} ถูกทำลายแล้ว พิมพ์ซ้ำไม่ได้`);
    const ins = await rq(t)
      .input('id', sql.BigInt, Number(src.id))
      .input('code', sql.VarChar(10), input.codeType ?? null)
      .query(
        `INSERT INTO dbo.PrintLogs (UnitId, ItemId, Sn, ItemName, Round, MaxRound, MfgDate, ExpDate, CodeType, ShowMfg, ShowExp,
           IsReprint, SourcePrintLogId, SkippedFrom, Note, StaffId, StaffName, DepartmentId, DepartmentName, ShowDept)
         OUTPUT INSERTED.PrintLogId AS id
         SELECT UnitId, ItemId, Sn, ItemName, Round, MaxRound, MfgDate, ExpDate, ISNULL(@code, CodeType), ShowMfg, ShowExp,
           1, ISNULL(SourcePrintLogId, PrintLogId), SkippedFrom, Note, StaffId, StaffName, DepartmentId, DepartmentName, ShowDept
         FROM dbo.PrintLogs WHERE PrintLogId = @id`,
      );
    const id = Number(ins.recordset[0].id);
    const [log] = await selectLogs(t, 'l.PrintLogId = @id', (r) => r.input('id', sql.BigInt, id));
    return { value: log, patch: { logs: [log] } };
  });
}

/** ย้อนการพิมพ์ (กดยกเลิกในหน้าต่างพิมพ์ / สติ๊กเกอร์ไม่ออก) — ลบได้เฉพาะดวงล่าสุดของชิ้นนั้น */
export async function removeLogs(input: { ids: number[] }): Promise<ActionOk<void>> {
  const ids = [...new Set((Array.isArray(input.ids) ? input.ids : []).map(int).filter((n) => n > 0))];
  if (!ids.length) return { value: undefined, patch: {} };
  if (ids.length > 500) fail('ย้อนกลับได้ครั้งละไม่เกิน 500 ดวง');
  const list = ids.join(',');
  return tx(async (t) => {
    const rows = (await rq(t).query(`SELECT PrintLogId AS id, UnitId AS unitId, Sn AS sn FROM dbo.PrintLogs WHERE PrintLogId IN (${list})`)).recordset;
    for (const unitId of new Set(rows.map((r: Row) => Number(r.unitId)))) await lockUnit(t, unitId);
    for (const r of rows) {
      const later = await rq(t)
        .input('id', sql.BigInt, Number(r.id))
        .input('unit', sql.Int, Number(r.unitId))
        .query(
          `SELECT TOP 1 1 AS x FROM dbo.PrintLogs
           WHERE PrintLogId > @id AND (UnitId = @unit OR SourcePrintLogId = @id) AND PrintLogId NOT IN (${list})`,
        );
      if (later.recordset.length) fail(`${r.sn} มีการพิมพ์ต่อจากนี้แล้ว — ย้อนกลับไม่ได้`);
    }
    // พิมพ์ซ้ำ (เลขมากกว่า) ก่อน เพราะอ้างถึงใบต้นฉบับ
    await rq(t).query(`DELETE FROM dbo.PrintLogs WHERE PrintLogId IN (${list}) AND IsReprint = 1; DELETE FROM dbo.PrintLogs WHERE PrintLogId IN (${list});`);
    await audit(t, { actor: 'staff', action: 'print.undo', entity: 'PrintLog', detail: rows.map((r: Row) => ({ id: Number(r.id), sn: r.sn })) });
    return { value: undefined, patch: { removed: { logs: rows.map((r: Row) => Number(r.id)) } } };
  });
}

/** ยกเลิกใบที่พิมพ์ผิด (เฉพาะใบล่าสุดของชิ้นนั้น) — รอบกลับเป็นรอบก่อน ใบยังอยู่ในประวัติ */
export async function voidPrint(input: { logId: number; reason: string; staffId: number }): Promise<ActionOk<PrintLog>> {
  const why = text(input.reason).slice(0, 200);
  return tx(async (t) => {
    const lr = await rq(t)
      .input('id', sql.BigInt, int(input.logId))
      .query(`SELECT PrintLogId AS id, UnitId AS unitId, IsReprint AS isReprint, VoidedAt AS voidedAt FROM dbo.PrintLogs WHERE PrintLogId = @id`);
    const log = lr.recordset[0];
    if (!log) fail('ไม่พบใบที่พิมพ์');
    if (log.voidedAt) fail('ใบนี้ถูกยกเลิกไปแล้ว');
    if (log.isReprint) fail('ยกเลิกได้เฉพาะใบที่พิมพ์ปกติ (พิมพ์ซ้ำจะถูกยกเลิกตามใบหลัก)');
    const u = await lockUnit(t, Number(log.unitId));
    if (u.disposed) fail('ชิ้นนี้ถูกทำลายแล้ว ยกเลิกการพิมพ์ไม่ได้');
    const latest = await rq(t)
      .input('unit', sql.Int, u.id)
      .query(`SELECT TOP 1 PrintLogId AS id FROM dbo.PrintLogs WHERE UnitId = @unit AND IsReprint = 0 AND VoidedAt IS NULL ORDER BY PrintLogId DESC`);
    if (Number(latest.recordset[0]?.id) !== Number(log.id)) fail('ยกเลิกได้เฉพาะใบล่าสุดของชิ้นนี้');
    if (!why) fail('กรุณาระบุเหตุผลที่ยกเลิก');
    const st = await rq(t).input('id', sql.Int, int(input.staffId)).query(`SELECT StaffId AS id, Name AS name FROM dbo.Staff WHERE StaffId = @id`);
    const staff = st.recordset[0];
    if (!staff) fail('กรุณาเลือกเจ้าหน้าที่ผู้ยกเลิก');
    await rq(t)
      .input('id', sql.BigInt, Number(log.id))
      .input('r', sql.NVarChar(200), why)
      .input('s', sql.Int, staff.id)
      .input('n', sql.NVarChar(100), staff.name)
      .query(
        `UPDATE dbo.PrintLogs SET VoidedAt = SYSDATETIME(), VoidReason = @r, VoidByStaffId = @s, VoidByName = @n
         WHERE PrintLogId = @id OR (IsReprint = 1 AND SourcePrintLogId = @id AND VoidedAt IS NULL)`,
      );
    await audit(t, { actor: 'staff', actorId: staff.id, actorName: staff.name, action: 'print.void', entity: 'PrintLog', entityId: Number(log.id), detail: { sn: u.sn, reason: why } });
    const logs = await selectLogs(t, 'l.PrintLogId = @id OR l.SourcePrintLogId = @id', (r) => r.input('id', sql.BigInt, Number(log.id)));
    return { value: logs.find((l) => l.id === Number(log.id))!, patch: { logs } };
  });
}

/* =====================================================================
   ตั้งค่า (โลโก้ / ชื่อ)
   ===================================================================== */

const BRAND_KEYS = ['hospitalName', 'hospitalLogo', 'appName', 'companyName', 'companyLogo'] as const;

export async function loadBrand(): Promise<Record<string, string>> {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT SettingKey AS k, SettingValue AS v FROM dbo.Settings WHERE SettingKey LIKE 'brand.%'`);
  const out: Record<string, string> = {};
  for (const row of r.recordset) if (row.v) out[String(row.k).slice(6)] = String(row.v);
  return out;
}

/** ค่าเป็น null = กลับไปใช้ค่าเริ่มต้น */
export async function saveBrand(admin: Actor, patch: Record<string, string | null>): Promise<Record<string, string>> {
  await tx(async (t) => {
    for (const [k, v] of Object.entries(patch)) {
      if (!(BRAND_KEYS as readonly string[]).includes(k)) continue;
      if (v != null && v.length > 2_000_000) fail('รูปใหญ่เกินไป');
      const req = rq(t).input('k', sql.VarChar(50), `brand.${k}`).input('a', sql.Int, admin.id);
      if (v == null || !String(v).trim()) await req.query(`DELETE FROM dbo.Settings WHERE SettingKey = @k`);
      else
        await req
          .input('v', sql.NVarChar(sql.MAX), String(v))
          .query(
            `UPDATE dbo.Settings SET SettingValue = @v, UpdatedAt = SYSDATETIME(), UpdatedByAdminId = @a WHERE SettingKey = @k;
             IF @@ROWCOUNT = 0 INSERT INTO dbo.Settings (SettingKey, SettingValue, UpdatedByAdminId) VALUES (@k, @v, @a);`,
          );
    }
    await audit(t, { actor: 'admin', actorId: admin.id, actorName: admin.name, action: 'settings.brand', detail: Object.keys(patch) });
  });
  return loadBrand();
}

/* =====================================================================
   นำเข้าทีละชุดจากไฟล์ CSV — เพิ่มเฉพาะของใหม่ ผิดแถวเดียวยกเลิกทั้งชุด
   (หน้าเว็บตรวจและแสดงตัวอย่างก่อนแล้ว ที่นี่ตรวจซ้ำกับข้อมูลล่าสุดในฐานข้อมูล)
   ===================================================================== */

const MAX_IMPORT = 2000;

function checkBatch<T extends { line?: unknown }>(rows: T[]): (T & { line: number })[] {
  if (!Array.isArray(rows) || !rows.length) fail('ไม่มีข้อมูลที่จะนำเข้า');
  if (rows.length > MAX_IMPORT) fail(`นำเข้าได้ครั้งละไม่เกิน ${MAX_IMPORT} แถว`);
  return rows.map((r) => ({ ...r, line: Number(r.line) || 0 }));
}

/** ข้อผิดพลาดของแถวไหน */
function atLine<T>(line: number, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof UserError) fail(`บรรทัด ${line}: ${e.message}`);
    throw e;
  }
}

export async function importItems(admin: Actor, input: (Omit<MasterItem, 'id'> & { line?: number })[]): Promise<ActionOk<MasterItem[]>> {
  const rows = checkBatch(input).map((r) => ({ line: r.line, ...atLine(r.line, () => checkItem(r)) }));
  for (const r of rows) if (!r.prefix) fail(`บรรทัด ${r.line}: ไม่มีคำนำหน้า SN`);
  return tx(async (t) => {
    const ex = await rq(t).query(`SELECT Name AS name, SnPrefix AS prefix FROM dbo.Items WITH (UPDLOCK, HOLDLOCK) WHERE IsActive = 1`);
    const names = new Set(ex.recordset.map((r: Row) => String(r.name).replace(/\s+/g, ' ').toLowerCase()));
    const prefixes = new Set(ex.recordset.map((r: Row) => String(r.prefix).trim()));
    for (const r of rows) {
      const n = r.name.replace(/\s+/g, ' ').toLowerCase();
      if (names.has(n)) fail(`บรรทัด ${r.line}: ชื่อ "${r.name}" มีอยู่แล้ว (หรือซ้ำในไฟล์)`);
      if (prefixes.has(r.prefix)) fail(`บรรทัด ${r.line}: คำนำหน้า ${r.prefix} ถูกใช้แล้ว (หรือซ้ำในไฟล์)`);
      names.add(n);
      prefixes.add(r.prefix);
    }
    const ins = await rq(t)
      .input('j', sql.NVarChar(sql.MAX), JSON.stringify(rows.map((r) => ({ n: r.name, s: r.shelf, m: r.maxRound, p: r.prefix, c: r.codeType }))))
      .query(
        `INSERT INTO dbo.Items (Name, ShelfDays, MaxRound, SnPrefix, DefaultCodeType)
         OUTPUT INSERTED.ItemId AS id
         SELECT n, s, m, p, c FROM OPENJSON(@j) WITH (n nvarchar(200), s int, m int, p varchar(8), c varchar(10))`,
      );
    const ids = ins.recordset.map((r: Row) => Number(r.id));
    const items = (await rq(t).query(`${ITEM_SELECT} WHERE ItemId IN (${ids.join(',')}) ORDER BY ItemId`)).recordset.map(toItem);
    await audit(t, { actor: 'admin', actorId: admin.id, actorName: admin.name, action: 'item.import', entity: 'Item', detail: { count: items.length } });
    return { value: items, patch: { items } };
  });
}

export async function importPeople(
  admin: Actor,
  kind: PeopleKind,
  input: (Omit<Staff | Department, 'id'> & { line?: number })[],
): Promise<ActionOk<(Staff | Department)[]>> {
  const k = PEOPLE[kind];
  const rows = checkBatch(input).map((r) =>
    atLine(r.line, () => {
      const name = text(r.name).replace(/\s+/g, ' ');
      const code = text(r.code) || null;
      if (!name) fail(k.emptyName);
      if (name.length > k.maxName) fail(`ชื่อยาวเกิน ${k.maxName} ตัวอักษร`);
      if (code && code.length > 20) fail('รหัสยาวเกิน 20 ตัวอักษร');
      return { line: r.line, name, code };
    }),
  );
  return tx(async (t) => {
    const ex = await rq(t).query(`SELECT Name AS name, Code AS code FROM ${k.table} WITH (UPDLOCK, HOLDLOCK)`);
    const names = new Set(ex.recordset.map((r: Row) => String(r.name).replace(/\s+/g, ' ').toLowerCase()));
    const codes = new Set(ex.recordset.filter((r: Row) => r.code).map((r: Row) => String(r.code).trim().toLowerCase()));
    for (const r of rows) {
      const n = r.name.toLowerCase();
      if (names.has(n)) fail(`บรรทัด ${r.line}: ${k.dupName(r.name)} (หรือซ้ำในไฟล์)`);
      if (r.code && codes.has(r.code.toLowerCase())) fail(`บรรทัด ${r.line}: รหัส ${r.code} ถูกใช้แล้ว (หรือซ้ำในไฟล์)`);
      names.add(n);
      if (r.code) codes.add(r.code.toLowerCase());
    }
    const ins = await rq(t)
      .input('j', sql.NVarChar(sql.MAX), JSON.stringify(rows.map((r) => ({ n: r.name, c: r.code }))))
      .query(
        `INSERT INTO ${k.table} (Name, Code, IsActive)
         OUTPUT INSERTED.${k.key} AS id
         SELECT n, c, 1 FROM OPENJSON(@j) WITH (n nvarchar(100), c nvarchar(20))`,
      );
    const ids = ins.recordset.map((r: Row) => Number(r.id));
    const people = (await rq(t).query(`${k.select} WHERE ${k.key} IN (${ids.join(',')}) ORDER BY ${k.key}`)).recordset.map(toPerson);
    await audit(t, {
      actor: 'admin',
      actorId: admin.id,
      actorName: admin.name,
      action: `${kind === 'staff' ? 'staff' : 'department'}.import`,
      entity: kind === 'staff' ? 'Staff' : 'Department',
      detail: { count: people.length },
    });
    return { value: people, patch: { [k.patchKey]: people } as Patch };
  });
}

/** ลงทะเบียน SN จากผู้ผลิตหลายชิ้น (ชิ้นใหม่ ยังไม่นับรอบ) */
export async function importUnits(input: { itemId: number; sn: string; line?: number }[]): Promise<ActionOk<Unit[]>> {
  const rows = checkBatch(input).map((r) => ({ line: r.line, itemId: int(r.itemId), sn: text(r.sn) }));
  return tx(async (t) => {
    const ir = await rq(t).query(`SELECT ItemId AS id, MaxRound AS maxRound FROM dbo.Items WITH (UPDLOCK, HOLDLOCK) WHERE IsActive = 1`);
    const maxRound = new Map(ir.recordset.map((r: Row) => [Number(r.id), Number(r.maxRound)]));
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (!maxRound.has(r.itemId)) fail(`บรรทัด ${r.line}: ไม่พบรายการอุปกรณ์`);
      if (!SN_PATTERN.test(r.sn)) fail(`บรรทัด ${r.line}: SN ใช้ได้เฉพาะภาษาอังกฤษ ตัวเลข สัญลักษณ์ ไม่มีช่องว่าง ไม่เกิน 40 ตัว`);
      const k = normSn(r.sn);
      if (seen.has(k)) fail(`บรรทัด ${r.line}: SN ${r.sn} ซ้ำกับบรรทัด ${seen.get(k)}`);
      seen.set(k, r.line);
    }
    // SN ที่มีอยู่แล้ว (เช็คทีละ 500 — SQL Server รับพารามิเตอร์ได้ไม่เกิน ~2100 ตัวต่อคำสั่ง)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const req = rq(t);
      chunk.forEach((r, j) => req.input(`s${j}`, sql.VarChar(40), r.sn));
      const dup = await req.query(`SELECT TOP 1 Sn AS sn FROM dbo.Units WHERE Sn IN (${chunk.map((_, j) => `@s${j}`).join(',')})`);
      if (dup.recordset[0]) {
        const sn = String(dup.recordset[0].sn);
        fail(`บรรทัด ${seen.get(normSn(sn))}: SN ${sn} มีอยู่ในระบบแล้ว`);
      }
    }
    const ins = await rq(t)
      .input('j', sql.NVarChar(sql.MAX), JSON.stringify(rows.map((r) => ({ s: r.sn, i: r.itemId, m: maxRound.get(r.itemId) }))))
      .query(
        `INSERT INTO dbo.Units (Sn, ItemId, MaxRound, ManufacturerSn)
         OUTPUT INSERTED.UnitId AS id
         SELECT s, i, m, 1 FROM OPENJSON(@j) WITH (s varchar(40), i int, m int)`,
      );
    const units = await selectUnits(t, ins.recordset.map((r: Row) => Number(r.id)));
    await audit(t, { actor: 'staff', action: 'unit.import', entity: 'Unit', detail: { count: units.length } });
    return { value: units, patch: { units } };
  });
}
