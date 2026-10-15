'use client';

import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Flex, Form, Input, Modal, Typography } from 'antd';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

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
