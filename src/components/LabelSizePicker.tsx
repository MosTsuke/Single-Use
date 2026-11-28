'use client';

import { Flex, Segmented } from 'antd';
import { LABEL_SIZE_LIST, LABEL_SIZES, type LabelSize } from '@/lib/label-size';
import { usePrinterSettings } from '@/lib/print';

/**
 * เลือกขนาดสติ๊กเกอร์ตามม้วนที่ใส่ในเครื่องพิมพ์ — ค่าเดียวใช้ร่วมกันทั้งหน้าพิมพ์ พิมพ์ซ้ำ ลงทะเบียน และพิมพ์ทดสอบ
 * ไม่จำข้ามการเปิดโปรแกรม (เปิดใหม่ = 50 × 25 ขอบส้ม)
 */
export default function LabelSizePicker({ size = 'middle' }: { size?: 'small' | 'middle' | 'large' }) {
  const { labelSize, setLabelSize } = usePrinterSettings();
  return (
    <Segmented<LabelSize>
      size={size}
      value={labelSize}
      onChange={setLabelSize}
      options={LABEL_SIZE_LIST.map((k) => {
        const s = LABEL_SIZES[k];
        return {
          value: k,
          label: (
            // ขนาดที่เลือก: ตัวหนา + สีตามกรอบของม้วน ให้เห็นชัดว่ากำลังพิมพ์ขนาดไหน
            <Flex align="center" gap={6} style={k === labelSize ? { color: s.ink, fontWeight: 700 } : undefined}>
              {/* รูปย่อของดวง: สัดส่วนจริง + สีกรอบของม้วน */}
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: Math.round((16 * s.h) / s.w),
                  border: `2px solid ${s.frame}`,
                  borderRadius: 3,
                  background: '#fff',
                }}
              />
              {s.text} ขอบ{s.color}
            </Flex>
          ),
        };
      })}
    />
  );
}
