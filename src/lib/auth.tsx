'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nowStamp } from './date';

/**
 * ระบบเข้าสู่ระบบของผู้ดูแล (แอดมิน)
 *
 * ข้อจำกัด: ข้อมูลทั้งหมดยังอยู่ในเบราว์เซอร์ (localStorage) จึงเป็น "ล็อกกันกดผิด / กันคนทั่วไปเข้าหน้าตั้งค่า"
 * ไม่ใช่ความปลอดภัยระดับเซิร์ฟเวอร์ — คนที่เปิด DevTools ได้ยังแก้ข้อมูลตรง ๆ ได้
 * เมื่อย้ายไปฐานข้อมูลกลาง ให้ย้ายการตรวจรหัสผ่านไปฝั่งเซิร์ฟเวอร์
 *
 * รหัสผ่านไม่เก็บเป็นตัวอักษร — เก็บเป็น PBKDF2-SHA256 + salt สุ่มต่อบัญชี
 */

export interface AdminAccount {
  id: number;
  /** ชื่อผู้ใช้สำหรับเข้าสู่ระบบ (ตัวเล็ก ไม่ซ้ำ) */
  username: string;
  /** ชื่อที่แสดง */
  displayName: string;
  salt: string;
  hash: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export type PublicAdmin = Omit<AdminAccount, 'salt' | 'hash'>;
type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

const KEY_ADMINS = 'sticker_admins';
const KEY_SESSION = 'sticker_adminSession';
const KEY_SEEDED = 'sticker_adminSeeded';

/**
 * บัญชีเริ่มต้น admin / admin1234 (ยังไม่เปิดให้สมัครเอง — วิธีจัดการบัญชีจะตกลงกันภายหลัง)
 * เก็บเป็น hash ที่คำนวณไว้ล่วงหน้า · ควรเปลี่ยนรหัสผ่านที่เมนูบัญชีแอดมินหลังใช้งานจริง
 * เพิ่มให้ครั้งเดียวต่อเครื่อง (ถ้าลบบัญชีนี้ทิ้ง จะไม่กลับมาอีก)
 */
const DEFAULT_ADMIN: Omit<AdminAccount, 'id' | 'createdAt'> = {
  username: 'admin',
  displayName: 'ผู้ดูแลระบบ',
  salt: '5f1c2a9e7b3d4c60a8e1f2b3c4d5e6f7',
  hash: '12ca1eba2d364f19cd8ad78e990d0cdea389898e95a8b9f4a5de91543a818099',
  active: true,
};
/** ไม่ได้ใช้งานนานเท่านี้ → ออกจากระบบอัตโนมัติ */
export const IDLE_MINUTES = 15;
const ITERATIONS = 120_000;

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD = 6;

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? []);

async function hashPassword(password: string, saltHex: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('เบราว์เซอร์ไม่รองรับการเข้ารหัส — ต้องเปิดผ่าน https:// หรือ http://localhost');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}
const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

/** เทียบแบบใช้เวลาคงที่ */
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

function readAdmins(): AdminAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_ADMINS) || '[]');
    return Array.isArray(raw) ? raw.filter((a) => a && a.username && a.hash && a.salt) : [];
  } catch {
    return [];
  }
}
function readSession(): { adminId: number; lastActive: number } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY_SESSION) || 'null');
    return s && typeof s.adminId === 'number' ? s : null;
  } catch {
    return null;
  }
}
function writeSession(s: { adminId: number; lastActive: number } | null) {
  try {
    if (s) sessionStorage.setItem(KEY_SESSION, JSON.stringify(s));
    else sessionStorage.removeItem(KEY_SESSION);
  } catch {
    /* โหมดส่วนตัว / ถูกบล็อก — ใช้ได้เฉพาะในหน้านี้ */
  }
}

const strip = ({ salt: _s, hash: _h, ...rest }: AdminAccount): PublicAdmin => rest;
const normUser = (u: string) => u.trim().toLowerCase();

interface AuthValue {
  ready: boolean;
  admins: PublicAdmin[];
  /** แอดมินที่เข้าสู่ระบบอยู่ (null = เจ้าหน้าที่ทั่วไป) */
  current: PublicAdmin | null;
  login: (username: string, password: string) => Promise<Result>;
  logout: () => void;
  /** สร้างบัญชีเพิ่ม — ต้องเป็นแอดมินที่เข้าสู่ระบบอยู่ (ไม่มีการสมัครเอง) */
  createAdmin: (input: { username: string; displayName: string; password: string }) => Promise<Result<PublicAdmin>>;
  updateAdmin: (id: number, input: { displayName: string; active: boolean }) => Result;
  setPassword: (id: number, password: string) => Promise<Result>;
  deleteAdmin: (id: number) => Result;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const ref = useRef<AdminAccount[]>([]);

  const save = useCallback((list: AdminAccount[]) => {
    ref.current = list;
    setAdmins(list);
    localStorage.setItem(KEY_ADMINS, JSON.stringify(list));
  }, []);

  const logout = useCallback(() => {
    writeSession(null);
    setSessionId(null);
  }, []);

  useEffect(() => {
    let list = readAdmins();
    try {
      if (!localStorage.getItem(KEY_SEEDED)) {
        if (!list.some((a) => a.username === DEFAULT_ADMIN.username)) {
          const id = list.length ? Math.max(...list.map((a) => a.id)) + 1 : 1;
          list = [...list, { ...DEFAULT_ADMIN, id, createdAt: nowStamp() }];
          localStorage.setItem(KEY_ADMINS, JSON.stringify(list));
        }
        localStorage.setItem(KEY_SEEDED, '1');
      }
    } catch {
      /* localStorage ใช้ไม่ได้ */
    }
    ref.current = list;
    setAdmins(list);
    const s = readSession();
    if (s && Date.now() - s.lastActive < IDLE_MINUTES * 60_000 && list.some((a) => a.id === s.adminId && a.active)) {
      setSessionId(s.adminId);
    } else writeSession(null);
    setReady(true);
  }, []);

