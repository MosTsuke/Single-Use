import { NextResponse } from 'next/server';
import { dbErrorMessage, getPool } from '@/server/db';

export const dynamic = 'force-dynamic';

/** ตรวจว่าโปรแกรมและฐานข้อมูลพร้อม — ใช้ตอนติดตั้ง/อัปเดต (http://localhost:<port>/api/health) */
export async function GET() {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`SELECT MAX(Version) AS v FROM dbo.SchemaVersion`);
    return NextResponse.json({ ok: true, db: 'พร้อมใช้งาน', schema: r.recordset[0]?.v ?? null });
  } catch (e) {
    console.error('[api/health]', e);
    return NextResponse.json({ ok: false, db: dbErrorMessage(e) }, { status: 503 });
  }
}
