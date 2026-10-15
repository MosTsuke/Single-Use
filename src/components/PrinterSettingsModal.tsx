'use client';

import { PrinterOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, Button, Col, Divider, Flex, Input, InputNumber, Modal, Row, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { addDays, todayISO } from '@/lib/date';
import { usePrinterSettings, usePrintStickers, type PrinterSettings } from '@/lib/print';

const { Text, Paragraph } = Typography;

/** ตั้งค่าเครื่องพิมพ์ของเครื่องนี้ — หลักคือ Godex EZ120 (203 dpi) */
export default function PrinterSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, setSettings } = usePrinterSettings();
  const printStickers = usePrintStickers();
  const [draft, setDraft] = useState<PrinterSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const testPrint = () => {
    // บันทึกค่าก่อน เพื่อให้ดวงทดสอบใช้ตำแหน่งล่าสุด — ดวงทดสอบไม่ถูกบันทึกเป็นประวัติ
    setSettings(draft);
    const today = todayISO();
    setTimeout(
      () =>
        printStickers([
          {
            name: 'ทดสอบการพิมพ์',
            useBarcode: true,
            barcode: 'TEST-000000',
            mfg: today,
            exp: addDays(today, 30),
            round: 1,
            maxRound: 4,
            staffName: 'ทดสอบ เจ้าหน้าที่',
          },
        ]),
      50,
    );
  };

  const save = () => {
    setSettings(draft);
    onClose();
  };

  const num = (key: 'offsetX' | 'offsetY', label: string, hint: string) => (
    <Col span={12}>
      <Text strong>{label}</Text>
      <InputNumber
        value={draft[key]}
        onChange={(v) => setDraft({ ...draft, [key]: Number(v ?? 0) })}
        min={-5}
        max={5}
        step={0.5}
        precision={1}
        suffix="มม."
        style={{ width: '100%', marginTop: 4 }}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {hint}
      </Text>
    </Col>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <Space>
          <PrinterOutlined style={{ color: '#2563eb' }} />
          ตั้งค่าเครื่องพิมพ์
        </Space>
      }
      width={560}
      footer={
        <Flex justify="space-between">
          <Button icon={<PrinterOutlined />} onClick={testPrint}>
            พิมพ์ทดสอบ
          </Button>
          <Space>
            <Button onClick={onClose}>ยกเลิก</Button>
            <Button type="primary" onClick={save}>
              บันทึก
            </Button>
          </Space>
        </Flex>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="เครื่องพิมพ์หลัก: Godex EZ120 (203 dpi)"
        description={
          <ol style={{ paddingLeft: 18, margin: '4px 0 0' }}>
            <li>ติดตั้งไดรเวอร์ GoDEX ของรุ่น EZ120 และตั้งชื่อเครื่องให้ตรงกับช่องด้านล่าง</li>
            <li>ในไดรเวอร์ ตั้งกระดาษ 50 × 25 มม. ชนิดสติ๊กเกอร์มีช่องว่าง (gap)</li>
            <li>ทำ calibrate เซนเซอร์กระดาษตามคู่มือเครื่อง ทุกครั้งที่เปลี่ยนม้วน</li>
            <li>หน้าต่างพิมพ์ของ Chrome: เลือก {draft.printerName || 'EZ120'} · Margins = None · Scale = 100%</li>
          </ol>
        }
      />

      <Text strong>ชื่อเครื่องพิมพ์ของจุดนี้</Text>
      <Input
        value={draft.printerName}
        onChange={(e) => setDraft({ ...draft, printerName: e.target.value })}
        placeholder="เช่น Pasin 2"
        prefix={<PrinterOutlined style={{ color: '#94a3b8' }} />}
        style={{ marginTop: 4 }}
        maxLength={60}
      />
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
        แสดงข้างปุ่มพิมพ์ให้เจ้าหน้าที่เห็นว่าต้องพิมพ์ออกเครื่องไหน · การล็อกให้ออกเครื่องนี้เท่านั้นต้องตั้งค่าที่เครื่องหน้างาน
        (ไฟล์อยู่ในโฟลเดอร์ deploy ของโปรเจกต์) · ชื่อต้องตรงกับที่แสดงใน Windows ทุกตัวอักษร
      </Text>
      <Divider style={{ margin: '16px 0' }} />

      <Paragraph style={{ marginBottom: 8 }}>
        <Text strong>ปรับตำแหน่งการพิมพ์</Text>{' '}
        <Text type="secondary">— ถ้าข้อความไม่อยู่กลางกรอบสีส้ม ให้พิมพ์ทดสอบแล้วขยับทีละ 0.5 มม.</Text>
      </Paragraph>
      <Row gutter={16}>
        {num('offsetX', 'เลื่อนแนวนอน', 'ลบ = ไปซ้าย · บวก = ไปขวา')}
        {num('offsetY', 'เลื่อนแนวตั้ง', 'ลบ = ขึ้น · บวก = ลง')}
      </Row>
      <Flex justify="flex-end" style={{ marginTop: 8 }}>
        <Button type="link" size="small" icon={<UndoOutlined />} onClick={() => setDraft({ ...draft, offsetX: 0, offsetY: 0 })}>
          รีเซ็ตเป็น 0
        </Button>
      </Flex>
      <Text type="secondary" style={{ fontSize: 12 }}>
        ค่านี้เก็บแยกตามเครื่องคอมพิวเตอร์ · ดวงทดสอบไม่ถูกบันทึกในประวัติ
      </Text>
    </Modal>
  );
}
