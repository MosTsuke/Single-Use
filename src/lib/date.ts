import dayjs, { type Dayjs } from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import 'dayjs/locale/th';

dayjs.extend(buddhistEra);
dayjs.locale('th');

export { dayjs };

export const ISO_DATE = 'YYYY-MM-DD';
/** รูปแบบวันที่แสดงในโปรแกรม เช่น 14/10/2569 */
export const THAI_DATE = 'DD/MM/BBBB';

/** วันที่ตามเวลาเครื่อง (ไม่ใช่ UTC) */
export const todayISO = () => dayjs().format(ISO_DATE);
export const nowStamp = () => dayjs().format('YYYY-MM-DD HH:mm');

/** YYYY-MM-DD -> DD/MM/พ.ศ. */
export function thaiDate(iso?: string): string {
  if (!iso) return '--/--/----';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${Number(y) + 543}`;
}

/** "YYYY-MM-DD HH:mm" -> "DD/MM/พ.ศ. HH:mm" */
export function thaiDateTime(stamp?: string): string {
  if (!stamp) return '-';
  const [d, t] = stamp.split(' ');
  return `${thaiDate(d)}${t ? ' ' + t : ''}`;
}

export function addDays(iso: string, days: number): string {
  return dayjs(iso, ISO_DATE).add(days, 'day').format(ISO_DATE);
}

export const toDayjs = (iso?: string): Dayjs | null => (iso ? dayjs(iso, ISO_DATE) : null);

/**
 * ปีงบประมาณไทย: 1 ต.ค. ถึง 30 ก.ย. ปีถัดไป
 * @param fiscalYearCE ปีงบประมาณแบบ ค.ศ. (ปีที่สิ้นสุด) เช่น 2026 = ปีงบ 2569
 */
export function fiscalRange(fiscalYearCE: number) {
  return { start: `${fiscalYearCE - 1}-10-01`, end: `${fiscalYearCE}-09-30` };
}

/** ปีงบประมาณ (ค.ศ.) ของวันที่ที่ระบุ */
export function fiscalYearOf(iso: string): number {
  const d = dayjs(iso, ISO_DATE);
  return d.month() >= 9 ? d.year() + 1 : d.year();
}
