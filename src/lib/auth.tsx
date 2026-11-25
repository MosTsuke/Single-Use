'use client';

import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getJSON, postJSON } from './api';
import { AuthContext, IDLE_MINUTES, type AuthValue, type PublicAdmin, type Result } from './auth-core';
import { LocalAuthProvider } from './auth-local';
import { useMode } from './mode';

export { IDLE_MINUTES, MIN_PASSWORD, USERNAME_PATTERN, type PublicAdmin } from './auth-core';

/**
 * ระบบเข้าสู่ระบบของผู้ดูแล (แอดมิน) — โหมด db (หน้างาน)
 * (โหมด demo ใช้ auth-local.tsx: บัญชี admin / admin1234 เก็บในเบราว์เซอร์ เหมือนรุ่นแรก)
 *
 * บัญชีเก็บในฐานข้อมูลที่เครื่องแม่ รหัสผ่านตรวจที่เซิร์ฟเวอร์ (PBKDF2-SHA256 + salt)
 * งานของแอดมิน (แก้รายการอุปกรณ์ เจ้าหน้าที่ ฯลฯ) เซิร์ฟเวอร์ตรวจสิทธิ์ทุกครั้ง
 * ไม่มีบัญชีเริ่มต้น — ตอนติดตั้งจะให้สร้างบัญชีแรกเอง
 */

/** session ของแท็บนี้ — ปิดแท็บ/ไม่ใช้งานนาน = ออกจากระบบ */
const KEY_SESSION = 'sticker_adminSession';

function readMarker(): number | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY_SESSION) || 'null');
    return s && typeof s.lastActive === 'number' ? s.lastActive : null;
  } catch {
    return null;
  }
}
function writeMarker(lastActive: number | null) {
  try {
    if (lastActive != null) sessionStorage.setItem(KEY_SESSION, JSON.stringify({ lastActive }));
    else sessionStorage.removeItem(KEY_SESSION);
  } catch {
    /* โหมดส่วนตัว / ถูกบล็อก */
  }
}

interface AuthState {
  needsSetup: boolean;
  current: PublicAdmin | null;
  admins: PublicAdmin[];
}

const asResult = async <T,>(p: Promise<Result<T>>): Promise<Result<T>> => {
  try {
    return await p;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return useMode() === 'demo' ? <LocalAuthProvider>{children}</LocalAuthProvider> : <DbAuthProvider>{children}</DbAuthProvider>;
}

function DbAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<AuthState>({ needsSetup: false, current: null, admins: [] });

  const refresh = useCallback(async () => {
    try {
      const s = await getJSON<AuthState>('/api/auth');
      setState(s);
      if (!s.current) writeMarker(null);
      return s;
    } catch {
      return null; // เชื่อมต่อไม่ได้ — หน้าหลักแจ้งเตือนเรื่องนี้อยู่แล้ว
    } finally {
      setReady(true);
    }
  }, []);

  const logout = useCallback(() => {
    writeMarker(null);
    setState((s) => ({ ...s, current: null, admins: [] }));
    void postJSON('/api/auth', { op: 'logout' }).catch(() => {});
  }, []);

  useEffect(() => {
    // อ่านก่อนโหลดสถานะ (ตัวจับเวลาด้านล่างจะเขียนค่าใหม่ทันทีที่รู้ว่าเป็นแอดมิน)
    const last = readMarker();
    void refresh().then((s) => {
      // แท็บใหม่ (ไม่มี session ของแท็บนี้) หรือไม่ได้ใช้งานนาน → ออกจากระบบ
      if (s?.current && (last == null || Date.now() - last > IDLE_MINUTES * 60_000)) logout();
    });
    // กลับมาที่หน้าต่างนี้ → เช็คสถานะใหม่ (เช่น เซิร์ฟเวอร์เปิดใหม่ / บัญชีถูกปิดจากเครื่องอื่น)
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, logout]);

  // ไม่ได้ใช้งานนาน → ออกจากระบบอัตโนมัติ (กันลืมออกแล้วเจ้าหน้าที่คนอื่นมาใช้ต่อ)
  const currentId = state.current?.id ?? null;
  useEffect(() => {
    if (currentId == null) return;
    let last = Date.now();
    writeMarker(last);
    const touch = () => {
      last = Date.now();
      writeMarker(last);
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
  }, [currentId, logout]);

  const signIn = useCallback(
    async (op: 'login' | 'setup', body: Record<string, string>): Promise<Result> => {
      const r = await asResult(postJSON<Result<PublicAdmin>>('/api/auth', { op, ...body }));
      if (!r.ok) return r;
      writeMarker(Date.now());
      await refresh();
      return { ok: true, value: undefined };
    },
    [refresh],
  );

  const login = useCallback<AuthValue['login']>((username, password) => signIn('login', { username, password }), [signIn]);
  const setupFirstAdmin = useCallback<AuthValue['setupFirstAdmin']>((input) => signIn('setup', input), [signIn]);

  /** งานจัดการบัญชี — สำเร็จแล้วโหลดรายชื่อใหม่ */
  const manage = useCallback(
    async <T,>(body: Record<string, unknown>): Promise<Result<T>> => {
      const r = await asResult(postJSON<Result<T>>('/api/auth', body));
      await refresh();
      return r.ok ? { ok: true, value: r.value as T } : r;
    },
    [refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      needsSetup: state.needsSetup,
      admins: state.admins,
      current: state.current,
      login,
      logout,
      setupFirstAdmin,
      createAdmin: (input) => manage<PublicAdmin>({ op: 'create', ...input }),
      updateAdmin: (id, input) => manage<void>({ op: 'update', id, ...input }),
      setPassword: (id, password) => manage<void>({ op: 'password', id, password }),
      deleteAdmin: (id) => manage<void>({ op: 'delete', id }),
    }),
    [ready, state, login, logout, setupFirstAdmin, manage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
