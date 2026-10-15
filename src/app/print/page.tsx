'use client';

import {
  BarcodeOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CloseOutlined,
  ExclamationCircleFilled,
  EyeOutlined,
  HistoryOutlined,
  PlusCircleOutlined,
  PrinterOutlined,
  QuestionCircleFilled,
  RedoOutlined,
  ScanOutlined,
  SettingOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  App,
  AutoComplete,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  type RefSelectProps,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DisposeModal from '@/components/DisposeModal';
import RegisterUnitModal from '@/components/RegisterUnitModal';
import PrinterSettingsModal from '@/components/PrinterSettingsModal';
import ReprintModal from '@/components/ReprintModal';
import Sticker from '@/components/Sticker';
import { CycleBar, StatusTag } from '@/components/UnitBits';
import UnitHistory from '@/components/UnitHistory';
import { beep } from '@/lib/beep';
import { dayjs, ISO_DATE, THAI_DATE, thaiDate, todayISO } from '@/lib/date';
import { usePrinterSettings, usePrintStickers } from '@/lib/print';
import { useStore, type UnitInfo } from '@/lib/store';
import type { PrintLog, StickerData, Unit } from '@/lib/types';
import { normSn } from '@/lib/units';

const { Text } = Typography;

type RowState = 'ok' | 'notfound' | 'last' | 'disposed' | 'notype';

interface QueueRow {
  key: number;
  sn: string;
  /** รอบที่หน้างานเลือกพิมพ์ (ไม่ระบุ = รอบถัดไปตามลำดับ) */
  round?: number;
  /** หมายเหตุ — บังคับเมื่อพิมพ์ข้ามรอบ */
  note?: string;
  /** วันผลิตของดวงนี้ (YYYY-MM-DD) — ค่าเริ่มต้นคือวันที่ยิงเข้ารายการ */
  mfg: string;
}

interface Resolved extends QueueRow {
  state: RowState;
  info?: UnitInfo;
  /** รอบถัดไปตามลำดับ (ค่าต่ำสุดที่เลือกได้) */
  natural?: number;
  /** พิมพ์ข้ามรอบหรือไม่ */
  skipped?: boolean;
  /** ข้ามรอบแต่ยังไม่กรอกหมายเหตุ → ยังพิมพ์ไม่ได้ */
  needsNote?: boolean;
  exp?: string;
}

export default function PrintPage() {
  return (
    <Suspense>
      <SterilizeStation />
    </Suspense>
  );
}

function SterilizeStation() {
  const { units, staff, findUnitBySn, getUnitInfo, sterilize, updateItem } = useStore();
  const printStickers = usePrintStickers();
  const { settings: printer } = usePrinterSettings();
  const { message } = App.useApp();
  const params = useSearchParams();
  const scanRef = useRef<RefSelectProps>(null);
  const keySeq = useRef(0);

  const [scan, setScan] = useState('');
  // เจ้าหน้าที่ผู้พิมพ์ — บังคับเลือกก่อนพิมพ์ (เลือกครั้งเดียว ใช้ต่อได้จนกว่าจะเปลี่ยน/รีโหลดหน้า)
  const [staffId, setStaffId] = useState<number | null>(null);
  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);
  const currentStaff = activeStaff.find((s) => s.id === staffId);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [recent, setRecent] = useState<PrintLog[]>([]);
  const [register, setRegister] = useState<{ sn?: string; replaces?: Unit; rowKey?: number } | null>(null);
  const [dispose, setDispose] = useState<{ unit: Unit; rowKey?: number } | null>(null);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);

  const focusScan = useCallback(() => setTimeout(() => scanRef.current?.focus(), 60), []);

  // ===== ค้นหา + แนะนำ (กรณีสติ๊กเกอร์ลอก/ยิงไม่ติด พิมพ์บางส่วนของ SN หรือชื่ออุปกรณ์ได้) =====
  const justSelected = useRef(false);
  const suggestions = useMemo(() => {
    const q = scan.trim().toLowerCase();
    if (q.length < 2) return [];
    const statusOrder = { new: 0, active: 0, last: 1, disposed: 2 } as const;
    return units
      .map((u) => {
        const sn = u.sn.toLowerCase();
        const info = getUnitInfo(u);
        const name = (info.item?.name ?? '').toLowerCase();
        const rank = sn === q ? 0 : sn.startsWith(q) ? 1 : sn.includes(q) ? 2 : name.includes(q) ? 3 : -1;
        return { info, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => statusOrder[a.info.status] - statusOrder[b.info.status] || a.rank - b.rank || a.info.unit.sn.localeCompare(b.info.unit.sn))
      .slice(0, 8)
      .map(({ info }) => ({
        value: info.unit.sn,
        label: (
          <Flex justify="space-between" align="center" gap={8} style={{ opacity: info.status === 'disposed' ? 0.5 : 1 }}>
            <Space size={8} style={{ minWidth: 0 }}>
              <Text code>{info.unit.sn}</Text>
              <Text ellipsis style={{ maxWidth: 220 }}>
                {info.item?.name}
              </Text>
            </Space>
            <Space size={8}>
              <CycleBar used={info.used} max={info.unit.maxRound} width={70} />
              <StatusTag status={info.status} />
            </Space>
          </Flex>
        ),
      }));
  }, [scan, units, getUnitInfo]);

  const onScanEnter = (value: string) => {
    // รอให้ AutoComplete ตัดสินก่อนว่าผู้ใช้เลือกรายการแนะนำ (ลูกศร + Enter) หรือยิงบาร์โคดตรง ๆ
    setTimeout(() => {
      if (justSelected.current) justSelected.current = false;
      else addScan(value);
    }, 0);
  };

  /** ตรวจสถานะของ SN ณ ตอนนี้ (คำนวณใหม่ทุกครั้งที่ข้อมูลเปลี่ยน) */
  const resolve = useCallback(
    (row: QueueRow): Resolved => {
      const unit = findUnitBySn(row.sn);
      if (!unit) return { ...row, state: 'notfound' };
      const info = getUnitInfo(unit);
      if (info.status === 'disposed') return { ...row, state: 'disposed', info };
      if (info.status === 'last') return { ...row, state: 'last', info };
      if (!info.item) return { ...row, state: 'notype', info };
      const natural = info.nextRound!;
      const round = Math.min(info.unit.maxRound, Math.max(natural, row.round ?? natural));
      const skipped = round > natural;
      return {
        ...row,
        state: 'ok',
        info,
        natural,
        round,
        skipped,
        needsNote: skipped && !row.note?.trim(),
        exp: dayjs(row.mfg).add(info.item.shelf, 'day').format(ISO_DATE),
      };
    },
    [findUnitBySn, getUnitInfo],
  );

  const rows = useMemo(() => queue.map(resolve), [queue, resolve]);
  const ready = rows.filter((r) => r.state === 'ok' && !r.needsNote);
  const waitingNote = rows.filter((r) => r.needsNote).length;
  const problems = rows.filter((r) => r.state !== 'ok').length;

  const updateRow = (key: number, patch: Partial<QueueRow>) =>
    setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const doSterilize = (list: Resolved[]) => {
    const logs: PrintLog[] = [];
    if (!currentStaff) return logs;
    for (const r of list) {
      if (!r.info || !r.exp) continue;
      const res = sterilize(r.info.unit.id, r.mfg, r.exp, { staffId: currentStaff.id, round: r.round, note: r.note });
      if (res.ok) logs.push(res.value);
      else message.error(`${r.sn}: ${res.error}`);
    }
    if (logs.length) {
      printStickers(logs);
      setRecent((prev) => [...logs.slice().reverse(), ...prev].slice(0, 30));
    }
    return logs;
  };

  const addScan = (raw: string) => {
    const sn = raw.trim();
    setScan('');
    if (!sn) return;
    const dup = queue.find((q) => normSn(q.sn) === normSn(sn));
    if (dup) {
      beep('error');
      message.warning(`${sn} อยู่ในรายการแล้ว`);
      setSelected(dup.key);
      return;
    }
    const row: QueueRow = { key: ++keySeq.current, sn, mfg: todayISO() };
    const r = resolve(row);
    beep(r.state === 'ok' ? 'ok' : 'error');
    setQueue((q) => [...q, row]);
    setSelected(row.key);
  };

  // เปิดจากหน้าอื่นด้วย ?sn=XXX
  const fromParam = useRef(false);
  useEffect(() => {
    const sn = params.get('sn');
    if (sn && !fromParam.current) {
      fromParam.current = true;
      const row: QueueRow = { key: ++keySeq.current, sn, mfg: todayISO() };
      setQueue([row]);
      setSelected(row.key);
    }
  }, [params]);

  const printAll = () => {
    if (!ready.length) return;
    if (!currentStaff) {
      beep('error');
      message.warning('กรุณาเลือกเจ้าหน้าที่ผู้พิมพ์ก่อน');
      return;
    }
    const logs = doSterilize(ready);
    const done = new Set(ready.map((r) => r.key));
    setQueue((q) => q.filter((x) => !done.has(x.key)));
    setSelected(null);
    message.success(`ส่งพิมพ์ ${logs.length} ดวงแล้ว`);
    focusScan();
  };

  const removeRow = (key: number) => {
    setQueue((q) => q.filter((x) => x.key !== key));
    if (selected === key) setSelected(null);
    focusScan();
  };

  /** แทน SN ในแถวด้วยชิ้นที่เพิ่งลงทะเบียน (กรณีทดแทน / ระบบสร้าง SN ให้) */
  const replaceRowSn = (rowKey: number | undefined, units: Unit[]) => {
    if (rowKey == null || units.length !== 1) return;
    setQueue((q) => q.map((x) => (x.key === rowKey ? { ...x, sn: units[0].sn } : x)));
  };

  // แถวที่เลือก (หรือแถวล่าสุด) ใช้แสดงตัวอย่างและประวัติ
  const focusRow = rows.find((r) => r.key === selected) ?? rows[rows.length - 1];
  const focusUnit = focusRow?.info?.unit;
  const focusItem = focusRow?.info?.item;
  // เปิด/ปิดบาร์โคดบนสติ๊กเกอร์ของประเภทนี้ (บันทึกเป็นค่าของประเภทอุปกรณ์)
  const toggleBarcode = (on: boolean) => {
    if (!focusItem) return;
    const { id, ...rest } = focusItem;
    updateItem(id, { ...rest, useBarcode: on });
    message.success(`${focusItem.name}: ${on ? 'พิมพ์บาร์โคด' : 'ไม่พิมพ์บาร์โคด (แสดง SN เป็นตัวหนังสือ)'}`);
    focusScan();
  };
  const preview: StickerData | null = useMemo(() => {
    if (focusRow?.state === 'ok' && focusRow.info?.item) {
      const it = focusRow.info.item;
      return {
        name: it.name,
        useBarcode: it.useBarcode,
        barcode: focusRow.info.unit.sn,
        mfg: focusRow.mfg,
        exp: focusRow.exp!,
        round: focusRow.round!,
        maxRound: focusRow.info.unit.maxRound,
        staffName: currentStaff?.name ?? '',
      };
    }
    // ไม่มีรายการที่เลือก (เช่น เพิ่งพิมพ์เสร็จ) → ล้างตัวอย่าง
    const l = focusRow?.info?.lastLog;
    return l ? { name: l.name, useBarcode: l.useBarcode, barcode: l.barcode, mfg: l.mfg, exp: l.exp, round: l.round, maxRound: l.maxRound } : null;
  }, [focusRow, currentStaff]);

  return (
    <>
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={14}>
          <Flex vertical gap={20}>
            {/* ===== ช่องยิง ===== */}
            <Card styles={{ body: { padding: 20 } }}>
              <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
                <Space>
                  <ScanOutlined style={{ color: '#2563eb', fontSize: 18 }} />
                  <Text strong style={{ fontSize: 16 }}>
                    ยิงบาร์โคด SN ของอุปกรณ์ที่ sterilize เสร็จ
                  </Text>
                </Space>
                <Space wrap>
                  <Button icon={<RedoOutlined />} onClick={() => setReprintOpen(true)}>
                    พิมพ์ซ้ำ
                  </Button>
                  <Button icon={<PlusCircleOutlined />} onClick={() => setRegister({})}>
                    ลงทะเบียนชิ้นใหม่
                  </Button>
                  <Tooltip title="ตั้งค่าเครื่องพิมพ์ / พิมพ์ทดสอบ">
                    <Button icon={<SettingOutlined />} onClick={() => setPrinterOpen(true)} aria-label="ตั้งค่าเครื่องพิมพ์" />
                  </Tooltip>
                </Space>
              </Flex>
              <AutoComplete
                ref={scanRef}
                autoFocus
                size="large"
                value={scan}
                options={suggestions}
                onChange={(v: string) => setScan(v ?? '')}
                onSelect={(v: string) => {
                  // กัน Enter เดียวกันไม่ให้เพิ่มซ้ำ แล้วล้างธงในจังหวะถัดไป (กรณีคลิกเลือกด้วยเมาส์)
                  justSelected.current = true;
                  setTimeout(() => (justSelected.current = false), 50);
                  addScan(v);
                  focusScan();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onScanEnter((e.target as HTMLInputElement).value);
                }}
                defaultActiveFirstOption={false}
                prefix={<BarcodeOutlined style={{ color: '#94a3b8', fontSize: 20 }} />}
                placeholder="ยิงบาร์โคด หรือพิมพ์ SN / ชื่ออุปกรณ์เพื่อค้นหา…"
                style={{ width: '100%', height: 56 }}
                styles={{
                  input: { fontSize: 20, fontFamily: 'ui-monospace, monospace' },
                  placeholder: { fontSize: 18 },
                }}
              />
            </Card>

            {/* ===== รายการรอพิมพ์ ===== */}
            <Card
              title={
                <Space>
                  รายการรอพิมพ์
                  <Badge count={ready.length} showZero color="#2563eb" />
                  {problems > 0 && <Badge count={`มีปัญหา ${problems}`} color="#ef4444" />}
                </Space>
              }
              extra={
                rows.length > 0 && (
                  <Button type="text" onClick={() => (setQueue([]), setSelected(null), focusScan())}>
                    ล้างรายการ
                  </Button>
                )
              }
              styles={{ body: { padding: rows.length ? 0 : undefined } }}
            >
              {rows.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="ยิง SN ได้เลย แล้วกดพิมพ์ทั้งหมดทีเดียว"
                />
              ) : (
                <div>
                  {rows.map((r) => (
                    <QueueItem
                      key={r.key}
                      row={r}
                      selected={focusRow?.key === r.key}
                      onSelect={() => setSelected(r.key)}
                      onRemove={() => removeRow(r.key)}
                      onRegister={() => setRegister({ sn: r.sn, rowKey: r.key })}
                      onDispose={() => r.info && setDispose({ unit: r.info.unit, rowKey: r.key })}
                      onReplace={() => r.info && setRegister({ replaces: r.info.unit, rowKey: r.key })}
                      onChange={(patch) => updateRow(r.key, patch)}
                    />
                  ))}
                </div>
              )}
              {rows.length > 0 && (
                <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
                  <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                    <Text strong style={{ whiteSpace: 'nowrap' }}>
                      <UserOutlined /> เจ้าหน้าที่ผู้พิมพ์ <Text type="danger">*</Text>
                    </Text>
                    <Select
                      showSearch
                      allowClear
                      size="large"
                      value={currentStaff?.id ?? null}
                      onChange={(v) => setStaffId(v ?? null)}
                      placeholder="เลือกหรือพิมพ์ค้นหาชื่อ / รหัส"
                      optionFilterProp="search"
                      status={!currentStaff && ready.length ? 'error' : undefined}
                      style={{ flex: 1, minWidth: 0 }}
                      options={activeStaff.map((s) => ({
                        value: s.id,
                        label: s.code ? `${s.name} (${s.code})` : s.name,
                        search: `${s.name} ${s.code ?? ''}`,
                      }))}
                      notFoundContent={
                        activeStaff.length ? 'ไม่พบชื่อ' : <Link href="/staff">ยังไม่มีรายชื่อ — ให้แอดมินเพิ่มที่เมนูรายชื่อเจ้าหน้าที่</Link>
                      }
                    />
                  </Flex>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<PrinterOutlined />}
                    disabled={!ready.length || !currentStaff}
                    onClick={printAll}
                    style={{ height: 56, fontSize: 18 }}
                  >
                    พิมพ์ทั้งหมด {ready.length} ดวง
                  </Button>
                  {printer.printerName && (
                    <Text type="secondary" style={{ display: 'block', marginTop: 8, textAlign: 'center' }}>
                      <PrinterOutlined /> พิมพ์ออกที่เครื่อง <Text strong>{printer.printerName}</Text> · 50 × 25 มม.
                    </Text>
                  )}
                  {!currentStaff && ready.length > 0 && (
                    <Text type="danger" style={{ display: 'block', marginTop: 8, textAlign: 'center' }}>
                      เลือกเจ้าหน้าที่ผู้พิมพ์ก่อนจึงจะพิมพ์ได้
                    </Text>
                  )}
                  {waitingNote > 0 && (
                    <Text type="warning" style={{ display: 'block', marginTop: 8, textAlign: 'center' }}>
                      มี {waitingNote} ดวงที่พิมพ์ข้ามรอบ — กรอกหมายเหตุก่อนจึงจะพิมพ์ได้
                    </Text>
                  )}
                  {problems > 0 && (
                    <Text type="secondary" style={{ display: 'block', marginTop: 8, textAlign: 'center' }}>
                      รายการที่มีปัญหาจะไม่ถูกพิมพ์ — แก้ไขหรือกด ✕ เอาออก
                    </Text>
                  )}
                </div>
              )}
            </Card>

            {recent.length > 0 && (
              <Card size="small" title={<Text type="secondary">พิมพ์ไปแล้วรอบนี้ ({recent.length})</Text>}>
                <Flex wrap gap={6}>
                  {recent.map((l) => (
                    <Tag key={l.id} color="blue" style={{ fontFamily: 'ui-monospace, monospace' }}>
                      {l.barcode} · {l.round}/{l.maxRound}
                    </Tag>
                  ))}
                </Flex>
              </Card>
            )}
          </Flex>
        </Col>

        {/* ===== ตัวอย่าง + ประวัติ ===== */}
        <Col xs={24} xl={10}>
          <Flex vertical gap={20}>
            <Card
              title={
                <Space>
                  <EyeOutlined style={{ color: '#2563eb' }} />
                  ตัวอย่างสติ๊กเกอร์
                </Space>
              }
              extra={
                <Space size={12}>
                  {focusItem && (
                    <Tooltip title={`ตั้งค่าของรายการ "${focusItem.name}" — มีผลกับทุกชิ้นของรายการนี้ (แก้ได้ที่หน้ารายการอุปกรณ์ด้วย)`}>
                      <Space size={6}>
                        <BarcodeOutlined style={{ color: focusItem.useBarcode ? '#2563eb' : '#94a3b8' }} />
                        <Text type="secondary">บาร์โคด</Text>
                        <Switch size="small" checked={focusItem.useBarcode} onChange={toggleBarcode} />
                      </Space>
                    </Tooltip>
                  )}
                  {focusRow && <Text code>{focusRow.sn}</Text>}
                </Space>
              }
            >
              {focusRow?.state === 'ok' && (
                <Flex justify="flex-end" align="center" gap={8} style={{ marginBottom: 12 }}>
                  <Text type="secondary">วันผลิต</Text>
                  <MfgPicker value={focusRow.mfg} onChange={(v) => updateRow(focusRow.key, { mfg: v })} width={150} />
                  <Tooltip title="ตั้งได้แยกทีละดวง (เฉพาะดวงที่เลือกอยู่) · ค่าเริ่มต้นคือวันนี้ · วันหมดอายุคำนวณตามอายุหลัง sterilize ของรายการนั้น">
                    <QuestionCircleFilled style={{ color: '#cbd5e1' }} />
                  </Tooltip>
                </Flex>
              )}
              <div className="sticker-preview-wrap">
                <div className="sticker-preview">
                  {preview ? (
                    <Sticker data={preview} />
                  ) : (
                    <Flex
                      vertical
                      align="center"
                      justify="center"
                      gap={6}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: '2px dashed #cbd5e1',
                        borderRadius: 12,
                        color: '#94a3b8',
                      }}
                    >
                      <BarcodeOutlined style={{ fontSize: 36 }} />
                      <Text type="secondary">ยิง SN เพื่อดูตัวอย่างสติ๊กเกอร์</Text>
                    </Flex>
                  )}
                </div>
              </div>
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: 12 }}>
                {focusRow && focusRow.state !== 'ok' && preview
                  ? 'แสดงดวงล่าสุดที่เคยพิมพ์ — ชิ้นนี้พิมพ์รอบใหม่ไม่ได้'
                  : 'ขนาดจริง 5.0 × 2.5 ซม. · กรอบสีส้มเป็นของม้วนสติ๊กเกอร์ ไม่ได้พิมพ์ออกไป'}
              </Text>
            </Card>

            <Card
              title={
                <Space>
                  <HistoryOutlined style={{ color: '#2563eb' }} />
                  ประวัติของชิ้นนี้
                </Space>
              }
            >
              {focusUnit ? (
                <UnitHistory unit={focusUnit} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ยิง SN เพื่อดูประวัติ" />
              )}
            </Card>
          </Flex>
        </Col>
      </Row>

      <RegisterUnitModal
        open={!!register}
        onClose={() => (setRegister(null), focusScan())}
        defaultSn={register?.sn}
        replaces={register?.replaces}
        defaultPrintNow={register?.rowKey == null}
        onDone={(units) => replaceRowSn(register?.rowKey, units)}
      />
      <DisposeModal
        unit={dispose?.unit ?? null}
        onClose={() => (setDispose(null), focusScan())}
        onDisposed={(u, replace) => {
          const rowKey = dispose?.rowKey;
          if (replace) setRegister({ replaces: u, rowKey });
          else if (rowKey != null) removeRow(rowKey);
        }}
      />
      <ReprintModal open={reprintOpen} onClose={() => (setReprintOpen(false), focusScan())} />
      <PrinterSettingsModal open={printerOpen} onClose={() => (setPrinterOpen(false), focusScan())} />
    </>
  );
}

