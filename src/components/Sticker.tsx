'use client';

import JsBarcode from 'jsbarcode';
import { useLayoutEffect, useRef, useState } from 'react';
import { thaiDate } from '@/lib/date';
import type { StickerData } from '@/lib/types';

/**
 * สติ๊กเกอร์ขนาดจริง 50 x 25 มม. — ใช้ทั้งตัวอย่างบนจอและตอนสั่งพิมพ์
 * กรอบสีส้มพิมพ์มาจากโรงงานบนม้วนสติ๊กเกอร์แล้ว จึงพิมพ์เฉพาะเนื้อหาสีดำด้านใน
 */
/** ความกว้าง 1 module ของบาร์โคด (มม.) — 2 จุดของหัวพิมพ์ 203 dpi */
const BARCODE_MODULE_MM = 0.25;
/** ความกว้างพื้นที่บาร์โคดบนสติ๊กเกอร์ (50 มม. − ขอบซ้ายขวา 3 มม.) */
const BARCODE_MAX_MM = 44;

export default function Sticker({ data, onReady }: { data: StickerData; onReady?: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const [barcodeError, setBarcodeError] = useState(false);

  useLayoutEffect(() => {
    // 1) วาดบาร์โคด
    let err = false;
    if (data.useBarcode && svgRef.current) {
      try {
        // วาด 1 หน่วยต่อ 1 module แล้วกำหนดขนาดจริงเป็น มม.
        JsBarcode(svgRef.current, data.barcode || '0', {
          format: 'CODE128',
          displayValue: false,
          margin: 0,
          width: 1,
          height: 60,
        });
        const svg = svgRef.current;
        const modules = parseFloat(svg.getAttribute('width') || '0');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('shape-rendering', 'crispEdges');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        // Godex EZ120 = 203 dpi (8 จุด/มม.) → 1 module = 2 จุด = 0.25 มม. พอดีหัวพิมพ์ แท่งคมและสแกนง่าย
        // ถ้า SN ยาวจนเกินพื้นที่ (44 มม.) จึงยอมยืดให้เต็มกว้างแทน
        const widthMm = modules * BARCODE_MODULE_MM;
        svg.style.width = modules > 0 && widthMm <= BARCODE_MAX_MM ? `${widthMm}mm` : '100%';
      } catch {
        err = true;
      }
    }
    setBarcodeError(err);

    // 2) ย่อชื่อให้พอดีพื้นที่
    const el = nameRef.current;
    if (el) {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      const limitH = el.clientHeight;
      const fits = () =>
        el.scrollWidth <= el.clientWidth && (data.useBarcode || el.scrollHeight <= Math.max(limitH, el.clientHeight));
      let guard = 0;
      while (!fits() && size > 6 && guard++ < 80) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    }
    onReady?.();
  }, [data, onReady]);

  return (
    <div className={`sticker${data.useBarcode ? '' : ' no-barcode'}`}>
      {data.useBarcode &&
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
      {!data.useBarcode && data.barcode && <div className="st-sn">SN {data.barcode}</div>}
      <div className="st-bottom">
        <div className="st-dates">
          <div>
            วันผลิต <b className="st-date">{thaiDate(data.mfg)}</b>
          </div>
          <div>
            หมดอายุ <b className="st-date">{thaiDate(data.exp)}</b>
          </div>
        </div>
        <div className="st-round">
          รอบ {data.round}/{data.maxRound}
        </div>
      </div>
      {data.staffName !== undefined && (
        <div className="st-staff">
          จนท. <b>{data.staffName || '—'}</b>
        </div>
      )}
    </div>
  );
}
