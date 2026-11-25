'use client';

import { Flex, Spin } from 'antd';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * โหมดของโปรแกรม — ถามเซิร์ฟเวอร์ครั้งเดียวตอนเปิด (/api/mode)
 * - 'db'   ต่อ SQL Server ที่เครื่องแม่ (หน้างานจริง): ข้อมูลกลาง ตั้งค่าครั้งแรกด้วยบัญชีแอดมิน + โลโก้
 * - 'demo' ไม่ได้ต่อฐานข้อมูล (Vercel / ทดสอบ): เก็บในเบราว์เซอร์เหมือนรุ่นแรก มีปุ่มโหลดข้อมูลตัวอย่าง
 * ถามไม่ได้ (เช่น เครื่องแม่ปิด) → ถือเป็น 'db' เพื่อให้หน้าเว็บแจ้งว่าต่อเครื่องแม่ไม่ได้
 */
export type AppMode = 'db' | 'demo';

const ModeContext = createContext<AppMode>('db');

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode | null>(null);

  useEffect(() => {
    fetch('/api/mode', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => setMode(b?.mode === 'demo' ? 'demo' : 'db'))
      .catch(() => setMode('db'));
  }, []);

  if (!mode) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  }
  return <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
