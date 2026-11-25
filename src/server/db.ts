import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';

/**
 * การเชื่อมต่อ SQL Server — อ่านค่าจาก environment (ไฟล์ singleuse.env ที่หน้างาน → app\.env.local)
 *
 * ใช้ฐานข้อมูลของโปรแกรมนี้เท่านั้น: [SingleUseSticker] ผ่าน login singleuse_app
 * ซึ่งมีสิทธิ์เฉพาะฐานนี้ (ดู database/00_create_database.sql) — ไม่แตะฐานข้อมูลอื่นบนเซิร์ฟเวอร์
 * และจะไม่ยอมเชื่อมต่อถ้าใส่ login ที่เป็น sysadmin (เช่น sa)
 */

export const DB_NAME = 'SingleUseSticker';

/** ข้อความที่แสดงให้ผู้ใช้ได้ (ภาษาไทย ไม่มีรายละเอียดภายใน) */
export class DbSetupError extends Error {}

const flag = (v: string | undefined, fallback: boolean) => (v == null || v === '' ? fallback : /^(1|true|yes)$/i.test(v));

function readConfig(): sql.config {
  const env = process.env;
  if (!env.DB_SERVER) throw new DbSetupError('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล (DB_SERVER ในไฟล์ singleuse.env)');
  if (!env.DB_PASSWORD || env.DB_PASSWORD === 'CHANGE_ME') {
    throw new DbSetupError('ยังไม่ได้ใส่รหัสผ่านฐานข้อมูล (DB_PASSWORD ในไฟล์ singleuse.env)');
  }
  const instanceName = env.DB_INSTANCE || undefined;
  return {
    server: env.DB_SERVER,
    // instance ที่มีชื่อ (เช่น SQLEXPRESS) หา port ผ่าน SQL Server Browser — ระบุอย่างใดอย่างหนึ่ง
    port: instanceName ? undefined : Number(env.DB_PORT || 1433),
    database: DB_NAME,
    user: env.DB_USER || 'singleuse_app',
    password: env.DB_PASSWORD,
    pool: { max: 8, min: 0, idleTimeoutMillis: 60_000 },
    connectionTimeout: 15_000,
    requestTimeout: 30_000,
    options: {
      instanceName,
      encrypt: flag(env.DB_ENCRYPT, true),
      // SQL Server ในโรงพยาบาลมักใช้ใบรับรองที่สร้างเอง
      trustServerCertificate: flag(env.DB_TRUST_SERVER_CERT, true),
      // วันที่/เวลาแปลงเป็นข้อความใน SQL เอง (CONVERT) จึงไม่มีเรื่องเขตเวลา
      useUTC: true,
      // เห็นใน Activity Monitor ของ SQL Server ว่าเป็นการเชื่อมต่อของโปรแกรมนี้
      appName: 'singleuse-sticker',
    },
  };
}

/** แยกสคริปต์ .sql เป็นชุดคำสั่งตามบรรทัด GO (แบบเดียวกับ SSMS) */
export function splitBatches(script: string): string[] {
  return script
    .replace(/^﻿/, '')
    .split(/^[ \t]*GO[ \t]*(?:--[^\n]*)?\r?$/gim)
    .map((b) => b.trim())
    .filter((b) => b && !/^(--[^\n]*\s*)*$/.test(b));
}

/** โฟลเดอร์สคริปต์ฐานข้อมูล (ในชุดติดตั้ง: app\database) */
const scriptsDir = () => path.join(process.cwd(), 'database');

async function schemaVersion(pool: sql.ConnectionPool): Promise<number> {
  const r = await pool.request().query<{ v: number | null }>(
    `IF OBJECT_ID(N'dbo.SchemaVersion', N'U') IS NULL SELECT CAST(0 AS int) AS v ELSE SELECT MAX(Version) AS v FROM dbo.SchemaVersion`,
  );
  return r.recordset[0]?.v ?? 0;
}

