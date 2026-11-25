import { createContext } from 'react';

/** ส่วนกลางของระบบแอดมินที่ใช้ร่วมกันทั้ง 2 โหมด (auth.tsx = โหมด db, auth-local.tsx = โหมด demo) */

export interface PublicAdmin {
  id: number;
  /** ชื่อผู้ใช้สำหรับเข้าสู่ระบบ (ตัวเล็ก ไม่ซ้ำ) */
  username: string;
  /** ชื่อที่แสดง */
  displayName: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

/** ไม่ได้ใช้งานนานเท่านี้ → ออกจากระบบอัตโนมัติ */
export const IDLE_MINUTES = 15;
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD = 6;

export interface AuthValue {
  ready: boolean;
  /** ยังไม่มีบัญชีแอดมินเลย → ต้องสร้างบัญชีแรก (ตอนติดตั้ง — โหมด db เท่านั้น) */
  needsSetup: boolean;
  admins: PublicAdmin[];
  /** แอดมินที่เข้าสู่ระบบอยู่ (null = เจ้าหน้าที่ทั่วไป) */
  current: PublicAdmin | null;
  login: (username: string, password: string) => Promise<Result>;
  logout: () => void;
  /** สร้างบัญชีแอดมินแรก (ได้เฉพาะตอนยังไม่มีบัญชีเลย) แล้วเข้าสู่ระบบทันที */
  setupFirstAdmin: (input: { username: string; displayName: string; password: string }) => Promise<Result>;
  /** สร้างบัญชีเพิ่ม — ต้องเป็นแอดมินที่เข้าสู่ระบบอยู่ (ไม่มีการสมัครเอง) */
  createAdmin: (input: { username: string; displayName: string; password: string }) => Promise<Result<PublicAdmin>>;
  updateAdmin: (id: number, input: { displayName: string; active: boolean }) => Promise<Result>;
  setPassword: (id: number, password: string) => Promise<Result>;
  deleteAdmin: (id: number) => Promise<Result>;
}

export const AuthContext = createContext<AuthValue | null>(null);
