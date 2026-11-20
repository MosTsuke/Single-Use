"use client";

import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { thaiDate } from "@/lib/date";
import { codeOf, type StickerData } from "@/lib/types";

/**
 * สติ๊กเกอร์ขนาดจริง 50 x 25 มม. — ใช้ทั้งตัวอย่างบนจอและตอนสั่งพิมพ์
 * กรอบสีส้มพิมพ์มาจากโรงงานบนม้วนสติ๊กเกอร์แล้ว จึงพิมพ์เฉพาะเนื้อหาสีดำด้านใน
 *
 * 3 แบบ: บาร์โคด (ด้านบน) / QR (ด้านซ้าย) / ไม่มีรหัส (แสดง SN เป็นตัวหนังสือ)
 */
/** ความกว้าง 1 module ของบาร์โคด (มม.) — 2 จุดของหัวพิมพ์ 203 dpi */
const BARCODE_MODULE_MM = 0.25;
/** ความกว้างพื้นที่บาร์โคดบนสติ๊กเกอร์ (50 มม. − ขอบซ้ายขวา 3 มม.) */
const BARCODE_MAX_MM = 44;
/** หัวพิมพ์ 203 dpi = 8 จุด/มม. */
const DOTS_PER_MM = 8;
/** ขนาด QR สูงสุด (มม.) รวมขอบเว้นว่าง — เหลือที่ด้านล่างให้คำว่า "รอบ" */
const QR_MAX_MM = 15;
/** ขอบเว้นว่างรอบ QR (หน่วย module) — มาตรฐานคือ 4 แต่สติ๊กเกอร์เล็ก ใช้ 2 ร่วมกับขอบสติ๊กเกอร์ */
const QR_QUIET = 2;

/** แปลง SN เป็นจุดของ QR — ขนาด 1 module เป็นจำนวนจุดเต็มของหัวพิมพ์ เพื่อให้คมและยิงง่าย */
function useQr(text: string, enabled: boolean) {
  return useMemo(() => {
    if (!enabled) return null;
    try {
      const qr = QRCode.create(text || "0", { errorCorrectionLevel: "M" });
      const n = qr.modules.size;
      const total = n + QR_QUIET * 2;
      const dots = Math.max(2, Math.floor((QR_MAX_MM * DOTS_PER_MM) / total));
      let d = "";
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (qr.modules.get(r, c))
            d += `M${c + QR_QUIET} ${r + QR_QUIET}h1v1h-1z`;
      return { total, sizeMm: (total * dots) / DOTS_PER_MM, path: d };
    } catch {
      return null;
    }
  }, [text, enabled]);
}

