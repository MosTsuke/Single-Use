/* =====================================================================
   Single-Use Sticker — ขั้นที่ 1: โครงสร้างตาราง (Schema เวอร์ชัน 1)
   ---------------------------------------------------------------------
   ผู้รัน : ฝ่าย IT หรือ login singleuse_app (หลังรัน 00_create_database.sql)
   วิธีรัน : เปิดไฟล์นี้ใน SSMS → Execute (F5)
   รันซ้ำได้ : ถ้ารันเวอร์ชันนี้ไปแล้ว สคริปต์จะไม่ทำอะไรซ้ำ
   SQL Server: 2016 ขึ้นไป
   ---------------------------------------------------------------------
   หลักการ
   - เวลาทั้งหมดเก็บเป็น "เวลาเครื่องเซิร์ฟเวอร์ (เวลาไทย)" ชนิด DATETIME2(0)
   - ไม่ลบข้อมูลจริง: รายการอุปกรณ์/เจ้าหน้าที่ใช้ปิดใช้งาน, การพิมพ์ใช้ "ยกเลิก" (Voided*)
   - เก็บชื่อ ณ ตอนพิมพ์ไว้ในประวัติ (ItemName, StaffName) ประวัติไม่เปลี่ยนแม้แก้ชื่อภายหลัง
   - การแก้ไขโครงสร้างในอนาคต: เพิ่มไฟล์ 02_..., 03_... (ดู README.md) ห้ามแก้ไฟล์ที่รันไปแล้ว
   ===================================================================== */

USE [SingleUseSticker];
GO
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;   -- จำเป็นสำหรับ filtered index
SET XACT_ABORT ON;   -- ถ้ามีคำสั่งไหนผิด ยกเลิกทั้งหมด (ไม่เหลือตารางครึ่ง ๆ กลาง ๆ)
GO

/* ---------- ตารางเก็บเวอร์ชันของโครงสร้าง ---------- */
IF OBJECT_ID(N'dbo.SchemaVersion', N'U') IS NULL
    CREATE TABLE dbo.SchemaVersion (
        Version      INT            NOT NULL CONSTRAINT PK_SchemaVersion PRIMARY KEY,
        Description  NVARCHAR(200)  NOT NULL,
        AppliedAt    DATETIME2(0)   NOT NULL CONSTRAINT DF_SchemaVersion_AppliedAt DEFAULT (SYSDATETIME()),
        AppliedBy    NVARCHAR(128)  NOT NULL CONSTRAINT DF_SchemaVersion_AppliedBy DEFAULT (SUSER_SNAME())
    );
GO

IF EXISTS (SELECT 1 FROM dbo.SchemaVersion WHERE Version = 1)
BEGIN
    PRINT N'Schema เวอร์ชัน 1 ถูกติดตั้งไปแล้ว — ไม่ทำอะไรซ้ำ';
    SET NOEXEC ON;
END
GO

BEGIN TRANSACTION;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   1) Items — รายการอุปกรณ์ (เช่น สาย Suction, ชุดทำแผล)
   ===================================================================== */
CREATE TABLE dbo.Items (
    ItemId           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Items PRIMARY KEY,
    Name             NVARCHAR(200)  NOT NULL,
    ShelfDays        INT            NOT NULL,            -- อายุหลัง sterilize (วัน) ใช้คำนวณวันหมดอายุ
    MaxRound         INT            NOT NULL,            -- จำนวนรอบสูงสุดต่อชิ้น
    SnPrefix         VARCHAR(8)     NOT NULL,            -- คำนำหน้า SN ที่ระบบสร้าง เช่น SUC → SUC-000001
    DefaultCodeType  VARCHAR(10)    NOT NULL CONSTRAINT DF_Items_DefaultCodeType DEFAULT ('barcode'),
    IsActive         BIT            NOT NULL CONSTRAINT DF_Items_IsActive DEFAULT (1),   -- ปิด = ซ่อนจากการใช้งาน แต่ประวัติยังอยู่
    CreatedAt        DATETIME2(0)   NOT NULL CONSTRAINT DF_Items_CreatedAt DEFAULT (SYSDATETIME()),
    UpdatedAt        DATETIME2(0)   NOT NULL CONSTRAINT DF_Items_UpdatedAt DEFAULT (SYSDATETIME()),
    CONSTRAINT CK_Items_Name       CHECK (LEN(LTRIM(RTRIM(Name))) > 0),
    CONSTRAINT CK_Items_ShelfDays  CHECK (ShelfDays BETWEEN 0 AND 3650),
    CONSTRAINT CK_Items_MaxRound   CHECK (MaxRound BETWEEN 1 AND 999),
    CONSTRAINT CK_Items_SnPrefix   CHECK (SnPrefix NOT LIKE '%[^A-Z0-9]%' AND LEN(SnPrefix) > 0),
    CONSTRAINT CK_Items_CodeType   CHECK (DefaultCodeType IN ('barcode', 'qr', 'none'))
);
-- คำนำหน้า SN ห้ามซ้ำกันระหว่างรายการที่ยังใช้งาน
CREATE UNIQUE INDEX UX_Items_SnPrefix_Active ON dbo.Items (SnPrefix) WHERE IsActive = 1;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   2) Staff — รายชื่อเจ้าหน้าที่ (ผู้พิมพ์ / ผู้ยกเลิก)
   ===================================================================== */
