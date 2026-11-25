'use client';

import { PictureOutlined, SaveOutlined, UndoOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Flex, Form, Input, Row, Space, Tag, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { DEFAULT_BRAND, imageFileToDataUrl, useBrand, type Brand } from '@/lib/brand';
import { useMode } from '@/lib/mode';

const { Text } = Typography;
const SIDEBAR_BG = '#0f172a';

type LogoKey = 'hospitalLogo' | 'companyLogo';
type NameValues = Pick<Brand, 'hospitalName' | 'appName' | 'companyName'>;

/** ตั้งค่าระบบ (แอดมิน) — ตอนนี้มีโลโก้และชื่อที่แสดงในแถบเมนู */
export default function SettingsPage() {
  const { brand, custom, update, reset } = useBrand();
  // หน้างาน (db): โลโก้/ชื่อโรงพยาบาลต้องเป็นของจริงเสมอ · โหมดทดสอบ (demo): กลับไปใช้ค่าตัวอย่างได้เหมือนเดิม
  const demo = useMode() === 'demo';
  const { message } = App.useApp();
  const [form] = Form.useForm<NameValues>();
  const [busy, setBusy] = useState<LogoKey | null>(null);

  useEffect(() => {
    form.setFieldsValue({ hospitalName: brand.hospitalName, appName: brand.appName, companyName: brand.companyName });
  }, [brand.hospitalName, brand.appName, brand.companyName, form]);

  const upload = (key: LogoKey) => async (file: File) => {
    setBusy(key);
    try {
      // โลโก้โรงพยาบาล = สี่เหลี่ยมเล็ก, โลโก้บริษัท = แนวนอน
      const url = key === 'hospitalLogo' ? await imageFileToDataUrl(file, 256, 256) : await imageFileToDataUrl(file, 600, 200);
      await update({ [key]: url });
      message.success('เปลี่ยนโลโก้แล้ว');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
    return false; // ไม่ให้ Upload ส่งไฟล์เอง — ย่อรูปแล้วบันทึกเองด้านบน
  };

  const saveNames = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    // ช่องที่ตรงกับค่าเริ่มต้น ไม่ต้องเก็บ (ถ้าค่าเริ่มต้นเปลี่ยนในอนาคตจะตามไปด้วย)
    const patch: Partial<Brand> = {};
    (Object.keys(v) as (keyof NameValues)[]).forEach((k) => {
      const val = (v[k] ?? '').trim();
      // หน้างาน: ชื่อโรงพยาบาลเก็บเสมอ (ค่าเริ่มต้นในโปรแกรมเป็นตัวอย่าง)
      patch[k] = k === 'hospitalName' && !demo ? val : !val || val === DEFAULT_BRAND[k] ? undefined : val;
    });
    try {
      await update(patch);
      message.success('บันทึกชื่อแล้ว');
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  };

  const logoCard = (key: LogoKey, title: string, hint: string, previewBox: { w: number; h: number; white?: boolean }) => {
    const isCustom = !!custom[key];
    // โลโก้โรงพยาบาลต้องเป็นของจริงเสมอ — เปลี่ยนรูปได้ แต่ไม่กลับไปใช้รูปตัวอย่าง
    const canReset = demo || key !== 'hospitalLogo';
    return (
      <Card
        title={
          <Space>
            <PictureOutlined style={{ color: '#2563eb' }} />
            {title}
            {canReset && (isCustom ? <Tag color="blue">ตั้งเอง</Tag> : <Tag>ค่าเริ่มต้น</Tag>)}
          </Space>
        }
        style={{ height: '100%' }}
      >
        {/* ตัวอย่างบนพื้นสีเดียวกับแถบเมนู */}
        <Flex justify="center" align="center" style={{ background: SIDEBAR_BG, borderRadius: 10, padding: 20, marginBottom: 16, minHeight: 120 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand[key]}
            alt={title}
            style={{
              maxWidth: previewBox.w,
              maxHeight: previewBox.h,
              objectFit: 'contain',
              borderRadius: 8,
              ...(previewBox.white ? { background: '#fff', padding: '6px 10px' } : {}),
            }}
          />
        </Flex>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          {hint}
        </Text>
        <Space wrap>
          <Upload accept="image/png,image/jpeg,image/webp,image/svg+xml" showUploadList={false} beforeUpload={upload(key)}>
            <Button type="primary" icon={<UploadOutlined />} loading={busy === key}>
              เลือกรูปใหม่
            </Button>
          </Upload>
          {canReset && (
            <Button icon={<UndoOutlined />} disabled={!isCustom} onClick={() => reset([key]).then(() => message.success('กลับไปใช้โลโก้เริ่มต้นแล้ว'), (e: Error) => message.error(e.message))}>
              ใช้ค่าเริ่มต้น
            </Button>
          )}
        </Space>
      </Card>
    );
  };

  return (
    <Flex vertical gap={20}>
      <Alert
        type="info"
        showIcon
        title="โลโก้และชื่อที่แสดงในแถบเมนูด้านซ้าย"
        description={
          demo
            ? 'โหมดทดสอบ: ค่าที่ตั้งจะเก็บในเบราว์เซอร์ของเครื่องนี้ — ถ้าใช้หลายเครื่องต้องตั้งแต่ละเครื่อง'
            : 'ค่าที่ตั้งเก็บในฐานข้อมูลที่เครื่องแม่ ทุกเครื่องที่เปิดโปรแกรมเห็นเหมือนกัน (เครื่องอื่นเห็นหลังเปิดหน้าใหม่)'
        }
      />
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          {logoCard('hospitalLogo', 'โลโก้โรงพยาบาล', 'แสดงมุมซ้ายบน — แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นหลังโปร่งใส (PNG / SVG / JPG ไม่เกิน 5 MB)', {
            w: 72,
            h: 72,
          })}
        </Col>
        <Col xs={24} lg={12}>
          {logoCard('companyLogo', 'โลโก้บริษัท (พัฒนาโดย)', 'แสดงด้านล่างของแถบเมนูบนพื้นขาว — แนะนำรูปแนวนอน (PNG / SVG / JPG ไม่เกิน 5 MB)', {
            w: 196,
            h: 72,
            white: true,
          })}
        </Col>
      </Row>

      <Card title="ชื่อที่แสดง">
        <Form<NameValues> form={form} layout="vertical" requiredMark={false} style={{ maxWidth: 560 }}>
          <Form.Item name="hospitalName" label="ชื่อโรงพยาบาล" rules={[{ required: true, whitespace: true, message: 'กรุณากรอกชื่อโรงพยาบาล' }]}>
            <Input maxLength={60} placeholder={demo ? DEFAULT_BRAND.hospitalName : undefined} />
          </Form.Item>
          <Form.Item name="appName" label="บรรทัดรองใต้ชื่อโรงพยาบาล">
            <Input maxLength={40} placeholder={DEFAULT_BRAND.appName} />
          </Form.Item>
          <Form.Item name="companyName" label="ชื่อบริษัท (แสดงเมื่อชี้ที่โลโก้บริษัท)">
            <Input maxLength={80} placeholder={DEFAULT_BRAND.companyName} />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveNames}>
              บันทึกชื่อ
            </Button>
            <Button
              icon={<UndoOutlined />}
              disabled={!(demo && custom.hospitalName) && !custom.appName && !custom.companyName}
              onClick={() =>
                reset(demo ? ['hospitalName', 'appName', 'companyName'] : ['appName', 'companyName']).then(
                  () => message.success('กลับไปใช้ชื่อเริ่มต้นแล้ว'),
                  (e: Error) => message.error(e.message),
                )
              }
            >
              ใช้ค่าเริ่มต้น
            </Button>
          </Space>
        </Form>
      </Card>
    </Flex>
  );
}
