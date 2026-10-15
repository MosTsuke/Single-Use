'use client';

import { BarcodeOutlined, NumberOutlined, PlusCircleOutlined, SwapOutlined } from '@ant-design/icons';
import { Alert, App, Checkbox, Col, Flex, Form, Input, InputNumber, Modal, Radio, Row, Select, Tag, Typography } from 'antd';
import { useEffect } from 'react';
import { addDays, todayISO } from '@/lib/date';
import { usePrintStickers } from '@/lib/print';
import { useStore } from '@/lib/store';
import type { Unit } from '@/lib/types';
import { SN_PATTERN } from '@/lib/units';

interface Props {
  open: boolean;
  onClose: () => void;
  /** SN จากผู้ผลิตที่ยิงมาแล้วแต่ยังไม่มีในระบบ */
  defaultSn?: string;
  defaultItemId?: number;
  /** ลงทะเบียนเพื่อทดแทนชิ้นเดิม */
  replaces?: Unit;
  onDone?: (units: Unit[]) => void;
  /** ค่าเริ่มต้นของ "พิมพ์รอบที่ 1 ทันที" (ปิดเมื่อเปิดจากรายการรอพิมพ์ เพราะจะพิมพ์พร้อมรายการอื่น) */
  defaultPrintNow?: boolean;
}

interface FormValues {
  itemId?: number;
  mode: 'auto' | 'manufacturer';
  qty: number;
  sn?: string;
  printNow: boolean;
  staffId?: number;
}

