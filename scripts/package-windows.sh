#!/usr/bin/env bash
# สร้างชุดติดตั้งสำหรับเครื่องแม่ (Windows 64-bit) ที่หน้างาน — ไม่ต้องใช้อินเทอร์เน็ตที่หน้างาน:
#   dist/singleuse-sticker-windows-<date>-<commit>.zip
# ข้างในมี: เว็บที่ build แล้ว (Next.js standalone ไม่ต้อง npm ที่หน้างาน), node.exe สำหรับ Windows x64,
# สคริปต์เปิด/ตั้งเปิดเอง/เปิด firewall/อัปเดต/หยุด/ถอน (deploy/windows/), สคริปต์ฐานข้อมูล (database/)
# และคู่มือ README-TH.txt — ต้องมีอินเทอร์เน็ตที่เครื่องนี้ (npm ci, nodejs.org)
#
#   ./scripts/package-windows.sh
#   NODE_VERSION=24.11.1 ./scripts/package-windows.sh
#
# ใช้ไฟล์ที่ git ติดตาม (หรือจะติดตาม) เท่านั้น จึงไม่มี .env.local / ไฟล์ส่วนตัวหลุดไป
# + package-lock.json (เครื่องผู้พัฒนาตั้ง git ให้ข้ามไฟล์นี้ แต่ต้องใช้เพื่อให้ build ได้ผลเหมือนเดิมทุกครั้ง)
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.11.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
CACHE="$DIST/cache"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD)"
DIRTY=""
[ -n "$(git -C "$ROOT" status --porcelain)" ] && DIRTY=" + uncommitted changes"
STAMP="$(date +%Y%m%d)"
OUT="$DIST/singleuse-sticker-windows-$STAMP-$COMMIT.zip"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/src" "$CACHE"

echo "1/5  copying the source ($COMMIT$DIRTY)"
(
  cd "$ROOT"
  git ls-files -z --cached --others --exclude-standard |
    while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s\0' "$f"; done |
    tar --null -T - -cf - | tar -xf - -C "$WORK/src"
  cp package-lock.json "$WORK/src/"
)

echo "2/5  installing packages (npm ci)"
(cd "$WORK/src" && npm ci --no-audit --no-fund --loglevel=error >/dev/null)

echo "3/5  type-check + build (standalone)"
(cd "$WORK/src" && npx tsc --noEmit)
if ! (cd "$WORK/src" && STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 npx next build >"$WORK/build.log" 2>&1); then
  tail -40 "$WORK/build.log"
  exit 1
fi

echo "4/5  Node.js $NODE_VERSION for Windows x64"
NODE_ZIP="node-v$NODE_VERSION-win-x64.zip"
if [ ! -f "$CACHE/$NODE_ZIP" ]; then
  curl -fsSL -o "$CACHE/$NODE_ZIP.part" "https://nodejs.org/dist/v$NODE_VERSION/$NODE_ZIP"
  mv "$CACHE/$NODE_ZIP.part" "$CACHE/$NODE_ZIP"
fi
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | grep "  $NODE_ZIP\$" >"$CACHE/$NODE_ZIP.sha256"
(cd "$CACHE" && shasum -a 256 -c "$NODE_ZIP.sha256" >/dev/null) || {
  echo "checksum of $NODE_ZIP doesn't match nodejs.org — deleting it, run again"
  rm -f "$CACHE/$NODE_ZIP"
  exit 1
}

echo "5/5  assembling"
B="$WORK/singleuse-sticker"
mkdir -p "$B/app/.next" "$B/node"
cp -R "$WORK/src/.next/standalone/." "$B/app/"
cp -R "$WORK/src/.next/static" "$B/app/.next/static"
cp -R "$WORK/src/public" "$B/app/public"
rm -f "$B/app/.env" "$B/app/.env."*   # ค่าจริงมาจาก singleuse.env ที่หน้างาน
rm -f "$B/app/public/.DS_Store"
unzip -q -j "$CACHE/$NODE_ZIP" "node-v$NODE_VERSION-win-x64/node.exe" "node-v$NODE_VERSION-win-x64/LICENSE" -d "$B/node"
cp -R "$WORK/src/deploy/windows/." "$B/"
mkdir -p "$B/database"
cp "$WORK/src/database/"*.sql "$WORK/src/database/README.md" "$B/database/"
# โปรแกรมรันสคริปต์ 01_, 02_, ... จาก app\database เอง — ต้องมีครบ
for f in "$WORK/src/database/"0[1-9]_*.sql; do
  [ -f "$B/app/database/$(basename "$f")" ] || { echo "missing in app/database: $(basename "$f")"; exit 1; }
done

# ไฟล์ที่คนหรือ cmd.exe อ่าน: ขึ้นบรรทัดแบบ Windows · .sql ใส่ BOM ให้ SSMS อ่านภาษาไทยถูก
# (.reg เป็น UTF-16 อยู่แล้ว ไม่แตะ)
find "$B" -maxdepth 2 -type f \( -name '*.bat' -o -name '*.cmd' -o -name '*.ps1' -o -name '*.txt' \
  -o -name '*.sql' -o -name '*.example' \) -not -path "$B/app/*" -not -path "$B/node/*" \
  -exec perl -pi -e 's/\r?\n/\r\n/' {} +
for f in "$B/database/"*.sql "$B/app/database/"*.sql; do
  perl -pi -e 's/^(?!\x{EF}\x{BB}\x{BF})/\x{EF}\x{BB}\x{BF}/ if $. == 1' "$f"
done

cat >"$B/VERSION.txt" <<VERSION
Single-Use Sticker
build:   $STAMP
commit:  $COMMIT$DIRTY
node:    v$NODE_VERSION (win-x64)
VERSION
perl -pi -e 's/\r?\n/\r\n/' "$B/VERSION.txt"

# ห้ามมีไฟล์ส่วนตัวติดไป
if find "$B" \( -name '.env.local' -o -name '.env' -o -name '*.bak' -o -name 'singleuse.env' \) | grep -q .; then
  echo "refusing: the bundle contains private files:"
  find "$B" \( -name '.env.local' -o -name '.env' -o -name '*.bak' -o -name 'singleuse.env' \)
  exit 1
fi

# Windows PowerShell 5.1 อ่าน .ps1 ที่ไม่มี BOM เป็น ANSI: ต้องเป็น ASCII ล้วน
if perl -ne 'if (/[^\x00-\x7F]/) { print "$ARGV:$.: $_"; $bad = 1 } close ARGV if eof; END { exit($bad ? 0 : 1) }' "$B"/scripts/*.ps1; then
  echo "refusing: non-ASCII characters in a .ps1 (above)"
  exit 1
fi

mkdir -p "$DIST"
rm -f "$OUT"
(cd "$WORK" && zip -qr -X "$OUT" singleuse-sticker)
echo
echo "done: $OUT ($(du -h "$OUT" | cut -f1))"
