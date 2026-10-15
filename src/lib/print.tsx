'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Sticker from '@/components/Sticker';
import type { StickerData } from './types';

type PrintFn = (list: StickerData[]) => void;
const PrintContext = createContext<PrintFn | null>(null);

/**
 * วาดสติ๊กเกอร์ลงพื้นที่ซ่อน (#print-area) แล้วเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
 * CSS @page กำหนดขนาดกระดาษ 50 x 25 มม. ไว้ใน globals.css
 */
export function PrintProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<{ id: number; list: StickerData[] } | null>(null);
  const [mounted, setMounted] = useState(false);
  const pending = useRef(0);

  useEffect(() => setMounted(true), []);

  const print = useCallback<PrintFn>((list) => {
    if (!list.length) return;
    pending.current = list.length;
    setJob({ id: Date.now(), list });
  }, []);

  const onStickerReady = useCallback(() => {
    pending.current -= 1;
    if (pending.current === 0) {
      // รอให้แอนิเมชันของหน้าต่าง/ข้อความบนจอจบก่อน เพราะหน้าต่างพิมพ์จะหยุดหน้าเว็บไว้ชั่วคราว
      const go = () => setTimeout(() => window.print(), 300);
      if (document.fonts?.ready) document.fonts.ready.then(go);
      else go();
    }
  }, []);

  return (
    <PrintContext.Provider value={print}>
      {children}
      {mounted &&
        createPortal(
          <div id="print-area" aria-hidden>
            {job?.list.map((d, i) => <Sticker key={`${job.id}-${i}`} data={d} onReady={onStickerReady} />)}
          </div>,
          document.body,
        )}
    </PrintContext.Provider>
  );
}

export function usePrintStickers(): PrintFn {
  const ctx = useContext(PrintContext);
  if (!ctx) throw new Error('usePrintStickers must be used inside <PrintProvider>');
  return ctx;
}