export default function RegisterUnitModal({ open, onClose, defaultSn, defaultItemId, replaces, onDone, defaultPrintNow = true }: Props) {
  const { items, staff, findUnitBySn, suggestSns, registerUnits, sterilize } = useStore();
  const printStickers = usePrintStickers();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();

  const itemId = Form.useWatch('itemId', form);
  const mode = Form.useWatch('mode', form);
  const printNow = Form.useWatch('printNow', form);
  const qty = Form.useWatch('qty', form) ?? 1;
  const item = items.find((i) => i.id === itemId);
  const preview = item && mode === 'auto' ? suggestSns(item.id, Math.min(qty, 50)) : [];

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      itemId: replaces?.itemId ?? defaultItemId,
      mode: defaultSn ? 'manufacturer' : 'auto',
      sn: defaultSn ?? '',
      qty: 1,
      printNow: defaultPrintNow,
    });
  }, [open, defaultSn, defaultItemId, replaces, defaultPrintNow, form]);

  const onOk = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return; // ฟอร์มยังไม่ครบ — antd แสดงข้อความเตือนในช่องแล้ว
    if (!item) return;
    const sns = v.mode === 'auto' ? suggestSns(item.id, v.qty) : [v.sn!.trim()];
    const res = registerUnits({ itemId: item.id, sns, manufacturerSn: v.mode === 'manufacturer', replacesSn: replaces?.sn });
    if (!res.ok) {
      message.error(res.error);
      return;
    }
    if (v.printNow) {
      const mfg = todayISO();
      const exp = addDays(mfg, item.shelf);
      const logs = res.value.map((u) => sterilize(u.id, mfg, exp, { staffId: v.staffId! })).flatMap((r) => (r.ok ? [r.value] : []));
      printStickers(logs);
    }
    message.success(
      `ลงทะเบียน ${res.value.length} ชิ้นแล้ว${v.printNow ? ' และส่งพิมพ์สติ๊กเกอร์รอบที่ 1' : ''}`,
    );
    onDone?.(res.value);
    onClose();
  };

  return (
    <Modal
      open={open}
      // เปิดได้จากในหน้าต่างประวัติ (Drawer) — ต้องอยู่ชั้นบนกว่า Drawer เสมอ
      zIndex={1100}
      onCancel={onClose}
      onOk={onOk}
      okText={'ลงทะเบียน'}
      cancelText="ยกเลิก"
      width={560}
      title={
        <Flex align="center" gap={8}>
          {replaces ? <SwapOutlined style={{ color: '#2563eb' }} /> : <PlusCircleOutlined style={{ color: '#2563eb' }} />}
          {replaces ? 'ลงทะเบียนชิ้นใหม่ทดแทน' : 'ลงทะเบียนอุปกรณ์ใหม่'}
        </Flex>
      }
      forceRender
    >
      {replaces && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            <span>
              ทดแทนชิ้นเดิม <Typography.Text code>{replaces.sn}</Typography.Text> ที่ถูกทำลาย
            </span>
          }
        />
      )}
      <Form<FormValues> form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="itemId" label="รายการอุปกรณ์" rules={[{ required: true, message: 'เลือกรายการอุปกรณ์' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="เลือกรายการอุปกรณ์"
            disabled={!!replaces}
            options={items.map((i) => ({ value: i.id, label: i.name }))}
          />
        </Form.Item>

        <Form.Item name="mode" label="Serial Number (SN)">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'auto', label: <><NumberOutlined /> ระบบสร้างให้</> },
              { value: 'manufacturer', label: <><BarcodeOutlined /> SN จากผู้ผลิต</> },
            ]}
          />
        </Form.Item>

        {mode === 'manufacturer' ? (
          <Form.Item
            name="sn"
            label="ยิงหรือพิมพ์ SN ที่ติดมากับอุปกรณ์"
            rules={[
              { required: true, whitespace: true, message: 'กรุณาระบุ SN' },
              { pattern: SN_PATTERN, message: 'SN ใช้ได้เฉพาะตัวอักษร/ตัวเลขภาษาอังกฤษ ไม่มีช่องว่าง' },
              {
                validator: (_, v: string) =>
                  v && findUnitBySn(v) ? Promise.reject(new Error('SN นี้มีอยู่ในระบบแล้ว')) : Promise.resolve(),
              },
            ]}
            normalize={(v: string) => v?.replace(/\s/g, '')}
          >
            <Input prefix={<BarcodeOutlined />} placeholder="เช่น ABC123456" autoFocus />
          </Form.Item>
        ) : (
          <Row gutter={16} align="bottom">
            <Col span={8}>
              <Form.Item name="qty" label="จำนวนชิ้น">
                <InputNumber min={1} max={50} precision={0} style={{ width: '100%' }} disabled={!!replaces} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item label="SN ที่จะได้">
                <Flex wrap gap={4} style={{ minHeight: 32, alignItems: 'center' }}>
                  {!item ? (
                    <Typography.Text type="secondary">เลือกรายการอุปกรณ์ก่อน</Typography.Text>
                  ) : (
                    <>
                      {preview.slice(0, 4).map((s) => (
                        <Tag key={s} style={{ fontFamily: 'monospace' }}>
                          {s}
                        </Tag>
                      ))}
                      {preview.length > 4 && <Typography.Text type="secondary">… {preview[preview.length - 1]}</Typography.Text>}
                    </>
                  )}
                </Flex>
              </Form.Item>
            </Col>
          </Row>
        )}

        {item && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            ใช้ได้ {item.maxRound} รอบ · หมดอายุหลัง sterilize {item.shelf} วัน
          </Typography.Paragraph>
        )}

        <Form.Item name="printNow" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox>Sterilize แล้ว — พิมพ์สติ๊กเกอร์รอบที่ 1 ทันที (วันที่วันนี้)</Checkbox>
        </Form.Item>
        {printNow && (
          <Form.Item
            name="staffId"
            label="เจ้าหน้าที่ผู้พิมพ์"
            style={{ marginTop: 12, marginBottom: 0 }}
            rules={[{ required: true, message: 'กรุณาเลือกเจ้าหน้าที่ผู้พิมพ์' }]}
          >
            <Select
              showSearch
              placeholder="เลือกหรือพิมพ์ค้นหาชื่อ / รหัส"
              optionFilterProp="search"
              notFoundContent={staff.some((s) => s.active) ? 'ไม่พบชื่อ' : 'ยังไม่มีรายชื่อ — เพิ่มที่เมนูรายชื่อเจ้าหน้าที่'}
              options={staff
                .filter((s) => s.active)
                .map((s) => ({ value: s.id, label: s.code ? `${s.name} (${s.code})` : s.name, search: `${s.name} ${s.code ?? ''}` }))}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

