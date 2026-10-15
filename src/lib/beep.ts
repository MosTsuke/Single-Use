/** เสียงตอบรับตอนยิงบาร์โคด — หน้างานไม่ต้องมองจอก็รู้ว่าผ่านหรือไม่ */
let ctx: AudioContext | null = null;

function tone(freq: number, start: number, dur: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.06, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur);
}

export function beep(kind: 'ok' | 'error') {
  try {
    ctx ??= new AudioContext();
    if (kind === 'ok') tone(1400, 0, 0.08);
    else {
      tone(300, 0, 0.15);
      tone(300, 0.2, 0.15);
    }
  } catch {
    /* เบราว์เซอร์ไม่รองรับเสียง — ข้ามไป */
  }
}
