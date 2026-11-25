import { gzipSync } from 'node:zlib';
import { NextResponse, type NextRequest } from 'next/server';
import { dbErrorMessage } from '@/server/db';
import { loadAll } from '@/server/repo';
import { currentVersion } from '@/server/version';

export const dynamic = 'force-dynamic';

/**
 * ข้อมูลทั้งหมดที่หน้าเว็บใช้ + เลขรุ่น (อ่านเลขรุ่นก่อน → ถ้ามีการบันทึกระหว่างโหลด รอบหน้าจะโหลดใหม่อีกครั้ง)
 *
 * ?gz=1 → ส่งแบบบีบอัด gzip (เล็กลงราว 15 เท่า) ให้หน้าเว็บแตกเองด้วย DecompressionStream
 * (Next.js ไม่ส่งหัว Content-Encoding ของ route handler จึงใช้หัว x-body-encoding แทน)
 * ประวัติการพิมพ์โตขึ้นทุกวัน และทุกเครื่องโหลดใหม่เมื่อมีการบันทึก จึงต้องเล็กไว้
 */
export async function GET(req: NextRequest) {
  const version = currentVersion();
  try {
    const body = JSON.stringify({ data: await loadAll(), version });
    if (req.nextUrl.searchParams.get('gz') === '1') {
      return new Response(new Uint8Array(gzipSync(body)), {
        headers: { 'Content-Type': 'application/octet-stream', 'x-body-encoding': 'gzip', 'Cache-Control': 'no-store' },
      });
    }
    return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[api/data]', e);
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 503 });
  }
}
