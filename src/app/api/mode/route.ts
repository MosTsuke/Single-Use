import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * โหมดของโปรแกรม (ตัดสินจากค่า DB_SERVER ตอนรัน)
 * - db   = ต่อ SQL Server (เครื่องแม่ที่หน้างาน) — ข้อมูลจริง เริ่มจากฐานว่าง
 * - demo = ไม่ได้ต่อฐานข้อมูล (Vercel / เครื่องทดสอบ) — เก็บข้อมูลในเบราว์เซอร์ มีข้อมูลตัวอย่างให้ลอง
 */
export async function GET() {
  return NextResponse.json({ mode: process.env.DB_SERVER ? 'db' : 'demo' }, { headers: { 'Cache-Control': 'no-store' } });
}
