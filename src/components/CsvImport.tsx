'use client';

import { CheckCircleFilled, CloseCircleFilled, DownloadOutlined, FileExcelOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Flex, Modal, Table, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { checkCsv, CSV_SPECS, downloadTemplate, parseCsv, readCsvFile, type CheckedRow, type CsvKind } from '@/lib/csv-import';
import { useStore } from '@/lib/store';

const { Text } = Typography;

/**
 * ปุ่ม "ไฟล์ต้นแบบ" + "นำเข้า CSV" — กรอกใน Excel แล้วนำเข้าทีละชุด
 * อ่านไฟล์ → ตรวจทุกแถว → แสดงตัวอย่าง (บอกแถวที่ผิด) → กดนำเข้า = บันทึกทั้งชุด
 */
export default function CsvImport({ kind }: { kind: CsvKind }) {
  const store = useStore();
  const { message } = App.useApp();
  const spec = CSV_SPECS[kind];
  const [file, setFile] = useState<{ name: string; table: string[][] } | null>(null);
  const [busy, setBusy] = useState(false);

  // ตรวจกับข้อมูลล่าสุดเสมอ (เครื่องอื่นอาจเพิ่มข้อมูลระหว่างเปิดหน้าต่างนี้)
  const data = useMemo(
    () => ({ items: store.items, units: store.units, logs: store.allLogs, staff: store.staff, departments: store.departments }),
    [store.items, store.units, store.allLogs, store.staff, store.departments],
  );
  const result = useMemo(() => {
    if (!file) return null;
    switch (kind) {
      case 'items':
        return checkCsv('items', file.table, data);
      case 'units':
        return checkCsv('units', file.table, data);
      default:
        return checkCsv(kind, file.table, data);
    }
  }, [file, kind, data]);

  const errors = result?.rows.filter((r) => r.error).length ?? 0;
  const ok = (result?.rows.length ?? 0) - errors;
  const canImport = !!result && !result.fileError && errors === 0 && result.values.length > 0;

  const pick = async (f: File) => {
    try {
      setFile({ name: f.name, table: parseCsv(await readCsvFile(f)) });
    } catch (e) {
      message.error(`อ่านไฟล์ไม่ได้: ${e instanceof Error ? e.message : String(e)}`);
    }
    return false; // อ่านในเครื่อง ไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์
  };

  const doImport = async () => {
    if (!result || !canImport) return;
    setBusy(true);
    const res =
      kind === 'items'
        ? await store.importItems(checkCsv('items', file!.table, data).values)
        : kind === 'staff'
          ? await store.importStaff(checkCsv('staff', file!.table, data).values)
          : kind === 'departments'
            ? await store.importDepartments(checkCsv('departments', file!.table, data).values)
            : await store.importUnits(checkCsv('units', file!.table, data).values);
    setBusy(false);
    if (!res.ok) {
      message.error(res.error, 8);
      return;
    }
    message.success(`นำเข้า${spec.title} ${res.value.length} ${spec.unit}แล้ว`);
    setFile(null);
  };

  const columns: ColumnsType<CheckedRow> = [
    { title: 'บรรทัด', dataIndex: 'line', width: 70, align: 'center' },
    ...spec.headers.map((h) => ({
      title: h,
      key: h,
      render: (_: unknown, r: CheckedRow) => r.cells[h] || <Text type="secondary">—</Text>,
    })),
    {
      title: 'ตรวจ',
      key: 'status',
      width: 260,
      render: (_: unknown, r: CheckedRow) =>
        r.error ? (
          <Text type="danger">
            <CloseCircleFilled /> {r.error}
          </Text>
        ) : (
          <Text type="success">
            <CheckCircleFilled /> ผ่าน
          </Text>
        ),
    },
  ];

  return (
    <>
      <Button icon={<DownloadOutlined />} onClick={() => downloadTemplate(kind)}>
        ไฟล์ต้นแบบ
      </Button>
      <Upload accept=".csv,text/csv" showUploadList={false} beforeUpload={pick}>
        <Button icon={<UploadOutlined />}>นำเข้า CSV</Button>
      </Upload>

      <Modal
        open={!!file}
        onCancel={() => setFile(null)}
        width={900}
        zIndex={1100}
        destroyOnHidden
        title={
          <Flex align="center" gap={8}>
            <FileExcelOutlined style={{ color: '#16a34a' }} />
            {`นำเข้า${spec.title} — ${file?.name ?? ''}`}
          </Flex>
        }
        okText={canImport ? `นำเข้า ${result!.values.length} ${spec.unit}` : 'นำเข้า'}
        okButtonProps={{ disabled: !canImport }}
        confirmLoading={busy}
        onOk={doImport}
        cancelText="ยกเลิก"
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          {spec.hint} · บรรทัดที่ขึ้นต้นด้วย # ไม่ถูกนำเข้า · เพิ่มเฉพาะข้อมูลใหม่ ไม่แก้ข้อมูลเดิม
        </Text>
        {result?.fileError ? (
          <Alert type="error" showIcon title={result.fileError} />
        ) : (
          <>
            <Alert
              type={errors ? 'error' : 'success'}
              showIcon
              style={{ marginBottom: 12 }}
              title={
                errors
                  ? `ผ่าน ${ok} แถว · ผิด ${errors} แถว — ยังไม่บันทึกอะไร แก้ไฟล์ตามข้อความในตารางแล้วนำเข้าใหม่`
                  : `ตรวจผ่านทั้งหมด ${ok} แถว — กด "นำเข้า" เพื่อบันทึก`
              }
            />
            <Table
              size="small"
              rowKey="line"
              columns={columns}
              dataSource={errors ? [...(result?.rows ?? [])].sort((a, b) => Number(!!b.error) - Number(!!a.error) || a.line - b.line) : result?.rows}
              pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
              scroll={{ x: 700 }}
            />
          </>
        )}
      </Modal>
    </>
  );
}
