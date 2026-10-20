'use client';

import { DeleteOutlined } from '@ant-design/icons';
import { Alert, App, Form, Input, Modal, Radio } from 'antd';
import { useEffect } from 'react';
import { useStore, type UnitInfo } from '@/lib/store';
import { DISPOSE_REASON_LABEL, EARLY_DISPOSE_REASONS, type DisposeReason } from '@/lib/types';

interface FormValues {
  reason?: DisposeReason;
  note?: string;
}

/**
 * ทำลายหลายชิ้นพร้อมกัน — สาเหตุ/หมายเหตุเดียวกันทุกชิ้น
 * กติกาเหมือนทำลายทีละชิ้น: ถ้ามีชิ้นที่ยังไม่ครบรอบปนอยู่ ต้องเลือกสาเหตุเอง (ไม่มี "ครบจำนวนรอบ") และต้องกรอกรายละเอียด
 */
export default function BulkDisposeModal({
  rows,
  open,
  onClose,
  onDone,
}: {
  rows: UnitInfo[];
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { disposeUnit } = useStore();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const earlyCount = rows.filter((r) => r.status !== 'last').length;
  const early = earlyCount > 0;
  const reason = Form.useWatch('reason', form);
  const noteRequired = early || (!!reason && reason !== 'max_round');

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ reason: early ? undefined : 'max_round', note: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onOk = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    let ok = 0;
    const failed: string[] = [];
    for (const r of rows) {
      const res = disposeUnit(r.unit.id, v.reason!, v.note);
      if (res.ok) ok++;
      else failed.push(`${r.unit.sn}: ${res.error}`);
    }
    if (ok) message.success(`บันทึกทำลาย ${ok} ชิ้นแล้ว`);
    failed.forEach((f) => message.error(f));
    onClose();
    onDone?.();
  };

  return (
    <Modal
      open={open}
      zIndex={1100}
      onCancel={onClose}
      onOk={onOk}
      okText={`บันทึกทำลาย ${rows.length} ชิ้น`}
      okButtonProps={{ danger: true, icon: <DeleteOutlined /> }}
      cancelText="ยกเลิก"
      title={`ทำลายหลายชิ้นพร้อมกัน (${rows.length} ชิ้น)`}
      width={600}
      forceRender
    >
      <Alert
        type={early ? 'error' : 'warning'}
        showIcon
        style={{ marginBottom: 16 }}
        title={
          early
            ? `ทำลาย ${rows.length} ชิ้น — มี ${earlyCount} ชิ้นที่ยังใช้ไม่ครบรอบ ต้องระบุสาเหตุและรายละเอียด`
            : `ทำลาย ${rows.length} ชิ้น — ทุกชิ้นใช้ครบรอบแล้ว`
        }
        description="สาเหตุและหมายเหตุจะบันทึกเหมือนกันทุกชิ้น · เมื่อบันทึกแล้วจะพิมพ์สติ๊กเกอร์ให้ SN เหล่านี้ไม่ได้อีก"
      />
      <Form<FormValues> form={form} layout="vertical">
        <Form.Item
          name="reason"
          label={early ? 'สาเหตุที่ทำลายก่อนครบรอบ' : 'สาเหตุ'}
          rules={[{ required: true, message: 'กรุณาเลือกสาเหตุ' }]}
        >
          <Radio.Group
            options={(early ? EARLY_DISPOSE_REASONS : (['max_round', ...EARLY_DISPOSE_REASONS] as DisposeReason[])).map((k) => ({
              value: k,
              label: DISPOSE_REASON_LABEL[k],
            }))}
          />
        </Form.Item>
        <Form.Item
          name="note"
          label={noteRequired ? 'รายละเอียด / หมายเหตุ' : 'หมายเหตุ (ถ้ามี)'}
          style={{ marginBottom: 20 }}
          rules={[{ required: noteRequired, whitespace: true, message: 'กรุณาระบุรายละเอียด' }]}
        >
          <Input.TextArea rows={3} maxLength={300} showCount placeholder="เช่น ผู้ทำลาย, เลขที่ใบทำลาย, ลักษณะที่ชำรุด" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
