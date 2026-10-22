'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  PrinterOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Card, Col, Empty, Flex, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState, type ReactNode } from 'react';
import { ColumnChart, INK, Meter, SERIES, ShareBar } from '@/components/DashCharts';
import type { Dayjs } from 'dayjs';
import { PeriodPicker, rangeOf, type Period } from '@/components/PeriodPicker';
import { dayjs, thaiDate, thaiDateTime, todayISO, addDays } from '@/lib/date';
import { useStore, type UnitInfo } from '@/lib/store';
import { DISPOSE_REASON_LABEL, type DisposeReason } from '@/lib/types';

const { Text } = Typography;

const REASONS: DisposeReason[] = ['max_round', 'damaged', 'worn', 'lost', 'other'];
/** สีของสาเหตุ — ครบรอบ = น้ำเงิน (ปกติ), ก่อนกำหนด = สีอื่นตามลำดับ */
const REASON_COLOR: Record<DisposeReason, string> = {
  max_round: SERIES[0],
  damaged: SERIES[1],
  worn: SERIES[2],
  lost: SERIES[3],
  other: SERIES[4],
};
const CRITICAL = '#d03b3b';
const WARNING = '#d97706';

interface DisposedRow {
  info: UnitInfo;
  reason: DisposeReason;
  date: string;
}