  // บัญชีถูกปิด/ลบ (เช่น แท็บอื่น) → ออกจากระบบ
  const currentAcc = admins.find((a) => a.id === sessionId && a.active) ?? null;
  useEffect(() => {
    if (ready && sessionId != null && !currentAcc) logout();
  }, [ready, sessionId, currentAcc, logout]);

  // ไม่ได้ใช้งานนาน → ออกจากระบบอัตโนมัติ (กันลืมออกแล้วเจ้าหน้าที่คนอื่นมาใช้ต่อ)
  useEffect(() => {
    if (sessionId == null) return;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
      writeSession({ adminId: sessionId, lastActive: last });
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - last > IDLE_MINUTES * 60_000) logout();
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [sessionId, logout]);

  const login = useCallback<AuthValue['login']>(async (username, password) => {
    const acc = ref.current.find((a) => a.username === normUser(username));
    let ok = false;
    try {
      // คำนวณ hash เสมอแม้ไม่พบชื่อผู้ใช้ เพื่อไม่ให้เดาชื่อผู้ใช้จากเวลาตอบสนอง
      const h = await hashPassword(password, acc?.salt ?? '00000000000000000000000000000000');
      ok = !!acc && safeEqual(h, acc.hash);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!ok || !acc) return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    if (!acc.active) return { ok: false, error: 'บัญชีนี้ถูกปิดใช้งาน' };
    save(ref.current.map((a) => (a.id === acc.id ? { ...a, lastLoginAt: nowStamp() } : a)));
    writeSession({ adminId: acc.id, lastActive: Date.now() });
    setSessionId(acc.id);
    return { ok: true, value: undefined };
  }, [save]);

  const createAdmin = useCallback<AuthValue['createAdmin']>(
    async ({ username, displayName, password }) => {
      if (sessionId == null) return { ok: false, error: 'ต้องเข้าสู่ระบบแอดมินก่อน' };
      const u = normUser(username);
      if (!USERNAME_PATTERN.test(u)) return { ok: false, error: 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว' };
      if (ref.current.some((a) => a.username === u)) return { ok: false, error: `มีชื่อผู้ใช้ "${u}" แล้ว` };
      if (password.length < MIN_PASSWORD) return { ok: false, error: `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัว` };
      try {
        const salt = newSalt();
        const acc: AdminAccount = {
          id: ref.current.length ? Math.max(...ref.current.map((a) => a.id)) + 1 : 1,
          username: u,
          displayName: displayName.trim() || u,
          salt,
          hash: await hashPassword(password, salt),
          active: true,
          createdAt: nowStamp(),
        };
        save([...ref.current, acc]);
        return { ok: true, value: strip(acc) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [save, sessionId],
  );

  const activeOthers = (id: number) => ref.current.filter((a) => a.id !== id && a.active).length;

  const updateAdmin = useCallback<AuthValue['updateAdmin']>(
    (id, { displayName, active }) => {
      if (sessionId == null) return { ok: false, error: 'ต้องเข้าสู่ระบบแอดมินก่อน' };
      const acc = ref.current.find((a) => a.id === id);
      if (!acc) return { ok: false, error: 'ไม่พบบัญชี' };
      if (!active && id === sessionId) return { ok: false, error: 'ปิดใช้งานบัญชีที่กำลังใช้อยู่ไม่ได้' };
      if (!active && !activeOthers(id)) return { ok: false, error: 'ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 บัญชี' };
      save(ref.current.map((a) => (a.id === id ? { ...a, displayName: displayName.trim() || a.username, active } : a)));
      return { ok: true, value: undefined };
    },
    [save, sessionId],
  );

  const setPassword = useCallback<AuthValue['setPassword']>(
    async (id, password) => {
      if (sessionId == null) return { ok: false, error: 'ต้องเข้าสู่ระบบแอดมินก่อน' };
      if (password.length < MIN_PASSWORD) return { ok: false, error: `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัว` };
      try {
        const salt = newSalt();
        const hash = await hashPassword(password, salt);
        save(ref.current.map((a) => (a.id === id ? { ...a, salt, hash } : a)));
        return { ok: true, value: undefined };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [save, sessionId],
  );

  const deleteAdmin = useCallback<AuthValue['deleteAdmin']>(
    (id) => {
      if (sessionId == null) return { ok: false, error: 'ต้องเข้าสู่ระบบแอดมินก่อน' };
      if (id === sessionId) return { ok: false, error: 'ลบบัญชีที่กำลังใช้อยู่ไม่ได้' };
      const acc = ref.current.find((a) => a.id === id);
      if (acc?.active && !activeOthers(id)) return { ok: false, error: 'ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 บัญชี' };
      save(ref.current.filter((a) => a.id !== id));
      return { ok: true, value: undefined };
    },
    [save, sessionId],
  );

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      admins: admins.map(strip),
      current: currentAcc ? strip(currentAcc) : null,
      login,
      logout,
      createAdmin,
      updateAdmin,
      setPassword,
      deleteAdmin,
    }),
    [ready, admins, currentAcc, login, logout, createAdmin, updateAdmin, setPassword, deleteAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
