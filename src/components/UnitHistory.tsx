'use client';

import { CheckCircleFilled, DeleteFilled, PlusCircleFilled, RedoOutlined } from '@ant-design/icons';
import { Empty, Tag, Timeline, Typography } from 'antd';
import { thaiDate, thaiDateTime } from '@/lib/date';
import { useStore } from '@/lib/store';
import { DISPOSE_REASON_LABEL, type Unit } from '@/lib/types';

const { Text } = Typography;

/** ไทม์ไลน์ของอุปกรณ์ 1 ชิ้น: ลงทะเบียน → sterilize แต่ละรอบ → ทำลาย (ล่าสุดอยู่บน) */
export default function UnitHistory({ unit }: { unit: Unit }) {
  const { logs } = useStore();
  const unitLogs = logs.filter((l) => l.unitId === unit.id);

  const events: { key: string; time: string; node: React.ReactNode; color: string; icon: React.ReactNode }[] = [
    {
      key: 'reg',
      time: unit.registeredAt,
      color: 'cyan',
      icon: <PlusCircleFilled />,
      node: (
        <>
          <Text strong>ลงทะเบียน</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {thaiDateTime(unit.registeredAt)} · SN {unit.manufacturerSn ? 'จากผู้ผลิต' : 'ระบบสร้าง'}
            {unit.replacesSn && <> · ทดแทน {unit.replacesSn}</>}
          </Text>
        </>
      ),
    },
    ...unitLogs.map((l) => ({
      key: `l${l.id}`,
      time: l.time,
      color: l.isReprint ? 'orange' : 'blue',
      icon: l.isReprint ? <RedoOutlined /> : <CheckCircleFilled />,
      node: (
        <>
          <Text strong>{l.isReprint ? 'พิมพ์ซ้ำ (ชำรุด)' : 'Sterilize & พิมพ์'}</Text>{' '}
          <Tag color={l.isReprint ? 'warning' : 'blue'} style={{ marginLeft: 4 }}>
            รอบ {l.round}/{l.maxRound}
          </Tag>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {thaiDateTime(l.time)} · หมดอายุ {thaiDate(l.exp)}
          </Text>
        </>
      ),
    })),
  ];
  if (unit.disposedAt) {
    events.push({
      key: 'dis',
      time: unit.disposedAt,
      color: 'red',
      icon: <DeleteFilled />,
      node: (
        <>
          <Text strong type="danger">
            ทำลาย
          </Text>{' '}
          <Text type="secondary">— {DISPOSE_REASON_LABEL[unit.disposeReason ?? 'other']}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {thaiDateTime(unit.disposedAt)}
            {unit.disposeNote && <> · {unit.disposeNote}</>}
          </Text>
        </>
      ),
    });
  }

  if (!events.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Timeline
      style={{ marginTop: 8 }}
      items={events.reverse().map((e) => ({ key: e.key, color: e.color, icon: e.icon, content: e.node }))}
    />
  );
}
