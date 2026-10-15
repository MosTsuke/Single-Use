'use client';

import { Progress, Tag, Tooltip } from 'antd';
import type { UnitStatus } from '@/lib/types';
import { STATUS_META } from '@/lib/units';

export function StatusTag({ status }: { status: UnitStatus }) {
  const m = STATUS_META[status];
  return (
    <Tooltip title={m.hint}>
      <Tag color={m.color} style={{ marginInlineEnd: 0 }}>
        {m.label}
      </Tag>
    </Tooltip>
  );
}

/** แถบแสดงจำนวนรอบที่ใช้ไปแล้ว เช่น ■■■□ 3/4 */
export function CycleBar({ used, max, width = 120 }: { used: number; max: number; width?: number }) {
  const color = used >= max ? '#ef4444' : used === max - 1 ? '#f59e0b' : '#2563eb';
  return (
    <Tooltip title={`ใช้ไปแล้ว ${used} จาก ${max} รอบ`}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        {max <= 10 ? (
          <Progress
            steps={max}
            percent={(used / max) * 100}
            showInfo={false}
            strokeColor={color}
            size={[Math.max(6, Math.min(24, Math.floor(width / max) - 2)), 8]}
          />
        ) : (
          // รอบเยอะเกินจะแบ่งช่อง ใช้แถบต่อเนื่องแทน
          <Progress
            percent={(used / max) * 100}
            showInfo={false}
            strokeColor={color}
            size={[Math.min(width, 100), 8]}
            style={{ width: Math.min(width, 100), margin: 0 }}
          />
        )}
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {used}/{max}
        </span>
      </span>
    </Tooltip>
  );
}
