'use client';

import { DeleteOutlined } from '@ant-design/icons';
import { Alert, App, Checkbox, Form, Input, Modal, Radio, Typography } from 'antd';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { DISPOSE_REASON_LABEL, EARLY_DISPOSE_REASONS, type DisposeReason, type Unit } from '@/lib/types';

interface Props {
  unit: Unit | null;
  onClose: () => void;
  /** เรียกหลังทำลายสำเร็จ — replace = ผู้ใช้ต้องการลงทะเบียนชิ้นใหม่ทดแทน */
  onDisposed?: (unit: Unit, replace: boolean) => void;
}

interface FormValues {
  reason?: DisposeReason;
  note?: string;
  replace: boolean;
}

export default function DisposeModal({ unit, onClose, onDisposed }: Props) {
  const { getUnitInfo, disposeUnit } = useStore();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const info = unit ? getUnitInfo(unit) : null;
  // ทำลายก่อนครบรอบ → ต้องเลือกสาเหตุเอง (ไม่มีค่าเริ่มต้น) และต้องกรอกรายละเอียด
  const early = !!info && info.status !== 'last';
  const reason = Form.useWatch('reason', form);
  // ทุกสาเหตุที่ไม่ใช่ "ครบจำนวนรอบ" ต้องมีรายละเอียดประกอบ
  const noteRequired = early || (!!reason && reason !== 'max_round');

  useEffect(() => {
    if (!unit || !info) return;
    form.resetFields();
    form.setFieldsValue({ reason: info.status === 'last' ? 'max_round' : undefined, note: '', replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id]);

  const onOk = async () => {
    if (!unit) return;
    const v = await form.validateFields().catch(() => null);
    if (!v) return; // ฟอร์มยังไม่ครบ — antd แสดงข้อความเตือนในช่องแล้ว
    const res = disposeUnit(unit.id, v.reason!, v.note);
    if (!res.ok) {
      message.error(res.error);
      return;
    }
    message.success(`บันทึกทำลาย ${unit.sn} แล้ว`);
    onClose();
    onDisposed?.(res.value, v.replace);
  };

  return (
    <Modal
      open={!!unit}
      // เปิดได้จากในหน้าต่างประวัติ (Drawer) — ต้องอยู่ชั้นบนกว่า Drawer เสมอ
      zIndex={1100}
      onCancel={onClose}
      onOk={onOk}
      okText="บันทึกทำลาย"
      okButtonProps={{ danger: true, icon: <DeleteOutlined /> }}
      cancelText="ยกเลิก"
      title="บันทึกการทำลายอุปกรณ์"
      forceRender
    >
      {unit && info && (
        <>
          <Alert
            type={info.status === 'last' ? 'warning' : 'error'}
            showIcon
            style={{ marginBottom: 16 }}
            title={
              <span>
                <Typography.Text code>{unit.sn}</Typography.Text> {info.item?.name} — ใช้ไปแล้ว {info.used}/{unit.maxRound} รอบ
              </span>
            }
            description={
              early
                ? `ยังใช้ไม่ครบรอบ (เหลืออีก ${unit.maxRound - info.used} รอบ) — กรุณาระบุสาเหตุและรายละเอียดการทำลาย`
                : 'เมื่อบันทึกทำลายแล้ว จะพิมพ์สติ๊กเกอร์ให้ SN นี้ไม่ได้อีก'
            }
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
              rules={[
                { required: noteRequired, whitespace: true, message: 'กรุณาระบุรายละเอียด เช่น ลักษณะที่ชำรุด หรือสถานที่ที่สูญหาย' },
              ]}
            >
              <Input.TextArea
                rows={3}
                maxLength={300}
                showCount
                placeholder={
                  noteRequired
                    ? 'เช่น สายขาดบริเวณข้อต่อ, ผิวแข็งกรอบ, หายจากหอผู้ป่วย ... · ผู้ทำลาย · เลขที่ใบทำลาย'
                    : 'เช่น ผู้ทำลาย, เลขที่ใบทำลาย'
                }
              />
            </Form.Item>
            <Form.Item name="replace" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Checkbox>ลงทะเบียนชิ้นใหม่ทดแทนต่อเลย</Checkbox>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
