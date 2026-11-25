import { NextResponse, type NextRequest } from 'next/server';
import * as auth from '@/server/auth';
import { dbErrorMessage } from '@/server/db';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** สถานะ: ต้องสร้างบัญชีแอดมินแรกไหม / ใครเข้าสู่ระบบอยู่ (+ รายชื่อแอดมิน เมื่อเป็นแอดมิน) */
export async function GET(req: NextRequest) {
  try {
    const [needsSetup, current] = await Promise.all([auth.needsSetup(), auth.currentAdmin(req)]);
    return json({ needsSetup, current, admins: current ? await auth.listAdmins() : [] });
  } catch (e) {
    console.error('[api/auth]', e);
    return json({ error: dbErrorMessage(e) }, 503);
  }
}

export async function POST(req: NextRequest) {
  let b: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: 'คำขอไม่ถูกต้อง' }, 400);
  }
  try {
    switch (b.op) {
      case 'login': {
        const r = await auth.verifyLogin(String(b.username ?? ''), String(b.password ?? ''));
        if (!r.ok) return json(r);
        const res = json({ ok: true, value: r.admin });
        auth.setSessionCookie(res, r.admin.id);
        return res;
      }
      case 'logout': {
        const res = json({ ok: true });
        auth.clearSessionCookie(res);
        return res;
      }
      // สร้างบัญชีแอดมินแรก — ทำได้เฉพาะตอนยังไม่มีบัญชีเลย (ตอนติดตั้ง)
      case 'setup': {
        const r = await auth.insertAdmin(
          { username: String(b.username ?? ''), displayName: String(b.displayName ?? ''), password: String(b.password ?? '') },
          { onlyIfNone: true },
        );
        if (!r.ok) return json(r);
        const res = json({ ok: true, value: r.admin });
        auth.setSessionCookie(res, r.admin.id);
        return res;
      }
    }
    // ที่เหลือต้องเป็นแอดมิน
    const me = await auth.currentAdmin(req);
    if (!me) return json({ ok: false, error: 'ต้องเข้าสู่ระบบแอดมินก่อน (หรือหมดเวลาเข้าสู่ระบบแล้ว)' }, 403);
    const id = Number(b.id);
    switch (b.op) {
      case 'create':
        return json(
          await auth.insertAdmin({ username: String(b.username ?? ''), displayName: String(b.displayName ?? ''), password: String(b.password ?? '') }).then((r) =>
            r.ok ? { ok: true, value: r.admin } : r,
          ),
        );
      case 'update':
        return json(await auth.updateAdmin(me, id, { displayName: String(b.displayName ?? ''), active: !!b.active }));
      case 'password':
        return json(await auth.setAdminPassword(id, String(b.password ?? '')));
      case 'delete':
        return json(await auth.deleteAdmin(me, id));
      default:
        return json({ ok: false, error: 'ไม่รู้จักคำสั่งนี้' }, 404);
    }
  } catch (e) {
    console.error('[api/auth]', e);
    return json({ ok: false, error: dbErrorMessage(e) }, 503);
  }
}
