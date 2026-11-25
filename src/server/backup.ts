import { DB_NAME, getPool, sql } from './db';

/**
 * สำรองฐานข้อมูลอัตโนมัติวันละครั้ง (ฐาน SingleUseSticker เท่านั้น)
 *
 * - ไฟล์ไปอยู่ในโฟลเดอร์ backup มาตรฐานของ SQL Server (ดูได้จาก SSMS: Server Properties → Database Settings)
 *   ชื่อ SingleUseSticker_Mon.bak ... SingleUseSticker_Sun.bak → เก็บย้อนหลัง 7 วัน เขียนทับตัวเก่าของวันเดียวกัน
 * - COPY_ONLY: ไม่กระทบแผนสำรองข้อมูลที่ฝ่าย IT ตั้งไว้เอง (ถ้ามี)
 * - ต้องให้สิทธิ์ db_backupoperator กับ singleuse_app (00_create_database.sql ให้ไว้แล้ว)
 *   ถ้าไม่มีสิทธิ์ จะบันทึกข้อความเตือนใน log วันละครั้ง โปรแกรมทำงานต่อได้ตามปกติ
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHECK_EVERY_MS = 60 * 60_000;

const g = globalThis as unknown as { __suBackupTimer?: NodeJS.Timeout; __suBackupWarned?: string };

async function backupIfDue() {
  const pool = await getPool();
  const s = await pool
    .request()
    .query<{ today: string; dow: number; last: string | null }>(
      `SELECT CONVERT(char(10), SYSDATETIME(), 23) AS today, (DATEPART(weekday, SYSDATETIME()) + @@DATEFIRST - 1) % 7 AS dow,
              (SELECT SettingValue FROM dbo.Settings WHERE SettingKey = 'backup.lastDate') AS last`,
    );
  const { today, dow, last } = s.recordset[0];
  if (last === today) return;
  const file = `${DB_NAME}_${DAYS[dow]}.bak`;
  try {
    await pool
      .request()
      .input('f', sql.NVarChar(200), file)
      .query(`BACKUP DATABASE [${DB_NAME}] TO DISK = @f WITH COPY_ONLY, INIT, CHECKSUM, NAME = N'Single-Use Sticker (auto)'`);
  } catch (e) {
    if (g.__suBackupWarned !== today) {
      g.__suBackupWarned = today;
      console.warn(`[backup] สำรองฐานข้อมูลอัตโนมัติไม่สำเร็จ: ${(e as Error).message}`);
    }
    return;
  }
  await pool
    .request()
    .input('d', sql.NVarChar(20), today)
    .query(
      `UPDATE dbo.Settings SET SettingValue = @d, UpdatedAt = SYSDATETIME() WHERE SettingKey = 'backup.lastDate';
       IF @@ROWCOUNT = 0 INSERT INTO dbo.Settings (SettingKey, SettingValue) VALUES ('backup.lastDate', @d);`,
    );
  console.log(`[backup] สำรองฐานข้อมูลแล้ว: ${file} (โฟลเดอร์ backup ของ SQL Server)`);
}

export function startAutoBackup() {
  if (g.__suBackupTimer || process.env.DB_AUTO_BACKUP === 'false') return;
  const run = () => backupIfDue().catch((e) => console.warn(`[backup] ${(e as Error).message}`));
  // รอให้โปรแกรมเปิดเสร็จก่อนสักครู่ แล้วเช็คทุกชั่วโมง
  setTimeout(run, 60_000).unref();
  g.__suBackupTimer = setInterval(run, CHECK_EVERY_MS);
  g.__suBackupTimer.unref();
}
