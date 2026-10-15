'use client';

import { DeleteOutlined } from '@ant-design/icons';
import { Alert, App, Checkbox, Form, Input, Modal, Radio, Typography } from 'antd';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { DISPOSE_REASON_LABEL, type DisposeReason, type Unit } from '@/lib/types';

interface Props {
  unit: Unit | null;
  onClose: () => void;
  /** เรียกหลังทำลายสำเร็จ — replace = ผู้ใช้ต้องการลงทะเบียนชิ้นใหม่ทดแทน */
  onDisposed?: (unit: Unit, replace: boolean) => void;
}

interface FormValues {
  reason: DisposeReason;
  note?: string;
  replace: boolean;
}

export default function DisposeModal({ unit, onClose, onDisposed }: Props) {
  const { getUnitInfo, disposeUnit } = useStore();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const info = unit ? getUnitInfo(unit) : null;
  const reason = Form.useWatch('reason', form);

  useEffect(() => {
    if (!unit || !info) return;
    form.setFieldsValue({ reason: info.status === 'last' ? 'max_round' : 'damaged', note: '', replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id]);

  const onOk = async () => {
    if (!unit) return;
    const v = await form.validateFields();
    const res = disposeUnit(unit.id, v.reason, v.note);
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
            description="เมื่อบันทึกทำลายแล้ว จะพิมพ์สติ๊กเกอร์ให้ SN นี้ไม่ได้อีก"
          />
          <Form<FormValues> form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="reason" label="สาเหตุ">
              <Radio.Group
                options={(Object.keys(DISPOSE_REASON_LABEL) as DisposeReason[]).map((k) => ({
                  value: k,
                  label: DISPOSE_REASON_LABEL[k],
                }))}
              />
            </Form.Item>
            <Form.Item
              name="note"
              label="หมายเหตุ"
              rules={[{ required: reason === 'other', whitespace: true, message: 'กรุณาระบุรายละเอียด' }]}
            >
              <Input.TextArea rows={2} maxLength={200} placeholder="เช่น สายขาด, ผู้ทำลาย, เลขที่ใบทำลาย" />
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
