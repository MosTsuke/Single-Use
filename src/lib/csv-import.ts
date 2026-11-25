import { cleanPrefix } from './storage';
import type { AppData, Department, MasterItem, Staff } from './types';
import { normSn, SN_PATTERN } from './units';

/**
 * นำเข้าข้อมูลทีละชุดจากไฟล์ CSV (ดาวน์โหลดไฟล์ต้นแบบ → กรอกใน Excel → นำเข้า)
 *
 * - บรรทัดแรกเป็นหัวตาราง (ต้องตรงกับไฟล์ต้นแบบ — สลับลำดับคอลัมน์ได้)
 * - บรรทัดที่ขึ้นต้นด้วย # และบรรทัดว่าง ไม่ถูกนำเข้า (ไฟล์ต้นแบบใช้ # ทำตัวอย่าง)
 * - เพิ่มเฉพาะข้อมูลใหม่ ไม่แก้ของเดิม · มีแถวผิดแม้แถวเดียว = ไม่บันทึกเลย (แก้ไฟล์แล้วนำเข้าใหม่)
 * - อ่านได้ทั้ง UTF-8 (CSV UTF-8 ของ Excel) และ ANSI ภาษาไทย (windows-874) · คั่นด้วย , ; หรือ tab
 */

export type CsvKind = 'items' | 'staff' | 'departments' | 'units';

/** ข้อมูล 1 แถวที่ผ่านการตรวจ + เลขบรรทัดในไฟล์ (ใช้ในข้อความแจ้งผิด) */
export type ImportRow<T> = T & { line: number };
export type ItemImport = ImportRow<Omit<MasterItem, 'id'>>;
export type PersonImport = ImportRow<Omit<Staff | Department, 'id'>>;
export type UnitImport = ImportRow<{ itemId: number; sn: string }>;

export const MAX_IMPORT_ROWS = 2000;

interface Spec {
  /** ใช้ในข้อความ เช่น "นำเข้ารายการอุปกรณ์" */
  title: string;
  /** หน่วยนับ เช่น "รายการ", "คน" */
  unit: string;
  filename: string;
  headers: string[];
  /** คอลัมน์ที่ต้องมีในหัวตาราง */
  required: string[];
  /** แถวตัวอย่างในไฟล์ต้นแบบ (ขึ้นต้นด้วย # ไม่ถูกนำเข้า) */
  examples: string[][];
  /** คำอธิบายการกรอก แสดงในหน้าต่างนำเข้า */
  hint: string;
}

