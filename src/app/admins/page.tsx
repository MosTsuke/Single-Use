'use client';

import { DeleteOutlined, EditOutlined, KeyOutlined, LockOutlined, PlusOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { thaiDateTime } from '@/lib/date';
import { MIN_PASSWORD, USERNAME_PATTERN, useAuth, type PublicAdmin } from '@/lib/auth';

const { Text } = Typography;

interface AccountForm {
  username: string;
  displayName: string;
  password?: string;
  confirm?: string;
  active: boolean;
}

const passwordRules = [
  { required: true, message: 'กรุณากรอกรหัสผ่าน' },
  { min: MIN_PASSWORD, message: `อย่างน้อย ${MIN_PASSWORD} ตัว` },
];
const confirmRule = ({ getFieldValue }: { getFieldValue: (n: string) => unknown }) => ({
  validator: (_: unknown, v: string) =>
    !v || v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('รหัสผ่านไม่ตรงกัน')),
});

/** จัดการบัญชีแอดมิน (เฉพาะแอดมิน — AppShell กันไว้แล้ว) */
export default function AdminsPage() {
  const { admins, current, createAdmin, updateAdmin, setPassword, deleteAdmin } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<AccountForm>();
  const [pwForm] = Form.useForm<{ password: string; confirm: string }>();
  const [editing, setEditing] = useState<PublicAdmin | null>(null);
  const [open, setOpen] = useState(false);
  const [pwFor, setPwFor] = useState<PublicAdmin | null>(null);
  const [busy, setBusy] = useState(false);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ username: '', displayName: '', active: true });
    setOpen(true);
  };
  const openEdit = (a: PublicAdmin) => {
    setEditing(a);
    form.resetFields();
    form.setFieldsValue({ username: a.username, displayName: a.displayName, active: a.active });
    setOpen(true);
  };

  const onSave = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setBusy(true);
    const res = editing
      ? updateAdmin(editing.id, { displayName: v.displayName, active: v.active })
      : await createAdmin({ username: v.username, displayName: v.displayName, password: v.password! });
    setBusy(false);
    if (!res.ok) return message.error(res.error);
    message.success(editing ? 'บันทึกแล้ว' : `เพิ่มบัญชี ${v.username} แล้ว`);
    setOpen(false);
  };

  const onSavePassword = async () => {
    const v = await pwForm.validateFields().catch(() => null);
    if (!v || !pwFor) return;
    setBusy(true);
    const res = await setPassword(pwFor.id, v.password);
    setBusy(false);
    if (!res.ok) return message.error(res.error);
    message.success(`เปลี่ยนรหัสผ่านของ ${pwFor.username} แล้ว`);
    setPwFor(null);
  };

  const columns: ColumnsType<PublicAdmin> = [
    {
      title: 'ชื่อผู้ใช้',
      dataIndex: 'username',
      width: 180,
      render: (v: string, r) => (
        <Space>
          <UserOutlined style={{ color: r.active ? '#2563eb' : '#cbd5e1' }} />
          <Text code>{v}</Text>
          {r.id === current?.id && <Tag color="blue">คุณ</Tag>}
        </Space>
      ),
    },
    { title: 'ชื่อที่แสดง', dataIndex: 'displayName', ellipsis: true },
    {
      title: 'เข้าสู่ระบบล่าสุด',
      dataIndex: 'lastLoginAt',
      width: 170,
      render: (v?: string) => (v ? thaiDateTime(v) : <Text type="secondary">—</Text>),
    },
    {
      title: 'ใช้งาน',
      dataIndex: 'active',
      width: 140,
      render: (v: boolean, r) => (
        <Space size={6}>
          <Switch
            size="small"
            checked={v}
            disabled={r.id === current?.id}
            onChange={(on) => {
              const res = updateAdmin(r.id, { displayName: r.displayName, active: on });
              if (res.ok) message.success(`${r.username}: ${on ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}`);
              else message.error(res.error);
            }}
          />
          {v ? <Tag color="green">ใช้งาน</Tag> : <Tag>ปิด</Tag>}
        </Space>
      ),
    },
    {
      title: 'จัดการ',
      key: 'act',
      width: 140,
      align: 'center',
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="แก้ไข">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Tooltip title="เปลี่ยนรหัสผ่าน">
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => {
                pwForm.resetFields();
                setPwFor(r);
              }}
            />
          </Tooltip>
          <Popconfirm
            title={`ลบบัญชี ${r.username}?`}
            okText="ลบ"
            cancelText="ยกเลิก"
            okButtonProps={{ danger: true }}
            disabled={r.id === current?.id}
            onConfirm={() => {
              const res = deleteAdmin(r.id);
              if (res.ok) message.success(`ลบ ${r.username} แล้ว`);
              else message.error(res.error);
            }}
          >
            <Tooltip title={r.id === current?.id ? 'ลบบัญชีที่กำลังใช้อยู่ไม่ได้' : 'ลบ'}>
              <Button type="text" danger icon={<DeleteOutlined />} disabled={r.id === current?.id} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#2563eb' }} />
            {`บัญชีแอดมิน (${admins.length})`}
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            เพิ่มแอดมิน
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="แอดมินเข้าหน้ารายการอุปกรณ์ / รายชื่อเจ้าหน้าที่ / บัญชีแอดมินได้ · เจ้าหน้าที่ทั่วไปพิมพ์สติ๊กเกอร์ได้โดยไม่ต้องเข้าสู่ระบบ"
          description="บัญชีเก็บอยู่ในเบราว์เซอร์ของเครื่องนี้ (ไม่รวมในไฟล์สำรองข้อมูล) — ถ้าใช้หลายเครื่องต้องสร้างบัญชีแยกแต่ละเครื่อง ระบบนี้กันคนทั่วไปเข้าหน้าตั้งค่า แต่ยังไม่ใช่ความปลอดภัยระดับเซิร์ฟเวอร์"
        />
        <Table rowKey="id" columns={columns} dataSource={admins} scroll={{ x: 800 }} pagination={false} />
      </Card>

      <Modal
        open={open}
        title={editing ? `แก้ไขบัญชี ${editing.username}` : 'เพิ่มแอดมิน'}
        onCancel={() => setOpen(false)}
        onOk={onSave}
        okText="บันทึก"
        cancelText="ยกเลิก"
        confirmLoading={busy}
        forceRender
      >
        <Form<AccountForm> form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="username"
            label="ชื่อผู้ใช้"
            normalize={(v: string) => v?.toLowerCase().replace(/\s/g, '')}
            rules={
              editing
                ? []
                : [
                    { required: true, message: 'กรุณากรอกชื่อผู้ใช้' },
                    { pattern: USERNAME_PATTERN, message: 'ใช้ a-z 0-9 . _ - ยาว 3–30 ตัว' },
                  ]
            }
          >
            <Input prefix={<UserOutlined />} disabled={!!editing} autoComplete="off" placeholder="เช่น somchai" />
          </Form.Item>
          <Form.Item name="displayName" label="ชื่อที่แสดง">
            <Input maxLength={60} placeholder="เช่น สมชาย (หัวหน้าเวร)" />
          </Form.Item>
          {!editing && (
            <>
              <Form.Item name="password" label="รหัสผ่าน" rules={passwordRules}>
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirm"
                label="ยืนยันรหัสผ่าน"
                dependencies={['password']}
                rules={[{ required: true, message: 'กรุณายืนยันรหัสผ่าน' }, confirmRule]}
              >
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
            </>
          )}
          <Form.Item name="active" label="ใช้งาน" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch disabled={editing?.id === current?.id} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!pwFor}
        title={`เปลี่ยนรหัสผ่าน — ${pwFor?.username ?? ''}`}
        onCancel={() => setPwFor(null)}
        onOk={onSavePassword}
        okText="บันทึกรหัสผ่านใหม่"
        cancelText="ยกเลิก"
        confirmLoading={busy}
        forceRender
      >
        <Form form={pwForm} layout="vertical" requiredMark={false}>
          <Form.Item name="password" label="รหัสผ่านใหม่" rules={passwordRules}>
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="ยืนยันรหัสผ่านใหม่"
            dependencies={['password']}
            rules={[{ required: true, message: 'กรุณายืนยันรหัสผ่าน' }, confirmRule]}
            style={{ marginBottom: 0 }}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
