'use client';

import { IdcardOutlined, LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Flex, Form, Input, Modal, Typography } from 'antd';
import { useState } from 'react';
import { MIN_PASSWORD, USERNAME_PATTERN, useAuth } from '@/lib/auth';

const { Text, Title } = Typography;

interface LoginValues {
  username: string;
  password: string;
}

/** ฟอร์มเข้าสู่ระบบแอดมิน (ไม่มีการสมัครเอง) */
export function AdminLoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginForm] = Form.useForm<LoginValues>();

  const doLogin = async (v: LoginValues) => {
    setBusy(true);
    setError(null);
    const res = await login(v.username, v.password);
    setBusy(false);
    if (res.ok) {
      loginForm.resetFields();
      onSuccess?.();
    } else {
      setError(res.error);
      loginForm.setFieldValue('password', '');
    }
  };

  return (
    <Form<LoginValues> form={loginForm} layout="vertical" requiredMark={false} onFinish={doLogin}>
      <Form.Item name="username" label="ชื่อผู้ใช้" rules={[{ required: true, message: 'กรุณากรอกชื่อผู้ใช้' }]}>
        <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
      </Form.Item>
      <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, message: 'กรุณากรอกรหัสผ่าน' }]}>
        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
      </Form.Item>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" block size="large" loading={busy}>
        เข้าสู่ระบบ
      </Button>
    </Form>
  );
}

/** แสดงแทนเนื้อหาของหน้าที่ต้องเป็นแอดมิน */
export function AdminGateCard() {
  return (
    <Flex justify="center" style={{ paddingTop: 40 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Flex vertical align="center" gap={4} style={{ marginBottom: 20 }}>
          <SafetyCertificateOutlined style={{ fontSize: 36, color: '#2563eb' }} />
          <Title level={4} style={{ margin: '8px 0 0' }}>
            สำหรับผู้ดูแลระบบ
          </Title>
          <Text type="secondary" style={{ textAlign: 'center' }}>
            หน้านี้ใช้ตั้งค่าระบบ ต้องเข้าสู่ระบบแอดมินก่อน
          </Text>
        </Flex>
        <AdminLoginForm />
      </Card>
    </Flex>
  );
}

export function AdminLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      destroyOnHidden
      title={
        <Flex align="center" gap={8}>
          <SafetyCertificateOutlined style={{ color: '#2563eb' }} />
          เข้าสู่ระบบแอดมิน
        </Flex>
      }
    >
      <AdminLoginForm onSuccess={onClose} />
    </Modal>
  );
}

interface SetupValues {
  username: string;
  displayName: string;
  password: string;
  confirm: string;
}

/**
 * ตั้งค่าครั้งแรก (ตอนติดตั้ง): ยังไม่มีบัญชีแอดมินเลย → ให้สร้างบัญชีแรก
 * ไม่มีรหัสผ่านเริ่มต้น — สร้างเสร็จแล้วเข้าสู่ระบบให้ทันที
 */
export function FirstAdminSetupCard() {
  const { setupFirstAdmin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFinish = async (v: SetupValues) => {
    setBusy(true);
    setError(null);
    const res = await setupFirstAdmin({ username: v.username.trim().toLowerCase(), displayName: v.displayName, password: v.password });
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <Flex justify="center" style={{ paddingTop: 24 }}>
      <Card style={{ width: '100%', maxWidth: 480 }}>
        <Flex vertical align="center" gap={4} style={{ marginBottom: 20 }}>
          <SafetyCertificateOutlined style={{ fontSize: 36, color: '#2563eb' }} />
          <Title level={4} style={{ margin: '8px 0 0' }}>
            ตั้งค่าครั้งแรก: สร้างบัญชีแอดมิน
          </Title>
          <Text type="secondary" style={{ textAlign: 'center' }}>
            เชื่อมต่อฐานข้อมูลเรียบร้อยแล้ว ขั้นสุดท้ายคือสร้างบัญชีผู้ดูแลระบบ
            สำหรับเข้าเมนูตั้งค่า (รายการอุปกรณ์ เจ้าหน้าที่ หน่วยงาน) — จดชื่อผู้ใช้และรหัสผ่านเก็บไว้
          </Text>
        </Flex>
        <Form<SetupValues> layout="vertical" requiredMark={false} onFinish={onFinish} initialValues={{ username: 'admin', displayName: 'ผู้ดูแลระบบ' }}>
          <Form.Item
            name="username"
            label="ชื่อผู้ใช้ (ภาษาอังกฤษตัวเล็ก)"
            rules={[
              { required: true, message: 'กรุณากรอกชื่อผู้ใช้' },
              { pattern: USERNAME_PATTERN, message: 'ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว' },
            ]}
            normalize={(v: string) => v?.toLowerCase()}
          >
            <Input prefix={<UserOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item name="displayName" label="ชื่อที่แสดง" rules={[{ required: true, message: 'กรุณากรอกชื่อที่แสดง' }]}>
            <Input prefix={<IdcardOutlined />} maxLength={60} />
          </Form.Item>
          <Form.Item
            name="password"
            label="รหัสผ่าน"
            rules={[
              { required: true, message: 'กรุณากรอกรหัสผ่าน' },
              { min: MIN_PASSWORD, message: `อย่างน้อย ${MIN_PASSWORD} ตัว` },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="ยืนยันรหัสผ่าน"
            dependencies={['password']}
            rules={[
              { required: true, message: 'กรุณากรอกรหัสผ่านอีกครั้ง' },
              ({ getFieldValue }) => ({
                validator: (_, v) => (!v || v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('รหัสผ่านไม่ตรงกัน'))),
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" block size="large" loading={busy}>
            สร้างบัญชีและเข้าสู่ระบบ
          </Button>
        </Form>
      </Card>
    </Flex>
  );
}
