'use client';

import { Flex, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';

/**
 * กราฟเล็ก ๆ สำหรับแดชบอร์ด (เขียนเอง ไม่ใช้ไลบรารีกราฟ)
 * สเปก: แท่งไม่เกิน 24px มุมบนโค้ง 4px ฐานเหลี่ยม · เว้นช่อง 2px ระหว่างส่วนที่ต่อกัน
 * เส้นกริดบาง สีจาง · ตัวหนังสือใช้สีข้อความ ไม่ใช้สีของข้อมูล · ทุกแท่งมี tooltip
 */

export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7' };
/** สีหมวดหมู่ (เรียงตายตัว ผ่านการตรวจตาบอดสีแล้ว) */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

const { Text } = Typography;

function niceMax(v: number) {
  if (v <= 4) return 4;
  if (v <= 10) return v % 2 ? v + 1 : v;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Flex gap={16} wrap>
      {items.map((s) => (
        <Flex key={s.label} align="center" gap={6}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
          <Text style={{ fontSize: 12, color: INK.secondary }}>{s.label}</Text>
        </Flex>
      ))}
    </Flex>
  );
}

/** กราฟแท่งแนวตั้ง (ซ้อนได้) — ใช้แสดงจำนวนรายเดือน */
export function ColumnChart({
  data,
  series,
  height = 180,
  unit,
}: {
  /** label = ป้ายใต้แท่ง (เว้นว่างได้เมื่อแท่งถี่), full = ชื่อเต็มใน tooltip */
  data: { label: string; full?: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number;
  unit: string;
}) {
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals));
  // เส้นกลางเฉพาะเมื่อเป็นจำนวนเต็ม (ไม่แสดง 12.5 ชิ้น)
  const ticks = Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max];
  const fmt = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : `${+v.toFixed(1)}`);

  return (
    <div>
      {series.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
        </div>
      )}
      <Flex gap={8}>
        {/* แกน Y */}
        <div style={{ position: 'relative', width: 28, height, flex: 'none' }}>
          {ticks.map((t) => (
            <Text
              key={t}
              style={{
                position: 'absolute',
                right: 0,
                bottom: (t / max) * height - 7,
                fontSize: 11,
                color: INK.muted,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: '14px',
              }}
            >
              {fmt(t)}
            </Text>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: 'relative', height }}>
            {ticks.map((t) => (
              <div
                key={t}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: (t / max) * height,
                  borderTop: `1px solid ${t === 0 ? INK.axis : INK.grid}`,
                }}
              />
            ))}
            <Flex style={{ position: 'absolute', inset: 0 }}>
              {data.map((d, i) => (
                <Tooltip
                  key={i}
                  title={
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.full ?? d.label}</div>
                      {series.map((s, k) => (
                        <Flex key={s.name} align="center" gap={6}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                          {series.length > 1 ? `${s.name}: ` : ''}
                          {d.values[k].toLocaleString()} {unit}
                        </Flex>
                      ))}
                      {series.length > 1 && (
                        <div style={{ marginTop: 2, opacity: 0.8 }}>
                          รวม {totals[i].toLocaleString()} {unit}
                        </div>
                      )}
                    </div>
                  }
                >
                  {/* พื้นที่ hover กว้างทั้งช่อง ใหญ่กว่าตัวแท่ง */}
                  <Flex vertical justify="flex-end" align="center" className="dash-col" style={{ flex: 1, minWidth: 0, height: '100%', cursor: 'default', padding: '0 1px' }}>
                    <div style={{ width: '100%', maxWidth: 24, display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
                      {d.values.map((v, k) => {
                        if (!v) return null;
                        const top = d.values.slice(k + 1).every((x) => !x);
                        return (
                          <div
                            key={k}
                            style={{
                              height: Math.max(2, (v / max) * height - 2),
                              background: series[k].color,
                              borderRadius: top ? '4px 4px 0 0' : 0,
                            }}
                          />
                        );
                      })}
                    </div>
                  </Flex>
                </Tooltip>
              ))}
            </Flex>
          </div>
          <Flex style={{ marginTop: 6 }}>
            {data.map((d, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: INK.muted, whiteSpace: 'nowrap' }}>
                {d.label}
              </Text>
            ))}
          </Flex>
        </div>
      </Flex>
    </div>
  );
}

/** แท่งสัดส่วน 100% แนวนอน + รายการคำอธิบาย (กดเลือกได้) */
export function ShareBar({
  segments,
  selected,
  onSelect,
  unit,
  empty,
}: {
  segments: { key: string; label: string; value: number; color: string; hint?: ReactNode }[];
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  unit: string;
  empty?: ReactNode;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return <>{empty}</>;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div>
      <Flex gap={2} style={{ height: 14, marginBottom: 16 }}>
        {segments
          .filter((s) => s.value > 0)
          .map((s, i, arr) => (
            <Tooltip key={s.key} title={`${s.label}: ${s.value.toLocaleString()} ${unit} (${pct(s.value)}%)`}>
              <div
                onClick={() => onSelect?.(selected === s.key ? null : s.key)}
                style={{
                  flex: s.value,
                  minWidth: 4,
                  background: s.color,
                  opacity: selected && selected !== s.key ? 0.3 : 1,
                  borderRadius: `${i === 0 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
                  cursor: onSelect ? 'pointer' : 'default',
                  transition: 'opacity .15s',
                }}
              />
            </Tooltip>
          ))}
      </Flex>
      <Flex vertical gap={2}>
        {segments.map((s) => {
          const active = selected === s.key;
          return (
            <Flex
              key={s.key}
              align="center"
              gap={10}
              onClick={() => s.value && onSelect?.(active ? null : s.key)}
              className={onSelect && s.value ? 'dash-row' : undefined}
              style={{
                padding: '6px 8px',
                borderRadius: 8,
                background: active ? '#eff6ff' : undefined,
                cursor: onSelect && s.value ? 'pointer' : 'default',
                opacity: s.value ? 1 : 0.5,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: INK.primary }}>{s.label}</Text>
                {s.hint && (
                  <Text style={{ display: 'block', fontSize: 12, color: INK.muted }} ellipsis>
                    {s.hint}
                  </Text>
                )}
              </div>
              <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {s.value.toLocaleString()}
              </Text>
              <Text style={{ width: 40, textAlign: 'right', fontSize: 12, color: INK.muted, fontVariantNumeric: 'tabular-nums' }}>
                {pct(s.value)}%
              </Text>
            </Flex>
          );
        })}
      </Flex>
    </div>
  );
}

/** แถบวัดสัดส่วนเล็ก ๆ ในตาราง (ราง = สีอ่อนของสีเดียวกัน) */
export function Meter({ value, color, track, width = 80 }: { value: number; color: string; track: string; width?: number }) {
  return (
    <span style={{ display: 'inline-block', width, height: 6, borderRadius: 3, background: track, verticalAlign: 'middle', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${Math.min(100, Math.max(0, value * 100))}%`, height: '100%', background: color, borderRadius: 3 }} />
    </span>
  );
}