export const CSV_SPECS: Record<CsvKind, Spec> = {
  items: {
    title: 'รายการอุปกรณ์',
    unit: 'รายการ',
    filename: 'template-รายการอุปกรณ์.csv',
    headers: ['ชื่ออุปกรณ์', 'อายุหลัง sterilize (วัน)', 'รอบสูงสุด', 'คำนำหน้า SN', 'พิมพ์บาร์โคด'],
    required: ['ชื่ออุปกรณ์', 'อายุหลัง sterilize (วัน)', 'รอบสูงสุด', 'คำนำหน้า SN'],
    examples: [
      ['# สาย Suction', '61', '4', 'SUC', 'ใช่'],
      ['# ชุดสวนปัสสาวะ', '30', '3', 'FOL', 'ไม่'],
    ],
    hint: 'อายุหลัง sterilize 0–3650 วัน · รอบสูงสุด 1–99 · คำนำหน้า SN ภาษาอังกฤษ/ตัวเลขไม่เกิน 8 ตัว ห้ามซ้ำ · พิมพ์บาร์โคด = ใช่ / ไม่ (เว้นว่าง = ใช่)',
  },
  staff: {
    title: 'รายชื่อเจ้าหน้าที่',
    unit: 'คน',
    filename: 'template-รายชื่อเจ้าหน้าที่.csv',
    headers: ['ชื่อ-นามสกุล', 'รหัสพนักงาน'],
    required: ['ชื่อ-นามสกุล'],
    examples: [
      ['# สมหญิง ใจดี', 'N1023'],
      ['# สมชาย รักงาน', ''],
    ],
    hint: 'ชื่อพิมพ์บนสติ๊กเกอร์ ห้ามซ้ำกับที่มีอยู่ · รหัสพนักงานไม่บังคับ (ถ้ามีห้ามซ้ำ)',
  },
  departments: {
    title: 'หน่วยงาน',
    unit: 'หน่วยงาน',
    filename: 'template-หน่วยงาน.csv',
    headers: ['ชื่อหน่วยงาน', 'รหัส/ชื่อย่อ'],
    required: ['ชื่อหน่วยงาน'],
    examples: [
      ['# ห้องผ่าตัด', 'OR'],
      ['# หอผู้ป่วยหนัก', 'ICU'],
    ],
    hint: 'ชื่อพิมพ์บนสติ๊กเกอร์ ("ใช้ที่ ...") ห้ามซ้ำกับที่มีอยู่ · รหัสไม่บังคับ (ถ้ามีห้ามซ้ำ)',
  },
  units: {
    title: 'อุปกรณ์รายชิ้น (SN)',
    unit: 'ชิ้น',
    filename: 'template-อุปกรณ์รายชิ้น.csv',
    headers: ['รายการอุปกรณ์', 'SN'],
    required: ['รายการอุปกรณ์', 'SN'],
    examples: [
      ['# สาย Suction', 'SUC-A0001'],
      ['# SUC', 'SUC-A0002'],
    ],
    hint: 'รายการอุปกรณ์ = ชื่อตามเมนูรายการอุปกรณ์ หรือคำนำหน้า SN · SN จากผู้ผลิต ภาษาอังกฤษ/ตัวเลข/สัญลักษณ์ ไม่มีช่องว่าง ไม่เกิน 40 ตัว ห้ามซ้ำ · ลงทะเบียนเป็นชิ้นใหม่ (ยังไม่นับรอบ)',
  },
};

/* ---------------------------------------------------------------------
   อ่าน / เขียน CSV
   --------------------------------------------------------------------- */

/** อ่านไฟล์เป็นข้อความ: UTF-8 ก่อน ถ้าไม่ใช่ (Excel บันทึกแบบ ANSI) ใช้ภาษาไทย windows-874 */
export async function readCsvFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 5 MB');
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-874').decode(buf);
  }
}

