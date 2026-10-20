'use client';

import {
  BarChartOutlined,
  BarcodeOutlined,
  CalendarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  LoginOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PrinterOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Alert, Button, Flex, Grid, Layout, Menu, Spin, Tag, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminGateCard, AdminLoginModal } from '@/components/AdminLogin';
import { IDLE_MINUTES, useAuth } from '@/lib/auth';
import { useEffect, useState, type ReactNode } from 'react';
import { dayjs } from '@/lib/date';
import { useStore } from '@/lib/store';

const { Sider, Header, Content } = Layout;

const NAV = [
  { key: '/print', icon: <PrinterOutlined />, label: 'พิมพ์สติ๊กเกอร์', desc: 'ยิง SN ของอุปกรณ์ที่ sterilize เสร็จ แล้วพิมพ์สติ๊กเกอร์รอบถัดไป' },
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'แดชบอร์ด', desc: 'ภาพรวม: พร้อมใช้ / รอทำลาย / สติ๊กเกอร์หมดอายุ และสาเหตุการทำลาย' },
  { key: '/units', icon: <BarcodeOutlined />, label: 'อุปกรณ์รายชิ้น (SN)', desc: 'ติดตามแต่ละชิ้น ใช้ไปกี่รอบ ครบอายุหรือยัง' },
  { key: '/reports', icon: <BarChartOutlined />, label: 'รายงาน Single-Use', desc: 'ประวัติการพิมพ์ทั้งหมด กรองตามช่วงเวลา' },
];

/** เมนูสำหรับแอดมินเท่านั้น — เจ้าหน้าที่ทั่วไปจะไม่เห็น และเปิด URL ตรง ๆ จะเจอหน้าเข้าสู่ระบบ */
const ADMIN_NAV = [
  { key: '/items', icon: <DatabaseOutlined />, label: 'รายการอุปกรณ์', desc: 'ตั้งค่าอายุหลัง sterilize รอบสูงสุด และคำนำหน้า SN' },
  { key: '/staff', icon: <TeamOutlined />, label: 'รายชื่อเจ้าหน้าที่', desc: 'รายชื่อผู้พิมพ์สติ๊กเกอร์ ใช้เลือกก่อนพิมพ์และแสดงบนสติ๊กเกอร์' },
  { key: '/admins', icon: <SafetyCertificateOutlined />, label: 'บัญชีแอดมิน', desc: 'ผู้ที่เข้าหน้าตั้งค่าได้ (รายการอุปกรณ์ / รายชื่อเจ้าหน้าที่)' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(false);
  const { ready, saveError } = useStore();
  const auth = useAuth();
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);
  const isAdmin = !!auth.current;
  const [today, setToday] = useState('');

  useEffect(() => setCollapsed(isMobile), [isMobile]);
  useEffect(() => setToday(dayjs().format('dddd D MMMM BBBB')), []);

  const adminPage = ADMIN_NAV.find((n) => pathname.startsWith(n.key));
  const current = adminPage ?? NAV.find((n) => pathname.startsWith(n.key)) ?? NAV[0];
  const toItem = (n: (typeof NAV)[number]) => ({ key: n.key, icon: n.icon, label: <Link href={n.key}>{n.label}</Link> });
  const doLogout = () => {
    auth.logout();
    if (adminPage) router.push('/print');
  };

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
        <Flex vertical style={{ height: 'calc(100vh - 64px)' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[current.key]}
            style={{ padding: '8px 8px', borderInlineEnd: 0, flex: 1, overflowY: 'auto' }}
            onClick={() => isMobile && setCollapsed(true)}
            items={[
              ...NAV.map(toItem),
              ...(isAdmin
                ? [{ type: 'group' as const, key: 'admin', label: collapsed ? null : 'ผู้ดูแลระบบ', children: ADMIN_NAV.map(toItem) }]
                : []),
            ]}
          />
          {/* ล่างสุดของแถบเมนู: เข้า/ออกจากระบบแอดมิน */}
          <div style={{ padding: 12, borderTop: '1px solid #1e293b' }}>
            {isAdmin ? (
              <Flex align="center" gap={8} justify={collapsed ? 'center' : 'space-between'}>
                {!collapsed && (
                  <div style={{ minWidth: 0, lineHeight: 1.3 }}>
                    <div style={{ color: '#fff', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <SafetyCertificateOutlined style={{ color: '#60a5fa', marginRight: 6 }} />
                      {auth.current!.displayName}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>ออกอัตโนมัติเมื่อไม่ใช้ {IDLE_MINUTES} นาที</div>
                  </div>
                )}
                <Tooltip title="ออกจากระบบแอดมิน" placement="right">
                  <Button
                    size="small"
                    icon={<LogoutOutlined />}
                    onClick={doLogout}
                    style={{ background: 'transparent', color: '#cbd5e1', borderColor: '#334155', flex: 'none' }}
                  >
                    {!collapsed && 'ออก'}
                  </Button>
                </Tooltip>
              </Flex>
            ) : (
              <Tooltip title={collapsed ? 'เข้าสู่ระบบแอดมิน' : ''} placement="right">
                <Button
                  block
                  icon={<LoginOutlined />}
                  onClick={() => setLoginOpen(true)}
                  style={{ background: 'transparent', color: '#94a3b8', borderColor: '#334155' }}
                >
                  {!collapsed && 'เข้าสู่ระบบแอดมิน'}
                </Button>
              </Tooltip>
            )}
          </div>
        </Flex>
      </Sider>
      <AdminLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />

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
          {isAdmin && (
            <Tag color="blue" icon={<SafetyCertificateOutlined />} style={{ marginInlineEnd: 0 }}>
              แอดมิน
            </Tag>
          )}
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
          {ready && auth.ready ? (
            adminPage && !isAdmin ? (
              <AdminGateCard />
            ) : (
              children
            )
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
