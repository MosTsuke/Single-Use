'use client';

import {
  BarChartOutlined,
  BarcodeOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PrinterOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Alert, Button, Flex, Grid, Layout, Menu, Spin, Typography } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { dayjs } from '@/lib/date';
import { useStore } from '@/lib/store';

const { Sider, Header, Content } = Layout;

const NAV = [
  { key: '/print', icon: <PrinterOutlined />, label: 'พิมพ์สติ๊กเกอร์', desc: 'ยิง SN ของอุปกรณ์ที่ sterilize เสร็จ แล้วพิมพ์สติ๊กเกอร์รอบถัดไป' },
  { key: '/units', icon: <BarcodeOutlined />, label: 'อุปกรณ์รายชิ้น (SN)', desc: 'ติดตามแต่ละชิ้น ใช้ไปกี่รอบ ครบอายุหรือยัง' },
  { key: '/reports', icon: <BarChartOutlined />, label: 'รายงาน Single-Use', desc: 'ประวัติการพิมพ์ทั้งหมด กรองตามช่วงเวลา' },
  { key: '/items', icon: <DatabaseOutlined />, label: 'รายการอุปกรณ์', desc: 'ตั้งค่าอายุหลัง sterilize รอบสูงสุด และคำนำหน้า SN' },
  { key: '/staff', icon: <TeamOutlined />, label: 'รายชื่อเจ้าหน้าที่', desc: 'รายชื่อผู้พิมพ์สติ๊กเกอร์ ใช้เลือกก่อนพิมพ์และแสดงบนสติ๊กเกอร์' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(false);
  const { ready, saveError } = useStore();
  const [today, setToday] = useState('');

  useEffect(() => setCollapsed(isMobile), [isMobile]);
  useEffect(() => setToday(dayjs().format('dddd D MMMM BBBB')), []);

  const current = NAV.find((n) => pathname.startsWith(n.key)) ?? NAV[0];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        collapsedWidth={isMobile ? 0 : 72}
        collapsed={collapsed}
        trigger={null}
        style={{ position: isMobile ? 'fixed' : 'sticky', top: 0, height: '100vh', zIndex: 100, left: 0 }}
      >
        <Flex align="center" gap={12} style={{ height: 64, padding: collapsed ? '0 24px' : '0 20px' }}>
          <Flex
            align="center"
            justify="center"
            style={{
              width: 32,
              height: 32,
              flex: 'none',
              borderRadius: 8,
              background: 'linear-gradient(135deg,#f59e0b,#f97316)',
              color: '#fff',
              fontSize: 18,
            }}
          >
            <TagsOutlined />
          </Flex>
          {!collapsed && (
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>Single-Use</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Sticker Management</div>
            </div>
          )}
        </Flex>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[current.key]}
          style={{ padding: '8px 8px', borderInlineEnd: 0 }}
          onClick={() => isMobile && setCollapsed(true)}
          items={NAV.map((n) => ({ key: n.key, icon: n.icon, label: <Link href={n.key}>{n.label}</Link> }))}
        />
      </Sider>

      {isMobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 99 }}
        />
      )}

      <Layout>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            padding: '0 20px',
            height: 'auto',
            minHeight: 64,
            lineHeight: 'normal',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Button
            type="text"
            aria-label="เมนู"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((c) => !c)}
          />
          <div style={{ flex: 1, minWidth: 0, padding: '10px 0' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {current.label}
            </Typography.Title>
            {!isMobile && <Typography.Text type="secondary">{current.desc}</Typography.Text>}
          </div>
          {screens.md && today && (
            <Typography.Text type="secondary">
              <CalendarOutlined style={{ marginRight: 6 }} />
              {today}
            </Typography.Text>
          )}
        </Header>

        <Content style={{ padding: isMobile ? 12 : 24 }}>
          {saveError && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              title="บันทึกข้อมูลไม่สำเร็จ"
              description={saveError}
            />
          )}
          {ready ? (
            children
          ) : (
            <Flex justify="center" style={{ padding: 80 }}>
              <Spin size="large" />
            </Flex>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
