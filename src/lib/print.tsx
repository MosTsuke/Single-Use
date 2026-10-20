'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { UndoOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { createPortal } from 'react-dom';
import Sticker from '@/components/Sticker';
import type { StickerData } from './types';

/**
 * สั่งพิมพ์ — คืน Promise ที่จบเมื่อหน้าต่างพิมพ์ปิด
 * เบราว์เซอร์ไม่บอกว่าในหน้าต่างพิมพ์กด "พิมพ์" หรือ "ยกเลิก" จึงบันทึกรอบไปก่อน (ไม่ต้องกดยืนยัน)
 * แล้วขึ้นปุ่ม "ไม่ได้พิมพ์ – ย้อนกลับ" ไว้ชั่วครู่ ให้กดเฉพาะกรณีที่ยกเลิก/สติ๊กเกอร์ไม่ออก
 */
export interface PrintOptions {
  /** ข้อความหลังพิมพ์ + ปุ่มย้อนกลับ (ไม่ใส่ = ไม่แสดง เช่น พิมพ์ทดสอบ) */
  undo?: { title: string; onUndo: () => void };
}
type PrintFn = (list: StickerData[], opts?: PrintOptions) => Promise<void>;
/** แสดงปุ่มย้อนกลับกี่วินาที */
const UNDO_SECONDS = 20;
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
  const { notification } = App.useApp();
  // งานพิมพ์ที่กำลังเปิดหน้าต่างพิมพ์อยู่ (กันสั่งซ้อน)
  const active = useRef<{ resolve: () => void; undo?: PrintOptions['undo'] } | null>(null);
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

  const print = useCallback<PrintFn>((list, opts) => {
    if (!list.length || active.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      active.current = { resolve, undo: opts?.undo };
      pending.current = list.length;
      setJob({ id: Date.now(), list });
    });
  }, []);

  /** หน้าต่างพิมพ์ปิดแล้ว → ขึ้นปุ่มย้อนกลับ (ไม่บังคับกด) */
  const afterDialog = useCallback(() => {
    const a = active.current;
    active.current = null;
    setJob(null);
    if (!a) return;
    if (a.undo) {
      const key = `print-undo-${Date.now()}`;
      const undo = a.undo;
      notification.success({
        key,
        title: undo.title,
        description: 'ถ้ากดยกเลิกในหน้าต่างพิมพ์ หรือสติ๊กเกอร์ไม่ออก กดปุ่มด้านล่างเพื่อไม่นับรอบนี้',
        duration: UNDO_SECONDS,
        placement: 'bottomRight',
        actions: (
          <Button
            danger
            size="small"
            icon={<UndoOutlined />}
            onClick={() => {
              notification.destroy(key);
              undo.onUndo();
            }}
          >
            ไม่ได้พิมพ์ – ย้อนกลับ
          </Button>
        ),
      });
    }
    a.resolve();
  }, [notification]);

  const onStickerReady = useCallback(() => {
    pending.current -= 1;
    if (pending.current === 0) {
      // รอให้แอนิเมชันของหน้าต่าง/ข้อความบนจอจบก่อน เพราะหน้าต่างพิมพ์จะหยุดหน้าเว็บไว้ชั่วคราว
      const go = () =>
        setTimeout(() => {
          // Chrome หยุดรอที่ window.print() จนหน้าต่างพิมพ์ปิด (ทั้งกดพิมพ์และกดยกเลิก)
          window.print();
          setTimeout(afterDialog, 100);
        }, 300);
      if (document.fonts?.ready) document.fonts.ready.then(go);
      else go();
    }
  }, [afterDialog]);

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