CREATE TABLE dbo.Staff (
    StaffId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Staff PRIMARY KEY,
    Name        NVARCHAR(100)  NOT NULL,                 -- ชื่อที่พิมพ์บนสติ๊กเกอร์
    Code        NVARCHAR(20)   NULL,                     -- รหัสพนักงาน (ไม่บังคับ)
    IsActive    BIT            NOT NULL CONSTRAINT DF_Staff_IsActive DEFAULT (1),
    CreatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_Staff_CreatedAt DEFAULT (SYSDATETIME()),
    UpdatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_Staff_UpdatedAt DEFAULT (SYSDATETIME()),
    CONSTRAINT CK_Staff_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0)
);
CREATE UNIQUE INDEX UX_Staff_Name ON dbo.Staff (Name);
CREATE UNIQUE INDEX UX_Staff_Code ON dbo.Staff (Code) WHERE Code IS NOT NULL;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   3) Units — อุปกรณ์รายชิ้น (1 แถว = 1 SN)
   ===================================================================== */
CREATE TABLE dbo.Units (
    UnitId             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Units PRIMARY KEY,
    Sn                 VARCHAR(40)    NOT NULL,          -- ค่าบนบาร์โคด/QR ไม่ซ้ำทั้งระบบ
    ItemId             INT            NOT NULL CONSTRAINT FK_Units_Items REFERENCES dbo.Items (ItemId),
    MaxRound           INT            NOT NULL,          -- รอบสูงสุด ณ วันลงทะเบียน (แก้รายการภายหลังไม่กระทบชิ้นเดิม)
    ManufacturerSn     BIT            NOT NULL CONSTRAINT DF_Units_ManufacturerSn DEFAULT (0),  -- 1 = SN จากผู้ผลิต
    ReplacesUnitId     INT            NULL CONSTRAINT FK_Units_Replaces REFERENCES dbo.Units (UnitId),  -- มาทดแทนชิ้นไหน
    RegisteredAt       DATETIME2(0)   NOT NULL CONSTRAINT DF_Units_RegisteredAt DEFAULT (SYSDATETIME()),
    RegisteredByStaffId INT           NULL CONSTRAINT FK_Units_RegisteredBy REFERENCES dbo.Staff (StaffId),
    DisposedAt         DATETIME2(0)   NULL,
    DisposeReason      VARCHAR(20)    NULL,
    DisposeNote        NVARCHAR(300)  NULL,
    DisposedByStaffId  INT            NULL CONSTRAINT FK_Units_DisposedBy REFERENCES dbo.Staff (StaffId),
    CONSTRAINT UQ_Units_Sn             UNIQUE (Sn),
    CONSTRAINT CK_Units_Sn             CHECK (LEN(Sn) > 0 AND Sn NOT LIKE '% %'),
    CONSTRAINT CK_Units_MaxRound       CHECK (MaxRound BETWEEN 1 AND 999),
    CONSTRAINT CK_Units_DisposeReason  CHECK (DisposeReason IS NULL OR DisposeReason IN ('max_round', 'damaged', 'worn', 'lost', 'other')),
    -- ทำลายแล้วต้องมีสาเหตุ / ยังไม่ทำลายต้องไม่มีสาเหตุ
    CONSTRAINT CK_Units_DisposeConsistent CHECK ((DisposedAt IS NULL AND DisposeReason IS NULL) OR (DisposedAt IS NOT NULL AND DisposeReason IS NOT NULL)),
    -- ทำลายก่อนครบรอบ (ไม่ใช่ max_round) ต้องมีรายละเอียด
    CONSTRAINT CK_Units_DisposeNote    CHECK (DisposeReason IS NULL OR DisposeReason = 'max_round' OR LEN(LTRIM(RTRIM(ISNULL(DisposeNote, N'')))) > 0)
);
CREATE INDEX IX_Units_ItemId ON dbo.Units (ItemId) INCLUDE (DisposedAt);
CREATE INDEX IX_Units_DisposedAt ON dbo.Units (DisposedAt) WHERE DisposedAt IS NOT NULL;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   4) PrintLogs — ประวัติการพิมพ์สติ๊กเกอร์ (1 แถว = 1 ดวง)
      - พิมพ์ปกติ 1 ดวง = sterilize 1 รอบ
      - พิมพ์ซ้ำ (สติ๊กเกอร์ชำรุด) ใช้รอบ/วันที่เดิม ไม่นับรอบ
      - ยกเลิกใบที่พิมพ์ผิด: ใส่ Voided* (แถวยังอยู่) → ไม่นับรอบ
   ===================================================================== */
