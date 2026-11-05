'use client';

import { RollbackOutlined } from '@ant-design/icons';
import { Alert, App, Descriptions, Form, Input, Modal, Select, Typography } from 'antd';
import { useEffect } from 'react';
import { thaiDate, thaiDateTime } from '@/lib/date';
import { useStore } from '@/lib/store';
import type { Unit } from '@/lib/types';

interface FormValues {
  reason?: string;
  staffId?: number;
}

/**
 * ยกเลิกใบที่พิมพ์ผิด (ดวงล่าสุดของชิ้น) — รอบกลับไปเป็นค่าก่อนหน้า
 * ดวงที่ยกเลิกยังอยู่ในประวัติ พร้อมเหตุผลและผู้ยกเลิก
 */
export default function VoidPrintModal({ unit, onClose }: { unit: Unit | null; onClose: () => void }) {
  const { voidableLog, voidPrint, getUnitInfo, staff, allLogs } = useStore();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const log = unit ? voidableLog(unit) : undefined;
  const info = unit ? getUnitInfo(unit) : null;
  const reprints = log ? allLogs.filter((l) => l.isReprint && l.sourceId === log.id && !l.voidedAt).length : 0;
  // รอบหลังยกเลิก = รอบสูงสุดของดวงที่เหลือ
  const after = log
    ? Math.max(0, ...allLogs.filter((l) => l.unitId === log.unitId && !l.isReprint && !l.voidedAt && l.id !== log.id).map((l) => l.round))
    : 0;

  useEffect(() => {
    if (unit) form.resetFields();
  }, [unit, form]);

  const onOk = async () => {
    if (!log) return;
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const res = voidPrint(log.id, { reason: v.reason!, staffId: v.staffId! });
    if (!res.ok) return message.error(res.error);
    message.success(`ยกเลิกใบรอบ ${log.round}/${log.maxRound} ของ ${unit!.sn} แล้ว — รอบกลับเป็น ${after}/${log.maxRound}`);
    onClose();
  };

  return (
    <Modal
      open={!!unit}
      zIndex={1100}
      onCancel={onClose}
      onOk={onOk}
      okText="ยกเลิกใบนี้"
      okButtonProps={{ danger: true, icon: <RollbackOutlined />, disabled: !log }}
      cancelText="ปิด"
      title="ยกเลิกใบที่พิมพ์ผิด"
      width={520}
      forceRender
    >
      {unit && !log ? (
        <Alert type="info" showIcon title="ชิ้นนี้ไม่มีใบที่ยกเลิกได้" />
      ) : (
        unit &&
        log && (
          <>
            <Descriptions
              size="small"
              column={1}
              bordered
              style={{ marginBottom: 16 }}
              items={[
                { key: 'sn', label: 'SN', children: <Typography.Text code>{unit.sn}</Typography.Text> },
                { key: 'it', label: 'อุปกรณ์', children: info?.item?.name ?? log.name },
                {
                  key: 'r',
                  label: 'ใบที่จะยกเลิก',
                  children: (
                    <>
                      <b>
                        รอบ {log.round}/{log.maxRound}
                      </b>{' '}
                      · พิมพ์เมื่อ {thaiDateTime(log.time)}
                      {log.staffName && <> โดย {log.staffName}</>}
                    </>
                  ),
                },
                { key: 'd', label: 'วันผลิต / หมดอายุ', children: `${thaiDate(log.mfg)} → ${thaiDate(log.exp)}` },
              ]}
            />
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title={
                <span>
                  ใช้ไปแล้ว {info?.used ?? log.round}/{log.maxRound} → กลับเป็น <b>{after}/{log.maxRound}</b>
                  {after === 0 && ' (กลับเป็นชิ้นใหม่)'}
                </span>
              }
              description={`ใบนี้จะยังอยู่ในประวัติ (ขีดฆ่า) พร้อมเหตุผล — ฉีกสติ๊กเกอร์ใบที่พิมพ์ผิดทิ้ง${reprints ? ` · ใบพิมพ์ซ้ำของดวงนี้ ${reprints} ใบจะถูกยกเลิกด้วย` : ''}`}
            />
            <Form<FormValues> form={form} layout="vertical" requiredMark={false}>
              <Form.Item
                name="reason"
                label="เหตุผลที่ยกเลิก"
                rules={[{ required: true, whitespace: true, message: 'กรุณาระบุเหตุผล' }]}
              >
                <Input.TextArea rows={2} maxLength={200} showCount placeholder="เช่น ยิง SN ผิดชิ้น, เลือกรอบผิด, ยังไม่ได้ sterilize" />
              </Form.Item>
              <Form.Item
                name="staffId"
                label="เจ้าหน้าที่ผู้ยกเลิก"
                style={{ marginBottom: 0 }}
                rules={[{ required: true, message: 'กรุณาเลือกเจ้าหน้าที่' }]}
              >
                <Select
                  showSearch
                  placeholder="เลือกหรือพิมพ์ค้นหาชื่อ / รหัส"
                  optionFilterProp="search"
                  options={staff
                    .filter((s) => s.active)
                    .map((s) => ({ value: s.id, label: s.code ? `${s.name} (${s.code})` : s.name, search: `${s.name} ${s.code ?? ''}` }))}
                />
              </Form.Item>
            </Form>
          </>
        )
      )}
    </Modal>
  );
}