/**
 * สร้าง/อัปเดตตารางให้เป็นเวอร์ชันล่าสุด — รันสคริปต์ 01_, 02_, ... ที่ยังไม่ได้รัน ตามลำดับ
 * (00_create_database.sql ต้องใช้สิทธิ์ sysadmin ฝ่าย IT รันเองใน SSMS ครั้งเดียว)
 * แต่ละสคริปต์มี transaction ของตัวเอง ถ้าพลาดจะยกเลิกทั้งไฟล์ และรันซ้ำได้
 */
async function migrate(cfg: sql.config): Promise<void> {
  const files = (await readdir(scriptsDir()))
    .filter((f) => /^\d{2}_.+\.sql$/i.test(f) && !f.startsWith('00_'))
    .sort();
  // การเชื่อมต่อเดียว: สคริปต์เปิด transaction ในชุดหนึ่งแล้ว commit ในอีกชุด
  const pool = await new sql.ConnectionPool({ ...cfg, pool: { max: 1, min: 0 }, requestTimeout: 120_000 }).connect();
  try {
    const current = await schemaVersion(pool);
    for (const f of files) {
      const version = Number(f.slice(0, 2));
      if (version <= current) continue;
      console.log(`[db] กำลังติดตั้งโครงสร้างฐานข้อมูล ${f}`);
      const text = await readFile(path.join(scriptsDir(), f), 'utf8');
      for (const batch of splitBatches(text)) await pool.request().batch(batch);
      const now = await schemaVersion(pool);
      if (now < version) throw new Error(`สคริปต์ ${f} รันแล้วแต่เวอร์ชันยังเป็น ${now}`);
    }
  } finally {
    await pool.close().catch(() => {});
  }
}

async function connect(): Promise<sql.ConnectionPool> {
  const cfg = readConfig();
  const pool = await new sql.ConnectionPool(cfg).connect();
  try {
    const r = await pool.request().query<{ admin: number }>(`SELECT IS_SRVROLEMEMBER('sysadmin') AS admin`);
    if (r.recordset[0]?.admin === 1) {
      throw new DbSetupError(
        'login ที่ตั้งไว้เป็นผู้ดูแลทั้งเซิร์ฟเวอร์ (sysadmin) โปรแกรมจึงไม่เชื่อมต่อ — ให้ใช้ login singleuse_app ที่สร้างจาก 00_create_database.sql',
      );
    }
    await migrate(cfg);
    return pool;
  } catch (e) {
    await pool.close().catch(() => {});
    throw e;
  }
}

// อยู่รอดข้ามการ hot reload ตอนพัฒนา
const g = globalThis as unknown as { __suPool?: Promise<sql.ConnectionPool> };

export function getPool(): Promise<sql.ConnectionPool> {
  if (!g.__suPool) {
    g.__suPool = connect().catch((e) => {
      g.__suPool = undefined; // ครั้งหน้าลองใหม่
      throw e;
    });
  }
  return g.__suPool;
}

/** ข้อความภาษาไทยของข้อผิดพลาดฐานข้อมูล (รายละเอียดจริงไปที่ log ของเซิร์ฟเวอร์เท่านั้น) */
export function dbErrorMessage(e: unknown): string {
  if (e instanceof DbSetupError) return e.message;
  const code = (e as { code?: string })?.code;
  if (code === 'ELOGIN') return 'เข้าสู่ฐานข้อมูลไม่สำเร็จ — ตรวจสอบ DB_USER / DB_PASSWORD ใน singleuse.env และว่ารัน 00_create_database.sql แล้ว';
  if (code === 'ESOCKET' || code === 'ETIMEOUT' || code === 'EINSTLOOKUP') {
    return 'เชื่อมต่อ SQL Server ไม่ได้ — ตรวจสอบว่า SQL Server เปิดอยู่ และ DB_SERVER / DB_PORT ใน singleuse.env ถูกต้อง';
  }
  if (code === 'ENOENT') return 'ไม่พบโฟลเดอร์สคริปต์ฐานข้อมูล (app\\database) — ชุดติดตั้งไม่ครบ';
  return 'เกิดข้อผิดพลาดที่ฐานข้อมูล ดูรายละเอียดใน logs\\server.log';
}

export { sql };