CREATE TABLE dbo.PrintLogs (
    PrintLogId      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PrintLogs PRIMARY KEY,
    UnitId          INT            NOT NULL CONSTRAINT FK_PrintLogs_Units REFERENCES dbo.Units (UnitId),
    ItemId          INT            NOT NULL CONSTRAINT FK_PrintLogs_Items REFERENCES dbo.Items (ItemId),
    Sn              VARCHAR(40)    NOT NULL,             -- SN ณ ตอนพิมพ์
    ItemName        NVARCHAR(200)  NOT NULL,             -- ชื่ออุปกรณ์ ณ ตอนพิมพ์
    Round           INT            NOT NULL,             -- รอบที่พิมพ์ เช่น 3 ใน 3/5
    MaxRound        INT            NOT NULL,
    MfgDate         DATE           NOT NULL,             -- วันผลิต (วัน sterilize)
    ExpDate         DATE           NOT NULL,             -- วันหมดอายุ
    CodeType        VARCHAR(10)    NOT NULL CONSTRAINT DF_PrintLogs_CodeType DEFAULT ('barcode'),  -- barcode / qr / none
    ShowMfg         BIT            NOT NULL CONSTRAINT DF_PrintLogs_ShowMfg DEFAULT (1),  -- พิมพ์บรรทัดวันผลิตหรือไม่
    ShowExp         BIT            NOT NULL CONSTRAINT DF_PrintLogs_ShowExp DEFAULT (1),  -- พิมพ์บรรทัดหมดอายุหรือไม่
    IsReprint       BIT            NOT NULL CONSTRAINT DF_PrintLogs_IsReprint DEFAULT (0),
    SourcePrintLogId BIGINT        NULL CONSTRAINT FK_PrintLogs_Source REFERENCES dbo.PrintLogs (PrintLogId),  -- ใบต้นฉบับของการพิมพ์ซ้ำ
    SkippedFrom     INT            NULL,                 -- พิมพ์ข้ามรอบ: รอบที่ควรเป็นตามลำดับ
    Note            NVARCHAR(200)  NULL,                 -- หมายเหตุ (บังคับเมื่อข้ามรอบ)
    StaffId         INT            NULL CONSTRAINT FK_PrintLogs_Staff REFERENCES dbo.Staff (StaffId),
    StaffName       NVARCHAR(100)  NULL,                 -- ชื่อผู้พิมพ์ ณ ตอนพิมพ์ (ที่พิมพ์บนสติ๊กเกอร์)
    PrintedAt       DATETIME2(0)   NOT NULL CONSTRAINT DF_PrintLogs_PrintedAt DEFAULT (SYSDATETIME()),
    StationName     NVARCHAR(50)   NULL,                 -- จุด/เครื่องที่พิมพ์ (เผื่อหลายจุด)
    VoidedAt        DATETIME2(0)   NULL,                 -- ยกเลิกใบที่พิมพ์ผิด
    VoidReason      NVARCHAR(200)  NULL,
    VoidByStaffId   INT            NULL CONSTRAINT FK_PrintLogs_VoidBy REFERENCES dbo.Staff (StaffId),
    VoidByName      NVARCHAR(100)  NULL,
    CONSTRAINT CK_PrintLogs_Round      CHECK (Round BETWEEN 1 AND MaxRound),
    CONSTRAINT CK_PrintLogs_Dates      CHECK (ExpDate >= MfgDate),
    CONSTRAINT CK_PrintLogs_CodeType   CHECK (CodeType IN ('barcode', 'qr', 'none')),
    -- พิมพ์ซ้ำต้องอ้างใบต้นฉบับ / พิมพ์ปกติต้องไม่อ้าง
    CONSTRAINT CK_PrintLogs_Reprint    CHECK ((IsReprint = 1 AND SourcePrintLogId IS NOT NULL) OR (IsReprint = 0 AND SourcePrintLogId IS NULL)),
    -- ข้ามรอบต้องมีหมายเหตุ และรอบที่ข้ามต้องน้อยกว่ารอบที่พิมพ์
    CONSTRAINT CK_PrintLogs_Skip       CHECK (SkippedFrom IS NULL OR (SkippedFrom < Round AND LEN(LTRIM(RTRIM(ISNULL(Note, N'')))) > 0)),
    -- ยกเลิกแล้วต้องมีเหตุผล
    CONSTRAINT CK_PrintLogs_Void       CHECK ((VoidedAt IS NULL AND VoidReason IS NULL) OR (VoidedAt IS NOT NULL AND LEN(LTRIM(RTRIM(ISNULL(VoidReason, N'')))) > 0))
);
-- กันพิมพ์รอบเดียวกันซ้ำ (เช่น 2 เครื่องยิง SN เดียวกันพร้อมกัน): 1 ชิ้น 1 รอบ มีใบปกติที่ยังมีผลได้ใบเดียว
CREATE UNIQUE INDEX UX_PrintLogs_UnitRound_Active ON dbo.PrintLogs (UnitId, Round) WHERE IsReprint = 0 AND VoidedAt IS NULL;
CREATE INDEX IX_PrintLogs_PrintedAt ON dbo.PrintLogs (PrintedAt) INCLUDE (ItemId, IsReprint, VoidedAt);
CREATE INDEX IX_PrintLogs_UnitId ON dbo.PrintLogs (UnitId, PrintLogId);
CREATE INDEX IX_PrintLogs_ItemId ON dbo.PrintLogs (ItemId, PrintedAt);
CREATE INDEX IX_PrintLogs_StaffId ON dbo.PrintLogs (StaffId) WHERE StaffId IS NOT NULL;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   5) AdminAccounts — บัญชีผู้ดูแลระบบ (เข้าเมนูตั้งค่า)
      รหัสผ่านไม่เก็บเป็นตัวอักษร: PBKDF2-SHA256 + salt สุ่มต่อบัญชี
   ===================================================================== */
