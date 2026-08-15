#!/usr/bin/env bash
# =====================================================================
#  with-preview.sh — vòng đời preview đã build, dùng cho mọi lệnh trình duyệt
#  ---------------------------------------------------------------------
#  Cách dùng:  bash scripts/with-preview.sh -- <lệnh> [tham số...]
#
#  Vì sao cần: trước đây mỗi bộ E2E tự khởi động server rồi tự dọn, nên
#  hay gặp ba cảnh: chạy trên `dist/` cũ mà tưởng là mới, dùng nhầm
#  server do bộ test khác để lại, và bỏ sót tiến trình preview còn sống.
#  Script này sở hữu trọn vòng đời: build → kiểm sản phẩm → preview →
#  chạy lệnh → dọn tiến trình, và từ chối chạy nếu bất kỳ khâu nào sai.
#
#  Nó KHÔNG bao giờ `source`, in, hay sao chép GIÁ TRỊ trong .env.local.
#  Dấu vân tay build chỉ lấy TÊN key, không lấy giá trị.
#
#  Mã thoát:
#    0  lệnh bên trong thành công
#    2  sai cú pháp (thiếu `--` hoặc thiếu lệnh)
#    3  .env.local thiếu key bắt buộc hoặc key rỗng
#    4  build thất bại
#    5  sản phẩm build không hợp lệ hoặc dấu vân tay không khớp
#    6  cổng preview đã bị chiếm, hoặc preview chết ngay
#    7  chờ preview sẵn sàng quá hạn
#    *  mã thoát nguyên vẹn của lệnh bên trong
# =====================================================================
set -euo pipefail

GOC="$(pwd)"
# Cổng có thể đổi qua biến môi trường. Cần thế vì bộ kiểm vòng đời của
# chính script này cũng mở preview thật — để cả hai cùng dùng 4173 thì
# chạy song song sẽ đá nhau, và lỗi hiện ra dưới dạng "cổng đang bị chiếm"
# rất giống một lỗi thật.
CONG="${WITH_PREVIEW_PORT:-4173}"
MAY=127.0.0.1
HAN_CHO_GIAY="${WITH_PREVIEW_TIMEOUT:-20}"
TEN_DAU="/.lotus-build-input"
KEY_BAT_BUOC=(VITE_SUPABASE_URL VITE_SUPABASE_ANON E2E_EMAIL E2E_PASSWORD)

E_USAGE=2; E_ENV=3; E_BUILD=4; E_ARTIFACT=5; E_PORT=6; E_TIMEOUT=7

TMP=""
PID_PREVIEW=""

bao() { printf '[with-preview] %s\n' "$*" >&2; }

don_dep() {
  if [ -n "$PID_PREVIEW" ]; then
    # Giết cả nhóm tiến trình: `npm run preview` đẻ ra node con, giết mỗi
    # npm sẽ để lại node mồ côi giữ cổng preview cho lần chạy sau.
    kill -TERM -- "-$PID_PREVIEW" 2>/dev/null || kill -TERM "$PID_PREVIEW" 2>/dev/null || true
    wait "$PID_PREVIEW" 2>/dev/null || true
    PID_PREVIEW=""
  fi
  if [ -n "$TMP" ] && [ -d "$TMP" ]; then rm -rf "$TMP"; fi
}
trap don_dep EXIT INT TERM

# --- 1. Cú pháp -----------------------------------------------------
if [ "$#" -lt 2 ] || [ "$1" != "--" ]; then
  bao "cách dùng: bash scripts/with-preview.sh -- <lệnh> [tham số...]"
  exit "$E_USAGE"
fi
shift

# --- 2. Khoá cách ly: .env.local phải đủ key và không rỗng ----------
ENV_FILE="$GOC/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  bao "không thấy .env.local — lệnh trình duyệt phải chạy trên cấu hình cách ly"
  exit "$E_ENV"
fi
thieu=()
for key in "${KEY_BAT_BUOC[@]}"; do
  # Neo đầu dòng và đòi ít nhất một ký tự sau dấu bằng. Chỉ đọc TÊN key.
  grep -qE "^${key}=.+" "$ENV_FILE" || thieu+=("$key")
done
if [ "${#thieu[@]}" -gt 0 ]; then
  bao "thiếu hoặc để rỗng trong .env.local: ${thieu[*]}"
  exit "$E_ENV"
fi

