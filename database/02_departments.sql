/* =====================================================================
   Single-Use Sticker — Schema เวอร์ชัน 2: หน่วยงานที่นำอุปกรณ์ไปใช้
   ---------------------------------------------------------------------
   รันหลัง 01_schema_v1.sql · รันซ้ำได้ (ถ้าติดตั้งแล้วจะไม่ทำอะไร)
   เพิ่ม:  ตาราง Departments
           คอลัมน์ใน PrintLogs: DepartmentId, DepartmentName, ShowDept
   ไม่กระทบข้อมูลเดิม (คอลัมน์ใหม่อนุญาตค่าว่าง / มีค่าเริ่มต้น)
   ===================================================================== */

USE [SingleUseSticker];
GO
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersion WHERE Version = 1)
BEGIN
    RAISERROR(N'ต้องรัน 01_schema_v1.sql ก่อน', 16, 1);
    SET NOEXEC ON;
END
ELSE IF EXISTS (SELECT 1 FROM dbo.SchemaVersion WHERE Version = 2)
BEGIN
    PRINT N'Schema เวอร์ชัน 2 ถูกติดตั้งไปแล้ว — ไม่ทำอะไรซ้ำ';
    SET NOEXEC ON;
END
GO

BEGIN TRANSACTION;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว', 16, 1); SET NOEXEC ON; END
GO

/* ---------- Departments — หน่วยงาน (เช่น ห้องผ่าตัด, ER) ---------- */
CREATE TABLE dbo.Departments (
    DepartmentId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Departments PRIMARY KEY,
    Name          NVARCHAR(100)  NOT NULL,               -- ชื่อที่พิมพ์บนสติ๊กเกอร์ ("ใช้ที่ ...")
    Code          NVARCHAR(20)   NULL,                   -- รหัส / ชื่อย่อ (ไม่บังคับ)
    IsActive      BIT            NOT NULL CONSTRAINT DF_Departments_IsActive DEFAULT (1),
    CreatedAt     DATETIME2(0)   NOT NULL CONSTRAINT DF_Departments_CreatedAt DEFAULT (SYSDATETIME()),
    UpdatedAt     DATETIME2(0)   NOT NULL CONSTRAINT DF_Departments_UpdatedAt DEFAULT (SYSDATETIME()),
    CONSTRAINT CK_Departments_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0)
);
CREATE UNIQUE INDEX UX_Departments_Name ON dbo.Departments (Name);
CREATE UNIQUE INDEX UX_Departments_Code ON dbo.Departments (Code) WHERE Code IS NOT NULL;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว', 16, 1); SET NOEXEC ON; END
GO

/* ---------- PrintLogs: หน่วยงานที่นำไปใช้ (ไม่บังคับ) ---------- */
ALTER TABLE dbo.PrintLogs ADD
    DepartmentId    INT            NULL CONSTRAINT FK_PrintLogs_Department REFERENCES dbo.Departments (DepartmentId),
    DepartmentName  NVARCHAR(100)  NULL,                                   -- ชื่อหน่วยงาน ณ ตอนพิมพ์
    ShowDept        BIT            NOT NULL CONSTRAINT DF_PrintLogs_ShowDept DEFAULT (1);  -- พิมพ์บรรทัด "ใช้ที่" หรือไม่
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว', 16, 1); SET NOEXEC ON; END
GO

CREATE INDEX IX_PrintLogs_DepartmentId ON dbo.PrintLogs (DepartmentId, PrintedAt) WHERE DepartmentId IS NOT NULL;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว', 16, 1); SET NOEXEC ON; END
GO

/* view vw_ActivePrintLogs ใช้ SELECT * → refresh ให้เห็นคอลัมน์ใหม่ */
EXEC sp_refreshview N'dbo.vw_ActivePrintLogs';
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว', 16, 1); SET NOEXEC ON; END
GO

INSERT INTO dbo.SchemaVersion (Version, Description)
VALUES (2, N'หน่วยงานที่นำไปใช้: ตาราง Departments + PrintLogs.DepartmentId/DepartmentName/ShowDept');
GO

COMMIT TRANSACTION;
GO
PRINT N'ติดตั้ง Schema เวอร์ชัน 2 เรียบร้อย';
GO
SET NOEXEC OFF;
GO
