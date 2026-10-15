'use client';

import {
  BarcodeOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { todayISO } from '@/lib/date';
import { buildDemoData } from '@/lib/demo';
import { cleanPrefix, normalizeData } from '@/lib/storage';
import { useStore } from '@/lib/store';
import type { MasterItem } from '@/lib/types';

type ItemForm = Omit<MasterItem, 'id'>;
const { Text } = Typography;

export default function ItemsPage() {
  const { items, units, logs, getUnitInfo, addItem, updateItem, deleteItem, replaceAll } = useStore();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<ItemForm>();
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  // จำนวนชิ้นแยกตามสถานะ ต่อประเภท
  const usage = useMemo(() => {
    const m = new Map<number, { ready: number; last: number; disposed: number }>();
    units.forEach((u) => {
      const c = m.get(u.itemId) ?? { ready: 0, last: 0, disposed: 0 };
      const st = getUnitInfo(u).status;
      if (st === 'disposed') c.disposed++;
      else if (st === 'last') c.last++;
      else c.ready++;
      m.set(u.itemId, c);
    });
    return m;
  }, [units, getUnitInfo]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((i) => !kw || i.name.toLowerCase().includes(kw));
  }, [items, q]);

  const openAdd = () => {
    setEditing(null);
    form.setFieldsValue({ name: '', shelf: 7, maxRound: 4, useBarcode: true, snPrefix: '' });
    setOpen(true);
  };

  const openEdit = (item: MasterItem) => {
    setEditing(item);
    form.setFieldsValue(item);
    setOpen(true);
  };

  const onSave = async () => {
    const v = await form.validateFields();
    const data = { ...v, name: v.name.trim(), snPrefix: cleanPrefix(v.snPrefix) };
    if (editing) {
      updateItem(editing.id, data);
      message.success('บันทึกการแก้ไขแล้ว');
    } else {
      addItem(data);
      message.success('เพิ่มประเภทอุปกรณ์แล้ว');
    }
    setOpen(false);
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), items, units, logs }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `singleuse-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBackup = (file: File) => {
    file
      .text()
      .then((txt) => {
        const raw = JSON.parse(txt);
        if (!Array.isArray(raw.items) || !Array.isArray(raw.logs)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
        const data = normalizeData(raw);
        modal.confirm({
          title: 'นำเข้าข้อมูลสำรอง',
          content: `พบ ${data.items.length} ประเภท, อุปกรณ์ ${data.units.length} ชิ้น และประวัติการพิมพ์ ${data.logs.length} ดวง — ข้อมูลปัจจุบันในเครื่องนี้จะถูกแทนที่ทั้งหมด`,
          okText: 'นำเข้าและแทนที่',
          okButtonProps: { danger: true },
          cancelText: 'ยกเลิก',
          onOk: () => {
            replaceAll(data);
            message.success('นำเข้าข้อมูลเรียบร้อย');
          },
        });
      })
      .catch((e: Error) => message.error(`นำเข้าไม่สำเร็จ: ${e.message}`));
    return false;
  };

  const loadDemo = () => {
    modal.confirm({
      title: 'โหลดข้อมูลตัวอย่าง',
      icon: <ExperimentOutlined style={{ color: '#7c3aed' }} />,
      content:
        'จำลองอุปกรณ์ 6 ประเภท พร้อมประวัติ sterilize ย้อนหลังประมาณ 5 เดือน ข้อมูลปัจจุบันในเครื่องนี้จะถูกแทนที่ทั้งหมด (กดสำรองข้อมูลก่อนได้)',
      okText: 'โหลดข้อมูลตัวอย่าง',
      cancelText: 'ยกเลิก',
      onOk: () => {
        const d = buildDemoData();
        replaceAll(d);
        message.success(`โหลดตัวอย่างแล้ว: ${d.units.length} ชิ้น, ประวัติ ${d.logs.length} ดวง`);
      },
    });
  };

  const columns: ColumnsType<MasterItem> = [
    {
      title: 'ประเภทอุปกรณ์',
      dataIndex: 'name',
      width: 200,
      sorter: (a, b) => a.name.localeCompare(b.name, 'th'),
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'อายุหลัง sterilize',
      dataIndex: 'shelf',
      width: 130,
      sorter: (a, b) => a.shelf - b.shelf,
      render: (v: number) => `${v} วัน`,
    },
    {
      title: 'รอบสูงสุด',
      dataIndex: 'maxRound',
      width: 130,
      render: (v: number) => <Tag color="blue">{v} รอบ</Tag>,
    },
    {
      title: 'บาร์โคด',
      dataIndex: 'useBarcode',
      width: 130,
      align: 'center',
      render: (v: boolean) =>
        v ? (
          <Tag icon={<BarcodeOutlined />} color="success">
            ใช้บาร์โคด
          </Tag>
        ) : (
          <Tag icon={<StopOutlined />}>ไม่ใช้บาร์โคด</Tag>
        ),
    },
    {
      title: 'คำนำหน้า SN',
      dataIndex: 'snPrefix',
      width: 130,
      render: (v: string) => <Text code>{v}-000001</Text>,
    },
    {
      title: (
        <Tooltip title="ยังมีรอบเหลือ ใช้งานได้">
          พร้อมใช้
        </Tooltip>
      ),
      width: 100,
      align: 'right',
      render: (_, r) => <Text strong style={{ color: '#16a34a' }}>{usage.get(r.id)?.ready ?? 0}</Text>,
    },
    {
      title: (
        <Tooltip title="ใช้ครบรอบแล้ว ยังไม่ได้บันทึกทำลาย">
          รอทำลาย
        </Tooltip>
      ),
      width: 100,
      align: 'right',
      render: (_, r) => {
        const n = usage.get(r.id)?.last ?? 0;
        return <Text strong={n > 0} type={n > 0 ? 'danger' : 'secondary'}>{n}</Text>;
      },
    },
    {
      title: 'ทำลายแล้ว',
      width: 100,
      align: 'right',
      render: (_, r) => <Text type="secondary">{usage.get(r.id)?.disposed ?? 0}</Text>,
    },
    {
      title: 'จัดการ',
      width: 120,
      align: 'center',
      render: (_, r) => (
        <Space>
          <Tooltip title="แก้ไข">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm
            title="ลบประเภทนี้?"
            description="ลบได้เมื่อไม่มีอุปกรณ์ที่ยังใช้งานอยู่ ประวัติเดิมยังอยู่ในรายงาน"
            okText="ลบ"
            cancelText="ยกเลิก"
            okButtonProps={{ danger: true }}
            onConfirm={() => {
              const res = deleteItem(r.id);
              if (res.ok) message.success(`ลบ ${r.name} แล้ว`);
              else message.error(res.error);
            }}
          >
            <Tooltip title="ลบ">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={20}>
      <Card
        title={`ประเภทอุปกรณ์ทั้งหมด (${items.length})`}
        extra={
          <Flex gap={8} wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="ค้นหาประเภท"
              style={{ width: 200 }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              เพิ่มประเภทอุปกรณ์
            </Button>
          </Flex>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty description="ยังไม่มีรายการ">
                <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                  เพิ่มประเภทแรก
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <Card title="สำรอง / กู้คืนข้อมูล">
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Text type="secondary" style={{ maxWidth: 560 }}>
            ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์ของเครื่องนี้ ควรสำรองเป็นไฟล์ไว้เป็นระยะ
            หรือใช้ย้ายข้อมูลไปเครื่องอื่น
          </Text>
          <Space wrap>
            <Button icon={<CloudDownloadOutlined />} onClick={exportBackup}>
              สำรองข้อมูล
            </Button>
            <Upload accept=".json,application/json" showUploadList={false} beforeUpload={importBackup}>
              <Button icon={<CloudUploadOutlined />}>นำเข้าข้อมูล</Button>
            </Upload>
            <Button icon={<ExperimentOutlined />} onClick={loadDemo} style={{ color: '#7c3aed', borderColor: '#c4b5fd' }}>
              โหลดข้อมูลตัวอย่าง
            </Button>
          </Space>
        </Flex>
      </Card>

      <Modal
        open={open}
        title={editing ? 'แก้ไขประเภทอุปกรณ์' : 'เพิ่มประเภทอุปกรณ์'}
        okText="บันทึก"
        cancelText="ยกเลิก"
        onOk={onSave}
        onCancel={() => setOpen(false)}
        forceRender
      >
        <Form<ItemForm> form={form} layout="vertical" requiredMark={false} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="ชื่อประเภทอุปกรณ์"
            rules={[
              { required: true, whitespace: true, message: 'กรุณากรอกชื่อ' },
              {
                validator: (_, v: string) =>
                  items.some((i) => i.name.trim() === v?.trim() && i.id !== editing?.id)
                    ? Promise.reject(new Error('มีชื่อรายการนี้อยู่แล้ว'))
                    : Promise.resolve(),
              },
            ]}
          >
            <Input placeholder="เช่น สาย Suction" maxLength={60} showCount />
          </Form.Item>
          <Form.Item
            name="snPrefix"
            label="คำนำหน้า SN (สำหรับ SN ที่ระบบสร้าง)"
            extra="ตัวอักษรภาษาอังกฤษ/ตัวเลข ไม่เกิน 8 ตัว เช่น SUC → SUC-000001"
            normalize={(v: string) => cleanPrefix(v)}
            rules={[
              { required: true, message: 'ระบุคำนำหน้า SN' },
              {
                validator: (_, v: string) =>
                  items.some((i) => i.snPrefix === v && i.id !== editing?.id)
                    ? Promise.reject(new Error('คำนำหน้านี้ถูกใช้กับประเภทอื่นแล้ว'))
                    : Promise.resolve(),
              },
            ]}
          >
            <Input placeholder="เช่น SUC" style={{ fontFamily: 'ui-monospace, monospace' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="shelf" label="อายุหลัง sterilize" rules={[{ required: true, message: 'ระบุจำนวนวัน' }]}>
                <InputNumber min={0} max={3650} precision={0} suffix="วัน" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maxRound"
                label="ใช้ได้สูงสุด"
                rules={[{ required: true, message: 'ระบุรอบสูงสุด' }]}
                extra={editing ? 'มีผลกับชิ้นที่ลงทะเบียนใหม่เท่านั้น' : undefined}
              >
                <InputNumber min={1} max={99} precision={0} suffix="รอบ" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Flex
            justify="space-between"
            align="center"
            style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px' }}
          >
            <div>
              <Text strong>
                <BarcodeOutlined /> พิมพ์บาร์โคด SN บนสติ๊กเกอร์
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                ปิดไว้ จะพิมพ์ SN เป็นตัวหนังสือแทนบาร์โคด
              </Text>
            </div>
            <Form.Item name="useBarcode" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          </Flex>
        </Form>
      </Modal>
    </Flex>
  );
}