# --- 3. Dấu vân tay đầu vào build ------------------------------------
# Gồm file đã theo dõi lẫn file mới chưa theo dõi (nhưng không bị ignore)
# dưới src/ và public/, cộng các file cấu hình, cộng TÊN key của .env.local.
liet_ke_dau_vao() {
  git ls-files -z -- src public index.html \
    vite.config.ts vite.config.js tsconfig.json tsconfig.node.json tsconfig.app.json \
    package.json package-lock.json 2>/dev/null || true
  git ls-files -z --others --exclude-standard -- src public 2>/dev/null || true
}
tinh_dau_vao() {
  {
    liet_ke_dau_vao | sort -zu | xargs -0 -r sha256sum
    grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$ENV_FILE" | sort -u | sed 's/^/env-key /'
  } | sha256sum | cut -d' ' -f1
}
DAU_VAO="$(tinh_dau_vao)"

# --- 4. Cổng phải rảnh trước khi tốn công build ----------------------
# Không tái dùng server lạ: nếu cổng đang có người, dừng hẳn.
if (exec 3<>"/dev/tcp/$MAY/$CONG") 2>/dev/null; then
  exec 3<&- 2>/dev/null || true
  exec 3>&- 2>/dev/null || true
  bao "cổng $CONG đang bị tiến trình khác giữ — không tái dùng server lạ"
  exit "$E_PORT"
fi

# --- 5. Build vào thư mục tạm cùng ổ đĩa -----------------------------
TMP="$(mktemp -d "$GOC/.with-preview.XXXXXX")"
UNG_VIEN="$TMP/dist"
if ! npm run build -- --outDir "$UNG_VIEN" --emptyOutDir >&2; then
  bao "build thất bại — không mở preview, không chạy lệnh bên trong"
  exit "$E_BUILD"
fi

# --- 6. Kiểm sản phẩm rồi mới đóng dấu -------------------------------
if [ ! -f "$UNG_VIEN/index.html" ]; then
  bao "build báo thành công nhưng không có sản phẩm hợp lệ ở thư mục tạm"
  exit "$E_ARTIFACT"
fi
printf '%s\n' "$DAU_VAO" > "$UNG_VIEN$TEN_DAU"

# Tráo nguyên tử: đưa dist cũ ra thư mục tạm trước, để nếu bước sau hỏng
# thì còn đường trả lại bản cũ.
CU=""
if [ -e "$GOC/dist" ]; then
  CU="$TMP/dist-cu"
  mv "$GOC/dist" "$CU"
fi
if ! mv "$UNG_VIEN" "$GOC/dist"; then
  [ -n "$CU" ] && mv "$CU" "$GOC/dist"
  bao "không tráo được sản phẩm build vào dist/"
  exit "$E_ARTIFACT"
fi

# --- 7. Xác minh dấu ngay trên dist/ đang phục vụ --------------------
if [ ! -f "$GOC/dist$TEN_DAU" ] || [ "$(cat "$GOC/dist$TEN_DAU")" != "$DAU_VAO" ]; then
  bao "dấu vân tay trên dist/ không khớp đầu vào hiện tại — từ chối phục vụ bản cũ"
  exit "$E_ARTIFACT"
fi

# --- 8. Đúng một preview, trong nhóm tiến trình riêng ----------------
set -m
npm run preview -- --host "$MAY" --port "$CONG" --strictPort >"$TMP/preview.log" 2>&1 &
PID_PREVIEW=$!
set +m

# --- 9. Chờ sẵn sàng, tối đa HAN_CHO_GIAY -----------------------------
han="$(( HAN_CHO_GIAY * 4 ))"
san_sang=0
for _ in $(seq 1 "$han"); do
  if ! kill -0 "$PID_PREVIEW" 2>/dev/null; then
    bao "preview thoát trước khi phục vụ được — xem $TMP/preview.log"
    exit "$E_PORT"
  fi
  if curl -fsS -o /dev/null "http://$MAY:$CONG/" 2>/dev/null; then san_sang=1; break; fi
  sleep 0.25
done
if [ "$san_sang" -ne 1 ]; then
  bao "chờ quá ${HAN_CHO_GIAY}s mà preview chưa trả lời"
  exit "$E_TIMEOUT"
fi

# --- 10. Chạy lệnh bên trong, giữ nguyên mã thoát của nó -------------
set +e
"$@"
ma_thoat=$?
set -e
exit "$ma_thoat"
