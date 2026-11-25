/**
 * ทำงานครั้งเดียวตอนเปิดเซิร์ฟเวอร์: เชื่อมต่อฐานข้อมูล (สร้าง/อัปเดตตารางถ้ายังไม่ได้ทำ)
 * แล้วเริ่มสำรองฐานข้อมูลอัตโนมัติ — ถ้าฐานข้อมูลยังไม่พร้อม หน้าเว็บจะแจ้งเอง และจะลองใหม่เมื่อมีคนเปิด
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getPool, dbErrorMessage } = await import('./server/db');
  const { startAutoBackup } = await import('./server/backup');
  getPool()
    .then(() => console.log('[db] เชื่อมต่อฐานข้อมูล SingleUseSticker แล้ว — พร้อมใช้งาน'))
    .catch((e) => console.error(`[db] ยังเชื่อมต่อฐานข้อมูลไม่ได้: ${dbErrorMessage(e)}\n`, e));
  startAutoBackup();
}
