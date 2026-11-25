'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getJSON, postJSON } from './api';

/**
 * โลโก้และชื่อที่แสดงในแถบเมนู
 * ค่าเริ่มต้นอยู่ใน DEFAULT_BRAND (ไฟล์ใน public/brand/) — แอดมินเปลี่ยนได้ที่เมนู "ตั้งค่า"
 * ค่าที่แอดมินตั้งเก็บในฐานข้อมูล (ตาราง Settings) ทุกเครื่องเห็นเหมือนกัน (โลโก้เก็บเป็นรูปย่อแบบ data URL)
 */
export interface Brand {
  hospitalName: string;
  hospitalLogo: string;
  /** บรรทัดรองใต้ชื่อโรงพยาบาล */
  appName: string;
  companyName: string;
  companyLogo: string;
}

export const DEFAULT_BRAND: Brand = {
  hospitalName: 'โรงพยาบาลตัวอย่าง',
  hospitalLogo: '/brand/hospital-logo.svg',
  appName: 'Single-Use Sticker',
  companyName: 'ห้างหุ้นส่วนจำกัด เอสพี เมดดิเทค (SP Meditech)',
  companyLogo: '/brand/company-logo.png',
};

interface BrandValue {
  brand: Brand;
  /** ค่าที่แอดมินตั้งเอง (ไม่มี = ใช้ค่าเริ่มต้น) */
  custom: Partial<Brand>;
  /** ใส่ค่าใหม่ — throw เมื่อบันทึกไม่สำเร็จ */
  update: (patch: Partial<Brand>) => Promise<void>;
  /** กลับไปใช้ค่าเริ่มต้นของช่องที่ระบุ — throw เมื่อบันทึกไม่สำเร็จ */
  reset: (keys: (keyof Brand)[]) => Promise<void>;
}

const BrandContext = createContext<BrandValue | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Partial<Brand>>({});

  useEffect(() => {
    getJSON<{ custom: Partial<Brand> }>('/api/brand')
      .then((r) => setCustom(r.custom ?? {}))
      .catch(() => {
        /* เชื่อมต่อไม่ได้ → ใช้ค่าเริ่มต้น */
      });
  }, []);

  const save = useCallback(async (patch: Partial<Record<keyof Brand, string | null>>) => {
    const r = await postJSON<{ ok: boolean; custom?: Partial<Brand>; error?: string }>('/api/brand', { patch });
    if (!r.ok) throw new Error(r.error || 'บันทึกไม่สำเร็จ');
    setCustom(r.custom ?? {});
  }, []);

  const update = useCallback(
    (patch: Partial<Brand>) => {
      const p: Partial<Record<keyof Brand, string | null>> = {};
      (Object.keys(patch) as (keyof Brand)[]).forEach((k) => (p[k] = patch[k] ?? null));
      return save(p);
    },
    [save],
  );
  const reset = useCallback((keys: (keyof Brand)[]) => save(Object.fromEntries(keys.map((k) => [k, null]))), [save]);

  const brand = useMemo<Brand>(() => {
    const b = { ...DEFAULT_BRAND };
    (Object.keys(custom) as (keyof Brand)[]).forEach((k) => {
      const v = custom[k];
      if (typeof v === 'string' && v.trim()) b[k] = v;
    });
    return b;
  }, [custom]);

  return <BrandContext.Provider value={{ brand, custom, update, reset }}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used inside <BrandProvider>');
  return ctx;
}

/**
 * อ่านไฟล์รูปแล้วย่อให้เล็กพอเก็บในฐานข้อมูล (PNG ไม่เกิน maxW × maxH พิกเซล)
 * SVG เก็บตามเดิม (ไฟล์เล็กและคมทุกขนาด)
 */
export async function imageFileToDataUrl(file: File, maxW: number, maxH: number): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 5 MB');
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml') {
    if (raw.length > 300_000) throw new Error('ไฟล์ SVG ใหญ่เกินไป');
    return raw;
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ'));
    i.src = raw;
  });
  const scale = Math.min(1, maxW / img.width, maxH / img.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
