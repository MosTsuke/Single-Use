import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import AppProviders from '@/components/AppProviders';
import AppShell from '@/components/AppShell';
// ฟอนต์ฝังมากับโปรแกรม (หน้างานไม่มีอินเทอร์เน็ต) — Sarabun ใช้บนสติ๊กเกอร์ ต้องโหลดได้เสมอ
import '@fontsource/prompt/300.css';
import '@fontsource/prompt/400.css';
import '@fontsource/prompt/500.css';
import '@fontsource/prompt/600.css';
import '@fontsource/prompt/700.css';
import '@fontsource/sarabun/400.css';
import '@fontsource/sarabun/500.css';
import '@fontsource/sarabun/600.css';
import '@fontsource/sarabun/700.css';
import '@fontsource/sarabun/800.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Single-Use Sticker',
  description: 'ระบบจัดการและพิมพ์สติ๊กเกอร์ Single-Use',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>
        <AntdRegistry>
          <AppProviders>
            <AppShell>{children}</AppShell>
          </AppProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}
