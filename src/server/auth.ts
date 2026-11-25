import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from './db';

/**
 * บัญชีแอดมิน — ตรวจรหัสผ่านที่เซิร์ฟเวอร์ (PBKDF2-SHA256 + salt สุ่มต่อบัญชี เหมือนรูปแบบเดิม)
 * session เก็บใน cookie HttpOnly ที่ลงลายมือชื่อด้วยกุญแจสุ่มของโปรเซสนี้
 * (เปิดโปรแกรมใหม่ = แอดมินต้องเข้าสู่ระบบใหม่)
 */

export interface PublicAdmin {
  id: number;
  username: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD = 6;
const ITERATIONS = 120_000;
const COOKIE = 'su_admin';
/** อายุสูงสุดของ session — นอกจากนี้หน้าเว็บออกจากระบบเองเมื่อไม่ใช้งาน 15 นาที */
const MAX_AGE_MS = 12 * 60 * 60_000;

const pbkdf2Async = promisify(pbkdf2);
export async function hashPassword(password: string, saltHex: string, iterations = ITERATIONS): Promise<string> {
  const buf = await pbkdf2Async(Buffer.from(password, 'utf8'), Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256');
  return buf.toString('hex');
}
export const newSalt = () => randomBytes(16).toString('hex');

const g = globalThis as unknown as { __suSessionKey?: Buffer };
const sessionKey = () => (g.__suSessionKey ??= randomBytes(32));
const sign = (payload: string) => createHmac('sha256', sessionKey()).update(payload).digest('base64url');

export function setSessionCookie(res: NextResponse, adminId: number) {
  const payload = `${adminId}.${Date.now()}`;
  res.cookies.set(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'strict', path: '/' });
}
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
}

function readSession(req: NextRequest): number | null {
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return null;
  const [id, at, sig] = raw.split('.');
  if (!id || !at || !sig) return null;
  const expected = Buffer.from(sign(`${id}.${at}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  if (Date.now() - Number(at) > MAX_AGE_MS) return null;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

const ADMIN_COLS = `AdminId AS id, Username AS username, DisplayName AS displayName, IsActive AS active,
  CONVERT(char(16), CreatedAt, 120) AS createdAt, CONVERT(char(16), LastLoginAt, 120) AS lastLoginAt`;

const toAdmin = (r: Record<string, unknown>): PublicAdmin => ({
  id: Number(r.id),
  username: String(r.username),
  displayName: String(r.displayName),
  active: !!r.active,
  createdAt: String(r.createdAt ?? ''),
  lastLoginAt: r.lastLoginAt ? String(r.lastLoginAt) : undefined,
});

/** แอดมินที่เข้าสู่ระบบอยู่ (ยังเปิดใช้งาน) — null = ไม่ใช่แอดมิน */
export async function currentAdmin(req: NextRequest): Promise<PublicAdmin | null> {
  const id = readSession(req);
  if (id == null) return null;
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${ADMIN_COLS} FROM dbo.AdminAccounts WHERE AdminId = @id AND IsActive = 1`);
  return r.recordset[0] ? toAdmin(r.recordset[0]) : null;
}

export async function listAdmins(): Promise<PublicAdmin[]> {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT ${ADMIN_COLS} FROM dbo.AdminAccounts ORDER BY AdminId`);
  return r.recordset.map(toAdmin);
}

/** ยังไม่มีบัญชีแอดมินที่ใช้งานได้เลย → ต้องสร้างบัญชีแรก (ตอนติดตั้ง) */
export async function needsSetup(): Promise<boolean> {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.AdminAccounts WHERE IsActive = 1`);
  return r.recordset[0].n === 0;
}

const DUMMY_SALT = '00000000000000000000000000000000';

export async function verifyLogin(username: string, password: string): Promise<{ ok: true; admin: PublicAdmin } | { ok: false; error: string }> {
  const pool = await getPool();
  const u = username.trim().toLowerCase();
  const r = await pool
    .request()
    .input('u', sql.VarChar(30), u.slice(0, 30))
    .query(`SELECT ${ADMIN_COLS}, PasswordHash AS hash, PasswordSalt AS salt, Iterations AS iterations FROM dbo.AdminAccounts WHERE Username = @u`);
  const row = r.recordset[0];
  // คำนวณ hash เสมอแม้ไม่พบชื่อผู้ใช้ เพื่อไม่ให้เดาชื่อผู้ใช้จากเวลาตอบสนอง
  const h = await hashPassword(password, row?.salt?.trim() ?? DUMMY_SALT, row?.iterations ?? ITERATIONS);
  const ok = !!row && timingSafeEqual(Buffer.from(h), Buffer.from(String(row.hash).trim().padEnd(h.length).slice(0, h.length)));
  if (!ok) return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  if (!row.active) return { ok: false, error: 'บัญชีนี้ถูกปิดใช้งาน' };
  await pool.request().input('id', sql.Int, row.id).query(`UPDATE dbo.AdminAccounts SET LastLoginAt = SYSDATETIME() WHERE AdminId = @id`);
  return { ok: true, admin: toAdmin(row) };
}

export function checkNewAdmin(username: string, password: string): string | null {
  if (!USERNAME_PATTERN.test(username)) return 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว';
  if (password.length < MIN_PASSWORD) return `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัว`;
  return null;
}

