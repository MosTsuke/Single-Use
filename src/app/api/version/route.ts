import { NextResponse } from 'next/server';
import { currentVersion } from '@/server/version';

export const dynamic = 'force-dynamic';

/** เลขรุ่นของข้อมูล — หน้าเว็บถามทุกไม่กี่วินาที (ไม่แตะฐานข้อมูล) */
export async function GET() {
  return NextResponse.json({ version: currentVersion() }, { headers: { 'Cache-Control': 'no-store' } });
}
