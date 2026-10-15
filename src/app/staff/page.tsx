'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Flex, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { thaiDateTime } from '@/lib/date';
import { useStore } from '@/lib/store';
import type { Staff } from '@/lib/types';

const { Text } = Typography;
type StaffForm = Omit<Staff, 'id'>;

interface Row extends Staff {
  prints: number;
  lastPrint?: string;
}

/** รายชื่อเจ้าหน้าที่ — ใช้เลือก "ผู้พิมพ์" ที่หน้าพิมพ์สติ๊กเกอร์ และแสดงบนสติ๊กเกอร์ */
export default function StaffPage() {
  const { staff, logs, addStaff, updateStaff, deleteStaff } = useStore();
  const { message } = App.useApp();
  const [form] = Form.useForm<StaffForm>();
  const [editing, setEditing] = useState<Staff | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const rows: Row[] = useMemo(() => {
    const stat = new Map<number, { prints: number; last?: string }>();
    for (const l of logs) {
      if (l.staffId == null || l.isReprint) continue;
      const s = stat.get(l.staffId) ?? { prints: 0 };
      s.prints++;
      if (!s.last || l.time > s.last) s.last = l.time;
      stat.set(l.staffId, s);
    }
    const k = q.trim().toLowerCase();
    return staff
      .filter((s) => !k || s.name.toLowerCase().includes(k) || (s.code ?? '').toLowerCase().includes(k))
      .map((s) => ({ ...s, prints: stat.get(s.id)?.prints ?? 0, lastPrint: stat.get(s.id)?.last }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'th'));
  }, [staff, logs, q]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ name: '', code: '', active: true });
    setOpen(true);
  };
  const openEdit = (s: Staff) => {
    setEditing(s);
    form.resetFields();
    form.setFieldsValue({ name: s.name, code: s.code ?? '', active: s.active });
    setOpen(true);
  };

  const onSave = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const res = editing ? updateStaff(editing.id, v) : addStaff(v);
    if (!res.ok) {
      message.error(res.error);
      return;
    }
    message.success(editing ? 'บันทึกแล้ว' : `เพิ่ม ${res.value.name} แล้ว`);
    setOpen(false);
  };

  const setActive = (s: Staff, active: boolean) => {
    const res = updateStaff(s.id, { ...s, active });
    if (res.ok) message.success(`${s.name}: ${active ? 'เปิดใช้งาน' : 'ปิดใช้งาน (ไม่แสดงในหน้าพิมพ์)'}`);
    else message.error(res.error);
  };

  const columns: ColumnsType<Row> = [
    {
      title: 'ชื่อ (แสดงบนสติ๊กเกอร์)',
      key: 'name',
      render: (_, r) => (
        <Space>
          <UserOutlined style={{ color: r.active ? '#2563eb' : '#cbd5e1' }} />
          <Text strong type={r.active ? undefined : 'secondary'}>
            {r.name}
          </Text>
        </Space>
      ),
    },
    {
      title: 'รหัสพนักงาน',
      dataIndex: 'code',
      width: 150,
      render: (v?: string) => (v ? <Text code>{v}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: 'พิมพ์ไปแล้ว',
      dataIndex: 'prints',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.prints - b.prints,
      render: (v: number) => `${v.toLocaleString()} ดวง`,
    },
    {
      title: 'พิมพ์ล่าสุด',
      dataIndex: 'lastPrint',
      width: 170,
      render: (v?: string) => (v ? thaiDateTime(v) : <Text type="secondary">—</Text>),
    },
    {
      title: 'ใช้งาน',
      key: 'active',
      width: 120,
      render: (_, r) => (
        <Tooltip title={r.active ? 'แสดงในดรอปดาวน์หน้าพิมพ์' : 'ซ่อนจากดรอปดาวน์ (ประวัติเดิมยังอยู่)'}>
          <Space size={6}>
            <Switch size="small" checked={r.active} onChange={(on) => setActive(r, on)} />
            {r.active ? <Tag color="green">ใช้งาน</Tag> : <Tag>ปิด</Tag>}
          </Space>
        </Tooltip>
      ),
    },
    {
      title: 'จัดการ',
      key: 'act',
      width: 110,
      align: 'center',
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="แก้ไข">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm
            title={`ลบ ${r.name}?`}
            description={r.prints ? 'มีประวัติการพิมพ์แล้ว ลบไม่ได้ — ให้ปิดใช้งานแทน' : 'ยังไม่เคยพิมพ์ ลบออกได้'}
            okText="ลบ"
            cancelText="ยกเลิก"
            okButtonProps={{ danger: true, disabled: r.prints > 0 }}
            onConfirm={() => {
              const res = deleteStaff(r.id);
              if (res.ok) message.success(`ลบ ${r.name} แล้ว`);
              else message.error(res.error);
            }}
          >
            <Tooltip title="ลบ">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const activeCount = staff.filter((s) => s.active).length;

  return (
    <>
      <Card
        title={`รายชื่อเจ้าหน้าที่ (${activeCount} คนที่ใช้งาน${staff.length > activeCount ? ` · ปิด ${staff.length - activeCount}` : ''})`}
        extra={
          <Flex gap={8} wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="ค้นหาชื่อ / รหัส"
              style={{ width: 200 }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              เพิ่มเจ้าหน้าที่
            </Button>
          </Flex>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          ก่อนพิมพ์สติ๊กเกอร์ต้องเลือกชื่อเจ้าหน้าที่ผู้พิมพ์ ชื่อจะพิมพ์บนสติ๊กเกอร์และบันทึกในประวัติ · คนที่ลาออก/ย้ายให้ปิดใช้งาน
        </Text>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 850 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty description={q ? 'ไม่พบชื่อที่ค้นหา' : 'ยังไม่มีรายชื่อเจ้าหน้าที่'}>
                {!q && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                    เพิ่มเจ้าหน้าที่คนแรก
                  </Button>
                )}
              </Empty>
            ),
          }}
        />
      </Card>

      <Modal
        open={open}
        title={editing ? 'แก้ไขเจ้าหน้าที่' : 'เพิ่มเจ้าหน้าที่'}
        onCancel={() => setOpen(false)}
        onOk={onSave}
        okText="บันทึก"
        cancelText="ยกเลิก"
        forceRender
      >
        <Form<StaffForm> form={form} layout="vertical" requiredMark={false} onFinish={onSave}>
          <Form.Item
            name="name"
            label="ชื่อ-นามสกุล"
            extra="ชื่อนี้จะพิมพ์บนสติ๊กเกอร์ — ถ้ายาวมากจะถูกตัดท้าย (…) ควรใช้ชื่อสั้น ๆ เช่น ชื่อ + นามสกุลย่อ"
            rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อ' }]}
          >
            <Input autoFocus maxLength={60} placeholder="เช่น สมหญิง ใจดี" />
          </Form.Item>
          <Form.Item name="code" label="รหัสพนักงาน (ไม่บังคับ)" extra="ใช้ค้นหาในดรอปดาวน์ได้">
            <Input maxLength={20} placeholder="เช่น N1023" />
          </Form.Item>
          <Form.Item name="active" label="ใช้งาน" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
