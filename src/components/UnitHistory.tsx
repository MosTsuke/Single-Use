'use client';

import { CheckCircleFilled, DeleteFilled, PlusCircleFilled, RedoOutlined, RollbackOutlined } from '@ant-design/icons';
import { Empty, Tag, Timeline, Typography } from 'antd';
import { thaiDate, thaiDateTime } from '@/lib/date';
import { useStore } from '@/lib/store';
import { DISPOSE_REASON_LABEL, type Unit } from '@/lib/types';

const { Text } = Typography;

/** ไทม์ไลน์ของอุปกรณ์ 1 ชิ้น: ลงทะเบียน → sterilize แต่ละรอบ → ทำลาย (ล่าสุดอยู่บน) */
export default function UnitHistory({ unit }: { unit: Unit }) {
  const { allLogs } = useStore();
  // แสดงทุกดวง รวมดวงที่ถูกยกเลิก (ขีดฆ่า) เพื่อให้ตรวจย้อนหลังได้
  const unitLogs = allLogs.filter((l) => l.unitId === unit.id);

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
      color: l.voidedAt ? 'gray' : l.isReprint ? 'orange' : 'blue',
      icon: l.isReprint ? <RedoOutlined /> : <CheckCircleFilled />,
      node: (
        <div style={l.voidedAt ? { opacity: 0.6 } : undefined}>
          <Text strong delete={!!l.voidedAt}>
            {l.isReprint ? 'พิมพ์ซ้ำ (ชำรุด)' : 'พิมพ์สติ๊กเกอร์'}
          </Text>{' '}
          <Tag color={l.voidedAt ? 'default' : l.isReprint ? 'warning' : 'blue'} style={{ marginLeft: 4 }}>
            รอบ {l.round}/{l.maxRound}
          </Tag>
          {l.voidedAt && (
            <Tag color="error" style={{ marginLeft: 0 }}>
              ยกเลิกแล้ว
            </Tag>
          )}
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            พิมพ์เมื่อ {thaiDateTime(l.time)}
            {l.staffName && <> · โดย {l.staffName}</>}
          </Text>
          <br />
          <Text style={{ fontSize: 12 }}>
            วันผลิต <Text strong style={{ fontSize: 12 }}>{thaiDate(l.mfg)}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}> · </Text>
            หมดอายุ <Text strong style={{ fontSize: 12 }}>{thaiDate(l.exp)}</Text>
          </Text>
          {l.skippedFrom != null && (
            <>
              <br />
              <Text type="warning" style={{ fontSize: 12 }}>
                ข้ามจากรอบ {l.skippedFrom} → {l.round}
                {l.note && <> · {l.note}</>}
              </Text>
            </>
          )}
        </div>
      ),
    })),
    // เหตุการณ์ "ยกเลิกการพิมพ์" แยกเป็นอีกรายการ ณ เวลาที่ยกเลิก (เฉพาะใบหลัก)
    ...unitLogs
      .filter((l) => l.voidedAt && !l.isReprint)
      .map((l) => ({
        key: `v${l.id}`,
        time: l.voidedAt!,
        color: 'red',
        icon: <RollbackOutlined />,
        node: (
          <>
            <Text strong type="danger">
              ยกเลิกการพิมพ์
            </Text>{' '}
            <Tag style={{ marginLeft: 4 }}>
              รอบ {l.round}/{l.maxRound}
            </Tag>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {thaiDateTime(l.voidedAt)}
              {l.voidBy && <> · โดย {l.voidBy}</>} · รอบกลับเป็น {l.skippedFrom != null ? l.skippedFrom - 1 : l.round - 1}/{l.maxRound}
            </Text>
            {l.voidReason && (
              <>
                <br />
                <Text style={{ fontSize: 12 }}>เหตุผล: {l.voidReason}</Text>
              </>
            )}
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
      // เรียงตามเวลา (ล่าสุดอยู่บน)
      items={[...events].sort((a, b) => a.time.localeCompare(b.time)).reverse().map((e) => ({ key: e.key, color: e.color, icon: e.icon, content: e.node }))}
    />
  );
}