export default function DashboardPage() {
  const { units, items, logs, getUnitInfo } = useStore();
  const [period, setPeriod] = useState<Period>('month');
  const [ref, setRef] = useState<Dayjs>(() => dayjs());
  const [itemId, setItemId] = useState<number | undefined>();
  const [reason, setReason] = useState<string | null>(null);

  const today = todayISO();
  const soon = addDays(today, 7);
  const range = rangeOf(period, ref);
  const start = range?.start ?? null;
  const end = range?.end ?? null;
  const inPeriod = (stamp?: string) => {
    if (!stamp) return false;
    const d0 = stamp.slice(0, 10);
    return (!start || d0 >= start) && (!end || d0 <= end);
  };
  const periodLabel = range ? range.label.replace(/ \(.*\)$/, '') : 'ทั้งหมด';
  const rangeText = range ? `${thaiDate(range.start)} – ${thaiDate(range.end)}` : 'ข้อมูลทั้งหมด';

  const all = useMemo(
    () => units.filter((u) => !itemId || u.itemId === itemId).map(getUnitInfo),
    [units, itemId, getUnitInfo],
  );

  const d = useMemo(() => {
    const live = all.filter((i) => i.status !== 'disposed');
    const ready = live.filter((i) => i.status === 'new' || i.status === 'active');
    const waiting = live.filter((i) => i.status === 'last');
    // สติ๊กเกอร์ดวงล่าสุดหมดอายุ / ใกล้หมดอายุ (ชิ้นที่ยังไม่ถูกทำลาย)
    const expired = live.filter((i) => i.lastLog && i.lastLog.exp < today);
    const expSoon = live.filter((i) => i.lastLog && i.lastLog.exp >= today && i.lastLog.exp <= soon);

    const disposed: DisposedRow[] = all
      .filter((i) => i.unit.disposedAt && inPeriod(i.unit.disposedAt))
      .map((i) => ({ info: i, reason: i.unit.disposeReason ?? 'other', date: i.unit.disposedAt! }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const byReason = Object.fromEntries(REASONS.map((r) => [r, 0])) as Record<DisposeReason, number>;
    disposed.forEach((x) => byReason[x.reason]++);
    const early = disposed.length - byReason.max_round;

    const periodLogs = logs.filter((l) => (!itemId || l.itemId === itemId) && inPeriod(l.time));
    const prints = periodLogs.filter((l) => !l.isReprint).length;
    const reprints = periodLogs.length - prints;

    return { live, ready, waiting, expired, expSoon, disposed, byReason, early, prints, reprints };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, logs, itemId, start, end, today, soon]);

  // ===== แนวโน้มตามช่วงเวลาที่เลือก (ผลรวมทุกแท่ง = ตัวเลขด้านบน) =====
  const trend = useMemo(() => {
    const now = dayjs();
    // จุดเริ่ม: ตามช่วงที่เลือก / "ทั้งหมด" = ข้อมูลแรกสุด · จุดจบ: ไม่เกินวันนี้
    let from = start ? dayjs(start) : now;
    if (!start) {
      const first = [...logs.map((l) => l.time), ...all.map((i) => i.unit.disposedAt ?? '')].filter(Boolean).sort()[0];
      from = first ? dayjs(first.slice(0, 10)) : now;
    }
    const to = end && dayjs(end).isBefore(now, 'day') ? dayjs(end) : now;
    type Gran = 'hour' | 'day' | 'month';
    const gran: Gran = period === 'day' ? 'hour' : period === 'month' ? 'day' : 'month';
    const buckets: { key: string; label: string; full: string }[] = [];
    if (gran === 'hour') {
      for (let h = 0; h < 24; h++) {
        const k = String(h).padStart(2, '0');
        buckets.push({ key: k, label: h % 3 === 0 ? `${k}:00` : '', full: `${k}:00–${k}:59 น.` });
      }
    } else if (gran === 'day') {
      for (let d0 = from.startOf('day'); !d0.isAfter(to, 'day'); d0 = d0.add(1, 'day'))
        buckets.push({ key: d0.format('YYYY-MM-DD'), label: d0.format('D'), full: thaiDate(d0.format('YYYY-MM-DD')) });
    } else {
      for (let d0 = from.startOf('month'); !d0.isAfter(to, 'month'); d0 = d0.add(1, 'month'))
        buckets.push({ key: d0.format('YYYY-MM'), label: d0.format('MMM BB'), full: d0.format('MMMM BBBB') });
    }
    const keyOf = (stamp: string) => (gran === 'hour' ? stamp.slice(11, 13) : gran === 'day' ? stamp.slice(0, 10) : stamp.slice(0, 7));
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const prints = buckets.map(() => [0, 0]);
    const disposals = buckets.map(() => [0, 0]);
    logs.forEach((l) => {
      if ((itemId && l.itemId !== itemId) || !inPeriod(l.time)) return;
      const i = idx.get(keyOf(l.time));
      if (i != null) prints[i][l.isReprint ? 1 : 0]++;
    });
    d.disposed.forEach((x) => {
      const i = idx.get(keyOf(x.date));
      if (i != null) disposals[i][x.reason === 'max_round' ? 0 : 1]++;
    });
    const granLabel = gran === 'hour' ? 'รายชั่วโมง' : gran === 'day' ? 'รายวัน' : 'รายเดือน';
    // รายวันมีหลายแท่ง — แสดงป้ายวันที่ห่าง ๆ ไม่ให้ทับกัน
    const every = gran === 'hour' ? 1 : buckets.length > 16 ? Math.ceil(buckets.length / 10) : 1;
    return {
      granLabel,
      prints: buckets.map((b, i) => ({ label: i % every === 0 ? b.label : '', full: b.full, values: prints[i] })),
      disposals: buckets.map((b, i) => ({ label: i % every === 0 ? b.label : '', full: b.full, values: disposals[i] })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, all, itemId, start, end, period, d.disposed]);

  // ===== แยกตามรายการอุปกรณ์ =====
  const perItem = useMemo(() => {
    return items
      .filter((it) => !itemId || it.id === itemId)
      .map((it) => {
        const mine = all.filter((i) => i.unit.itemId === it.id);
        const disp = d.disposed.filter((x) => x.info.unit.itemId === it.id);
        const full = disp.filter((x) => x.reason === 'max_round').length;
        const early = disp.length - full;
        const earlyRows = disp.filter((x) => x.reason !== 'max_round');
        const prints = logs.filter((l) => l.itemId === it.id && !l.isReprint && inPeriod(l.time)).length;
        const avgEarly = earlyRows.length ? earlyRows.reduce((a, x) => a + x.info.used, 0) / earlyRows.length : null;
        return {
          id: it.id,
          name: it.name,
          maxRound: it.maxRound,
          ready: mine.filter((i) => i.status === 'new' || i.status === 'active').length,
          waiting: mine.filter((i) => i.status === 'last').length,
          expired: mine.filter((i) => i.status !== 'disposed' && i.lastLog && i.lastLog.exp < today).length,
          prints,
          full,
          early,
          earlyRate: disp.length ? early / disp.length : 0,
          avgEarly,
        };
      })
      .sort((a, b) => b.prints - a.prints || b.full + b.early - (a.full + a.early) || a.name.localeCompare(b.name, 'th'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, all, logs, d.disposed, itemId, today, start, end]);

  const shownDisposed = reason ? d.disposed.filter((x) => x.reason === reason) : d.disposed;

  return (
    <Flex vertical gap={20}>
      {/* ===== ตัวกรอง (แถวเดียว ด้านบน) ===== */}
      <Card styles={{ body: { padding: '12px 16px' } }}>
        <Flex wrap gap={12} align="center">
          <FilterOutlined style={{ color: INK.muted }} />
          <PeriodPicker period={period} value={ref} onChange={(p, r) => (setPeriod(p), setRef(r), setReason(null))} />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="ทุกรายการอุปกรณ์"
            style={{ width: 220 }}
            value={itemId}
            onChange={(v) => (setItemId(v), setReason(null))}
            options={items.map((i) => ({ value: i.id, label: i.name }))}
          />
          <Text type="secondary" style={{ marginLeft: 'auto', fontSize: 12 }}>
            {rangeText}
          </Text>
        </Flex>
      </Card>

      {/* ================= ส่วนที่ 1: ตามช่วงเวลาที่เลือก ================= */}
      <SectionTitle title={`ในช่วง ${periodLabel}`} sub={`${rangeText}${itemId ? ` · ${items.find((i) => i.id === itemId)?.name}` : ''} — ตัวเลขทั้งหมดในส่วนนี้เปลี่ยนตามตัวกรอง`} />
      <Row gutter={[16, 16]}>
        <Tile
          span={8}
          label="พิมพ์สติ๊กเกอร์ (= sterilize)"
          value={d.prints}
          unit="ดวง"
          icon={<PrinterOutlined style={{ color: '#2563eb' }} />}
          sub={`พิมพ์ซ้ำเพราะสติ๊กเกอร์ชำรุดอีก ${d.reprints} ดวง`}
        />
        <Tile
          span={8}
          label="ทำลาย — ใช้ครบตามรอบ"
          value={d.byReason.max_round}
          unit="ชิ้น"
          icon={<CheckCircleOutlined style={{ color: SERIES[0] }} />}
          sub={d.disposed.length ? `${Math.round((d.byReason.max_round / d.disposed.length) * 100)}% ของที่ทำลายทั้งหมด ${d.disposed.length} ชิ้น` : 'ยังไม่มีการทำลาย'}
        />
        <Tile
          span={8}
          label="ทำลาย — ก่อนครบรอบ"
          value={d.early}
          unit="ชิ้น"
          icon={<DeleteOutlined style={{ color: SERIES[1] }} />}
          sub={`ชำรุด ${d.byReason.damaged} · เสื่อมสภาพ ${d.byReason.worn} · สูญหาย ${d.byReason.lost} · อื่น ๆ ${d.byReason.other}`}
        />
      </Row>

      {/* ===== สาเหตุการทำลาย + รายการ ===== */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title={`สาเหตุการทำลาย (${periodLabel})`} style={{ height: '100%' }}>
            <ShareBar
              unit="ชิ้น"
              selected={reason}
              onSelect={setReason}
              empty={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ยังไม่มีการทำลายในช่วงนี้" />}
              segments={REASONS.map((r) => ({
                key: r,
                label: DISPOSE_REASON_LABEL[r],
                value: d.byReason[r],
                color: REASON_COLOR[r],
                hint: r === 'max_round' ? 'ใช้งานครบตามจำนวนรอบ (ปกติ)' : 'ทำลายก่อนครบรอบ',
              }))}
            />
            {d.disposed.length > 0 && (
              <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
                กดที่สาเหตุเพื่อดูว่ามีชิ้นไหนบ้าง
              </Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                {reason ? DISPOSE_REASON_LABEL[reason as DisposeReason] : 'ทำลายทั้งหมด'}
                <Tag style={{ marginInlineEnd: 0 }}>{shownDisposed.length} ชิ้น</Tag>
              </Space>
            }
            extra={reason && <a onClick={() => setReason(null)}>ดูทุกสาเหตุ</a>}
            styles={{ body: { padding: 0 } }}
            style={{ height: '100%' }}
          >
            <Table<DisposedRow>
              size="small"
              rowKey={(r) => r.info.unit.id}
              dataSource={shownDisposed}
              pagination={{ pageSize: 6, hideOnSinglePage: true, size: 'small', showSizeChanger: false }}
              scroll={{ x: 560 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ไม่มีรายการ" /> }}
              columns={disposedColumns(!reason)}
            />
          </Card>
        </Col>
      </Row>

      {/* ===== แนวโน้มตามช่วงเวลา ===== */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={`พิมพ์สติ๊กเกอร์${trend.granLabel}`} extra={<Text type="secondary">{periodLabel}</Text>}>
            <ColumnChart
              unit="ดวง"
              data={trend.prints}
              series={[
                { name: 'พิมพ์ปกติ', color: SERIES[0] },
                { name: 'พิมพ์ซ้ำ (ชำรุด)', color: SERIES[1] },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={`ทำลาย${trend.granLabel}`} extra={<Text type="secondary">{periodLabel}</Text>}>
            <ColumnChart
              unit="ชิ้น"
              data={trend.disposals}
              series={[
                { name: 'ครบรอบ', color: SERIES[0] },
                { name: 'ก่อนกำหนด (ชำรุด/เสื่อม/สูญหาย/อื่น ๆ)', color: SERIES[1] },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* ===== แยกตามรายการอุปกรณ์ (ตามช่วงเวลา) ===== */}
      <Card title={`แยกตามรายการอุปกรณ์ — ${periodLabel}`} styles={{ body: { padding: 0 } }}>
        <Table
          size="middle"
          rowKey="id"
          dataSource={perItem}
          pagination={false}
          scroll={{ x: 760 }}
          columns={[
            {
              title: 'รายการอุปกรณ์',
              dataIndex: 'name',
              width: 170,
              fixed: 'left',
              render: (v: string) => <Text strong>{v}</Text>,
            },
            {
              title: 'พิมพ์ (ดวง)',
              dataIndex: 'prints',
              width: 100,
              align: 'right',
              render: (v: number) => (v ? v.toLocaleString() : <Text type="secondary">0</Text>),
            },
            {
              title: 'ทำลาย ครบรอบ',
              dataIndex: 'full',
              width: 110,
              align: 'right',
              render: (v: number) => (v ? v : <Text type="secondary">0</Text>),
            },
            {
              title: 'ทำลาย ก่อนกำหนด',
              dataIndex: 'early',
              width: 120,
              align: 'right',
              render: (v: number) => (v ? <Text strong>{v}</Text> : <Text type="secondary">0</Text>),
            },
            {
              title: (
                <Tooltip title="สัดส่วนชิ้นที่ทำลายก่อนครบรอบ จากที่ทำลายทั้งหมดในช่วงนี้ — ยิ่งสูงยิ่งควรตรวจสอบวิธีใช้/การจัดเก็บ">
                  % ก่อนกำหนด
                </Tooltip>
              ),
              dataIndex: 'earlyRate',
              width: 140,
              render: (v: number, r) =>
                r.full + r.early ? (
                  <Flex align="center" gap={8}>
                    <Meter value={v} color={v >= 0.3 ? CRITICAL : SERIES[1]} track={v >= 0.3 ? '#fbe3e3' : '#fde4d8'} width={60} />
                    <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(v * 100)}%</Text>
                  </Flex>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
            {
              title: (
                <Tooltip title="ชิ้นที่ทำลายก่อนกำหนดในช่วงนี้ ใช้ไปเฉลี่ยกี่รอบก่อนเสีย">ใช้ได้เฉลี่ยก่อนเสีย</Tooltip>
              ),
              dataIndex: 'avgEarly',
              width: 140,
              render: (v: number | null, r) =>
                v == null ? <Text type="secondary">—</Text> : `${v.toFixed(1)} / ${r.maxRound} รอบ`,
            },
          ]}
        />
      </Card>

      {/* ================= ส่วนที่ 2: สถานะ ณ วันนี้ ================= */}
      <SectionTitle
        title="สถานะ ณ วันนี้"
        sub={`ภาพรวมของอุปกรณ์ที่มีอยู่ตอนนี้${itemId ? ` (${items.find((i) => i.id === itemId)?.name})` : ''} — ไม่ขึ้นกับช่วงเวลา`}
      />
      <Row gutter={[16, 16]}>
        <Tile
          span={8}
          label="พร้อมใช้งาน"
          value={d.ready.length}
          unit="ชิ้น"
          icon={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
          sub={`จากที่ยังไม่ทำลาย ${d.live.length} ชิ้น`}
        />
        <Tile
          span={8}
          label="ครบรอบ — รอทำลาย"
          value={d.waiting.length}
          unit="ชิ้น"
          icon={<ExclamationCircleOutlined style={{ color: CRITICAL }} />}
          sub={d.waiting.length ? 'ต้องทำลายและเปลี่ยนชิ้นใหม่' : 'ไม่มีค้าง'}
          alert={d.waiting.length > 0 ? CRITICAL : undefined}
        />
        <Tile
          span={8}
          label="สติ๊กเกอร์หมดอายุ"
          value={d.expired.length}
          unit="ชิ้น"
          icon={<WarningOutlined style={{ color: WARNING }} />}
          sub={`ต้อง sterilize ใหม่ก่อนใช้ · ใกล้หมดใน 7 วัน ${d.expSoon.length} ชิ้น`}
          alert={d.expired.length > 0 ? WARNING : undefined}
        />
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <ActionList
            title="สติ๊กเกอร์หมดอายุ / ใกล้หมดอายุ (7 วัน)"
            icon={<ClockCircleOutlined style={{ color: WARNING }} />}
            rows={[...d.expired, ...d.expSoon].sort((x, y) => x.lastLog!.exp.localeCompare(y.lastLog!.exp))}
            empty="ไม่มีสติ๊กเกอร์หมดอายุ"
            right={(i) => (
              <Tag color={i.lastLog!.exp < today ? 'error' : 'warning'} style={{ marginInlineEnd: 0 }}>
                หมด {thaiDate(i.lastLog!.exp)}
              </Tag>
            )}
          />
        </Col>
        <Col xs={24} lg={12}>
          <ActionList
            title="ครบรอบ — รอทำลาย"
            icon={<ExclamationCircleOutlined style={{ color: CRITICAL }} />}
            rows={d.waiting}
            empty="ไม่มีชิ้นที่รอทำลาย"
            right={(i) => <Text type="secondary">พิมพ์ล่าสุด {i.lastLog ? thaiDate(i.lastLog.time.slice(0, 10)) : '—'}</Text>}
          />
        </Col>
      </Row>
    </Flex>
  );
}

function disposedColumns(showReason: boolean): ColumnsType<DisposedRow> {
  return [
    {
      title: 'SN',
      width: 140,
      render: (_, r) => <Text code>{r.info.unit.sn}</Text>,
    },
    { title: 'อุปกรณ์', ellipsis: true, render: (_, r) => r.info.item?.name ?? '(รายการถูกลบ)' },
    {
      title: 'ใช้ไป',
      width: 80,
      render: (_, r) => (
        <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
          {r.info.used}/{r.info.unit.maxRound}
        </Text>
      ),
    },
    ...(showReason
      ? [
          {
            title: 'สาเหตุ',
            width: 130,
            render: (_: unknown, r: DisposedRow) => (
              <Flex align="center" gap={6}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: REASON_COLOR[r.reason], flex: 'none' }} />
                {DISPOSE_REASON_LABEL[r.reason]}
              </Flex>
            ),
          },
        ]
      : []),
    {
      title: 'วันที่ / หมายเหตุ',
      width: 200,
      render: (_, r) => (
        <div style={{ lineHeight: 1.3 }}>
          <Text style={{ fontSize: 12 }}>{thaiDateTime(r.date)}</Text>
          {r.info.unit.disposeNote && (
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }} ellipsis={{ tooltip: r.info.unit.disposeNote }}>
              {r.info.unit.disposeNote}
            </Text>
          )}
        </div>
      ),
    },
  ];
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginTop: 8, marginBottom: -4 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {sub}
      </Text>
    </div>
  );
}

function Tile({
  span = 8,
  label,
  value,
  unit,
  icon,
  sub,
  alert,
}: {
  span?: number;
  label: string;
  value: number;
  unit: string;
  icon: ReactNode;
  sub: string;
  alert?: string;
}) {
  const card = (
    <Card style={{ height: '100%', borderColor: alert }} styles={{ body: { padding: 18 } }}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {label}
      </Text>
      <Flex align="baseline" gap={8} style={{ margin: '6px 0 4px' }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1, color: INK.primary }}>{value.toLocaleString()}</span>
        <Text type="secondary">{unit}</Text>
      </Flex>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {sub}
      </Text>
    </Card>
  );
  return (
    <Col xs={24} sm={12} md={span}>
      {card}
    </Col>
  );
}

function ActionList({
  title,
  icon,
  rows,
  empty,
  right,
}: {
  title: string;
  icon: ReactNode;
  rows: UnitInfo[];
  empty: string;
  right: (i: UnitInfo) => ReactNode;
}) {
  return (
    <Card
      title={
        <Space>
          {icon}
          {title}
          <Tag style={{ marginInlineEnd: 0 }}>{rows.length}</Tag>
        </Space>
      }
      style={{ height: '100%' }}
      styles={{ body: { padding: rows.length ? '4px 0' : undefined, maxHeight: 320, overflowY: 'auto' } }}
    >
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
      ) : (
        rows.map((i) => (
          <Flex key={i.unit.id} align="center" gap={10} style={{ padding: '8px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <Text code style={{ flex: 'none' }}>
              {i.unit.sn}
            </Text>
            <Text ellipsis style={{ flex: 1, minWidth: 0 }}>
              {i.item?.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
              {i.used}/{i.unit.maxRound}
            </Text>
            <span style={{ flex: 'none' }}>{right(i)}</span>
          </Flex>
        ))
      )}
    </Card>
  );
}
