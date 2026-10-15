'use client';

import {
  AppstoreOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  PlusCircleOutlined,
  PrinterOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import DisposeModal from '@/components/DisposeModal';
import RegisterUnitModal from '@/components/RegisterUnitModal';
import { CycleBar, StatusTag } from '@/components/UnitBits';
import UnitHistory from '@/components/UnitHistory';
import { thaiDate, thaiDateTime, todayISO } from '@/lib/date';
import { useStore, type UnitInfo } from '@/lib/store';
import { DISPOSE_REASON_LABEL, type Unit, type UnitStatus } from '@/lib/types';

type StatusFilter = 'all' | 'usable' | UnitStatus;
const { Text } = Typography;

export default function UnitsPage() {
  const { units, items, getUnitInfo } = useStore();
  const [status, setStatus] = useState<StatusFilter>('usable');
  const [itemFilter, setItemFilter] = useState<number | undefined>();
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState<Unit | null>(null);
  const [disposing, setDisposing] = useState<Unit | null>(null);
  const [register, setRegister] = useState<{ replaces?: Unit } | null>(null);

  const all = useMemo(() => units.map(getUnitInfo), [units, getUnitInfo]);

  const counts = useMemo(() => {
    const c = { new: 0, active: 0, last: 0, disposed: 0 } as Record<UnitStatus, number>;
    all.forEach((i) => c[i.status]++);
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all
      .filter((i) => {
        if (status === 'usable' && !(i.status === 'new' || i.status === 'active')) return false;
        if (status !== 'all' && status !== 'usable' && i.status !== status) return false;
        if (itemFilter && i.unit.itemId !== itemFilter) return false;
        if (kw && !i.unit.sn.toLowerCase().includes(kw)) return false;
        return true;
      })
      .reverse();
  }, [all, status, itemFilter, q]);

  const viewingInfo = viewing ? getUnitInfo(units.find((u) => u.id === viewing.id) ?? viewing) : null;
  const today = todayISO();

  const columns: ColumnsType<UnitInfo> = [
    {
      title: 'SN',
      key: 'sn',
      width: 160,
      sorter: (a, b) => a.unit.sn.localeCompare(b.unit.sn),
      render: (_, r) => (
        <a onClick={() => setViewing(r.unit)}>
          <Text code copyable={{ text: r.unit.sn }}>
            {r.unit.sn}
          </Text>
        </a>
      ),
    },
    {
      title: 'ประเภท',
      key: 'type',
      ellipsis: true,
      render: (_, r) => r.item?.name ?? <Text type="secondary">(ประเภทถูกลบ)</Text>,
    },
    {
      title: 'ใช้ไปแล้ว',
      key: 'used',
      width: 170,
      sorter: (a, b) => a.used / a.unit.maxRound - b.used / b.unit.maxRound,
      render: (_, r) => <CycleBar used={r.used} max={r.unit.maxRound} />,
    },
    {
      title: 'สถานะ',
      key: 'status',
      width: 160,
      render: (_, r) => <StatusTag status={r.status} />,
    },
    {
      title: 'Sterilize ล่าสุด / หมดอายุ',
      key: 'last',
      width: 230,
      render: (_, r) =>
        r.lastLog ? (
          <Space orientation="vertical" size={0}>
            <Text>{thaiDateTime(r.lastLog.time)}</Text>
            <Text type={r.lastLog.exp < today && r.status !== 'disposed' ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
              หมดอายุ {thaiDate(r.lastLog.exp)}
              {r.lastLog.exp < today && r.status !== 'disposed' && ' (เลยกำหนด)'}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: '',
      key: 'act',
      width: 140,
      align: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="ประวัติ">
            <Button type="text" icon={<HistoryOutlined />} onClick={() => setViewing(r.unit)} />
          </Tooltip>
          {r.nextRound != null && (
            <Tooltip title="Sterilize & พิมพ์">
              <Link href={`/print?sn=${encodeURIComponent(r.unit.sn)}`}>
                <Button type="text" icon={<PrinterOutlined />} />
              </Link>
            </Tooltip>
          )}
          {r.status !== 'disposed' && (
            <Tooltip title="บันทึกทำลาย">
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setDisposing(r.unit)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const statCard = (title: string, value: number, icon: React.ReactNode, filter: StatusFilter, color: string) => (
    <Card
      hoverable
      onClick={() => setStatus(filter)}
      style={{ borderColor: status === filter ? color : undefined }}
    >
      <Statistic title={title} value={value} suffix="ชิ้น" prefix={<span style={{ color }}>{icon}</span>} />
    </Card>
  );

  return (
    <Flex vertical gap={20}>
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          {statCard('พร้อมใช้งาน', counts.new + counts.active, <CheckCircleOutlined />, 'usable', '#16a34a')}
        </Col>
        <Col xs={12} lg={6}>
          {statCard('ครบรอบ — รอทำลาย', counts.last, <ExclamationCircleOutlined />, 'last', '#ef4444')}
        </Col>
        <Col xs={12} lg={6}>
          {statCard('ทำลายแล้ว', counts.disposed, <StopOutlined />, 'disposed', '#64748b')}
        </Col>
        <Col xs={12} lg={6}>
          {statCard('ทั้งหมด', units.length, <AppstoreOutlined />, 'all', '#2563eb')}
        </Col>
      </Row>

      <Card
        title="อุปกรณ์รายชิ้น"
        extra={
          <Button type="primary" icon={<PlusCircleOutlined />} onClick={() => setRegister({})}>
            ลงทะเบียนอุปกรณ์
          </Button>
        }
      >
        <Flex wrap gap={8} style={{ marginBottom: 16 }}>
          <Segmented<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[
              { value: 'usable', label: 'พร้อมใช้' },
              { value: 'last', label: 'รอทำลาย' },
              { value: 'disposed', label: 'ทำลายแล้ว' },
              { value: 'all', label: 'ทั้งหมด' },
            ]}
          />
          <Select
            allowClear
            placeholder="ทุกประเภท"
            style={{ width: 200 }}
            value={itemFilter}
            onChange={setItemFilter}
            options={items.map((i) => ({ value: i.id, label: i.name }))}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="ค้นหา SN"
            style={{ width: 200 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Flex>
        <Table
          rowKey={(r) => r.unit.id}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} ชิ้น` }}
          locale={{
            emptyText: (
              <Empty description="ไม่มีอุปกรณ์ในกลุ่มนี้">
                <Button type="primary" icon={<PlusCircleOutlined />} onClick={() => setRegister({})}>
                  ลงทะเบียนอุปกรณ์
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        size={480}
        title={
          viewingInfo && (
            <Space>
              <Text code>{viewingInfo.unit.sn}</Text>
              <StatusTag status={viewingInfo.status} />
            </Space>
          )
        }
        extra={
          viewingInfo?.nextRound != null && (
            <Link href={`/print?sn=${encodeURIComponent(viewingInfo.unit.sn)}`}>
              <Button type="primary" icon={<PrinterOutlined />}>
                Sterilize
              </Button>
            </Link>
          )
        }
      >
        {viewingInfo && (
          <>
            <Descriptions
              column={1}
              size="small"
              bordered
              items={[
                { key: 't', label: 'ประเภท', children: viewingInfo.item?.name ?? '(ประเภทถูกลบ)' },
                { key: 'u', label: 'ใช้ไปแล้ว', children: <CycleBar used={viewingInfo.used} max={viewingInfo.unit.maxRound} /> },
                { key: 's', label: 'ที่มาของ SN', children: viewingInfo.unit.manufacturerSn ? 'ผู้ผลิต' : 'ระบบสร้าง' },
                { key: 'r', label: 'ลงทะเบียน', children: thaiDateTime(viewingInfo.unit.registeredAt) },
                ...(viewingInfo.unit.replacesSn
                  ? [{ key: 'rp', label: 'ทดแทนชิ้น', children: <Text code>{viewingInfo.unit.replacesSn}</Text> }]
                  : []),
                ...(viewingInfo.unit.disposedAt
                  ? [
                      {
                        key: 'd',
                        label: 'ทำลาย',
                        children: `${thaiDateTime(viewingInfo.unit.disposedAt)} — ${DISPOSE_REASON_LABEL[viewingInfo.unit.disposeReason ?? 'other']}`,
                      },
                    ]
                  : []),
              ]}
            />
            <Typography.Title level={5} style={{ marginTop: 24 }}>
              ประวัติ
            </Typography.Title>
            <UnitHistory unit={viewingInfo.unit} />
            {viewingInfo.status !== 'disposed' && (
              <Button danger block icon={<DeleteOutlined />} onClick={() => setDisposing(viewingInfo.unit)}>
                บันทึกทำลาย
              </Button>
            )}
          </>
        )}
      </Drawer>

      <DisposeModal
        unit={disposing}
        onClose={() => setDisposing(null)}
        onDisposed={(u, replace) => replace && setRegister({ replaces: u })}
      />
      <RegisterUnitModal open={!!register} onClose={() => setRegister(null)} replaces={register?.replaces} />
    </Flex>
  );
}
