import { NextResponse, type NextRequest } from 'next/server';
import type { ActionResponse } from '@/lib/api-types';
import { normalizeData } from '@/lib/storage';
import { currentAdmin } from '@/server/auth';
import { dbErrorMessage } from '@/server/db';
import * as repo from '@/server/repo';
import { bumpVersion, currentVersion } from '@/server/version';

export const dynamic = 'force-dynamic';

type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Run = (args: Args, admin: repo.Actor | null) => Promise<repo.ActionOk<unknown>>;

/**
 * งานที่บันทึกข้อมูลทั้งหมดผ่านทางนี้ทางเดียว: POST /api/action { name, args }
 * admin: true = ต้องเข้าสู่ระบบแอดมินก่อน (ตรวจที่เซิร์ฟเวอร์)
 */
const ACTIONS: Record<string, { admin?: boolean; run: Run }> = {
  // หน้างาน (ไม่ต้องเข้าสู่ระบบ)
  sterilize: { run: (a) => repo.sterilize(a as repo.SterilizeInput) },
  createReprint: { run: (a) => repo.createReprint({ logId: a.logId, codeType: a.codeType }) },
  removeLogs: { run: (a) => repo.removeLogs({ ids: a.ids }) },
  voidPrint: { run: (a) => repo.voidPrint({ logId: a.logId, reason: a.reason, staffId: a.staffId }) },
  registerUnits: { run: (a) => repo.registerUnits({ itemId: a.itemId, sns: a.sns, manufacturerSn: !!a.manufacturerSn, replacesSn: a.replacesSn }) },
  disposeUnit: { run: (a) => repo.disposeUnit({ unitId: a.unitId, reason: a.reason, note: a.note }) },
  // แอดมิน
  addItem: { admin: true, run: (a, ad) => repo.addItem(ad!, a.data) },
  updateItem: { admin: true, run: (a, ad) => repo.updateItem(ad!, a.id, a.data) },
  deleteItem: { admin: true, run: (a, ad) => repo.deleteItem(ad!, a.id) },
  saveStaff: { admin: true, run: (a, ad) => repo.savePerson(ad!, 'staff', a.id ?? null, a.data) },
  deleteStaff: { admin: true, run: (a, ad) => repo.deletePerson(ad!, 'staff', a.id) },
  saveDepartment: { admin: true, run: (a, ad) => repo.savePerson(ad!, 'departments', a.id ?? null, a.data) },
  deleteDepartment: { admin: true, run: (a, ad) => repo.deletePerson(ad!, 'departments', a.id) },
  importData: { admin: true, run: (a, ad) => repo.importData(ad!, normalizeData(a.data ?? {})) },
};

const reply = <T,>(body: ActionResponse<T>, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  let body: { name?: string; args?: Args };
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: 'คำขอไม่ถูกต้อง', version: currentVersion() }, 400);
  }
  const action = body.name ? ACTIONS[body.name] : undefined;
  if (!action) return reply({ ok: false, error: 'ไม่รู้จักคำสั่งนี้', version: currentVersion() }, 404);
  try {
    let admin: repo.Actor | null = null;
    if (action.admin) {
      const a = await currentAdmin(req);
      if (!a) return reply({ ok: false, error: 'ต้องเข้าสู่ระบบแอดมินก่อน (หรือหมดเวลาเข้าสู่ระบบแล้ว)', version: currentVersion() }, 403);
      admin = { id: a.id, name: a.displayName };
    }
    const r = await action.run(body.args ?? {}, admin);
    return reply({ ok: true, value: r.value, patch: r.patch, version: bumpVersion() });
  } catch (e) {
    if (e instanceof repo.UserError) return reply({ ok: false, error: e.message, version: currentVersion() });
    const known = repo.constraintMessage(e);
    if (known) {
      console.warn(`[api/action] ${body.name}:`, (e as Error).message);
      return reply({ ok: false, error: known, version: currentVersion() });
    }
    console.error(`[api/action] ${body.name}:`, e);
    return reply({ ok: false, error: dbErrorMessage(e), version: currentVersion() }, 503);
  }
}
