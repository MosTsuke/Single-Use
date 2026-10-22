'use client';

import { DatePicker, Segmented } from 'antd';
import type { Dayjs } from 'dayjs';
import { dayjs, fiscalRange, fiscalYearOf, ISO_DATE, thaiDate, todayISO } from '@/lib/date';

/** ตัวเลือกช่วงเวลา — ใช้ร่วมกันระหว่างหน้ารายงานและแดชบอร์ด */
export type Period = 'all' | 'day' | 'month' | 'year' | 'fiscal';

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'day', label: 'รายวัน' },
  { value: 'month', label: 'รายเดือน' },
  { value: 'year', label: 'รายปี' },
  { value: 'fiscal', label: 'ปีงบประมาณ' },
];

export interface PeriodRange {
  start: string;
  end: string;
  label: string;
}

export function rangeOf(period: Period, ref: Dayjs): PeriodRange | null {
  if (period === 'all') return null;
  if (period === 'day') {
    const d = ref.format(ISO_DATE);
    return { start: d, end: d, label: `วันที่ ${thaiDate(d)}` };
  }
  if (period === 'month') {
    return {
      start: ref.startOf('month').format(ISO_DATE),
      end: ref.endOf('month').format(ISO_DATE),
      label: `เดือน${ref.format('MMMM BBBB')}`,
    };
  }
  if (period === 'year') {
    return {
      start: ref.startOf('year').format(ISO_DATE),
      end: ref.endOf('year').format(ISO_DATE),
      label: `ปี พ.ศ. ${ref.year() + 543}`,
    };
  }
  // ปีงบประมาณ: ปีที่เลือก = ปีงบที่สิ้นสุดใน ก.ย. ของปีนั้น
  const fy = ref.year();
  const r = fiscalRange(fy);
  return { ...r, label: `ปีงบประมาณ ${fy + 543} (${thaiDate(r.start)} – ${thaiDate(r.end)})` };
}

/** ค่าอ้างอิงเริ่มต้นเมื่อเปลี่ยนชนิดช่วงเวลา (ปีงบ = ปีงบปัจจุบัน เช่น ต.ค. 2569 อยู่ในปีงบ 2570) */
export const defaultRef = (p: Period): Dayjs => (p === 'fiscal' ? dayjs().year(fiscalYearOf(todayISO())) : dayjs());

/** แถบเลือก ทั้งหมด / รายวัน / รายเดือน / รายปี / ปีงบประมาณ + ตัวเลือกวันที่ */
export function PeriodPicker({
  period,
  value,
  onChange,
}: {
  period: Period;
  value: Dayjs;
  onChange: (period: Period, ref: Dayjs) => void;
}) {
  return (
    <>
      <Segmented<Period> options={PERIOD_OPTIONS} value={period} onChange={(p) => onChange(p, defaultRef(p))} />
      {period !== 'all' && (
        <DatePicker
          allowClear={false}
          value={value}
          onChange={(d) => d && onChange(period, d)}
          picker={period === 'day' ? 'date' : period === 'month' ? 'month' : 'year'}
          format={
            period === 'day' ? 'DD/MM/BBBB' : period === 'month' ? 'MMMM BBBB' : period === 'fiscal' ? '[ปีงบ] BBBB' : '[ปี] BBBB'
          }
          style={{ width: 180 }}
        />
      )}
    </>
  );
}
