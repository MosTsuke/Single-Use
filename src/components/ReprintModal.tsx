'use client';

import { BarcodeOutlined, RedoOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Empty, Flex, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { thaiDate, thaiDateTime } from '@/lib/date';
import { usePrinterSettings, usePrintStickers } from '@/lib/print';
import { useStore } from '@/lib/store';
import Sticker from '@/components/Sticker';
import type { PrintLog } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** แสดงเฉพาะรายการนี้ (ถ้าระบุ) */
  itemId?: number;
}

export default function ReprintModal({ open, onClose, itemId }: Props) {
  const { logs, units, items, createReprint, removeLogs } = useStore();
  const printStickers = usePrintStickers();
  const { settings: printer } = usePrinterSettings();
  const { message } = App.useApp();
  const [q, setQ] = useState('');
  const [confirming, setConfirming] = useState<PrintLog | null>(null);
  const [withBarcode, setWithBarcode] = useState(true);

  const rows = useMemo(() => {
    const reprintCount = new Map<number, number>();
    logs.forEach((l) => l.isReprint && l.sourceId && reprintCount.set(l.sourceId, (reprintCount.get(l.sourceId) ?? 0) + 1));
    // พิมพ์ซ้ำได้เฉพาะดวงล่าสุดของชิ้นที่ยังไม่ถูกทำลาย (ดวงรอบก่อน ๆ ใช้ไปแล้ว)
    const latestByUnit = new Map<number, number>();
    logs.forEach((l) => !l.isReprint && l.unitId != null && latestByUnit.set(l.unitId, l.id));
    const disposed = new Set(units.filter((u) => u.disposedAt).map((u) => u.id));
    const kw = q.trim().toLowerCase();
    return logs
      .filter((l) => !l.isReprint)
      .filter((l) => l.unitId == null || (!disposed.has(l.unitId) && latestByUnit.get(l.unitId) === l.id))
      .filter((l) => (itemId ? l.itemId === itemId : true))
      .filter((l) => !kw || l.name.toLowerCase().includes(kw) || l.barcode.toLowerCase().includes(kw))
      .map((l) => ({ ...l, reprints: reprintCount.get(l.id) ?? 0 }))
      .reverse();
  }, [logs, units, q, itemId]);

  // เปิดหน้าต่างยืนยัน พร้อมตัวอย่างสติ๊กเกอร์ — ค่าเริ่มต้นบาร์โคดตามที่ตั้งไว้ของรายการอุปกรณ์
  const doReprint = (log: PrintLog) => {
    const item = items.find((i) => i.id === log.itemId);
    setWithBarcode(item?.useBarcode ?? log.useBarcode);
    setConfirming(log);
  };

  const previewData = useMemo(
    () => (confirming ? { ...confirming, useBarcode: withBarcode } : null),
    [confirming, withBarcode],
  );

  const confirmReprint = () => {
    if (!confirming) return;
    const src = confirming;
    setConfirming(null);
    // ปิดหน้าต่างให้เสร็จก่อน แล้วค่อยเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
    // (หน้าต่างพิมพ์จะหยุดแอนิเมชันปิด modal ทำให้ modal ค้างจนปิดไม่ได้)
    onClose();
    const r = createReprint(src.id, { useBarcode: withBarcode });
    if (!r) return;
    setTimeout(
      () =>
        printStickers([r], {
          undo: {
            title: `พิมพ์ซ้ำ ${r.name} รอบ ${r.round}/${r.maxRound} แล้ว`,
            onUndo: () => {
              const res = removeLogs([r.id]);
              if (res.ok) message.info('ย้อนกลับแล้ว — ไม่นับการพิมพ์ซ้ำครั้งนี้');
              else message.error(res.error);
            },
          },
        }),
      400,
    );
  };

  const columns: ColumnsType<(typeof rows)[number]> = [
    {
      title: 'รายการ',
      dataIndex: 'name',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{r.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            พิมพ์เมื่อ {thaiDateTime(r.time)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'รอบ',
      width: 80,
      render: (_, r) => <Tag color="blue">{`${r.round}/${r.maxRound}`}</Tag>,
    },
    {
      title: 'SN / หมดอายุ',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          {r.barcode ? (
            <Typography.Text code>
              <BarcodeOutlined /> {r.barcode}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            หมดอายุ {thaiDate(r.exp)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '',
      width: 130,
      align: 'right',
      render: (_, r) => (
        <Space orientation="vertical" size={2} align="end">
          <Button size="small" icon={<RedoOutlined />} onClick={() => doReprint(r)} style={{ borderColor: '#f59e0b', color: '#d97706' }}>
            พิมพ์ซ้ำ
          </Button>
          {r.reprints > 0 && (
            <Typography.Text type="warning" style={{ fontSize: 11 }}>
              พิมพ์ซ้ำแล้ว {r.reprints} ครั้ง
            </Typography.Text>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        <Button onClick={onClose} size="large">
          ปิด
        </Button>
      }
      width={760}
      title={
        <Space>
          <RedoOutlined style={{ color: '#f59e0b' }} />
          พิมพ์ซ้ำ (กรณีสติ๊กเกอร์ชำรุด)
        </Space>
      }
      destroyOnHidden
    >
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="ค้นหาชื่อหรือ SN"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
        scroll={{ x: 560 }}
        locale={{ emptyText: <Empty description="ยังไม่มีประวัติการพิมพ์" /> }}
      />

      {/* ===== ยืนยันพิมพ์ซ้ำ + ตัวอย่าง ===== */}
      <Modal
        open={!!confirming}
        onCancel={() => setConfirming(null)}
        onOk={confirmReprint}
        okText="พิมพ์ซ้ำ"
        cancelText="ยกเลิก"
        okButtonProps={{ icon: <RedoOutlined />, size: 'large' }}
        cancelButtonProps={{ size: 'large' }}
        width={520}
        centered
        destroyOnHidden
        title={
          <Space>
            <RedoOutlined style={{ color: '#f59e0b' }} />
            ยืนยันการพิมพ์ซ้ำ
          </Space>
        }
      >
        {confirming && (
          <>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              พิมพ์ <Typography.Text strong>{confirming.name}</Typography.Text> รอบ {confirming.round}/
              {confirming.maxRound} อีก 1 ดวง โดยใช้ SN และวันที่เดิม (ไม่นับรอบเพิ่ม)
            </Typography.Paragraph>
            <div className="sticker-preview-wrap" style={{ padding: '20px 8px' }}>
              <div className="sticker-preview">
                <Sticker data={previewData!} />
              </div>
            </div>
            <Flex justify="space-between" align="center" style={{ marginTop: 12 }}>
              <Space size={8}>
                <BarcodeOutlined style={{ color: withBarcode ? '#2563eb' : '#94a3b8' }} />
                <Typography.Text>พิมพ์บาร์โคด</Typography.Text>
                <Switch checked={withBarcode} onChange={setWithBarcode} />
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                มีผลกับดวงนี้ดวงเดียว
                {printer.printerName && <> · พิมพ์ที่ <b>{printer.printerName}</b></>}
              </Typography.Text>
            </Flex>
          </>
        )}
      </Modal>
    </Modal>
  );
}