CREATE TABLE dbo.AdminAccounts (
    AdminId        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AdminAccounts PRIMARY KEY,
    Username       VARCHAR(30)    NOT NULL,
    DisplayName    NVARCHAR(60)   NOT NULL,
    PasswordHash   CHAR(64)       NOT NULL,              -- hex ของ PBKDF2-SHA256 (32 ไบต์)
    PasswordSalt   CHAR(32)       NOT NULL,              -- hex ของ salt (16 ไบต์)
    Iterations     INT            NOT NULL CONSTRAINT DF_AdminAccounts_Iterations DEFAULT (120000),
    IsActive       BIT            NOT NULL CONSTRAINT DF_AdminAccounts_IsActive DEFAULT (1),
    CreatedAt      DATETIME2(0)   NOT NULL CONSTRAINT DF_AdminAccounts_CreatedAt DEFAULT (SYSDATETIME()),
    LastLoginAt    DATETIME2(0)   NULL,
    CONSTRAINT UQ_AdminAccounts_Username UNIQUE (Username),
    CONSTRAINT CK_AdminAccounts_Username CHECK (LEN(Username) >= 3 AND Username NOT LIKE '%[^a-z0-9._-]%')
);
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   6) Settings — ค่าตั้งค่าระบบ (โลโก้ ชื่อโรงพยาบาล ฯลฯ) แบบ key/value
   ===================================================================== */
CREATE TABLE dbo.Settings (
    SettingKey        VARCHAR(50)    NOT NULL CONSTRAINT PK_Settings PRIMARY KEY,   -- เช่น brand.hospitalName
    SettingValue      NVARCHAR(MAX)  NULL,                                          -- ข้อความ หรือรูปแบบ data URL
    UpdatedAt         DATETIME2(0)   NOT NULL CONSTRAINT DF_Settings_UpdatedAt DEFAULT (SYSDATETIME()),
    UpdatedByAdminId  INT            NULL CONSTRAINT FK_Settings_Admin REFERENCES dbo.AdminAccounts (AdminId)
);
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   7) AuditLog — บันทึกการแก้ไขข้อมูลหลัก (ใครแก้อะไร เมื่อไร)
      เช่น เพิ่ม/แก้รายการอุปกรณ์ เจ้าหน้าที่ บัญชีแอดมิน ตั้งค่า ทำลายอุปกรณ์
   ===================================================================== */
