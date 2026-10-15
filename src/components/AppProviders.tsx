'use client';

import { App, ConfigProvider } from 'antd';
import thTH from 'antd/locale/th_TH';
import type { ReactNode } from 'react';
import '@/lib/date'; // ตั้งค่า dayjs (ภาษาไทย + พ.ศ.)
import { AuthProvider } from '@/lib/auth';
import { PrintProvider } from '@/lib/print';
import { StoreProvider } from '@/lib/store';

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={thTH}
      theme={{
        token: {
          fontFamily: "'Prompt', -apple-system, 'Segoe UI', sans-serif",
          colorPrimary: '#2563eb',
          colorWarning: '#f59e0b',
          borderRadius: 10,
          colorBgLayout: '#f4f6fb',
        },
        components: {
          Layout: { siderBg: '#0f172a', headerBg: '#ffffff' },
          Menu: {
            darkItemBg: '#0f172a',
            darkItemSelectedBg: '#2563eb',
            itemBorderRadius: 8,
          },
          Card: { headerFontSize: 16 },
          Table: { headerBg: '#f8fafc' },
        },
      }}
    >
      <App>
        <AuthProvider>
          <StoreProvider>
            <PrintProvider>{children}</PrintProvider>
          </StoreProvider>
        </AuthProvider>
      </App>
    </ConfigProvider>
  );
}