/** เพิ่มบัญชี — ใช้ทั้งตอนสร้างบัญชีแรก (onlyIfNone) และแอดมินเพิ่มบัญชีอื่น */
export async function insertAdmin(
  input: { username: string; displayName: string; password: string },
  opts: { onlyIfNone?: boolean } = {},
): Promise<{ ok: true; admin: PublicAdmin } | { ok: false; error: string }> {
  const username = input.username.trim().toLowerCase();
  const bad = checkNewAdmin(username, input.password);
  if (bad) return { ok: false, error: bad };
  const salt = newSalt();
  const hash = await hashPassword(input.password, salt);
  const pool = await getPool();
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const req = () => new sql.Request(t);
    if (opts.onlyIfNone) {
      const r = await req().query(`SELECT COUNT(*) AS n FROM dbo.AdminAccounts WITH (UPDLOCK, HOLDLOCK) WHERE IsActive = 1`);
      if (r.recordset[0].n > 0) {
        await t.rollback();
        return { ok: false, error: 'มีบัญชีแอดมินอยู่แล้ว — เข้าสู่ระบบด้วยบัญชีนั้น' };
      }
    }
    const dup = await req().input('u', sql.VarChar(30), username).query(`SELECT 1 AS x FROM dbo.AdminAccounts WHERE Username = @u`);
    if (dup.recordset.length) {
      await t.rollback();
      return { ok: false, error: `มีชื่อผู้ใช้ "${username}" แล้ว` };
    }
    const ins = await req()
      .input('u', sql.VarChar(30), username)
      .input('d', sql.NVarChar(60), (input.displayName.trim() || username).slice(0, 60))
      .input('h', sql.Char(64), hash)
      .input('s', sql.Char(32), salt)
      .input('i', sql.Int, ITERATIONS)
      .query(
        `INSERT INTO dbo.AdminAccounts (Username, DisplayName, PasswordHash, PasswordSalt, Iterations)
         OUTPUT INSERTED.AdminId AS id VALUES (@u, @d, @h, @s, @i)`,
      );
    const row = await req().input('id', sql.Int, ins.recordset[0].id).query(`SELECT ${ADMIN_COLS} FROM dbo.AdminAccounts WHERE AdminId = @id`);
    await t.commit();
    return { ok: true, admin: toAdmin(row.recordset[0]) };
  } catch (e) {
    await t.rollback().catch(() => {});
    throw e;
  }
}

async function activeOthers(id: number): Promise<number> {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT COUNT(*) AS n FROM dbo.AdminAccounts WHERE AdminId <> @id AND IsActive = 1`);
  return r.recordset[0].n;
}

type R = { ok: true; value?: undefined } | { ok: false; error: string };

export async function updateAdmin(me: PublicAdmin, id: number, input: { displayName: string; active: boolean }): Promise<R> {
  if (!input.active && id === me.id) return { ok: false, error: 'ปิดใช้งานบัญชีที่กำลังใช้อยู่ไม่ได้' };
  if (!input.active && !(await activeOthers(id))) return { ok: false, error: 'ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 บัญชี' };
  const pool = await getPool();
  const r = await pool
    .request()
    .input('id', sql.Int, id)
    .input('d', sql.NVarChar(60), String(input.displayName ?? '').trim().slice(0, 60))
    .input('a', sql.Bit, !!input.active)
    .query(`UPDATE dbo.AdminAccounts SET DisplayName = CASE WHEN @d = N'' THEN Username ELSE @d END, IsActive = @a WHERE AdminId = @id`);
  return r.rowsAffected[0] ? { ok: true } : { ok: false, error: 'ไม่พบบัญชี' };
}

export async function setAdminPassword(id: number, password: string): Promise<R> {
  if (password.length < MIN_PASSWORD) return { ok: false, error: `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัว` };
  const salt = newSalt();
  const hash = await hashPassword(password, salt);
  const pool = await getPool();
  const r = await pool
    .request()
    .input('id', sql.Int, id)
    .input('h', sql.Char(64), hash)
    .input('s', sql.Char(32), salt)
    .input('i', sql.Int, ITERATIONS)
    .query(`UPDATE dbo.AdminAccounts SET PasswordHash = @h, PasswordSalt = @s, Iterations = @i WHERE AdminId = @id`);
  return r.rowsAffected[0] ? { ok: true } : { ok: false, error: 'ไม่พบบัญชี' };
}

export async function deleteAdmin(me: PublicAdmin, id: number): Promise<R> {
  if (id === me.id) return { ok: false, error: 'ลบบัญชีที่กำลังใช้อยู่ไม่ได้' };
  const pool = await getPool();
  const cur = await pool.request().input('id', sql.Int, id).query(`SELECT IsActive AS active FROM dbo.AdminAccounts WHERE AdminId = @id`);
  if (!cur.recordset[0]) return { ok: false, error: 'ไม่พบบัญชี' };
  if (cur.recordset[0].active && !(await activeOthers(id))) return { ok: false, error: 'ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 บัญชี' };
  await pool
    .request()
    .input('id', sql.Int, id)
    .query(`UPDATE dbo.Settings SET UpdatedByAdminId = NULL WHERE UpdatedByAdminId = @id; DELETE FROM dbo.AdminAccounts WHERE AdminId = @id;`);
  return { ok: true };
}
