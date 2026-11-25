import type { ActionResponse } from './api-types';

/** เรียกเซิร์ฟเวอร์บนเครื่องแม่ — ข้อผิดพลาดเป็นข้อความภาษาไทยที่แสดงให้ผู้ใช้ได้เลย */

export const OFFLINE_MESSAGE = 'เชื่อมต่อเครื่องแม่ไม่ได้ — ตรวจสอบว่าเครื่องแม่เปิดอยู่และสายแลนเชื่อมต่อ แล้วลองใหม่';

export async function getJSON<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `เซิร์ฟเวอร์ตอบกลับผิดปกติ (${res.status})`);
  return body as T;
}

/** โหลดข้อมูลทั้งหมด — ขอแบบบีบอัดถ้าเบราว์เซอร์แตกไฟล์ gzip ได้ (Chrome/Edge รุ่นที่ใช้กันอยู่ได้ทั้งหมด) */
export async function getAppData<T>(): Promise<T> {
  const canGunzip = typeof DecompressionStream !== 'undefined';
  let res: Response;
  try {
    res = await fetch(canGunzip ? '/api/data?gz=1' : '/api/data', { cache: 'no-store' });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
  if (res.ok && res.headers.get('x-body-encoding') === 'gzip' && res.body) {
    const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text) as T;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `เซิร์ฟเวอร์ตอบกลับผิดปกติ (${res.status})`);
  return body as T;
}

export async function postJSON<T>(url: string, payload: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
  const body = await res.json().catch(() => null);
  if (!body) throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดปกติ (${res.status})`);
  return body as T;
}

/** POST /api/action — ไม่ throw: เชื่อมต่อไม่ได้ก็คืนเป็น { ok: false } พร้อม version = -1 */
export async function callAction<T>(name: string, args: unknown): Promise<ActionResponse<T>> {
  try {
    return await postJSON<ActionResponse<T>>('/api/action', { name, args });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), version: -1 };
  }
}
