/* =====================================================================
   Single-Use Sticker — Schema เวอร์ชัน 3: ตั้งบัญชีแอดมินเองตอนติดตั้ง
   ---------------------------------------------------------------------
   รันหลัง 02_departments.sql · รันซ้ำได้ (ถ้าติดตั้งแล้วจะไม่ทำอะไร)
   โปรแกรมรันไฟล์นี้ให้เองตอนเปิดครั้งแรก (หรือรันใน SSMS ก็ได้)

   ลบบัญชีเริ่มต้น admin / admin1234 ที่ 01_schema_v1.sql สร้างไว้
   เฉพาะเมื่อยังไม่เคยมีใครเข้าสู่ระบบด้วยบัญชีนั้นและรหัสยังเป็นค่าเริ่มต้น
   → เมื่อไม่มีบัญชีแอดมินเลย โปรแกรมจะให้สร้างบัญชีแรกเองตอนเปิดใช้งานครั้งแรก
     (ไม่มีรหัสผ่านเริ่มต้นที่ใครก็รู้ค้างอยู่ในระบบจริง)
   ===================================================================== */

USE [SingleUseSticker];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersion WHERE Version = 2)
BEGIN
    RAISERROR(N'ต้องรัน 02_departments.sql ก่อน', 16, 1);
    SET NOEXEC ON;
END
ELSE IF EXISTS (SELECT 1 FROM dbo.SchemaVersion WHERE Version = 3)
BEGIN
    PRINT N'Schema เวอร์ชัน 3 ถูกติดตั้งไปแล้ว — ไม่ทำอะไรซ้ำ';
    SET NOEXEC ON;
END
GO

BEGIN TRANSACTION;

DELETE FROM dbo.AdminAccounts
WHERE Username = 'admin'
  AND PasswordHash = '12ca1eba2d364f19cd8ad78e990d0cdea389898e95a8b9f4a5de91543a818099'
  AND LastLoginAt IS NULL;

INSERT INTO dbo.SchemaVersion (Version, Description)
VALUES (3, N'ไม่มีบัญชีแอดมินเริ่มต้น — สร้างบัญชีแรกในโปรแกรมตอนติดตั้ง');

COMMIT TRANSACTION;
GO
PRINT N'ติดตั้ง Schema เวอร์ชัน 3 เรียบร้อย';
GO
SET NOEXEC OFF;
GO