CREATE TABLE dbo.AuditLog (
    AuditId     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
    At          DATETIME2(0)   NOT NULL CONSTRAINT DF_AuditLog_At DEFAULT (SYSDATETIME()),
    ActorType   VARCHAR(10)    NOT NULL,                 -- admin / staff / system
    ActorId     INT            NULL,
    ActorName   NVARCHAR(100)  NULL,
    Action      VARCHAR(50)    NOT NULL,                 -- เช่น item.update, staff.create, unit.dispose
    EntityType  VARCHAR(30)    NULL,
    EntityId    NVARCHAR(50)   NULL,
    Detail      NVARCHAR(MAX)  NULL,                     -- รายละเอียด (JSON)
    CONSTRAINT CK_AuditLog_ActorType CHECK (ActorType IN ('admin', 'staff', 'system'))
);
CREATE INDEX IX_AuditLog_At ON dbo.AuditLog (At);
CREATE INDEX IX_AuditLog_Entity ON dbo.AuditLog (EntityType, EntityId);
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   8) View สำหรับดู/ออกรายงานใน SSMS ได้ทันที
   ===================================================================== */
-- สถานะปัจจุบันของแต่ละชิ้น (คำนวณเหมือนในโปรแกรม)
CREATE VIEW dbo.vw_UnitStatus AS
SELECT
    u.UnitId,
    u.Sn,
    u.ItemId,
    i.Name                          AS ItemName,
    ISNULL(p.UsedRounds, 0)         AS UsedRounds,
    u.MaxRound,
    CASE
        WHEN u.DisposedAt IS NOT NULL          THEN 'disposed'   -- ทำลายแล้ว
        WHEN ISNULL(p.UsedRounds, 0) = 0       THEN 'new'        -- ชิ้นใหม่
        WHEN p.UsedRounds >= u.MaxRound        THEN 'last'       -- ครบรอบ รอทำลาย
        ELSE 'active'                                            -- ใช้งานได้
    END                             AS Status,
    p.LastPrintedAt,
    p.LastExpDate,
    u.RegisteredAt,
    u.DisposedAt,
    u.DisposeReason
FROM dbo.Units u
JOIN dbo.Items i ON i.ItemId = u.ItemId
OUTER APPLY (
    SELECT
        MAX(CASE WHEN l.IsReprint = 0 THEN l.Round END) AS UsedRounds,
        MAX(l.PrintedAt)                                  AS LastPrintedAt,
        MAX(l.ExpDate)                                    AS LastExpDate
    FROM dbo.PrintLogs l
    WHERE l.UnitId = u.UnitId AND l.VoidedAt IS NULL
) p;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

-- ประวัติการพิมพ์ที่มีผล (ไม่รวมใบที่ยกเลิก)
CREATE VIEW dbo.vw_ActivePrintLogs AS
SELECT * FROM dbo.PrintLogs WHERE VoidedAt IS NULL;
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

/* =====================================================================
   9) ข้อมูลเริ่มต้น
   ===================================================================== */
-- บัญชีแอดมินเริ่มต้น admin / admin1234  (ต้องเปลี่ยนรหัสผ่านหลังติดตั้ง)
INSERT INTO dbo.AdminAccounts (Username, DisplayName, PasswordHash, PasswordSalt, Iterations)
VALUES ('admin', N'ผู้ดูแลระบบ',
        '12ca1eba2d364f19cd8ad78e990d0cdea389898e95a8b9f4a5de91543a818099',
        '5f1c2a9e7b3d4c60a8e1f2b3c4d5e6f7',
        120000);

INSERT INTO dbo.SchemaVersion (Version, Description)
VALUES (1, N'โครงสร้างเริ่มต้น: Items, Staff, Units, PrintLogs, AdminAccounts, Settings, AuditLog');
GO
IF @@TRANCOUNT = 0 BEGIN RAISERROR(N'เกิดข้อผิดพลาด — ยกเลิกการติดตั้งทั้งหมดแล้ว (ไม่มีอะไรถูกสร้าง)', 16, 1); SET NOEXEC ON; END
GO

COMMIT TRANSACTION;
GO
PRINT N'ติดตั้ง Schema เวอร์ชัน 1 เรียบร้อย';
GO
SET NOEXEC OFF;
GO
