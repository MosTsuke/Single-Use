'use client';

import { IdcardOutlined, LockOutlined, SafetyCertificateOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Flex, Form, Input, Steps, Typography, Upload } from 'antd';
import { useState } from 'react';
import { AdminLoginForm } from '@/components/AdminLogin';
import { MIN_PASSWORD, USERNAME_PATTERN, useAuth } from '@/lib/auth';
import { DEFAULT_BRAND, imageFileToDataUrl, useBrand } from '@/lib/brand';

const { Text, Title } = Typography;
const SIDEBAR_BG = '#0f172a';

/**
 * ตั้งค่าครั้งแรกหลังติดตั้ง — ต้องทำให้ครบก่อนใช้งาน:
 *   1) สร้างบัญชีแอดมิน (ไม่มีรหัสผ่านเริ่มต้น)
 *   2) ชื่อโรงพยาบาล (ค่าเริ่มต้นในโปรแกรมเป็นตัวอย่าง) + โลโก้ (ไม่บังคับ — ไม่ใส่ = ไอคอนกลาง)
 * ข้อมูลอื่น (รายการอุปกรณ์ เจ้าหน้าที่ หน่วยงาน) หน้างานเพิ่มเองทีหลังที่เมนูผู้ดูแลระบบ
 */
export default function FirstRunSetup() {
  const auth = useAuth();
  const step = auth.needsSetup ? 0 : 1;

  return (
    <Flex justify="center" style={{ paddingTop: 24 }}>
      <Card style={{ width: '100%', maxWidth: 520 }}>
        <Flex vertical align="center" gap={4} style={{ marginBottom: 20 }}>
          <SafetyCertificateOutlined style={{ fontSize: 36, color: '#2563eb' }} />
          <Title level={4} style={{ margin: '8px 0 0' }}>
            ตั้งค่าครั้งแรก
          </Title>
          <Text type="secondary" style={{ textAlign: 'center' }}>
            เชื่อมต่อฐานข้อมูลเรียบร้อยแล้ว ทำ 2 ขั้นนี้ให้ครบก่อนเริ่มใช้งาน
          </Text>
        </Flex>
        <Steps size="small" current={step} style={{ marginBottom: 24 }} items={[{ title: 'บัญชีแอดมิน' }, { title: 'โลโก้และชื่อโรงพยาบาล' }]} />
        {step === 0 ? (
          <AdminStep />
        ) : auth.current ? (
          <BrandStep />
        ) : (
          <>
            <Alert type="info" showIcon style={{ marginBottom: 16 }} title="สร้างบัญชีแอดมินแล้ว — เข้าสู่ระบบแอดมินเพื่อตั้งโลโก้และชื่อโรงพยาบาลต่อ" />
            <AdminLoginForm />
          </>
        )}
      </Card>
    </Flex>
  );
}

interface AdminValues {
  username: string;
  displayName: string;
  password: string;
  confirm: string;
}

function AdminStep() {
  const { setupFirstAdmin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFinish = async (v: AdminValues) => {
    setBusy(true);
    setError(null);
    const res = await setupFirstAdmin({ username: v.username.trim().toLowerCase(), displayName: v.displayName, password: v.password });
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <Form<AdminValues> layout="vertical" requiredMark={false} onFinish={onFinish} initialValues={{ username: 'admin', displayName: 'ผู้ดูแลระบบ' }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        บัญชีสำหรับเข้าเมนูผู้ดูแลระบบ (รายการอุปกรณ์ เจ้าหน้าที่ หน่วยงาน ตั้งค่า) — จดชื่อผู้ใช้และรหัสผ่านเก็บไว้
      </Text>
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
        สร้างบัญชีและไปขั้นถัดไป
      </Button>
    </Form>
  );
}

function BrandStep() {
  const { custom, brand, update } = useBrand();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ hospitalName: string }>();
  const [logo, setLogo] = useState<string | undefined>(custom.hospitalLogo);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setReading(true);
    setError(null);
    try {
      setLogo(await imageFileToDataUrl(file, 256, 256));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
    return false; // ไม่ให้ Upload ส่งไฟล์เอง — ย่อรูปแล้วบันทึกตอนกดปุ่มด้านล่าง
  };

  const onFinish = async (v: { hospitalName: string }) => {
    setBusy(true);
    setError(null);
    try {
      await update({ hospitalName: v.hospitalName.trim(), hospitalLogo: logo });
      message.success('ตั้งค่าครั้งแรกเสร็จแล้ว — เพิ่มรายการอุปกรณ์ เจ้าหน้าที่ และหน่วยงานได้ที่เมนูผู้ดูแลระบบ', 8);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Form layout="vertical" form={form} requiredMark={false} onFinish={onFinish} initialValues={{ hospitalName: custom.hospitalName ?? '' }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        แสดงที่มุมซ้ายบนของทุกหน้า (เปลี่ยนภายหลังได้ที่เมนู ตั้งค่า)
      </Text>
      <Form.Item label="โลโก้โรงพยาบาล (ไม่บังคับ)">
        <Flex align="center" gap={16}>
          <Flex justify="center" align="center" style={{ background: SIDEBAR_BG, borderRadius: 10, width: 112, height: 112, flex: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo ?? DEFAULT_BRAND.hospitalLogo} alt="โลโก้โรงพยาบาล" style={{ maxWidth: 80, maxHeight: 80, objectFit: 'contain', borderRadius: 8 }} />
          </Flex>
          <Flex vertical gap={8}>
            <Flex gap={8} wrap>
              <Upload accept="image/png,image/jpeg,image/webp,image/svg+xml" showUploadList={false} beforeUpload={pick}>
                <Button icon={<UploadOutlined />} loading={reading}>
                  {logo ? 'เปลี่ยนรูป' : 'เลือกรูปโลโก้'}
                </Button>
              </Upload>
              {logo && (
                <Button type="link" onClick={() => setLogo(undefined)}>
                  ไม่ใส่โลโก้
                </Button>
              )}
            </Flex>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {logo
                ? 'แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นหลังโปร่งใส (PNG / SVG / JPG ไม่เกิน 5 MB)'
                : 'ยังไม่มีโลโก้ ข้ามได้ — ระหว่างนี้แสดงไอคอนนี้แทน ใส่ทีหลังได้ที่เมนู ตั้งค่า'}
            </Text>
          </Flex>
        </Flex>
      </Form.Item>
      <Form.Item name="hospitalName" label="ชื่อโรงพยาบาล" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อโรงพยาบาล' }]}>
        <Input maxLength={60} placeholder="เช่น โรงพยาบาล..." />
      </Form.Item>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
        บรรทัดรองใต้ชื่อ: {brand.appName}
      </Text>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" block size="large" loading={busy}>
        บันทึกและเริ่มใช้งาน
      </Button>
    </Form>
  );
}
