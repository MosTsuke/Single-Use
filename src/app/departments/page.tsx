'use client';

import { ApartmentOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Card, Empty, Flex, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { thaiDateTime } from '@/lib/date';
import { useStore } from '@/lib/store';
import type { Department } from '@/lib/types';

const { Text } = Typography;
type DeptForm = Omit<Department, 'id'>;

interface Row extends Department {
  prints: number;
  lastPrint?: string;
}

/** หน่วยงานที่นำอุปกรณ์ไปใช้ — เลือกได้ที่หน้าพิมพ์สติ๊กเกอร์ (ไม่บังคับ) และพิมพ์เป็นบรรทัด "ใช้ที่ ..." */
export default function DepartmentsPage() {
  const { departments, logs, addDepartment, updateDepartment, deleteDepartment } = useStore();
  const { message } = App.useApp();
  const [form] = Form.useForm<DeptForm>();
  const [editing, setEditing] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const rows: Row[] = useMemo(() => {
    const stat = new Map<number, { prints: number; last?: string }>();
    for (const l of logs) {
      if (l.departmentId == null || l.isReprint) continue;
      const s = stat.get(l.departmentId) ?? { prints: 0 };
      s.prints++;
      if (!s.last || l.time > s.last) s.last = l.time;
      stat.set(l.departmentId, s);
    }
    const k = q.trim().toLowerCase();
    return departments
      .filter((s) => !k || s.name.toLowerCase().includes(k) || (s.code ?? '').toLowerCase().includes(k))
      .map((s) => ({ ...s, prints: stat.get(s.id)?.prints ?? 0, lastPrint: stat.get(s.id)?.last }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'th'));
  }, [departments, logs, q]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ name: '', code: '', active: true });
    setOpen(true);
  };
  const openEdit = (s: Department) => {
    setEditing(s);
    form.resetFields();
    form.setFieldsValue({ name: s.name, code: s.code ?? '', active: s.active });
    setOpen(true);
  };

  const onSave = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const res = editing ? updateDepartment(editing.id, v) : addDepartment(v);
    if (!res.ok) {
      message.error(res.error);
      return;
    }
    message.success(editing ? 'บันทึกแล้ว' : `เพิ่ม ${res.value.name} แล้ว`);
    setOpen(false);
  };

  const setActive = (s: Department, active: boolean) => {
    const res = updateDepartment(s.id, { ...s, active });
    if (res.ok) message.success(`${s.name}: ${active ? 'เปิดใช้งาน' : 'ปิดใช้งาน (ไม่แสดงในหน้าพิมพ์)'}`);
    else message.error(res.error);
  };

  const columns: ColumnsType<Row> = [
    {
      title: 'ชื่อหน่วยงาน (แสดงบนสติ๊กเกอร์)',
      key: 'name',
      render: (_, r) => (
        <Space>
          <ApartmentOutlined style={{ color: r.active ? '#2563eb' : '#cbd5e1' }} />
          <Text strong type={r.active ? undefined : 'secondary'}>
            {r.name}
          </Text>
        </Space>
      ),
    },
    {
      title: 'รหัส / ชื่อย่อ',
      dataIndex: 'code',
      width: 150,
      render: (v?: string) => (v ? <Text code>{v}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: 'ใช้ไปแล้ว',
      dataIndex: 'prints',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.prints - b.prints,
      render: (v: number) => `${v.toLocaleString()} ดวง`,
    },
    {
      title: 'ใช้ล่าสุด',
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
            description={r.prints ? 'มีประวัติการพิมพ์แล้ว ลบไม่ได้ — ให้ปิดใช้งานแทน' : 'ยังไม่เคยถูกใช้ ลบออกได้'}
            okText="ลบ"
            cancelText="ยกเลิก"
            okButtonProps={{ danger: true, disabled: r.prints > 0 }}
            onConfirm={() => {
              const res = deleteDepartment(r.id);
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

  const activeCount = departments.filter((s) => s.active).length;

  return (
    <>
      <Card
        title={`หน่วยงาน (${activeCount} ที่ใช้งาน${departments.length > activeCount ? ` · ปิด ${departments.length - activeCount}` : ''})`}
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
              เพิ่มหน่วยงาน
            </Button>
          </Flex>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          ตอนพิมพ์สติ๊กเกอร์เลือกหน่วยงานที่นำไปใช้ได้ทีละดวง (ไม่บังคับ) ชื่อจะพิมพ์เป็นบรรทัด "ใช้ที่ ..." และบันทึกในประวัติ · หน่วยงานที่เลิกใช้ให้ปิดใช้งาน
        </Text>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 850 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty description={q ? 'ไม่พบหน่วยงานที่ค้นหา' : 'ยังไม่มีหน่วยงาน'}>
                {!q && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                    เพิ่มหน่วยงานแรก
                  </Button>
                )}
              </Empty>
            ),
          }}
        />
      </Card>

      <Modal
        open={open}
        title={editing ? 'แก้ไขหน่วยงาน' : 'เพิ่มหน่วยงาน'}
        onCancel={() => setOpen(false)}
        onOk={onSave}
        okText="บันทึก"
        cancelText="ยกเลิก"
        forceRender
      >
        <Form<DeptForm> form={form} layout="vertical" requiredMark={false} onFinish={onSave}>
          <Form.Item
            name="name"
            label="ชื่อหน่วยงาน"
            extra="ชื่อนี้จะพิมพ์บนสติ๊กเกอร์ (ใช้ที่ ...) — ถ้ายาวมากจะถูกตัดท้าย (…) ควรใช้ชื่อสั้น ๆ"
            rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อหน่วยงาน' }]}
          >
            <Input autoFocus maxLength={60} placeholder="เช่น ห้องผ่าตัด, ER, ICU" />
          </Form.Item>
          <Form.Item name="code" label="รหัส / ชื่อย่อ (ไม่บังคับ)" extra="ใช้ค้นหาในดรอปดาวน์ได้">
            <Input maxLength={20} placeholder="เช่น OR" />
          </Form.Item>
          <Form.Item name="active" label="ใช้งาน" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
