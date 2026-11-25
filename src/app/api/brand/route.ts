import { NextResponse, type NextRequest } from 'next/server';
import { currentAdmin } from '@/server/auth';
import { dbErrorMessage } from '@/server/db';
import { loadBrand, saveBrand, UserError } from '@/server/repo';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** โลโก้/ชื่อที่แอดมินตั้งไว้ (ไม่มี = ใช้ค่าเริ่มต้นในโปรแกรม) */
export async function GET() {
  try {
    return json({ custom: await loadBrand() });
  } catch (e) {
    console.error('[api/brand]', e);
    return json({ error: dbErrorMessage(e) }, 503);
  }
}

/** { patch: { hospitalName: '...', hospitalLogo: null, ... } } — null = กลับไปใช้ค่าเริ่มต้น */
export async function POST(req: NextRequest) {
  try {
    const me = await currentAdmin(req);
    if (!me) return json({ ok: false, error: 'ต้องเข้าสู่ระบบแอดมินก่อน (หรือหมดเวลาเข้าสู่ระบบแล้ว)' }, 403);
    const b = await req.json().catch(() => null);
    if (!b || typeof b.patch !== 'object') return json({ ok: false, error: 'คำขอไม่ถูกต้อง' }, 400);
    return json({ ok: true, custom: await saveBrand({ id: me.id, name: me.displayName }, b.patch) });
  } catch (e) {
    if (e instanceof UserError) return json({ ok: false, error: e.message });
    console.error('[api/brand]', e);
    return json({ ok: false, error: dbErrorMessage(e) }, 503);
  }
}