/** เลือกวันผลิต (เก็บเป็น YYYY-MM-DD แสดงแบบ พ.ศ.) */
function MfgPicker({ value, onChange, size, width }: { value: string; onChange: (v: string) => void; size?: 'small'; width: number }) {
  return (
    <DatePicker
      size={size}
      value={dayjs(value)}
      onChange={(d: Dayjs | null) => d && onChange(d.format(ISO_DATE))}
      format={THAI_DATE}
      allowClear={false}
      suffixIcon={<CalendarOutlined />}
      style={{ width }}
    />
  );
}

/** แถว 1 รายการในคิว — สีและปุ่มบอกชัดว่าต้องทำอะไร */
function QueueItem({
  row,
  selected,
  onSelect,
  onRemove,
  onRegister,
  onDispose,
  onReplace,
  onChange,
}: {
  row: Resolved;
  onChange: (patch: Partial<QueueRow>) => void;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRegister: () => void;
  onDispose: () => void;
  onReplace: () => void;
}) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const { info } = row;
  const tone = {
    ok: { bg: '#ffffff', icon: <CheckCircleFilled style={{ color: '#16a34a' }} /> },
    notfound: { bg: '#fffbeb', icon: <QuestionCircleFilled style={{ color: '#f59e0b' }} /> },
    last: { bg: '#fef2f2', icon: <ExclamationCircleFilled style={{ color: '#ef4444' }} /> },
    disposed: { bg: '#fef2f2', icon: <CloseCircleFilled style={{ color: '#ef4444' }} /> },
    notype: { bg: '#fef2f2', icon: <CloseCircleFilled style={{ color: '#ef4444' }} /> },
  }[row.state];
  // ข้ามรอบแต่ยังไม่กรอกหมายเหตุ → ไอคอนเตือนสีส้ม (ยังพิมพ์ไม่ได้)
  if (row.needsNote) tone.icon = <ExclamationCircleFilled style={{ color: '#f59e0b' }} />;

  return (
    <Flex
      align="center"
      gap={12}
      onClick={onSelect}
      style={{
        padding: '12px 16px',
        background: tone.bg,
        borderBottom: '1px solid #f0f0f0',
        borderLeft: `4px solid ${selected ? '#2563eb' : 'transparent'}`,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 20 }}>{tone.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={8} wrap>
          <Text code style={{ fontSize: 14 }}>
            {row.sn}
          </Text>
          {info?.item && <Text strong>{info.item.name}</Text>}
        </Space>
        <div style={{ marginTop: 2 }}>
          {row.state === 'ok' && (
            <>
              <Space size={8} wrap align="center" style={{ marginTop: 2 }}>
                <Text>พิมพ์รอบ</Text>
                <span onClick={stop}>
                  <InputNumber
                    size="small"
                    value={row.round}
                    min={row.natural}
                    max={info!.unit.maxRound}
                    precision={0}
                    step={1}
                    inputMode="numeric"
                    // รับเฉพาะตัวเลข — กัน e, E, +, -, . ที่ช่องตัวเลขของเบราว์เซอร์ยอมให้พิมพ์
                    onKeyDown={(e) => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()}
                    parser={(v) => Number((v ?? '').replace(/\D/g, '')) || 0}
                    onChange={(v) => onChange({ round: typeof v === 'number' ? v : undefined })}
                    style={{ width: 64, fontWeight: 600, color: row.skipped ? '#d97706' : '#1d4ed8' }}
                    status={row.skipped ? 'warning' : undefined}
                  />
                </span>
                <Text strong style={{ color: '#1d4ed8' }}>/ {info!.unit.maxRound}</Text>
                {row.round === info!.unit.maxRound && <Text type="warning">(รอบสุดท้าย)</Text>}
              </Space>
              <Space size={8} wrap align="center" style={{ marginTop: 4 }}>
                <Text>วันผลิต</Text>
                <span onClick={stop}>
                  <MfgPicker value={row.mfg} onChange={(v) => onChange({ mfg: v })} size="small" width={130} />
                </span>
                <Text type="secondary">หมดอายุ {thaiDate(row.exp)}</Text>
              </Space>
              {row.skipped && (
                <div onClick={stop} style={{ marginTop: 6 }}>
                  <Text type="warning" style={{ fontSize: 12 }}>
                    ข้ามจากรอบ {row.natural} ไปรอบ {row.round} — ต้องกรอกหมายเหตุ
                  </Text>
                  <Input.TextArea
                    value={row.note}
                    onChange={(e) => onChange({ note: e.target.value })}
                    placeholder="เช่น ใช้งานไปแล้วแต่ไม่ได้บันทึก, พิมพ์ย้อนหลังจากระบบเดิม"
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    maxLength={200}
                    status={row.needsNote ? 'error' : undefined}
                    style={{ marginTop: 4 }}
                  />
                </div>
              )}
            </>
          )}
          {row.state === 'notfound' && <Text type="warning">ไม่พบ SN นี้ในระบบ — ลงทะเบียนก่อน</Text>}
          {row.state === 'last' && (
            <Text type="danger">
              ใช้ครบ {info!.unit.maxRound} รอบแล้ว — ห้าม sterilize ซ้ำ ต้องทำลาย
            </Text>
          )}
          {row.state === 'disposed' && <Text type="danger">ชิ้นนี้ถูกทำลายไปแล้ว</Text>}
          {row.state === 'notype' && <Text type="danger">รายการอุปกรณ์ของชิ้นนี้ถูกลบไปแล้ว</Text>}
        </div>
      </div>
      {row.state === 'ok' && info && (
        <span className="hide-sm">
          <CycleBar used={row.round!} max={info.unit.maxRound} width={100} />
        </span>
      )}
      {row.state === 'notfound' && (
        <Button type="primary" icon={<PlusCircleOutlined />} onClick={(e) => (e.stopPropagation(), onRegister())}>
          ลงทะเบียน
        </Button>
      )}
      {row.state === 'last' && (
        <Button danger type="primary" icon={<SwapOutlined />} onClick={(e) => (e.stopPropagation(), onDispose())}>
          ทำลาย & เปลี่ยนชิ้น
        </Button>
      )}
      {row.state === 'disposed' && (
        <Button icon={<SwapOutlined />} onClick={(e) => (e.stopPropagation(), onReplace())}>
          ชิ้นทดแทน
        </Button>
      )}
      <Tooltip title="เอาออกจากรายการ">
        <Button type="text" icon={<CloseOutlined />} onClick={(e) => (e.stopPropagation(), onRemove())} />
      </Tooltip>
    </Flex>
  );
}
