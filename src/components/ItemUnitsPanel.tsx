'use client';

import { ArrowRightOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { Button, Empty, Flex, Segmented, Space } from 'antd';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import RegisterUnitModal from '@/components/RegisterUnitModal';
import UnitTable from '@/components/UnitTable';
import { useStore } from '@/lib/store';
import type { MasterItem } from '@/lib/types';

type Filter = 'live' | 'usable' | 'last' | 'disposed' | 'all';

/** อุปกรณ์รายชิ้น (SN) ของรายการอุปกรณ์ 1 รายการ — แสดงตอนกางแถวในหน้ารายการอุปกรณ์ */
export default function ItemUnitsPanel({ item }: { item: MasterItem }) {
  const { units, getUnitInfo } = useStore();
  const [filter, setFilter] = useState<Filter>('live');
  const [register, setRegister] = useState(false);

  const all = useMemo(
    () => units.filter((u) => u.itemId === item.id).map(getUnitInfo),
    [units, item.id, getUnitInfo],
  );
  const count = (f: Filter) => all.filter((i) => match(f, i.status)).length;
  const rows = useMemo(
    () =>
      all
        .filter((i) => match(filter, i.status))
        // ชิ้นที่ใกล้ครบรอบขึ้นก่อน แล้วเรียงตาม SN
        .sort((a, b) => order(a.status) - order(b.status) || a.unit.sn.localeCompare(b.unit.sn)),
    [all, filter],
  );

  return (
    <div style={{ padding: '4px 0 8px' }}>
      <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 12 }}>
        <Segmented<Filter>
          size="small"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'live', label: `ยังไม่ทำลาย (${count('live')})` },
            { value: 'usable', label: `พร้อมใช้ (${count('usable')})` },
            { value: 'last', label: `รอทำลาย (${count('last')})` },
            { value: 'disposed', label: `ทำลายแล้ว (${count('disposed')})` },
            { value: 'all', label: `ทั้งหมด (${all.length})` },
          ]}
        />
        <Space size={4}>
          <Button size="small" icon={<PlusCircleOutlined />} onClick={() => setRegister(true)}>
            ลงทะเบียนชิ้นเพิ่ม
          </Button>
          <Link href={`/units?item=${item.id}&status=all`}>
            <Button size="small" type="link" icon={<ArrowRightOutlined />} iconPlacement="end">
              เปิดในหน้าอุปกรณ์รายชิ้น
            </Button>
          </Link>
        </Space>
      </Flex>
      <UnitTable
        rows={rows}
        showItem={false}
        size="small"
        pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
        emptyText={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ไม่มีชิ้นในกลุ่มนี้" />}
      />
      <RegisterUnitModal open={register} onClose={() => setRegister(false)} defaultItemId={item.id} />
    </div>
  );
}

function match(f: Filter, s: string) {
  if (f === 'all') return true;
  if (f === 'live') return s !== 'disposed';
  if (f === 'usable') return s === 'new' || s === 'active';
  return s === f;
}

function order(s: string) {
  return s === 'last' ? 0 : s === 'active' ? 1 : s === 'new' ? 2 : 3;
}
