'use client';

import {
  BarcodeOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FilterOutlined,
  RedoOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  Input,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { dayjs, fiscalRange, fiscalYearOf, ISO_DATE, thaiDate, thaiDateTime, todayISO } from '@/lib/date';
import { PeriodPicker, rangeOf, type Period } from '@/components/PeriodPicker';
import { useStore } from '@/lib/store';
import type { PrintLog } from '@/lib/types';

type StatusFilter = 'all' | 'normal' | 'reprint';

const { Text } = Typography;

function downloadCSV(rows: PrintLog[], filename: string) {
  const head = ['วัน-เวลาที่พิมพ์', 'รายการอุปกรณ์', 'รอบ', 'รอบสูงสุด', 'วันผลิต', 'วันหมดอายุ', 'SN', 'สถานะ', 'เจ้าหน้าที่', 'หมายเหตุ'];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((l) =>
    [
      thaiDateTime(l.time),
      l.name,
      l.round,
      l.maxRound,
      thaiDate(l.mfg),
      thaiDate(l.exp),
      l.barcode ? `\t${l.barcode}` : '-',
      l.isReprint ? 'พิมพ์ซ้ำ (ชำรุด)' : 'พิมพ์ปกติ',
      l.staffName ?? '',
      l.skippedFrom != null ? `ข้ามจากรอบ ${l.skippedFrom}${l.note ? ' · ' + l.note : ''}` : (l.note ?? ''),
    ]
      .map(esc)
      .join(','),
  );
  // BOM เพื่อให้ Excel อ่านภาษาไทยถูก
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ReportsPage() {
  const { logs, items } = useStore();
  const [period, setPeriod] = useState<Period>('month');
  const [ref, setRef] = useState<Dayjs>(() => dayjs());
  const [itemFilter, setItemFilter] = useState<number | undefined>();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');

  const range = rangeOf(period, ref);


  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return logs
      .filter((l) => {
        if (range) {
          const d = l.time.slice(0, 10);
          if (d < range.start || d > range.end) return false;
        }
        if (itemFilter && l.itemId !== itemFilter) return false;
        if (status === 'normal' && l.isReprint) return false;
        if (status === 'reprint' && !l.isReprint) return false;
        if (kw && ![l.name, l.barcode, l.staffName ?? ''].some((v) => v.toLowerCase().includes(kw))) return false;
        return true;
      })
      .slice()
      .reverse();
  }, [logs, range, itemFilter, status, q]);

  const stats = useMemo(() => {
    const normal = filtered.filter((l) => !l.isReprint).length;
    const reprint = filtered.length - normal;
    const byItem = new Map<string, { normal: number; reprint: number }>();
    filtered.forEach((l) => {
      const s = byItem.get(l.name) ?? { normal: 0, reprint: 0 };
      if (l.isReprint) s.reprint++;
      else s.normal++;
      byItem.set(l.name, s);
    });
    const top = [...byItem.entries()]
      .map(([name, s]) => ({ name, ...s, total: s.normal + s.reprint }))
      .sort((a, b) => b.total - a.total);
    return { normal, reprint, total: filtered.length, top };
  }, [filtered]);

  const columns: ColumnsType<PrintLog> = [
    {
      title: 'วัน-เวลาที่พิมพ์',
      dataIndex: 'time',
      width: 170,
      sorter: (a, b) => a.time.localeCompare(b.time) || a.id - b.id,
      defaultSortOrder: 'descend',
      render: (v: string) => <Text type="secondary">{thaiDateTime(v)}</Text>,
    },
    {
      title: 'รายการอุปกรณ์',
      dataIndex: 'name',
      ellipsis: true,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'รอบที่ใช้งาน',
      width: 120,
      render: (_, l) => (
        <Text strong style={{ color: '#1d4ed8' }}>
          รอบที่ {l.round}/{l.maxRound}
        </Text>
      ),
    },
    {
      title: 'วันผลิต → หมดอายุ',
      width: 220,
      render: (_, l) => {
        const expired = l.exp < todayISO();
        return (
          <Space size={6}>
            <Text type="secondary">{thaiDate(l.mfg)}</Text>→
            <Text type={expired ? 'danger' : undefined}>{thaiDate(l.exp)}</Text>
            {expired && <Tag color="error">หมดอายุ</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'SN',
      dataIndex: 'barcode',
      width: 180,
      render: (_, l) =>
        l.barcode ? (
          <Text code copyable={{ text: l.barcode }}>
            {l.barcode}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'เจ้าหน้าที่',
      dataIndex: 'staffName',
      width: 160,
      ellipsis: true,
      render: (v?: string) => (v ? v : <Text type="secondary">—</Text>),
    },
    {
      title: 'สถานะ',
      width: 150,
      align: 'center',
      render: (_, l) =>
        l.isReprint ? (
          <Tag icon={<RedoOutlined />} color="warning">
            พิมพ์ซ้ำ (ชำรุด)
          </Tag>
        ) : (
          <Tag icon={<CheckCircleOutlined />} color="processing">
            พิมพ์ปกติ
          </Tag>
        ),
    },
  ];

  const reprintRate = stats.total ? Math.round((stats.reprint / stats.total) * 100) : 0;

  return (
    <Flex vertical gap={20}>
      {/* ตัวกรอง */}
      <Card>
        <Flex wrap gap={12} align="center" justify="space-between">
          <Flex wrap gap={12} align="center">
            <FilterOutlined style={{ color: '#64748b' }} />
            <PeriodPicker period={period} value={ref} onChange={(p, r) => (setPeriod(p), setRef(r))} />
          </Flex>
          <Button
            icon={<DownloadOutlined />}
            disabled={!filtered.length}
            onClick={() => downloadCSV(filtered, `รายงาน-single-use-${todayISO()}.csv`)}
          >
            ส่งออก Excel (CSV)
          </Button>
        </Flex>
        {range && (
          <Text type="secondary" style={{ display: 'block', marginTop: 10 }}>
            ช่วงเวลา: {range.label}
          </Text>
        )}
      </Card>

      {/* สรุป */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card>
            <Statistic title="พิมพ์ทั้งหมด" value={stats.total} suffix="ดวง" prefix={<FileTextOutlined style={{ color: '#2563eb' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card>
            <Statistic title="พิมพ์ปกติ" value={stats.normal} suffix="ดวง" prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card>
            <Statistic title="พิมพ์ซ้ำ (ชำรุด)" value={stats.reprint} suffix="ดวง" prefix={<RedoOutlined style={{ color: '#f59e0b' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card>
            <Statistic title="อัตราพิมพ์ซ้ำ" value={reprintRate} suffix="%" prefix={<TagsOutlined style={{ color: '#64748b' }} />} />
            <Progress percent={reprintRate} showInfo={false} size="small" strokeColor="#f59e0b" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        <Col xs={24} xxl={18}>
          <Card
            title="ประวัติการพิมพ์"
            extra={
              <Flex gap={8} wrap>
                <Select
                  allowClear
                  placeholder="ทุกรายการ"
                  style={{ width: 200 }}
                  value={itemFilter}
                  onChange={setItemFilter}
                  options={items.map((i) => ({ value: i.id, label: i.name }))}
                />
                <Select<StatusFilter>
                  style={{ width: 140 }}
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'all', label: 'ทุกสถานะ' },
                    { value: 'normal', label: 'พิมพ์ปกติ' },
                    { value: 'reprint', label: 'พิมพ์ซ้ำ' },
                  ]}
                />
                <Input
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder="ค้นหาชื่อ / SN / เจ้าหน้าที่"
                  style={{ width: 200 }}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </Flex>
            }
          >
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filtered}
              scroll={{ x: 1160 }}
              pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `ทั้งหมด ${t} รายการ` }}
              locale={{ emptyText: <Empty description="ไม่มีข้อมูลในช่วงเวลานี้" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} xxl={6}>
          <Card title="สรุปตามรายการ">
            {stats.top.length ? (
              <Flex vertical gap={16}>
                {stats.top.map((t) => (
                  <div key={t.name}>
                    <Flex justify="space-between">
                      <Text ellipsis style={{ maxWidth: '70%' }}>
                        {t.name}
                      </Text>
                      <Text strong>{t.total}</Text>
                    </Flex>
                    <Progress
                      percent={(t.total / stats.top[0].total) * 100}
                      success={{ percent: (t.normal / stats.top[0].total) * 100, strokeColor: '#2563eb' }}
                      strokeColor="#f59e0b"
                      showInfo={false}
                      size="small"
                    />
                    {t.reprint > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <BarcodeOutlined /> ปกติ {t.normal} · ซ้ำ {t.reprint}
                      </Text>
                    )}
                  </div>
                ))}
              </Flex>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ไม่มีข้อมูล" />
            )}
          </Card>
        </Col>
      </Row>
    </Flex>
  );
}
