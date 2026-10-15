'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Sticker from '@/components/Sticker';
import type { StickerData } from './types';

type PrintFn = (list: StickerData[]) => void;
const PrintContext = createContext<PrintFn | null>(null);

/** ค่าปรับตำแหน่งการพิมพ์ของเครื่องนี้ (เก็บแยกตามเครื่อง) */
export interface PrinterSettings {
  /** เลื่อนซ้าย(-)/ขวา(+) หน่วย มม. */
  offsetX: number;
  /** เลื่อนขึ้น(-)/ลง(+) หน่วย มม. */
  offsetY: number;
  /**
   * ชื่อเครื่องพิมพ์ของจุดนี้ (เช่น "Pasin 2") — ใช้แสดงเตือนเจ้าหน้าที่
   * เบราว์เซอร์ไม่ให้หน้าเว็บเลือกเครื่องพิมพ์เอง การล็อกจริงทำที่เครื่องหน้างาน (ดู deploy/README.md)
   */
  printerName: string;
}
const SETTINGS_KEY = 'printer_settings';
const DEFAULT_SETTINGS: PrinterSettings = { offsetX: 0, offsetY: 0, printerName: 'Pasin 2' };
const SettingsContext = createContext<{
  settings: PrinterSettings;
  setSettings: (s: PrinterSettings) => void;
} | null>(null);

/**
 * วาดสติ๊กเกอร์ลงพื้นที่ซ่อน (#print-area) แล้วเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
 * CSS @page กำหนดขนาดกระดาษ 50 x 25 มม. ไว้ใน globals.css
 */
export function PrintProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<{ id: number; list: StickerData[] } | null>(null);
  const [mounted, setMounted] = useState(false);
  const pending = useRef(0);
  const [settings, setSettingsState] = useState<PrinterSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const setSettings = useCallback((s: PrinterSettings) => {
    setSettingsState(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

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
      <SettingsContext.Provider value={{ settings, setSettings }}>{children}</SettingsContext.Provider>
      {mounted &&
        createPortal(
          <div
            id="print-area"
            aria-hidden
            style={
              {
                '--print-offset-x': `${settings.offsetX}mm`,
                '--print-offset-y': `${settings.offsetY}mm`,
              } as CSSProperties
            }
          >
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

export function usePrinterSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('usePrinterSettings must be used inside <PrintProvider>');
  return ctx;
}
