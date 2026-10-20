'use client';

import { DeleteOutlined, HistoryOutlined, PrinterOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Drawer, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import BulkDisposeModal from '@/components/BulkDisposeModal';
import DisposeModal from '@/components/DisposeModal';
import RegisterUnitModal from '@/components/RegisterUnitModal';
import { CycleBar, StatusTag } from '@/components/UnitBits';
import UnitHistory from '@/components/UnitHistory';
import { thaiDate, thaiDateTime, todayISO } from '@/lib/date';
import { useStore, type UnitInfo } from '@/lib/store';
import { DISPOSE_REASON_LABEL, type Unit } from '@/lib/types';

const { Text } = Typography;

interface Props {
  rows: UnitInfo[];
  /** แสดงคอลัมน์ชื่ออุปกรณ์ (ปิดเมื่อแสดงอยู่ใต้รายการอุปกรณ์อยู่แล้ว) */
  showItem?: boolean;
  size?: TableProps['size'];
  pagination?: TableProps['pagination'];
  emptyText?: ReactNode;
  /** แสดงช่องติ๊กเลือกหลายชิ้นเพื่อทำลายพร้อมกัน */
  selectable?: boolean;
}

/** ตารางอุปกรณ์รายชิ้น + หน้าต่างประวัติ / ทำลาย / ลงทะเบียนทดแทน (ใช้ทั้งหน้าอุปกรณ์รายชิ้นและใต้รายการอุปกรณ์) */
export default function UnitTable({ rows, showItem = true, size, pagination, emptyText, selectable = false }: Props) {
  const { units, getUnitInfo } = useStore();
  const [viewing, setViewing] = useState<Unit | null>(null);
  const [disposing, setDisposing] = useState<Unit | null>(null);
  const [replacing, setReplacing] = useState<Unit | null>(null);
  // เลือกหลายชิ้นเพื่อทำลายพร้อมกัน (เลือกได้เฉพาะชิ้นที่ยังไม่ถูกทำลาย)
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const selectedRows = useMemo(
    () => (selectable ? rows.filter((r) => selectedKeys.includes(r.unit.id) && r.status !== 'disposed') : []),
    [rows, selectedKeys, selectable],
  );

  const viewingInfo = viewing ? getUnitInfo(units.find((u) => u.id === viewing.id) ?? viewing) : null;
  const today = todayISO();

  const columns: ColumnsType<UnitInfo> = [
    {
      title: 'SN',
      key: 'sn',
      width: 170,
      sorter: (a, b) => a.unit.sn.localeCompare(b.unit.sn),
      render: (_, r) => (
        <a onClick={() => setViewing(r.unit)}>
          <Text code copyable={{ text: r.unit.sn }}>
            {r.unit.sn}
          </Text>
        </a>
      ),
    },
    ...(showItem
      ? [
          {
            title: 'อุปกรณ์',
            key: 'type',
            ellipsis: true,
            render: (_: unknown, r: UnitInfo) => r.item?.name ?? <Text type="secondary">(รายการถูกลบ)</Text>,
          },
        ]
      : []),
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
      width: 190,
      align: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="ประวัติ">
            <Button type="text" icon={<HistoryOutlined />} onClick={() => setViewing(r.unit)} />
          </Tooltip>
          {r.nextRound != null && (
            <Tooltip title="พิมพ์สติ๊กเกอร์">
              <Link href={`/print?sn=${encodeURIComponent(r.unit.sn)}`}>
                <Button type="text" icon={<PrinterOutlined />} />
              </Link>
            </Tooltip>
          )}
          {r.status !== 'disposed' && (
            // ครบรอบแล้ว = ปุ่มทึบเด่น ให้หน้างานเห็นว่าต้องทำลาย · ยังไม่ครบ = ปุ่มขอบ (ทำลายก่อนกำหนด)
            <Button
              size="small"
              danger
              type={r.status === 'last' ? 'primary' : 'default'}
              icon={<DeleteOutlined />}
              onClick={() => setDisposing(r.unit)}
              style={{ marginLeft: 4 }}
            >
              ทำลาย
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      {selectedRows.length > 0 && (
        <Alert
          type="error"
          style={{ marginBottom: 12, padding: '8px 12px' }}
          title={
            <Space wrap>
              <span>
                เลือกไว้ <b>{selectedRows.length}</b> ชิ้น
                {selectedRows.some((r) => r.status !== 'last') && (
                  <Text type="secondary"> (มีชิ้นที่ยังไม่ครบรอบ {selectedRows.filter((r) => r.status !== 'last').length} ชิ้น)</Text>
                )}
              </span>
            </Space>
          }
          action={
            <Space>
              <Button size="small" onClick={() => setSelectedKeys([])}>
                ยกเลิกที่เลือก
              </Button>
              <Button size="small" type="primary" danger icon={<DeleteOutlined />} onClick={() => setBulkOpen(true)}>
                ทำลายที่เลือก ({selectedRows.length})
              </Button>
            </Space>
          }
        />
      )}
      <Table
        rowKey={(r) => r.unit.id}
        rowSelection={
          selectable
            ? {
                selectedRowKeys: selectedRows.map((r) => r.unit.id),
                onChange: (keys) => setSelectedKeys(keys as number[]),
                getCheckboxProps: (r) => ({ disabled: r.status === 'disposed' }),
                preserveSelectedRowKeys: true,
              }
            : undefined
        }
        size={size}
        columns={columns}
        dataSource={rows}
        scroll={{ x: showItem ? 1050 : 870 }}
        pagination={pagination}
        locale={emptyText ? { emptyText } : undefined}
      />

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
                พิมพ์สติ๊กเกอร์
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
                { key: 't', label: 'อุปกรณ์', children: viewingInfo.item?.name ?? '(รายการถูกลบ)' },
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
                        children: (
                          <>
                            {thaiDateTime(viewingInfo.unit.disposedAt)} — {DISPOSE_REASON_LABEL[viewingInfo.unit.disposeReason ?? 'other']}
                            {viewingInfo.unit.disposeNote && (
                              <div style={{ color: '#64748b', marginTop: 2 }}>{viewingInfo.unit.disposeNote}</div>
                            )}
                          </>
                        ),
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
        defaultReplace={false}
        onDisposed={(u, replace) => replace && setReplacing(u)}
      />
      <BulkDisposeModal
        rows={selectedRows}
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => setSelectedKeys([])}
      />
      <RegisterUnitModal open={!!replacing} onClose={() => setReplacing(null)} replaces={replacing ?? undefined} />
    </>
  );
}
