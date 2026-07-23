#!/usr/bin/env bash
# =====================================================================
#  handover-check.sh — Người tiếp nhận tự kiểm tra hệ VMP trong ~1 phút.
#  Chạy:  bash scripts/handover-check.sh
#  Mỗi mục in ✅/❌ kèm cách sửa. Không ghi/sửa gì — chỉ đọc.
# =====================================================================
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { echo "✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "❌ $1"; echo "   → $2"; FAIL=$((FAIL+1)); }

echo "== VMP handover check =="

# 1. Node/npm
if command -v npm >/dev/null 2>&1; then
  ok "npm có sẵn ($(node -v 2>/dev/null))"
else
  bad "Thiếu Node.js/npm" "Cài Node 18+ từ nodejs.org rồi chạy: npm install"
fi

# 2. File env frontend
if [ -f .env ]; then
  ok "Đã có .env (frontend)"
else
  bad "Chưa có .env" "Sao chép .env.example thành .env và điền VITE_SUPABASE_URL + VITE_SUPABASE_ANON"
fi

# 3. File env admin + kết nối DB
if [ -f .env.local ]; then
  # shellcheck disable=SC1091
  source .env.local
  if command -v psql >/dev/null 2>&1 && [ -n "${SUPABASE_DB_URL:-}" ]; then
    LAST_SYNC=$(psql "$SUPABASE_DB_URL" -tA -c "select coalesce(max(started_at)::text,'CHƯA CÓ') from vmp_sheet_sync_runs;" 2>/dev/null)
    if [ -n "$LAST_SYNC" ]; then
      ok "Kết nối Supabase OK — lần sync cuối: $LAST_SYNC"
    else
      bad "Không kết nối được Supabase qua SUPABASE_DB_URL" "Kiểm tra chuỗi kết nối trong .env.local (xem .env.local.example)"
    fi
  else
    bad "Thiếu psql hoặc SUPABASE_DB_URL rỗng" "Cài postgresql client (brew install libpq) và điền .env.local"
  fi
else
  bad "Chưa có .env.local" "Sao chép .env.local.example thành .env.local, điền chuỗi kết nối nhận qua kênh an toàn"
fi

# 4. Google Sheet CSV công khai tải được (đường sync WF-04 dùng chính URL dạng này)
SHEET_CSV="https://docs.google.com/spreadsheets/d/1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8/export?format=csv&gid=1252715724"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$SHEET_CSV")
if [ "$HTTP" = "200" ]; then
  ok "Tải được CSV Google Sheet 6.Timeline VMP (HTTP 200)"
else
  bad "Không tải được CSV Sheet (HTTP $HTTP)" "Kiểm tra quyền chia sẻ Sheet hoặc mạng; WF-04 cần tải được URL này"
fi

# 5. n8n instance sống
HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://n8n.cpc1hn.com/")
if [ "$HTTP" = "200" ] || [ "$HTTP" = "302" ]; then
  ok "n8n.cpc1hn.com truy cập được (HTTP $HTTP)"
else
  bad "n8n.cpc1hn.com không phản hồi (HTTP $HTTP)" "Kiểm tra server n8n; toàn bộ sync/cảnh báo chạy trên đó"
fi

echo
echo "== Kết quả: $PASS đạt, $FAIL lỗi =="
if [ "$FAIL" -eq 0 ]; then
  echo "Bước tiếp: npm install && npm run dev (dashboard), đọc docs/HANDOVER.md"
fi
exit "$FAIL"