/** แยก CSV (รองรับ "..." ที่มี , หรือขึ้นบรรทัดใหม่ข้างใน และ "" แทน ") — ตัวคั่นดูจากบรรทัดแรก */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  const sep = [',', ';', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** ดาวน์โหลดไฟล์ CSV (ใส่ BOM ให้ Excel เปิดภาษาไทยถูก) */
export function downloadCsv(filename: string, rows: string[][]) {
  const text = '﻿' + rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadTemplate(kind: CsvKind) {
  const s = CSV_SPECS[kind];
  downloadCsv(s.filename, [s.headers, ...s.examples]);
}

/* ---------------------------------------------------------------------
   ตรวจข้อมูล (ใช้ทั้งตอนแสดงตัวอย่าง และตรวจซ้ำก่อนบันทึกในโหมดทดสอบ)
   --------------------------------------------------------------------- */

export interface CheckedRow {
  /** เลขบรรทัดในไฟล์ (นับจาก 1 รวมหัวตาราง) */
  line: number;
  /** ค่าตามหัวตาราง (สำหรับแสดงในตัวอย่าง) */
  cells: Record<string, string>;
  error?: string;
}

export interface CheckResult<T> {
  /** ผิดทั้งไฟล์ (เช่น หัวตารางไม่ตรง) */
  fileError?: string;
  rows: CheckedRow[];
  /** ข้อมูลพร้อมบันทึก (มีเฉพาะเมื่อไม่มีแถวผิดเลย) */
  values: T[];
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const YES = new Set(['', 'ใช่', 'y', 'yes', 'true', '1', 'มี', 'พิมพ์']);
const NO = new Set(['ไม่', 'ไม่ใช่', 'n', 'no', 'false', '0', 'ไม่มี', 'ไม่พิมพ์']);

function toInt(v: string): number | null {
  const t = v.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** แยกหัวตาราง + แถวข้อมูล (ข้ามบรรทัดว่างและบรรทัด #) */
function splitTable(kind: CsvKind, table: string[][]): { fileError?: string; rows: { line: number; cells: Record<string, string> }[] } {
  const spec = CSV_SPECS[kind];
  const lines = table.map((cells, i) => ({ line: i + 1, cells: cells.map((c) => c.trim()) }));
  const isBlank = (c: string[]) => c.every((x) => !x);
  const content = lines.filter((l) => !isBlank(l.cells) && !l.cells[0]?.startsWith('#'));
  const header = content.shift();
  if (!header) return { fileError: 'ไฟล์ว่าง — ดาวน์โหลดไฟล์ต้นแบบแล้วกรอกข้อมูลใต้หัวตาราง', rows: [] };
  const index = new Map(header.cells.map((h, i) => [norm(h), i]));
  const missing = spec.required.filter((h) => !index.has(norm(h)));
  if (missing.length) {
    return { fileError: `หัวตารางไม่ตรงกับไฟล์ต้นแบบ (ไม่พบคอลัมน์: ${missing.join(', ')}) — ดาวน์โหลดไฟล์ต้นแบบของหน้านี้แล้วกรอกใหม่`, rows: [] };
  }
  if (content.length > MAX_IMPORT_ROWS) return { fileError: `นำเข้าได้ครั้งละไม่เกิน ${MAX_IMPORT_ROWS} แถว — แบ่งเป็นหลายไฟล์`, rows: [] };
  if (!content.length) return { fileError: 'ไม่มีข้อมูลใต้หัวตาราง (บรรทัดที่ขึ้นต้นด้วย # เป็นตัวอย่าง ไม่ถูกนำเข้า)', rows: [] };
  return {
    rows: content.map((l) => ({
      line: l.line,
      cells: Object.fromEntries(spec.headers.map((h) => [h, index.has(norm(h)) ? (l.cells[index.get(norm(h))!] ?? '') : ''])),
    })),
  };
}

/** ตรวจทุกแถวเทียบกับข้อมูลที่มีอยู่ และระหว่างแถวในไฟล์เดียวกัน */
export function checkCsv(kind: 'items', table: string[][], data: AppData): CheckResult<ItemImport>;
export function checkCsv(kind: 'staff' | 'departments', table: string[][], data: AppData): CheckResult<PersonImport>;
export function checkCsv(kind: 'units', table: string[][], data: AppData): CheckResult<UnitImport>;
export function checkCsv(kind: CsvKind, table: string[][], data: AppData): CheckResult<ItemImport | PersonImport | UnitImport> {
  const { fileError, rows: raw } = splitTable(kind, table);
  if (fileError) return { fileError, rows: [], values: [] };
  const rows: CheckedRow[] = [];
  const values: (ItemImport | PersonImport | UnitImport)[] = [];
  const h = CSV_SPECS[kind].headers;

  if (kind === 'items') {
    const names = new Map(data.items.map((i) => [norm(i.name), 'มีอยู่แล้ว']));
    const prefixes = new Map(data.items.map((i) => [i.snPrefix, 'ถูกใช้กับรายการอื่นแล้ว']));
    for (const r of raw) {
      const c = r.cells;
      const name = c[h[0]].replace(/\s+/g, ' ').trim();
      const shelf = toInt(c[h[1]]);
      const maxRound = toInt(c[h[2]]);
      const prefixRaw = c[h[3]].toUpperCase();
      const prefix = cleanPrefix(prefixRaw);
      const code = norm(c[h[4]] ?? '');
      let error: string | undefined;
      if (!name) error = 'ไม่มีชื่ออุปกรณ์';
      else if (name.length > 60) error = 'ชื่อยาวเกิน 60 ตัวอักษร';
      else if (names.has(norm(name))) error = `ชื่อ "${name}" ${names.get(norm(name))}`;
      else if (shelf == null || shelf > 3650) error = 'อายุหลัง sterilize ต้องเป็นตัวเลข 0–3650';
      else if (maxRound == null || maxRound < 1 || maxRound > 99) error = 'รอบสูงสุดต้องเป็นตัวเลข 1–99';
      else if (!prefix || prefix !== prefixRaw.trim()) error = 'คำนำหน้า SN ใช้ได้เฉพาะ A-Z และ 0-9 ไม่เกิน 8 ตัว';
      else if (prefixes.has(prefix)) error = `คำนำหน้า ${prefix} ${prefixes.get(prefix)}`;
      else if (!YES.has(code) && !NO.has(code)) error = 'พิมพ์บาร์โคด ใส่ได้แค่ ใช่ / ไม่';
      rows.push({ line: r.line, cells: c, error });
      if (!error) {
        names.set(norm(name), `ซ้ำกับบรรทัด ${r.line}`);
        prefixes.set(prefix, `ซ้ำกับบรรทัด ${r.line}`);
        values.push({ line: r.line, name, shelf: shelf!, maxRound: maxRound!, snPrefix: prefix, useBarcode: !NO.has(code) });
      }
    }
  } else if (kind === 'staff' || kind === 'departments') {
    const list = kind === 'staff' ? data.staff : data.departments;
    const names = new Map(list.map((p) => [norm(p.name), 'มีอยู่แล้ว']));
    const codes = new Map(list.filter((p) => p.code).map((p) => [norm(p.code!), `ถูกใช้กับ ${p.name} แล้ว`]));
    for (const r of raw) {
      const c = r.cells;
      const name = c[h[0]].replace(/\s+/g, ' ').trim();
      const code = c[h[1]].trim();
      let error: string | undefined;
      if (!name) error = 'ไม่มีชื่อ';
      else if (name.length > 60) error = 'ชื่อยาวเกิน 60 ตัวอักษร';
      else if (names.has(norm(name))) error = `ชื่อ "${name}" ${names.get(norm(name))}`;
      else if (code.length > 20) error = 'รหัสยาวเกิน 20 ตัวอักษร';
      else if (code && codes.has(norm(code))) error = `รหัส ${code} ${codes.get(norm(code))}`;
      rows.push({ line: r.line, cells: c, error });
      if (!error) {
        names.set(norm(name), `ซ้ำกับบรรทัด ${r.line}`);
        if (code) codes.set(norm(code), `ซ้ำกับบรรทัด ${r.line}`);
        values.push({ line: r.line, name, code: code || undefined, active: true });
      }
    }
  } else {
    const sns = new Map(data.units.map((u) => [normSn(u.sn), 'มีอยู่ในระบบแล้ว']));
    for (const r of raw) {
      const c = r.cells;
      const itemText = c[h[0]].replace(/\s+/g, ' ').trim();
      const sn = c[h[1]].trim();
      const byName = data.items.filter((i) => norm(i.name) === norm(itemText));
      const item = byName.length === 1 ? byName[0] : byName.length ? undefined : data.items.find((i) => i.snPrefix === itemText.toUpperCase());
      let error: string | undefined;
      if (!itemText) error = 'ไม่มีชื่อรายการอุปกรณ์';
      else if (byName.length > 1) error = `มีรายการชื่อ "${itemText}" หลายรายการ — ใส่คำนำหน้า SN แทนชื่อ`;
      else if (!item) error = `ไม่พบรายการอุปกรณ์ "${itemText}" (เพิ่มที่เมนูรายการอุปกรณ์ก่อน)`;
      else if (!sn) error = 'ไม่มี SN';
      else if (!SN_PATTERN.test(sn)) error = 'SN ใช้ได้เฉพาะภาษาอังกฤษ ตัวเลข สัญลักษณ์ ไม่มีช่องว่าง ไม่เกิน 40 ตัว';
      else if (sns.has(normSn(sn))) error = `SN ${sn} ${sns.get(normSn(sn))}`;
      rows.push({ line: r.line, cells: c, error });
      if (!error) {
        sns.set(normSn(sn), `ซ้ำกับบรรทัด ${r.line}`);
        values.push({ line: r.line, itemId: item!.id, sn });
      }
    }
  }
  return { rows, values: rows.some((r) => r.error) ? [] : values };
}
