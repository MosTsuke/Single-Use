/* =====================================================================
   Single-Use Sticker — ขั้นที่ 0: สร้างฐานข้อมูล + บัญชีสำหรับโปรแกรม
   ---------------------------------------------------------------------
   ผู้รัน : ฝ่าย IT (ต้องใช้สิทธิ์ sysadmin)  — รันครั้งเดียว
   วิธีรัน : เปิดไฟล์นี้ใน SSMS → แก้รหัสผ่านบรรทัด @AppPassword → Execute (F5)
   ผลลัพธ์ : ฐานข้อมูลใหม่ [SingleUseSticker] แยกจากฐานข้อมูลเดิมทั้งหมด
             และ login [singleuse_app] ที่เข้าได้เฉพาะฐานข้อมูลนี้
   ไม่แตะ   : ฐานข้อมูล / ตาราง / login อื่นที่มีอยู่แล้วบนเซิร์ฟเวอร์
   ===================================================================== */

SET NOCOUNT ON;

/* ---------- 1) ตั้งค่า (แก้ก่อนรัน) ---------- */
DECLARE @AppPassword NVARCHAR(128) = N'CHANGE_ME_Str0ng!Pass';   -- ← เปลี่ยนเป็นรหัสผ่านจริง แล้วส่งให้ผู้ติดตั้งโปรแกรม

IF @AppPassword = N'CHANGE_ME_Str0ng!Pass'
BEGIN
    RAISERROR(N'กรุณาเปลี่ยนรหัสผ่าน @AppPassword ก่อนรันสคริปต์ — ยังไม่มีอะไรถูกสร้าง', 16, 1);
    SET NOEXEC ON;   -- หยุดทุกส่วนที่เหลือของไฟล์
END

/* ---------- 2) สร้างฐานข้อมูล (ถ้ายังไม่มี) ----------
   Thai_CI_AS = เรียงภาษาไทยถูกต้อง และไม่สนตัวพิมพ์เล็ก/ใหญ่ (SN "abc-1" = "ABC-1") */
IF DB_ID(N'SingleUseSticker') IS NULL
BEGIN
    EXEC (N'CREATE DATABASE [SingleUseSticker] COLLATE Thai_CI_AS');
    PRINT N'สร้างฐานข้อมูล SingleUseSticker แล้ว';
END
ELSE
    PRINT N'มีฐานข้อมูล SingleUseSticker อยู่แล้ว — ข้ามขั้นตอนนี้';

/* ---------- 3) สร้าง login สำหรับโปรแกรม (SQL Server authentication) ----------
   ถ้าเซิร์ฟเวอร์ปิด SQL authentication ไว้ ต้องเปิด Mixed Mode หรือใช้ Windows account แทน */
IF SUSER_ID(N'singleuse_app') IS NULL
BEGIN
    DECLARE @sql NVARCHAR(MAX) =
        N'CREATE LOGIN [singleuse_app] WITH PASSWORD = ' + QUOTENAME(@AppPassword, '''') +
        N', DEFAULT_DATABASE = [SingleUseSticker], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF';
    EXEC (@sql);
    PRINT N'สร้าง login singleuse_app แล้ว';
END
ELSE
    PRINT N'มี login singleuse_app อยู่แล้ว — ข้ามขั้นตอนนี้';
GO

/* ---------- 4) ให้สิทธิ์เฉพาะฐานข้อมูลนี้ ----------
   - อ่าน/เขียนข้อมูล และรัน stored procedure ได้
   - แก้โครงสร้างตาราง (db_ddladmin) ได้เฉพาะในฐานข้อมูลนี้ เพื่อให้รันสคริปต์อัปเดตเวอร์ชันได้
   - สำรองฐานข้อมูลนี้ (db_backupoperator) — โปรแกรมสำรองให้เองวันละครั้ง
     ลงโฟลเดอร์ backup มาตรฐานของ SQL Server (เก็บ 7 ไฟล์ วนตามวันในสัปดาห์)
   - ไม่มีสิทธิ์ใด ๆ กับฐานข้อมูลอื่น */
USE [SingleUseSticker];
GO
IF DATABASE_PRINCIPAL_ID(N'singleuse_app') IS NULL
    CREATE USER [singleuse_app] FOR LOGIN [singleuse_app];
GO
ALTER ROLE db_datareader ADD MEMBER [singleuse_app];
ALTER ROLE db_datawriter ADD MEMBER [singleuse_app];
ALTER ROLE db_ddladmin  ADD MEMBER [singleuse_app];
ALTER ROLE db_backupoperator ADD MEMBER [singleuse_app];
GRANT EXECUTE TO [singleuse_app];
GO
PRINT N'เสร็จขั้นที่ 0 — ตารางจะถูกสร้างให้เองเมื่อเปิดโปรแกรมครั้งแรก (หรือรัน 01_, 02_, 03_ ใน SSMS ตามลำดับ)';
GO
SET NOEXEC OFF;
GO