export default function Sticker({
  data,
  onReady,
}: {
  data: StickerData;
  onReady?: () => void;
}) {
  const code = codeOf(data);
  const svgRef = useRef<SVGSVGElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const [barcodeError, setBarcodeError] = useState(false);
  const qr = useQr(data.barcode, code === "qr");

  useLayoutEffect(() => {
    // 1) วาดบาร์โคด
    let err = false;
    if (code === "barcode" && svgRef.current) {
      try {
        // วาด 1 หน่วยต่อ 1 module แล้วกำหนดขนาดจริงเป็น มม.
        JsBarcode(svgRef.current, data.barcode || "0", {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          width: 1,
          height: 60,
        });
        const svg = svgRef.current;
        const modules = parseFloat(svg.getAttribute("width") || "0");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("shape-rendering", "crispEdges");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        // Godex EZ120 = 203 dpi (8 จุด/มม.) → 1 module = 2 จุด = 0.25 มม. พอดีหัวพิมพ์ แท่งคมและสแกนง่าย
        // ถ้า SN ยาวจนเกินพื้นที่ (44 มม.) จึงยอมยืดให้เต็มกว้างแทน
        const widthMm = modules * BARCODE_MODULE_MM;
        svg.style.width =
          modules > 0 && widthMm <= BARCODE_MAX_MM ? `${widthMm}mm` : "100%";
      } catch {
        err = true;
      }
    }
    setBarcodeError(err);

    // 2) ชื่ออุปกรณ์: ไม่เกิน 2 บรรทัด (เกินตัดด้วย … ผ่าน CSS line-clamp)
    //    ชื่อสั้นใช้ขนาดเต็มบรรทัดเดียว · ชื่อยาวย่อตัวอักษรลงจน 2 บรรทัดพอดีพื้นที่ที่เหลือ
    //    ถ้าย่อถึงขนาดเล็กสุดแล้วยังไม่พอ 2 บรรทัด → เหลือ 1 บรรทัด + …
    const el = nameRef.current;
    if (el) {
      el.style.fontSize = "";
      el.style.webkitLineClamp = "";
      const MIN_PX = 7.5; // ≈ 2 มม. — เล็กกว่านี้พิมพ์ที่ 203 dpi แล้วอ่านยาก
      let size = parseFloat(getComputedStyle(el).fontSize);
      const lineH = () => parseFloat(getComputedStyle(el).lineHeight) || size * 1.35;
      const oneLine = () => {
        const prev = el.style.whiteSpace;
        el.style.whiteSpace = "nowrap";
        const ok = el.scrollWidth <= el.clientWidth + 0.5;
        el.style.whiteSpace = prev;
        return ok;
      };
      const need = () => (oneLine() ? 1 : 2) * lineH();
      let guard = 0;
      while (need() > el.clientHeight + 0.5 && size > MIN_PX && guard++ < 120) {
        size = Math.max(MIN_PX, size - 0.25);
        el.style.fontSize = `${size}px`;
      }
      // แบบบาร์โคด: ยังไม่พอ → ลดความสูงแท่งบาร์โคดลงได้ถึง 3.6 มม. (ความกว้างแท่งไม่เปลี่ยน ยังยิงอ่านได้)
      const svg = svgRef.current;
      if (code === "barcode" && svg) {
        // clientHeight เป็นขนาดจริงของเลย์เอาต์ (ไม่โดนการขยายตัวอย่างบนจอ)
        svg.style.height = "";
        let h = svg.clientHeight;
        const minH = (3.6 * 96) / 25.4; // 3.6 มม. เป็น px
        guard = 0;
        while (need() > el.clientHeight + 0.5 && h > minH && guard++ < 80) {
          h = Math.max(minH, h - 0.5);
          svg.style.height = `${h}px`;
        }
      }
      if (need() > el.clientHeight + 0.5) el.style.webkitLineClamp = "1";
    }
    onReady?.();
  }, [data, code, onReady]);

  // บรรทัด "ใช้ที่ ..." — มีหน่วยงานและไม่ได้ปิดไว้ → สติ๊กเกอร์ใช้โหมด 4 บรรทัด (ตัวอักษรเล็กลงเล็กน้อย)
  const showDept = !!data.departmentName && data.showDept !== false;
  const shown = [data.showMfg !== false, data.showExp !== false];
  // ลำดับบรรทัดหลังจากเลื่อนขึ้น (0 = บนสุด) — บรรทัดที่ขึ้นมาอยู่แถวเดียวกับ "รอบ" (0–1) ต้องเว้นที่ด้านขวา
  const staffIdx = shown.filter(Boolean).length;
  const deptIdx = staffIdx + (data.staffName !== undefined ? 1 : 0);
  const lines = (
    <div className="st-lines">
      {shown[0] && (
        <div className="st-line">
          วันผลิต <b className="st-date">{thaiDate(data.mfg)}</b>
        </div>
      )}
      {shown[1] && (
        <div className="st-line">
          หมดอายุ <b className="st-date">{thaiDate(data.exp)}</b>
        </div>
      )}
      {data.staffName !== undefined && (
        <div className={`st-staff${staffIdx < 2 ? " st-staff-up" : ""}`}>
          จนท. <b>{data.staffName || "—"}</b>
        </div>
      )}
      {/* แบบ QR: "ใช้ที่" แยกไปเป็นบรรทัดเต็มความกว้างด้านล่าง (ไม่อยู่ในคอลัมน์แคบด้านขวา) */}
      {showDept && code !== "qr" && (
        <div className={`st-staff st-dept${deptIdx < 2 ? " st-staff-up" : ""}`}>
          ใช้ที่ <b>{data.departmentName}</b>
        </div>
      )}
    </div>
  );
  const round = (
    <div className="st-round">
      รอบ {data.round}/{data.maxRound}
    </div>
  );

  // ===== แบบ QR: ชื่อ SN วันที่ จนท. ด้านซ้าย / QR + "รอบ" ใต้ QR ด้านขวา (สลับด้วย CSS order) =====
  if (code === "qr") {
    const qrCol = (
      <div className="st-qr-col">
        {qr ? (
          <svg
            className="st-qr"
            viewBox={`0 0 ${qr.total} ${qr.total}`}
            shapeRendering="crispEdges"
            style={{ width: `${qr.sizeMm}mm`, height: `${qr.sizeMm}mm` }}
          >
            <path d={qr.path} fill="#000" />
          </svg>
        ) : (
          <div
            className="st-code st-error"
            style={{ width: `${QR_MAX_MM}mm`, height: `${QR_MAX_MM}mm` }}
          >
            QR ไม่ถูกต้อง
          </div>
        )}
        {round}
      </div>
    );
    const main = (
      <div className="st-qr-main">
        <div ref={nameRef} className="st-name">
          {data.name}
        </div>
        {data.barcode && <div className="st-sn">{data.barcode}</div>}
        <div className="st-info">{lines}</div>
      </div>
    );
    if (showDept) {
      // มี "ใช้ที่": QR + ข้อความด้านบน / บรรทัด "ใช้ที่ ..." เต็มความกว้างด้านล่าง
      return (
        <div className="sticker st-qr-layout st-dept-mode st-qr-dept">
          <div className="st-qr-top">
            {qrCol}
            {main}
          </div>
          <div className="st-staff st-qr-deptline">
            ใช้ที่ <b>{data.departmentName}</b>
          </div>
        </div>
      );
    }
    return (
      <div className="sticker st-qr-layout">
        {qrCol}
        {main}
      </div>
    );
  }

  return (
    <div
      className={`sticker${code === "barcode" ? "" : " no-barcode"}${showDept ? " st-dept-mode" : ""}`}
    >
      {code === "barcode" &&
        (barcodeError ? (
          <div className="st-code st-error">บาร์โคดไม่ถูกต้อง</div>
        ) : (
          <>
            <svg ref={svgRef} className="st-barcode" />
            <div className="st-code">{data.barcode}</div>
          </>
        ))}
      <div ref={nameRef} className="st-name">
        {data.name}
      </div>
      {code !== "barcode" && data.barcode && (
        <div className="st-sn">SN {data.barcode}</div>
      )}
      {/*
        ส่วนล่าง: บรรทัด วันผลิต / หมดอายุ / จนท. เรียงจากบนลงล่าง
        "รอบ" อยู่ตำแหน่งเดิมเสมอ (ตรงบรรทัดหมดอายุ) — ปิดบรรทัดวันที่ไป จนท. จะเลื่อนขึ้นมาแทนที่
      */}
      <div className="st-info">
        {lines}
        {round}
      </div>
    </div>
  );
}
