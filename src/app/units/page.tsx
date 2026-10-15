'use client';

import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlusCircleOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Flex, Input, Row, Segmented, Select, Statistic } from 'antd';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import RegisterUnitModal from '@/components/RegisterUnitModal';
import UnitTable from '@/components/UnitTable';
import { useStore } from '@/lib/store';
import type { UnitStatus } from '@/lib/types';

type StatusFilter = 'all' | 'usable' | UnitStatus;
const STATUS_VALUES: StatusFilter[] = ['all', 'usable', 'last', 'disposed'];

export default function UnitsPage() {
  return (
    <Suspense>
      <UnitsView />
    </Suspense>
  );
}

function UnitsView() {
  const { units, items, getUnitInfo } = useStore();
  const params = useSearchParams();
  // เปิดจากหน้ารายการอุปกรณ์ด้วย ?item=<id>&status=<usable|last|disposed|all>
  const [status, setStatus] = useState<StatusFilter>(() => {
    const s = params.get('status') as StatusFilter | null;
    return s && STATUS_VALUES.includes(s) ? s : 'usable';
  });
  const [itemFilter, setItemFilter] = useState<number | undefined>(() => {
    const id = Number(params.get('item'));
    return id > 0 ? id : undefined;
  });
  const [q, setQ] = useState('');
  const [register, setRegister] = useState(false);

  const all = useMemo(() => units.map(getUnitInfo), [units, getUnitInfo]);

  const counts = useMemo(() => {
    // นับตามรายการที่เลือก (ถ้าเลือก) ให้ตัวเลขบนการ์ดตรงกับตาราง
    const c = { new: 0, active: 0, last: 0, disposed: 0 } as Record<UnitStatus, number>;
    all.forEach((i) => (!itemFilter || i.unit.itemId === itemFilter) && c[i.status]++);
    return c;
  }, [all, itemFilter]);

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
          {statCard('ทั้งหมด', counts.new + counts.active + counts.last + counts.disposed, <AppstoreOutlined />, 'all', '#2563eb')}
        </Col>
      </Row>

      <Card
        title="อุปกรณ์รายชิ้น"
        extra={
          <Button type="primary" icon={<PlusCircleOutlined />} onClick={() => setRegister(true)}>
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
            placeholder="ทุกรายการ"
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
        <UnitTable
          rows={rows}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} ชิ้น` }}
          emptyText={
            <Empty description="ไม่มีอุปกรณ์ในกลุ่มนี้">
              <Button type="primary" icon={<PlusCircleOutlined />} onClick={() => setRegister(true)}>
                ลงทะเบียนอุปกรณ์
              </Button>
            </Empty>
          }
        />
      </Card>

      <RegisterUnitModal open={register} onClose={() => setRegister(false)} defaultItemId={itemFilter} />
    </Flex>
  );
}
