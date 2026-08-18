# Dữ liệu nguồn dễ nhập hơn + Công chúa mắt/miệng lớn hơn — Kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang Dữ liệu nguồn nhập nhanh và ít sai hơn (ô chọn thay vì gõ, ô bắt buộc rõ ràng, không bao giờ giấu ô bắt buộc trong vùng thu gọn), mọi thao tác ghi đều có phản hồi thành công/thất bại, và Công chúa Vali có mắt to hơn miệng lớn hơn.

**Architecture:** Luật tách khỏi giao diện như codebase đang làm — logic thuần vào `src/lib/*.ts` và `src/features/catalogWorkspace/*.ts` (test bằng `node --test`, không dựng trình duyệt), React chỉ vẽ theo luật. Toast trở thành context dùng chung thay cho khối JSX nằm trong `App.tsx`.

**Tech Stack:** React 18 + Vite + TypeScript, Supabase RPC, test `node --test` (tests/unit/*.test.mjs), e2e puppeteer (tests/e2e/*.mjs), ảnh Playwright (tests/visual).

## Global Constraints

- Trả lời và đặt tên bằng tiếng Việt; comment giải thích **vì sao**, theo giọng các file đang có.
- Không thêm thư viện mới. `<input list>` + `<datalist>` là native.
- `npm run typecheck` phải sạch trước khi build.
- Không sửa mẫu Excel (`SOURCE_OBJECT_TEMPLATE_COLUMNS`, `PRODUCT_GMP_TEMPLATE_COLUMNS`) — đó là hợp đồng có phiên bản với file người dùng đã tải.
- Không khai cứng danh mục nghiệp vụ mới. Chỉ 6 bộ phận **đã có sẵn** trong `definitions.ts` được khoá cứng.
- Danh sách trường phải là tập con whitelist server — không thêm `key` mới nào vào `definitions.ts`.
- Thay đổi giao diện: chạy `Visual baseline` trên CI TRƯỚC, `Quality and Deploy` SAU (Task 11).
- Commit sau mỗi task. Được push `origin/main` không cần hỏi lại.

---

## Cấu trúc file

**Tạo mới**
| File | Trách nhiệm |
|---|---|
| `src/lib/toastQueue.ts` | Luật hàng đợi toast thuần: thêm, chốt, hết hạn, giới hạn số lượng |
| `src/components/ui/ToastProvider.tsx` | Context + `useToast()` + khối hiển thị |
| `src/features/catalogWorkspace/suggestions.ts` | Luật thuần: gom giá trị distinct thành danh sách gợi ý |
| `src/features/catalogWorkspace/useCatalogSuggestions.ts` | Hook nạp dữ liệu một lần cho cả workspace |
| `tests/unit/toast-queue.test.mjs` | Test luật toast |
| `tests/unit/catalog-suggestions.test.mjs` | Test luật gợi ý |
| `tests/unit/catalog-field-groups.test.mjs` | Test chia nhóm theo tính bắt buộc |

**Sửa**
| File | Đổi gì |
|---|---|
| `src/components/brand/CongChuaVali.tsx` | Mắt, miệng, chân mày |
| `src/features/catalogWorkspace/contracts.ts` | Thêm `kind: "combobox"`, `suggestFrom`, `allowOther` |
| `src/features/catalogWorkspace/definitions.ts` | Đổi kind một số trường; hàm `chiaNhomTruong` |
| `src/features/catalogWorkspace/diff.ts` | `thieuTruongBatBuoc` trả `{key,label}[]` |
| `src/features/catalogWorkspace/CatalogField.tsx` | Combobox, "khác…", nhãn bắt buộc, `ref` để focus |
| `src/features/catalogWorkspace/CatalogRecordDialog.tsx` | Chia nhóm mới, nút Lưu, focus ô thiếu, validate, mặc định |
| `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx` | Truyền gợi ý, nối toast |
| `src/features/catalogWorkspace/CatalogExcelImport.tsx` | Nối toast |
| `src/lib/catalogForm.ts` | `department` khoá + "khác", nhóm bắt buộc |
| `src/components/catalog/CatalogObjectForm.tsx` | Combobox, nhãn bắt buộc, focus ô thiếu |
| `src/App.tsx` | Bọc `ToastProvider`, bỏ toast inline |
| `src/index.css` | Lớp `.cw-combobox`, `.cw-bat-buoc-chu`, `.vmp-toast*` |
| `tests/unit/catalog-workspace-diff.test.mjs` | Cập nhật 3 assert của `thieuTruongBatBuoc` |
| `tests/unit/catalog-form.test.mjs` | Test department |
| `tests/e2e/catalog-workspace.mjs` | e2e ô thiếu + toast |

---

### Task 1: Công chúa — mắt to hơn, miệng lớn hơn

**Files:**
- Modify: `src/components/brand/CongChuaVali.tsx:146-188`

**Interfaces:**
- Consumes: không
- Produces: không (chỉ hình)

Không TDD: đây là tác phẩm vẽ, đúng/sai do mắt người quyết. Chốt kiểm là ảnh baseline ở Task 11.

- [ ] **Step 1: Sửa khối chân mày, mắt, miệng**

Thay nguyên ba khối (chân mày `:146-153`, mắt `:155-170`, miệng `:178-189`):

```tsx
      {/* ---- Chân mày — nhích lên 2px nhường chỗ cho mắt to ---------- */}
      {mood === "concern" ? (
        <path d="M129 120Q142 115 153 122M167 122Q178 115 191 120"
          fill="none" stroke={MAU.net} strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M129 117Q141 110 153 116M167 116Q179 110 191 117"
          fill="none" stroke={MAU.net} strokeWidth="1.8" strokeLinecap="round" opacity=".9" />
      )}

      {/* ---- Mắt hạnh nhân có tròng — celebrate là mắt cười khép -----
           Tròng to cần lòng trắng: hai chấm đen r6.2 đặt thẳng lên da mặt
           trông như lỗ thủng, không phải mắt. Ellipse trắng nằm dưới tròng
           và bị vòm mí ôm lấy, nên mắt vẫn là hạnh nhân chứ không tròn xoe. */}
      {mood === "celebrate" ? (
        <path d="M126 141Q140 128 154 141M166 141Q180 128 194 141"
          fill="none" stroke={MAU.net} strokeWidth="2.8" strokeLinecap="round" />
      ) : (
        <g>
          <ellipse cx="140" cy="139" rx="12" ry="8.4" fill="#FFFFFF" opacity=".92" />
          <ellipse cx="180" cy="139" rx="12" ry="8.4" fill="#FFFFFF" opacity=".92" />
          <circle cx="140" cy="139" r="6.2" fill={MAU.net} />
          <circle cx="180" cy="139" r="6.2" fill={MAU.net} />
          <circle cx="142.4" cy="136.4" r="2.2" fill="#FFFFFF" />
          <circle cx="182.4" cy="136.4" r="2.2" fill="#FFFFFF" />
          <path d="M126 139Q140 125 154 139" fill="none"
            stroke={MAU.net} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M166 139Q180 125 194 139" fill="none"
            stroke={MAU.net} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
```

Và khối miệng:

```tsx
      {/* ---- Miệng theo mood — lớn hơn bản trước ~35% ----------------- */}
      {mood === "concern" && (
        <ellipse cx="160" cy="173" rx="6" ry="7" fill={MAU.moi} opacity=".9" />
      )}
      {mood === "guide" && (
        <path d="M145 169Q160 181 175 169" fill="none"
          stroke={MAU.moi} strokeWidth="2.8" strokeLinecap="round" />
      )}
      {mood === "celebrate" && (
        <path d="M141 167Q160 190 179 167Q160 176 141 167Z" fill={MAU.moi} />
      )}
```

- [ ] **Step 2: Kiểm không phá luật thiết kế và kiểu**

Run: `npm run typecheck && npm run drift`
Expected: cả hai sạch. `drift` đã miễn trừ hex cho file nhân vật; nếu nó vẫn kêu, KHÔNG nới luật — dùng token màu có sẵn trong `MAU`.

- [ ] **Step 3: Nhìn bằng mắt**

Run: `npm run dev` rồi mở web, xem cả ba mood của công chúa ở nền sáng.
Expected: mắt to rõ, còn hình hạnh nhân, tròng không tràn khỏi mí; miệng lớn hơn thấy rõ nhưng không chạm cằm.

- [ ] **Step 4: Commit**

```bash
git add src/components/brand/CongChuaVali.tsx
git commit -m "brand(công chúa): mắt to hơn có lòng trắng, miệng lớn hơn"
```

---

### Task 2: Luật hàng đợi toast

**Files:**
- Create: `src/lib/toastQueue.ts`
- Test: `tests/unit/toast-queue.test.mjs`

**Interfaces:**
- Consumes: không
- Produces:
  - `export type LoaiToast = "dang" | "thanhCong" | "loi" | "canhBao"`
  - `export interface Toast { id: string; loai: LoaiToast; loi_nhan: string }` → **dùng tên `noiDung`**: `{ id: string; loai: LoaiToast; noiDung: string }`
  - `export const THOI_LUONG: Record<LoaiToast, number>`
  - `export function themToast(ds: Toast[], t: Toast): Toast[]`
  - `export function chotToast(ds: Toast[], id: string, loai: LoaiToast, noiDung: string): Toast[]`
  - `export function boToast(ds: Toast[], id: string): Toast[]`
  - `export const TOI_DA = 4`

- [ ] **Step 1: Viết test hỏng trước**

Tạo `tests/unit/toast-queue.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  themToast, chotToast, boToast, THOI_LUONG, TOI_DA,
} from "../../src/lib/toastQueue.ts";

const t = (id, loai, noiDung) => ({ id, loai, noiDung });

test("thêm toast xếp cuối hàng", () => {
  const ds = themToast(themToast([], t("1", "thanhCong", "Đã lưu")), t("2", "loi", "Hỏng"));
  assert.deepEqual(ds.map((x) => x.id), ["1", "2"]);
});

test("quá TOI_DA thì bỏ cái cũ nhất", () => {
  let ds = [];
  for (let i = 1; i <= TOI_DA + 2; i++) ds = themToast(ds, t(String(i), "thanhCong", "x"));
  assert.equal(ds.length, TOI_DA);
  assert.equal(ds[0].id, "3");
});

test("chốt đổi tại chỗ, không nhảy xuống cuối hàng", () => {
  // Toast 'đang lưu' phải biến thành 'đã lưu' ĐÚNG CHỖ NÓ ĐANG ĐỨNG.
  // Nếu bỏ đi rồi thêm mới, người dùng thấy dòng nhảy vị trí giữa lúc đọc.
  let ds = themToast(themToast([], t("a", "dang", "Đang lưu…")), t("b", "dang", "Đang ghi…"));
  ds = chotToast(ds, "a", "thanhCong", "Đã lưu TB-001");
  assert.deepEqual(ds.map((x) => x.id), ["a", "b"]);
  assert.equal(ds[0].loai, "thanhCong");
  assert.equal(ds[0].noiDung, "Đã lưu TB-001");
});

test("chốt một id không tồn tại thì thêm mới vào cuối", () => {
  const ds = chotToast([], "z", "loi", "Hỏng");
  assert.deepEqual(ds.map((x) => x.id), ["z"]);
});

test("bỏ toast theo id", () => {
  const ds = boToast([t("a", "loi", "x"), t("b", "loi", "y")], "a");
  assert.deepEqual(ds.map((x) => x.id), ["b"]);
});

test("lỗi ở lại lâu hơn thành công", () => {
  // Người dùng cần đủ thời gian đọc câu lỗi rồi mới quyết làm gì.
  assert.ok(THOI_LUONG.loi > THOI_LUONG.thanhCong);
  assert.equal(THOI_LUONG.dang, 0); // 0 = không tự tắt, chờ chốt
});
```

- [ ] **Step 2: Chạy cho hỏng**

Run: `node --import tsx --test tests/unit/toast-queue.test.mjs`
Expected: FAIL — không tìm thấy module `src/lib/toastQueue.ts`.

- [ ] **Step 3: Viết luật**

```ts
/* =====================================================================
 *  toastQueue.ts — luật hàng đợi thông báo, tách khỏi React
 *  ---------------------------------------------------------------------
 *  Không import React: luật phải kiểm được mà không cần dựng trình duyệt.
 *
 *  Hai điều dễ làm sai và là lý do file này tồn tại:
 *
 *  1. Thao tác dài (lưu, ghi lô Excel) mở một toast "đang chạy" rồi CHỐT
 *     nó thành thành công hay thất bại. Chốt phải sửa TẠI CHỖ — bỏ đi rồi
 *     thêm mới sẽ làm dòng nhảy vị trí ngay lúc người dùng đang đọc.
 *  2. Bấm liên tục thì hàng đợi phải có trần. Không có trần thì mười thao
 *     tác nhanh phủ kín màn hình và che mất chính cái bảng vừa ghi.
 * ===================================================================== */
export type LoaiToast = "dang" | "thanhCong" | "loi" | "canhBao";

export interface Toast {
  id: string;
  loai: LoaiToast;
  noiDung: string;
}

/** Mili giây trước khi tự tắt. 0 nghĩa là chờ chốt, không tự tắt. */
export const THOI_LUONG: Record<LoaiToast, number> = {
  dang: 0,
  thanhCong: 2500,
  canhBao: 5000,
  loi: 6000,
};

/** Nhiều hơn ngần này thì toast che mất nội dung nó vừa báo là đã ghi. */
export const TOI_DA = 4;

export function themToast(ds: readonly Toast[], t: Toast): Toast[] {
  const moi = [...ds, t];
  return moi.length > TOI_DA ? moi.slice(moi.length - TOI_DA) : moi;
}

export function chotToast(
  ds: readonly Toast[], id: string, loai: LoaiToast, noiDung: string,
): Toast[] {
  if (!ds.some((t) => t.id === id)) return themToast(ds, { id, loai, noiDung });
  return ds.map((t) => (t.id === id ? { id, loai, noiDung } : t));
}

export function boToast(ds: readonly Toast[], id: string): Toast[] {
  return ds.filter((t) => t.id !== id);
}
```

- [ ] **Step 4: Chạy cho xanh**

Run: `node --import tsx --test tests/unit/toast-queue.test.mjs`
Expected: 6 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/toastQueue.ts tests/unit/toast-queue.test.mjs
git commit -m "feat(thông báo): luật hàng đợi toast, chốt tại chỗ và có trần"
```

---

### Task 3: ToastProvider và nối vào App

**Files:**
- Create: `src/components/ui/ToastProvider.tsx`
- Modify: `src/App.tsx:2057-2085` (bỏ khối toast inline), chỗ dựng cây React (bọc provider)
- Modify: `src/index.css` (thêm lớp `.vmp-toast*`)

**Interfaces:**
- Consumes: `themToast`, `chotToast`, `boToast`, `THOI_LUONG`, `Toast`, `LoaiToast` từ `src/lib/toastQueue.ts`
- Produces:
  - `export default function ToastProvider({ children }: { children: React.ReactNode })`
  - `export function useToast(): BoToast` với
    `interface BoToast { thanhCong(noiDung: string): void; loi(noiDung: string): void; canhBao(noiDung: string): void; dangChay(noiDung: string): { xong(noiDung: string): void; hong(noiDung: string): void } }`

- [ ] **Step 1: Viết provider**

```tsx
/* =====================================================================
 *  ToastProvider — một chỗ duy nhất báo thành công / thất bại
 *  ---------------------------------------------------------------------
 *  Trước đó toast là một khối JSX nằm trong App.tsx, điều khiển bằng đúng
 *  một state của luồng lưu tiến độ. Hệ quả: mọi thao tác ghi ở màn Dữ liệu
 *  nguồn đóng hộp thoại rồi im lặng — người dùng không biết đã lưu chưa,
 *  và cách duy nhất để chắc là bấm Làm mới rồi tự dò lại bảng.
 *
 *  Luật hàng đợi ở `src/lib/toastQueue.ts`; ở đây chỉ vẽ và hẹn giờ.
 *
 *  Trợ năng: vùng thông báo là `aria-live="polite"` để trình đọc màn hình
 *  đọc mà không cắt ngang; riêng lỗi dùng `role="alert"` vì nó cần cắt
 *  ngang thật. Toast lỗi bấm tắt được — người dùng đọc xong muốn dẹp ngay.
 * ===================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader, X } from "lucide-react";

import { THOI_LUONG, boToast, chotToast, themToast } from "../../lib/toastQueue.ts";
import type { LoaiToast, Toast } from "../../lib/toastQueue.ts";

export interface BoToast {
  thanhCong(noiDung: string): void;
  loi(noiDung: string): void;
  canhBao(noiDung: string): void;
  /** Thao tác dài: mở toast "đang chạy", chốt bằng `xong` hoặc `hong`. */
  dangChay(noiDung: string): { xong(noiDung: string): void; hong(noiDung: string): void };
}

const Ctx = createContext<BoToast | null>(null);

/** Dùng ngoài provider thì không nổ — chỉ im lặng. Một component tách ra
 *  test riêng không nên chết chỉ vì thiếu vỏ thông báo. */
const IM_LANG: BoToast = {
  thanhCong: () => {}, loi: () => {}, canhBao: () => {},
  dangChay: () => ({ xong: () => {}, hong: () => {} }),
};

export function useToast(): BoToast {
  return useContext(Ctx) ?? IM_LANG;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [ds, setDs] = useState<Toast[]>([]);
  const dem = useRef(0);
  const hen = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const huyHen = useCallback((id: string) => {
    const h = hen.current.get(id);
    if (h) { clearTimeout(h); hen.current.delete(id); }
  }, []);

  const datHen = useCallback((id: string, loai: LoaiToast) => {
    huyHen(id);
    const ms = THOI_LUONG[loai];
    if (!ms) return;
    hen.current.set(id, setTimeout(() => {
      setDs((cu) => boToast(cu, id));
      hen.current.delete(id);
    }, ms));
  }, [huyHen]);

  // Dọn mọi hẹn giờ khi provider tháo — timer còn sống sẽ setState lên cây
  // đã gỡ và React cảnh báo rò rỉ.
  useEffect(() => () => { hen.current.forEach(clearTimeout); hen.current.clear(); }, []);

  const api = useMemo<BoToast>(() => {
    const mo = (loai: LoaiToast, noiDung: string) => {
      const id = `t${++dem.current}`;
      setDs((cu) => themToast(cu, { id, loai, noiDung }));
      datHen(id, loai);
      return id;
    };
    return {
      thanhCong: (n) => { mo("thanhCong", n); },
      loi: (n) => { mo("loi", n); },
      canhBao: (n) => { mo("canhBao", n); },
      dangChay: (n) => {
        const id = mo("dang", n);
        const chot = (loai: LoaiToast, noiDung: string) => {
          setDs((cu) => chotToast(cu, id, loai, noiDung));
          datHen(id, loai);
        };
        return {
          xong: (noiDung) => chot("thanhCong", noiDung),
          hong: (noiDung) => chot("loi", noiDung),
        };
      },
    };
  }, [datHen]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="vmp-toast-vung" aria-live="polite" aria-atomic="false">
        {ds.map((t) => (
          <div key={t.id} className={`vmp-toast vmp-toast--${t.loai}`}
            role={t.loai === "loi" ? "alert" : "status"}>
            <span className="vmp-toast__icon" aria-hidden="true">
              {t.loai === "dang" ? <Loader size={16} />
                : t.loai === "thanhCong" ? <Check size={16} />
                : <AlertTriangle size={16} />}
            </span>
            <span className="vmp-toast__chu">{t.noiDung}</span>
            {t.loai !== "dang" && (
              <button type="button" className="vmp-toast__tat" aria-label="Đóng thông báo"
                onClick={() => { huyHen(t.id); setDs((cu) => boToast(cu, t.id)); }}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
```

- [ ] **Step 2: Thêm CSS**

Vào `src/index.css`, dùng biến token đang có trong file (tra `--` gần các lớp `cw-` để lấy đúng tên biến; KHÔNG viết mã hex mới — `npm run drift` sẽ chặn):

```css
/* Vùng thông báo nổi góc phải. Xếp chồng dọc, mới nhất ở dưới. */
.vmp-toast-vung {
  position: fixed; top: 20px; right: 20px; z-index: 9999;
  display: flex; flex-direction: column; gap: 8px; max-width: 380px;
  pointer-events: none;
}
.vmp-toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: 14px;
  font-weight: 700; font-size: 14px;
  box-shadow: var(--bong-noi, 0 8px 28px rgba(0,0,0,.18));
  border: 1.5px solid transparent;
}
.vmp-toast--dang { background: var(--nen-noi); color: var(--chu); border-color: var(--vien); }
.vmp-toast--thanhCong { background: var(--ok-nen); color: var(--ok-chu); border-color: var(--ok-vien); }
.vmp-toast--canhBao { background: var(--canh-nen); color: var(--canh-chu); border-color: var(--canh-vien); }
.vmp-toast--loi { background: var(--loi-nen); color: var(--loi-chu); border-color: var(--loi-vien); }
.vmp-toast__chu { flex: 1; }
.vmp-toast__tat { background: none; border: 0; cursor: pointer; color: inherit; opacity: .7; }
.vmp-toast__tat:hover { opacity: 1; }
@media (prefers-reduced-motion: no-preference) {
  .vmp-toast { animation: vmp-toast-vao 160ms ease-out; }
  @keyframes vmp-toast-vao { from { opacity: 0; transform: translateY(-6px); } }
}
```

- [ ] **Step 3: Bọc provider trong App và bỏ toast inline**

Trong `src/App.tsx`: bọc `ToastProvider` quanh cây ứng dụng ở chỗ ngoài cùng nhất mà vẫn nằm trong các provider dữ liệu hiện có; xoá khối `{saveStatus && (...)}` ở `:2057-2085`; thay bằng một `useEffect` bơm `saveStatus` sang toast:

```tsx
// saveStatus của hook lưu tiến độ giờ đi qua vỏ thông báo dùng chung, để
// mọi màn báo kết quả theo cùng một cách thay vì mỗi chỗ tự vẽ một hộp.
const toast = useToast();
const saveTruoc = useRef("");
useEffect(() => {
  if (saveStatus === saveTruoc.current) return;
  saveTruoc.current = saveStatus;
  if (saveStatus === "saved") toast.thanhCong("Đã lưu thành công");
  else if (saveStatus === "warning") toast.canhBao("Lưu Supabase OK — Sheet chưa đồng bộ");
  else if (saveStatus === "error") toast.loi("Lưu thất bại");
}, [saveStatus, toast]);
```

Component gọi `useToast()` phải nằm BÊN TRONG `ToastProvider`. Nếu `saveStatus` đang ở chính component dựng provider thì tách phần thân hiện tại ra một component con, hoặc đặt provider ở `src/main.tsx` bọc `<App />`. Chọn cách nào cũng được, miễn `useToast()` không gọi ở cấp trên provider.

- [ ] **Step 4: Kiểu và mắt thường**

Run: `npm run typecheck`
Expected: sạch.
Run: `npm run dev`, làm một thao tác lưu tiến độ.
Expected: thấy toast "Đã lưu thành công" nổi góc phải rồi tự tắt.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ToastProvider.tsx src/App.tsx src/index.css
git commit -m "feat(thông báo): vỏ toast dùng chung thay khối inline trong App"
```

---

### Task 4: Chia nhóm trường theo tính bắt buộc

**Files:**
- Modify: `src/features/catalogWorkspace/definitions.ts` (thêm hàm cuối file)
- Modify: `src/features/catalogWorkspace/diff.ts:112-121`
- Modify: `tests/unit/catalog-workspace-diff.test.mjs:121-123`
- Test: `tests/unit/catalog-field-groups.test.mjs`

**Interfaces:**
- Consumes: `CatalogFieldDefinition` từ `contracts.ts`
- Produces:
  - `export function chiaNhomTruong(fields: readonly CatalogFieldDefinition[], soChinh?: number): { chinh: CatalogFieldDefinition[]; nangCao: CatalogFieldDefinition[] }` (mặc định `soChinh = 5`)
  - `thieuTruongBatBuoc(...)` đổi kiểu trả về thành `Array<{ key: string; label: string }>`

- [ ] **Step 1: Viết test hỏng**

Tạo `tests/unit/catalog-field-groups.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { chiaNhomTruong } from "../../src/features/catalogWorkspace/definitions.ts";

const f = (key, extra = {}) => ({ key, label: key, kind: "text", ...extra });

test("trường bắt buộc luôn nằm ở nhóm chính, dù khai ở cuối", () => {
  // Đây là lý do hàm này tồn tại: bản trước cắt bằng slice(0,5) theo vị
  // trí, nên một ô bắt buộc khai thứ 9 nằm trong phần thu gọn — người dùng
  // bấm Lưu, nút mờ câm, và không thấy ô nào để điền.
  const ds = [f("a"), f("b"), f("c"), f("d"), f("e"), f("g"), f("h"), f("bb", { required: true })];
  const { chinh, nangCao } = chiaNhomTruong(ds);
  assert.ok(chinh.some((t) => t.key === "bb"));
  assert.ok(!nangCao.some((t) => t.key === "bb"));
});

test("giữ nguyên thứ tự khai trong từng nhóm", () => {
  const ds = [f("a"), f("b"), f("c"), f("d"), f("e"), f("g"), f("h", { required: true })];
  const { chinh, nangCao } = chiaNhomTruong(ds);
  assert.deepEqual(chinh.map((t) => t.key), ["a", "b", "c", "d", "e", "h"]);
  assert.deepEqual(nangCao.map((t) => t.key), ["g"]);
});

test("không trường nào lặp ở cả hai nhóm", () => {
  const ds = [f("a", { required: true }), f("b"), f("c"), f("d"), f("e"), f("g")];
  const { chinh, nangCao } = chiaNhomTruong(ds);
  const trung = chinh.filter((t) => nangCao.some((x) => x.key === t.key));
  assert.deepEqual(trung, []);
  assert.equal(chinh.length + nangCao.length, ds.length);
});

test("ít trường hơn ngưỡng thì không có nhóm nâng cao", () => {
  const ds = [f("a"), f("b")];
  assert.deepEqual(chiaNhomTruong(ds).nangCao, []);
});
```

- [ ] **Step 2: Chạy cho hỏng**

Run: `node --import tsx --test tests/unit/catalog-field-groups.test.mjs`
Expected: FAIL — `chiaNhomTruong is not a function`.

- [ ] **Step 3: Viết hàm**

Thêm cuối `definitions.ts`:

```ts
/**
 * Chia trường thành nhóm luôn hiện và nhóm thu gọn.
 *
 * Luật cứng: trường BẮT BUỘC không bao giờ rơi vào nhóm thu gọn. Bản trước
 * cắt bằng `fields.slice(0, 5)` — thuần theo vị trí khai — nên một ô bắt
 * buộc nằm cuối danh sách sẽ bị giấu trong `<details>` đang đóng, còn nút
 * Lưu thì mờ đi không nói gì. Người dùng bấm, không có chuyện gì xảy ra.
 */
export function chiaNhomTruong(
  fields: readonly CatalogFieldDefinition[],
  soChinh = 5,
): { chinh: CatalogFieldDefinition[]; nangCao: CatalogFieldDefinition[] } {
  const buoc = new Set<string>();
  fields.forEach((f, i) => { if (f.required || i < soChinh) buoc.add(f.key); });
  return {
    chinh: fields.filter((f) => buoc.has(f.key)),
    nangCao: fields.filter((f) => !buoc.has(f.key)),
  };
}
```

- [ ] **Step 4: Đổi `thieuTruongBatBuoc` sang trả key + label**

Trong `diff.ts`:

```ts
/** Trường bắt buộc còn để trống. Trả cả `key` chứ không chỉ nhãn: giao
 *  diện cần key để mở đúng nhóm và đặt con trỏ vào đúng ô. */
export function thieuTruongBatBuoc(
  fields: readonly CatalogFieldDefinition[],
  record: CatalogRecord,
): Array<{ key: string; label: string }> {
  return fields
    .filter((f) => f.required && chuanHoa(f.kind, record[f.key]) === null)
    .map((f) => ({ key: f.key, label: f.label }));
}
```

Cập nhật `tests/unit/catalog-workspace-diff.test.mjs:121-123`:

```js
  assert.deepEqual(thieuTruongBatBuoc(f, { ma: "TB-1", ten: "", note: "" }),
    [{ key: "ten", label: "Tên" }]);
  assert.deepEqual(thieuTruongBatBuoc(f, { ma: "TB-1", ten: "Máy dập" }), []);
  assert.deepEqual(thieuTruongBatBuoc(f, {}),
    [{ key: "ma", label: "Mã đối tượng" }, { key: "ten", label: "Tên" }]);
```

Trong `CatalogRecordDialog.tsx:83` chỗ hiện `thieu.join(", ")` đổi thành `thieu.map((t) => t.label).join(", ")` để typecheck qua (Task 5 sẽ làm tiếp phần focus).

- [ ] **Step 5: Chạy toàn bộ unit**

Run: `npm run test:unit && npm run typecheck`
Expected: tất cả PASS, typecheck sạch.

- [ ] **Step 6: Commit**

```bash
git add src/features/catalogWorkspace/definitions.ts src/features/catalogWorkspace/diff.ts \
  src/features/catalogWorkspace/CatalogRecordDialog.tsx \
  tests/unit/catalog-field-groups.test.mjs tests/unit/catalog-workspace-diff.test.mjs
git commit -m "feat(danh mục): ô bắt buộc không bao giờ nằm trong phần thu gọn"
```

---

### Task 5: Đánh dấu bắt buộc, nút Lưu nói thật, nhảy tới ô thiếu

**Files:**
- Modify: `src/features/catalogWorkspace/CatalogField.tsx`
- Modify: `src/features/catalogWorkspace/CatalogRecordDialog.tsx`
- Modify: `src/index.css` (lớp `.cw-bat-buoc-chu`)

**Interfaces:**
- Consumes: `chiaNhomTruong` (Task 4), `thieuTruongBatBuoc` trả `{key,label}[]` (Task 4)
- Produces: `CatalogFieldProps` thêm `autoFocus?: boolean`

- [ ] **Step 1: `CatalogField` — nhãn bắt buộc đọc được và `required` thật**

Trong `CatalogField.tsx`, thay khối `<label>` và thêm `required` vào `chung`:

```tsx
  const chung = {
    id,
    disabled: khoa,
    required: field.required || undefined,
    "aria-required": field.required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": moTa,
    className: `cw-o${changed ? " is-doi" : ""}${error ? " is-loi" : ""}`,
  } as const;
```

```tsx
      <label htmlFor={id} className="cw-nhan">
        {field.label}
        {/* Dấu sao một mình không nói gì với người chưa quen quy ước, và
            trước đây nó còn aria-hidden nên trình đọc màn hình bỏ qua hẳn. */}
        {field.required && <span className="cw-bat-buoc-chu">Bắt buộc</span>}
        {khoa && <Lock size={13} aria-hidden="true" className="cw-khoa-icon" />}
      </label>
```

Thêm prop `autoFocus` vào interface và truyền `autoFocus={autoFocus}` cho cả ba nhánh (checkbox, select, input).

CSS:

```css
.cw-bat-buoc-chu {
  margin-left: 6px; padding: 1px 6px; border-radius: 999px;
  font-size: 11px; font-weight: 700; letter-spacing: .02em;
  background: var(--loi-nen); color: var(--loi-chu);
}
```

- [ ] **Step 2: Dialog — dùng nhóm mới, cho bấm Lưu, nhảy tới ô thiếu**

Trong `CatalogRecordDialog.tsx`:

Thay `const chinh = def.fields.slice(0, 5); const nangCao = def.fields.slice(5);` bằng:

```tsx
  const { chinh, nangCao } = useMemo(() => chiaNhomTruong(def.fields), [def.fields]);
  /* Ô nào cần đặt con trỏ vào — đặt khi người dùng bấm Lưu mà còn thiếu. */
  const [oCanNhay, setOCanNhay] = useState<string | null>(null);
  const thieuTrongNangCao = thieu.some((t) => nangCao.some((f) => f.key === t.key));
```

Thay điều kiện mờ nút (dòng `khongLuuDuoc`) — bỏ `thieu.length > 0` ra:

```tsx
  /* Nút Lưu KHÔNG mờ vì thiếu ô bắt buộc. Nút mờ mà không nói vì sao là
     cách chắc chắn khiến người dùng nghĩ hệ thống hỏng — họ bấm, không có
     gì xảy ra, và ô cần điền có thể đang nằm trong phần thu gọn. Cho bấm,
     rồi mở đúng phần đó ra và đặt con trỏ vào ô còn trống. */
  const khongLuuDuoc = !canEdit || dangLuu
    || (phaiNeuLyDo && !lyDo.trim())
    || Object.keys(patch).length === 0;
```

Trong `luu()`, thay `if (thieu.length > 0) return;`:

```tsx
    if (thieu.length > 0) {
      const dau = thieu[0];
      if (nangCao.some((f) => f.key === dau.key)) setMoNangCao(true);
      setOCanNhay(dau.key);
      return;
    }
```

Truyền `autoFocus` xuống cả hai vòng lặp `chinh.map` và `nangCao.map`:

```tsx
                autoFocus={oCanNhay === f.key}
```

và trong `datGiaTri` thêm `setOCanNhay(null);` để con trỏ không bị giật lại khi người dùng tự chuyển ô.

Nhãn phần thu gọn báo trước số ô còn thiếu:

```tsx
              <summary>
                Nâng cao ({nangCao.length} trường
                {thieuTrongNangCao && ` · còn ${thieu.filter((t) => nangCao.some((f) => f.key === t.key)).length} ô chưa điền`})
              </summary>
```

Và dòng "Còn thiếu" nói rõ hơn:

```tsx
      {thieu.length > 0 && (
        <p className="cw-loi" role="alert">
          Còn thiếu: {thieu.map((t) => t.label).join(", ")}
        </p>
      )}
```

- [ ] **Step 3: Kiểu**

Run: `npm run typecheck && npm run test:unit`
Expected: sạch, mọi test PASS.

- [ ] **Step 4: Thử tay**

Run: `npm run dev` → Dữ liệu nguồn → Người nhận cảnh báo → Thêm → để trống Email → bấm Tạo mới.
Expected: con trỏ nhảy vào ô Email, có nhãn "Bắt buộc", dòng "Còn thiếu: Email" hiện ở dưới.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalogWorkspace/CatalogField.tsx \
  src/features/catalogWorkspace/CatalogRecordDialog.tsx src/index.css
git commit -m "feat(danh mục): nhãn Bắt buộc đọc được, nút Lưu nói thật, nhảy tới ô còn trống"
```

---

### Task 6: Luật gợi ý và hook nạp dữ liệu

**Files:**
- Create: `src/features/catalogWorkspace/suggestions.ts`
- Create: `src/features/catalogWorkspace/useCatalogSuggestions.ts`
- Test: `tests/unit/catalog-suggestions.test.mjs`

**Interfaces:**
- Consumes: `fetchSourceObjects` từ `src/lib/supabaseData.ts`, `listDataset` từ `./api.ts`
- Produces:
  - `export type GoiY = Record<string, string[]>`
  - `export function gomGoiY(rows: ReadonlyArray<Record<string, unknown>>, keys: readonly string[]): GoiY`
  - `export function useCatalogSuggestions(): GoiY` (gộp sẵn gợi ý của cả ba dataset, khoá theo tên cột)

- [ ] **Step 1: Viết test hỏng**

Tạo `tests/unit/catalog-suggestions.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { gomGoiY } from "../../src/features/catalogWorkspace/suggestions.ts";

test("gom giá trị distinct, bỏ rỗng, sắp theo bảng chữ cái", () => {
  const rows = [
    { line: "Line 1", area_code: "KV-A" },
    { line: "Line 2", area_code: "" },
    { line: "Line 1", area_code: null },
  ];
  assert.deepEqual(gomGoiY(rows, ["line", "area_code"]),
    { line: ["Line 1", "Line 2"], area_code: ["KV-A"] });
});

test("cắt khoảng trắng thừa và gộp giá trị chỉ khác nhau ở khoảng trắng", () => {
  // Đúng thứ combobox sinh ra để dẹp: 'Line 1' và 'Line 1 ' là một.
  const rows = [{ line: " Line 1" }, { line: "Line 1 " }];
  assert.deepEqual(gomGoiY(rows, ["line"]), { line: ["Line 1"] });
});

test("KHÔNG gộp giá trị khác nhau ở chữ hoa thường", () => {
  // Hồ sơ GMP: 'KV-A' và 'kv-a' có thể là hai mã khác nhau thật. Gợi ý
  // hiện cả hai để người dùng nhìn thấy sự lệch mà tự quyết, chứ máy không
  // được tự chọn hộ một cái rồi bỏ cái kia.
  const rows = [{ area_code: "KV-A" }, { area_code: "kv-a" }];
  assert.deepEqual(gomGoiY(rows, ["area_code"]), { area_code: ["KV-A", "kv-a"] });
});

test("số cũng thành gợi ý dạng chuỗi", () => {
  assert.deepEqual(gomGoiY([{ batch_size: 1000 }], ["batch_size"]), { batch_size: ["1000"] });
});

test("không có dòng nào thì mỗi khoá là mảng rỗng", () => {
  assert.deepEqual(gomGoiY([], ["line"]), { line: [] });
});
```

- [ ] **Step 2: Chạy cho hỏng**

Run: `node --import tsx --test tests/unit/catalog-suggestions.test.mjs`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết luật**

`src/features/catalogWorkspace/suggestions.ts`:

```ts
/* =====================================================================
 *  suggestions.ts — gom giá trị đã có thành danh sách gợi ý
 *  ---------------------------------------------------------------------
 *  Ô gõ tự do là nguồn gốc của "Line 1", "Line1" và "line 1" cùng tồn tại
 *  trong một bảng: lọc theo dây chuyền ra ba nhóm cho một dây chuyền thật.
 *  Gợi ý lấy từ chính dữ liệu đang có nên không ai phải bịa danh mục, mà
 *  lần nhập sau vẫn tái dùng đúng chữ của lần trước.
 *
 *  Chỉ chuẩn hoá KHOẢNG TRẮNG, không chuẩn hoá hoa thường. Trong hồ sơ
 *  GMP hai mã khác nhau ở chữ hoa có thể là hai mã thật — máy tự gộp là
 *  máy sửa dữ liệu đã ban hành mà không ai duyệt.
 * ===================================================================== */
export type GoiY = Record<string, string[]>;

export function gomGoiY(
  rows: ReadonlyArray<Record<string, unknown>>,
  keys: readonly string[],
): GoiY {
  const kq: GoiY = {};
  for (const key of keys) {
    const tap = new Set<string>();
    for (const r of rows) {
      const v = r?.[key];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) tap.add(s);
    }
    kq[key] = [...tap].sort((a, b) => a.localeCompare(b, "vi"));
  }
  return kq;
}
```

`src/features/catalogWorkspace/useCatalogSuggestions.ts`:

```ts
/* =====================================================================
 *  useCatalogSuggestions — nạp gợi ý một lần cho cả workspace
 *  ---------------------------------------------------------------------
 *  Nạp ở đây chứ không nạp trong hộp thoại: mở form ra rồi mới gọi mạng
 *  thì danh sách gợi ý xuất hiện muộn hơn con trỏ, và người dùng đã gõ
 *  xong nửa chữ. Một lượt lúc vào màn là đủ.
 *
 *  Đối tượng nguồn phải đọc CẢ loại và CẢ bản đã ngừng dùng: gợi ý là để
 *  tái dùng đúng chữ cũ, mà chữ cũ nằm nhiều nhất ở dữ liệu cũ.
 *
 *  Sản phẩm GMP đọc qua `listDataset` với trang lớn, KHÔNG dùng `svRows`
 *  của màn: cái đó phân trang và lọc theo ô tìm kiếm, nên gợi ý sẽ đổi
 *  theo từ khoá đang gõ — thứ không ai hiểu nổi khi đang nhập liệu.
 * ===================================================================== */
import { useEffect, useState } from "react";

import { fetchSourceObjects } from "../../lib/supabaseData.ts";
import { listDataset } from "./api.ts";
import { gomGoiY } from "./suggestions.ts";
import type { GoiY } from "./suggestions.ts";

const KHOA_DOI_TUONG = ["department", "area_code", "line", "work_group"] as const;
const KHOA_SAN_PHAM = [
  "dosage_form", "production_line", "primary_pack", "mixing_tank", "batch_size", "strength",
] as const;

/** Đủ phủ toàn bộ danh mục sản phẩm hiện tại; nhiều hơn thì phần thừa chỉ
 *  làm chậm màn mà không thêm gợi ý nào. */
const SO_DONG_GOI_Y = 500;

export function useCatalogSuggestions(): GoiY {
  const [goiY, setGoiY] = useState<GoiY>({});

  useEffect(() => {
    let con = true;
    (async () => {
      const kq: GoiY = {};
      try {
        const rows = await fetchSourceObjects({ kind: null, includeInactive: true });
        Object.assign(kq, gomGoiY(rows as Array<Record<string, unknown>>, [...KHOA_DOI_TUONG]));
      } catch { /* Gợi ý hỏng không được chặn nhập liệu — ô vẫn gõ tay được. */ }
      try {
        const sp = await listDataset({ dataset: "products", query: "", page: 0, pageSize: SO_DONG_GOI_Y });
        if (sp.ok) Object.assign(kq, gomGoiY(sp.rows.map((r) => r.data), [...KHOA_SAN_PHAM]));
      } catch { /* như trên */ }
      if (con) setGoiY(kq);
    })();
    return () => { con = false; };
  }, []);

  return goiY;
}
```

- [ ] **Step 4: Chạy cho xanh**

Run: `node --import tsx --test tests/unit/catalog-suggestions.test.mjs && npm run typecheck`
Expected: 5 test PASS, typecheck sạch.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalogWorkspace/suggestions.ts \
  src/features/catalogWorkspace/useCatalogSuggestions.ts tests/unit/catalog-suggestions.test.mjs
git commit -m "feat(danh mục): gợi ý nhập lấy từ giá trị đã có trong hồ sơ"
```

---

### Task 7: Combobox trong hộp thoại Sản phẩm / Người nhận

**Files:**
- Modify: `src/features/catalogWorkspace/contracts.ts` (kiểu trường)
- Modify: `src/features/catalogWorkspace/definitions.ts` (đổi `kind` một số trường)
- Modify: `src/features/catalogWorkspace/CatalogField.tsx` (vẽ combobox)
- Modify: `src/features/catalogWorkspace/CatalogRecordDialog.tsx` (nhận prop `goiY`)
- Modify: `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx` (gọi hook, truyền xuống)
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `GoiY` và `useCatalogSuggestions` (Task 6)
- Produces:
  - `CatalogFieldKind` thêm `"combobox"`
  - `CatalogFieldProps` thêm `goiY?: readonly string[]`
  - `CatalogRecordDialogProps` thêm `goiY?: GoiY`

- [ ] **Step 1: Mở rộng kiểu**

`contracts.ts`:

```ts
export type CatalogFieldKind = "text" | "number" | "boolean" | "date" | "select" | "combobox";
```

`chuanHoa` trong `diff.ts` rơi vào `default` cho `combobox` → xử lý như text, đúng ý. Không phải sửa gì thêm ở đó.

- [ ] **Step 2: Đổi kind ở `definitions.ts`**

Sản phẩm GMP — sáu trường:

```ts
    { key: "strength", label: "Hàm lượng", kind: "combobox" },
    { key: "dosage_form", label: "Dạng bào chế", kind: "combobox" },
    { key: "production_line", label: "Dây chuyền", kind: "combobox" },
    { key: "primary_pack", label: "Bao bì sơ cấp", kind: "combobox" },
    { key: "batch_size", label: "Cỡ lô", kind: "combobox" },
    { key: "mixing_tank", label: "Bồn pha", kind: "combobox" },
```

Người nhận cảnh báo — ô Giá trị phạm vi:

```ts
    { key: "scope", label: "Giá trị phạm vi", kind: "combobox",
      hint: "Để trống nếu phạm vi là Tất cả" },
```

Đối tượng nguồn (dataset `objects` chỉ dùng cho bảng, nhưng giữ nhất quán):

```ts
    { key: "area_code", label: "Mã khu vực", kind: "combobox" },
    { key: "line", label: "Dây chuyền", kind: "combobox" },
    { key: "work_group", label: "Nhóm công việc", kind: "combobox" },
```

KHÔNG thêm `key` nào mới — whitelist server là biên thật.

- [ ] **Step 3: Vẽ combobox trong `CatalogField`**

Thêm nhánh trước nhánh `input` cuối:

```tsx
      ) : field.kind === "combobox" ? (
        /* Gõ được, mà cũng chọn được từ những giá trị đã có trong hồ sơ.
           Khoá cứng danh sách ở đây là sai: thiết bị mới, dây chuyền mới
           xuất hiện thường xuyên hơn nhịp sửa code. */
        <>
          <input {...chung} list={`${id}-goi-y-ds`} type="text"
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value)} />
          <datalist id={`${id}-goi-y-ds`}>
            {(goiY || []).map((v) => <option key={v} value={v} />)}
          </datalist>
        </>
      ) : (
```

và thêm `goiY` vào props/destructure.

- [ ] **Step 4: Truyền gợi ý xuống**

`CatalogRecordDialog` nhận `goiY?: GoiY` và truyền `goiY={goiY?.[f.key]}` vào mỗi `CatalogField` (cả hai vòng lặp).

Riêng ô `scope` của Người nhận cảnh báo: nguồn gợi ý đổi theo ô Phạm vi đang chọn.

```tsx
  /* Phạm vi 'bộ phận' thì gợi ý bộ phận, 'khu vực' thì gợi ý mã khu vực.
     Gợi ý sai loại còn tệ hơn không gợi ý: người dùng chọn đại một cái
     trông quen mắt rồi cảnh báo lọc trượt hết. */
  const goiYCho = (key: string): readonly string[] | undefined => {
    if (dataset !== "alerts" || key !== "scope") return goiY?.[key];
    const pv = String(nhap.scope_type ?? "").toLowerCase();
    if (pv.includes("bộ phận")) return goiY?.department;
    if (pv.includes("khu vực")) return goiY?.area_code;
    return undefined;
  };
```

`CatalogWorkspaceShell`: `const goiY = useCatalogSuggestions();` ở thân component, truyền `goiY={goiY}` vào `<CatalogRecordDialog ...>` (`:606-613`).

- [ ] **Step 5: CSS mũi tên gợi ý**

```css
/* Combobox trông phải khác ô text trần, nếu không không ai biết là bấm
   xuống có danh sách. */
.cw-o[list] { background-image: var(--mui-ten-xuong, none); padding-right: 26px; }
```

Nếu `--mui-ten-xuong` chưa có trong `index.css`, bỏ dòng `background-image` và thay bằng viền phải dày hơn — KHÔNG thêm hex mới (`npm run drift` chặn).

- [ ] **Step 6: Kiểm**

Run: `npm run typecheck && npm run test:unit`
Expected: sạch, PASS.
Run: `npm run dev` → Sản phẩm GMP → Sửa một dòng → ô Dạng bào chế.
Expected: bấm vào ô hiện danh sách dạng bào chế đã có; gõ chữ mới vẫn nhập được.

- [ ] **Step 7: Commit**

```bash
git add src/features/catalogWorkspace/contracts.ts src/features/catalogWorkspace/definitions.ts \
  src/features/catalogWorkspace/CatalogField.tsx src/features/catalogWorkspace/CatalogRecordDialog.tsx \
  src/features/catalogWorkspace/CatalogWorkspaceShell.tsx src/index.css
git commit -m "feat(danh mục): ô gõ tự do thành combobox gợi ý theo dữ liệu đã có"
```

---

### Task 8: Form đối tượng — bộ phận khoá có lối thoát, combobox, nhảy tới ô thiếu

**Files:**
- Modify: `src/lib/catalogForm.ts`
- Modify: `src/components/catalog/CatalogObjectForm.tsx`
- Modify: `tests/unit/catalog-form.test.mjs`

**Interfaces:**
- Consumes: `GoiY` (Task 6)
- Produces:
  - `export const BO_PHAN_CHUAN: readonly { ma: string; ten: string }[]`
  - `export const MA_BO_PHAN_KHAC = "__khac__"`
  - `TruongForm` thêm `chonCoKhac?: boolean` và `goiYTu?: string`
  - `export function truongThieuDauTien(form: GiaTriForm): string | null`

- [ ] **Step 1: Viết test hỏng**

Thêm vào `tests/unit/catalog-form.test.mjs`:

```js
import {
  BO_PHAN_CHUAN, MA_BO_PHAN_KHAC, truongThieuDauTien,
} from "../../src/lib/catalogForm.ts";

test("sáu bộ phận chuẩn khớp danh mục đã khai ở workspace", () => {
  assert.deepEqual(BO_PHAN_CHUAN.map((b) => b.ma),
    ["xsx", "cd", "kho", "qc", "rd", "qa"]);
});

test("bộ phận ngoài danh sách chuẩn vẫn hợp lệ", () => {
  // Dữ liệu di trú từ Sheet có bộ phận không nằm trong sáu mã trên. Chặn
  // nó ở form nghĩa là người dùng không sửa nổi bản ghi cũ nào — mà cũng
  // không ai được phép âm thầm đổi bộ phận của hồ sơ đã ban hành.
  const f = { object_code: "TB-9", object_name: "Máy", department: "Tổ điện lạnh", validate_flag: "n" };
  assert.deepEqual(validateCatalogForm(f), {});
});

test("bộ phận để trống vẫn bị chặn", () => {
  const f = { object_code: "TB-9", object_name: "Máy", department: "", validate_flag: "n" };
  assert.equal(validateCatalogForm(f).department, "Phải nhập bộ phận quản lý");
});

test("truongThieuDauTien trả key của ô bắt buộc trống đầu tiên", () => {
  assert.equal(truongThieuDauTien({ object_code: "", object_name: "", department: "xsx" }),
    "object_code");
  assert.equal(truongThieuDauTien({ object_code: "TB-1", object_name: "", department: "xsx" }),
    "object_name");
  assert.equal(
    truongThieuDauTien({ object_code: "TB-1", object_name: "Máy", department: "xsx", validate_flag: "n" }),
    null);
});
```

- [ ] **Step 2: Chạy cho hỏng**

Run: `node --import tsx --test tests/unit/catalog-form.test.mjs`
Expected: FAIL — `BO_PHAN_CHUAN` không export.

- [ ] **Step 3: Sửa `catalogForm.ts`**

```ts
/** Sáu bộ phận chuẩn — KHỚP `BO_PHAN` của catalogWorkspace/definitions.ts.
 *  Hai nơi cùng một danh mục là chuyện đã có sẵn; đổi một bên phải đổi bên
 *  kia, nếu không hai màn hiện hai danh sách khác nhau cho cùng một cột. */
export const BO_PHAN_CHUAN = [
  { ma: "xsx", ten: "Xưởng sản xuất" },
  { ma: "cd", ten: "Cơ điện" },
  { ma: "kho", ten: "Kho" },
  { ma: "qc", ten: "QC – Kiểm nghiệm" },
  { ma: "rd", ten: "RD – Nghiên cứu phát triển" },
  { ma: "qa", ten: "QA – QLCL" },
] as const;

/** Giá trị nội bộ của lựa chọn "Bộ phận khác…" — KHÔNG bao giờ được ghi
 *  xuống database; giao diện thấy nó thì mở ô text để người dùng gõ tên
 *  thật, và giá trị gửi đi là tên thật đó. */
export const MA_BO_PHAN_KHAC = "__khac__";
```

Trong `TRUONG_FORM`, ô `department` giữ `batBuoc: true` và thêm hai cờ mới:

```ts
  { key: "department", label: "Bộ phận quản lý", nhom: "chinh", batBuoc: true,
    chonCoKhac: true,
    goiY: "Chọn trong danh sách. Bộ phận mới thì chọn “Bộ phận khác…” rồi gõ tên." },
  { key: "area_code", label: "Khu vực", nhom: "chinh", goiYTu: "area_code" },
  { key: "line", label: "Line", nhom: "chinh", goiYTu: "line" },
```

và `work_group`:

```ts
  { key: "work_group", label: "Nhóm công việc", nhom: "phan_cong", goiYTu: "work_group" },
```

Thêm hai cờ vào interface `TruongForm`:

```ts
  /** Ô chọn khoá danh sách chuẩn, kèm lựa chọn "khác…" mở ô gõ tự do. */
  chonCoKhac?: boolean;
  /** Tên cột dùng để tra gợi ý combobox từ dữ liệu đang có. */
  goiYTu?: string;
```

`validateCatalogForm` **không** thêm luật nào cho `department` ngoài `batBuoc` sẵn có — bộ phận ngoài danh sách chuẩn phải đi qua được (test ở Step 1).

Thêm hàm:

```ts
/** Ô bắt buộc còn trống đầu tiên, theo thứ tự hiển thị. Giao diện dùng nó
 *  để mở đúng nhóm và đặt con trỏ vào đúng ô thay vì chỉ làm mờ nút Lưu. */
export function truongThieuDauTien(form: GiaTriForm): string | null {
  const loi = validateCatalogForm(form);
  for (const t of truongDangHien(form)) {
    if (loi[t.key]) return t.key;
  }
  return null;
}
```

- [ ] **Step 4: Chạy cho xanh**

Run: `node --import tsx --test tests/unit/catalog-form.test.mjs`
Expected: mọi test PASS.

- [ ] **Step 5: Vẽ trong `CatalogObjectForm`**

Nhận prop mới `goiY?: GoiY` (shell truyền xuống), và trong `veTruong` thêm hai nhánh **trước** nhánh `t.chon`:

```tsx
        {t.chonCoKhac ? (() => {
          const giaTri = form[t.key] ?? "";
          const trongChuan = BO_PHAN_CHUAN.some((b) => b.ma === giaTri);
          const dangKhac = giaTri !== "" && !trongChuan;
          return (
            <>
              <select id={id} className={lop} disabled={khoa}
                value={dangKhac ? MA_BO_PHAN_KHAC : giaTri}
                aria-invalid={loiO ? true : undefined} aria-describedby={moTa}
                onChange={(e) => dat(t.key, e.target.value === MA_BO_PHAN_KHAC ? "" : e.target.value)}>
                <option value="">—</option>
                {BO_PHAN_CHUAN.map((b) => <option key={b.ma} value={b.ma}>{b.ten}</option>)}
                <option value={MA_BO_PHAN_KHAC}>Bộ phận khác…</option>
              </select>
              {/* Bản ghi cũ mang bộ phận ngoài sáu mã chuẩn (dữ liệu di trú
                  từ Sheet) phải hiện đúng giá trị đang có. Không có ô này
                  thì mở form ra là giá trị biến mất, và một cú bấm Lưu ghi
                  đè mất bộ phận của hồ sơ đã ban hành. */}
              {dangKhac && (
                <input className={`${lop} cw-o-khac`} value={giaTri} disabled={khoa}
                  aria-label={`${t.label} — nhập tên bộ phận`}
                  placeholder="Tên bộ phận mới"
                  onChange={(e) => dat(t.key, e.target.value)} />
              )}
            </>
          );
        })() : t.goiYTu ? (
          <>
            <input id={id} className={lop} value={form[t.key] ?? ""} disabled={khoa}
              list={`${id}-ds`} aria-invalid={loiO ? true : undefined} aria-describedby={moTa}
              onChange={(e) => dat(t.key, e.target.value)} />
            <datalist id={`${id}-ds`}>
              {(goiY?.[t.goiYTu] ?? []).map((v) => <option key={v} value={v} />)}
            </datalist>
          </>
        ) : t.chonNguoi ? (
```

Lưu ý: chọn "Bộ phận khác…" đặt giá trị về `""` để ô text mở ra trống — nhưng khi đó `dangKhac` là `false` và ô text biến mất ngay. Tránh bằng một state riêng:

```tsx
  /* Nhớ rằng người dùng đang ở chế độ "khác", vì giá trị rỗng không phân
     biệt được "chưa chọn gì" với "chọn khác nhưng chưa gõ". */
  const [boPhanKhac, setBoPhanKhac] = useState(() => {
    const v = String(row.department ?? "");
    return v !== "" && !BO_PHAN_CHUAN.some((b) => b.ma === v);
  });
```

và dùng `const dangKhac = boPhanKhac || (giaTri !== "" && !trongChuan);`, đồng thời `onChange` của select gọi `setBoPhanKhac(e.target.value === MA_BO_PHAN_KHAC)`.

- [ ] **Step 6: Nhảy tới ô thiếu + nhãn bắt buộc**

Trong `luu()` của `CatalogObjectForm`, sau `setLoi(loiMoi)`:

```tsx
    if (Object.keys(loiMoi).length) {
      const dau = truongThieuDauTien(form);
      if (dau) {
        // Nhóm Nâng cao đang thu gọn thì mở ra, nếu không người dùng nhận
        // một câu lỗi trỏ tới ô họ không nhìn thấy.
        if (TRUONG_FORM.find((t) => t.key === dau)?.nhom === "nang_cao") setMoNangCao(true);
        setOCanNhay(dau);
      }
      return;
    }
```

Thêm `const [oCanNhay, setOCanNhay] = useState<string | null>(null);`, truyền `autoFocus={oCanNhay === t.key}` cho ô nhập/select trong `veTruong`, và `setOCanNhay(null)` trong `dat`.

Đổi nhãn bắt buộc giống Task 5:

```tsx
          {t.batBuoc && <span className="cw-bat-buoc-chu">Bắt buộc</span>}
```

`CatalogWorkspaceShell` truyền `goiY={goiY}` vào `<CatalogObjectForm ...>` (`:578-582`).

- [ ] **Step 7: Kiểm**

Run: `npm run typecheck && npm run test:unit`
Expected: sạch, PASS.
Run: `npm run dev` → Dữ liệu nguồn → Đối tượng nguồn → Sửa một dòng.
Expected: Bộ phận là danh sách 6 lựa chọn + "Bộ phận khác…"; chọn "khác" hiện ô gõ; ô Khu vực/Line có gợi ý.

- [ ] **Step 8: Commit**

```bash
git add src/lib/catalogForm.ts src/components/catalog/CatalogObjectForm.tsx \
  src/features/catalogWorkspace/CatalogWorkspaceShell.tsx tests/unit/catalog-form.test.mjs
git commit -m "feat(đối tượng): bộ phận khoá danh sách chuẩn kèm lối thoát, khu vực/line có gợi ý"
```

---

### Task 9: Mặc định an toàn cho người nhận cảnh báo + nối lại luật đang chết

**Files:**
- Modify: `src/features/catalogWorkspace/CatalogRecordDialog.tsx`
- Modify: `tests/unit/dataset-form.test.mjs` (nếu cần bổ sung)

**Interfaces:**
- Consumes: `validateDatasetForm` từ `src/lib/datasetForm.ts`
- Produces: không có API mới

- [ ] **Step 1: Đặt mặc định khi tạo mới**

Trong `CatalogRecordDialog.tsx`, sửa khởi tạo state:

```tsx
/* Bản ghi mới của Người nhận cảnh báo phải có Phạm vi và Loại cảnh báo.
   Để trống thì bảng vẫn hiện người này "Đang bật" nhưng workflow không
   biết lọc theo gì — họ có thể không nhận email nào mà chẳng có lỗi nào
   báo. Đặt mặc định rộng nhất ("tất cả", "cả hai") thay vì bắt người dùng
   điền thêm hai ô: mặc định an toàn không phiền ai, ô bắt buộc thì có. */
const MAC_DINH_TAO_MOI: Partial<Record<CatalogDatasetId, CatalogRecord>> = {
  alerts: { scope_type: "tất cả", alert_kind: "cả hai" },
};
```

và dùng nó ở cả hai chỗ khởi tạo `nhap`:

```tsx
  const [nhap, setNhap] = useState<CatalogRecord>(
    () => ({ ...(record === null ? MAC_DINH_TAO_MOI[dataset] : {}), ...(record || {}) }));
```

```tsx
  if (nguon !== record) {
    setNguon(record);
    setNhap({ ...(record === null ? MAC_DINH_TAO_MOI[dataset] : {}), ...(record || {}) });
    setLyDo("");
    setLoi(null);
  }
```

Giá trị `"tất cả"` và `"cả hai"` phải khớp **đúng chữ** với `options` trong `definitions.ts:77-88` — sai một dấu là select hiện rỗng.

- [ ] **Step 2: Nối `validateDatasetForm` vào dialog**

```tsx
import { validateDatasetForm } from "../../lib/datasetForm.ts";
```

```tsx
  /* Luật này đã nằm trong repo từ lâu nhưng KHÔNG file nào import — nghĩa
     là email sai định dạng hiện không bị chặn ở form, và mail cảnh báo
     lặng lẽ không tới ai. Nối lại thay vì để nó nằm chết. */
  const loiTruong = useMemo(() => validateDatasetForm(dataset, nhap), [dataset, nhap]);
```

Truyền `error={loiTruong[f.key]}` xuống mỗi `CatalogField`, và chặn trong `luu()`:

```tsx
    const keyLoi = Object.keys(loiTruong);
    if (keyLoi.length > 0) {
      const dau = keyLoi[0];
      if (nangCao.some((f) => f.key === dau)) setMoNangCao(true);
      setOCanNhay(dau);
      return;
    }
```

- [ ] **Step 3: Kiểm**

Run: `npm run test:unit && npm run typecheck`
Expected: PASS, sạch.
Run: `npm run dev` → Người nhận cảnh báo → Thêm.
Expected: Phạm vi đã sẵn "Tất cả", Loại cảnh báo sẵn "Cả hai". Gõ email `abc@` rồi bấm Tạo mới → lỗi hiện ngay dưới ô Email, không gửi lên server.

- [ ] **Step 4: Commit**

```bash
git add src/features/catalogWorkspace/CatalogRecordDialog.tsx tests/unit/dataset-form.test.mjs
git commit -m "feat(cảnh báo): mặc định phạm vi/loại khi tạo mới, nối lại luật kiểm email"
```

---

### Task 10: Nối toast vào mọi thao tác ghi của Dữ liệu nguồn

**Files:**
- Modify: `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`
- Modify: `src/features/catalogWorkspace/CatalogRecordDialog.tsx`
- Modify: `src/features/catalogWorkspace/CatalogExcelImport.tsx`

**Interfaces:**
- Consumes: `useToast()` (Task 3)
- Produces: không có API mới

- [ ] **Step 1: Lưu đối tượng nguồn**

Trong `CatalogWorkspaceShell.tsx`, thêm `const toast = useToast();` và sửa `onSaved` của `CatalogObjectForm` (`:584-599`):

```tsx
          onSaved={async (patch, lyDo, version) => {
            if (!Object.keys(patch).length) { setDangSuaObj(null); return; }
            const ma = dangSuaObj.taoMoi
              ? String(patch.object_code ?? "")
              : String(dangSuaObj.row.object_code ?? "");
            const dang = toast.dangChay(dangSuaObj.taoMoi ? `Đang tạo ${ma}…` : `Đang lưu ${ma}…`);
            const kq = await saveCatalogObject(kind, ma, patch, lyDo, version);
            if (!kq.ok) {
              const câu = kq.error_code === "VERSION_CONFLICT"
                ? `${kq.error ?? "Bản ghi đã bị người khác sửa"} (bản trên máy chủ: v${kq.current_version ?? "?"})`
                : (kq.error ?? "Lưu danh mục thất bại");
              dang.hong(câu);
              // Ném tiếp để form giữ nguyên hộp thoại và dữ liệu vừa gõ —
              // đóng hộp thoại lúc lưu hỏng là bắt người dùng gõ lại từ đầu.
              throw new Error(câu);
            }
            dang.xong(dangSuaObj.taoMoi ? `Đã tạo ${ma}` : `Đã lưu ${ma}`);
            setDangSuaObj(null);
            await taiDoiTuong();
            onReload?.();
            if (kq.change_id) setChangeId(kq.change_id);
          }}
```

Đổi tên biến `câu` thành `thongBao` khi viết code thật — không đặt tên biến có dấu.

- [ ] **Step 2: Lưu sản phẩm / người nhận**

Trong `CatalogRecordDialog.tsx`, thêm `const toast = useToast();` và sửa `luu()`:

```tsx
    setDangLuu(true);
    const khoa = String(nhap[def.businessKeyField] ?? "");
    const dang = toast.dangChay(laTaoMoi ? `Đang tạo ${khoa}…` : `Đang lưu ${khoa}…`);
    const kq = await saveRecord({ /* ...như cũ... */ });
    setDangLuu(false);

    if (!kq.ok) {
      dang.hong(kq.error || "Lưu thất bại");
      setLoi(kq);   // Hộp thoại VẪN MỞ, dữ liệu vừa gõ còn nguyên.
      return;
    }
    dang.xong(laTaoMoi ? `Đã tạo ${khoa}` : `Đã lưu ${khoa}`);
    onSaved({ recordId: kq.recordId, version: kq.version });
    onClose();
```

- [ ] **Step 3: Nhập Excel**

Trong `CatalogExcelImport.tsx`, thêm `const toast = useToast();` và trong `ghi()` (`:228-238`):

```tsx
    setDangGhi(true);
    const dang = toast.dangChay("Đang ghi lô vào hệ thống…");
    const kq = await commitCatalogImport(staging.batch.id, lyDo.trim());
    setDangGhi(false);
    if (!kq.ok) {
      const thongBao = `Ghi thất bại: ${kq.error || kq.errorCode || "không rõ"}`;
      dang.hong(thongBao);
      setKetQuaGhi(thongBao);
      return;
    }
    dang.xong(`Đã ghi: ${kq.created ?? 0} tạo mới · ${kq.updated ?? 0} sửa · ${kq.unchanged ?? 0} giữ nguyên`);
    setKetQuaGhi(`Đã ghi: ${kq.created ?? 0} tạo mới · ${kq.updated ?? 0} sửa · ${kq.unchanged ?? 0} giữ nguyên.`);
    setParsed(null);
    onCommitted?.(kq.pendingChangeIds ?? []);
```

Và ở chỗ kiểm tra file (nơi gọi `stageCatalogImport`): thành công thì `toast.thanhCong(...)` với số dòng hợp lệ, có dòng lỗi thì `toast.canhBao(...)` với số dòng lỗi. Tra biến đếm đang có trong file (`tong.loi`, `tong` các loại) thay vì tự đếm lại.

- [ ] **Step 4: Áp thay đổi và sinh timeline**

`onApplied` của `CatalogImpactPreview` (`:628-634`) thêm `toast.thanhCong("Đã áp thay đổi vào timeline")`.

`SinhTimelineDialog` (`:644-660`): thành công `toast.thanhCong(...)` kèm số hạng mục lấy từ `kq`; thất bại `toast.loi(...)` với câu lỗi và **không đóng** hộp thoại.

- [ ] **Step 5: Kiểm**

Run: `npm run typecheck && npm run test:unit`
Expected: sạch, PASS.
Run: `npm run dev` → sửa một sản phẩm → Lưu.
Expected: toast "Đang lưu…" rồi thành "Đã lưu {mã}".

- [ ] **Step 6: Commit**

```bash
git add src/features/catalogWorkspace/CatalogWorkspaceShell.tsx \
  src/features/catalogWorkspace/CatalogRecordDialog.tsx \
  src/features/catalogWorkspace/CatalogExcelImport.tsx
git commit -m "feat(danh mục): mọi thao tác ghi đều báo thành công hoặc thất bại"
```

---

### Task 11: e2e, ảnh baseline, deploy

**Files:**
- Modify: `tests/e2e/catalog-workspace.mjs`

**Interfaces:**
- Consumes: mọi thứ ở trên
- Produces: không

- [ ] **Step 1: Đọc bộ e2e đang có**

Run: `sed -n 1,80p tests/e2e/catalog-workspace.mjs`
Mục đích: theo đúng cách nó đăng nhập, dựng kho giả lập và chọn phần tử. KHÔNG tự nghĩ ra kiểu mới.

- [ ] **Step 2: Thêm hai ca kiểm**

Ca 1 — ô bắt buộc trong phần thu gọn:
mở hộp thoại tạo mới Người nhận cảnh báo, xoá Email, bấm nút Tạo mới, khẳng định
`document.activeElement` là ô `#cw-alerts-email` và `<details class="cw-nang-cao">` đã mở nếu ô thiếu nằm trong đó.

Ca 2 — toast:
lưu thành công → tồn tại `.vmp-toast--thanhCong`; ép server trả lỗi qua kho giả lập → tồn tại `.vmp-toast--loi` **và** hộp thoại vẫn mở (`.cw-than` còn trên DOM).

- [ ] **Step 3: Chạy toàn bộ bộ kiểm**

```bash
npm run typecheck && npm run test:unit && npm run e2e:catalog && npm run a11y
```
Expected: tất cả xanh. a11y phải xanh — nhãn "Bắt buộc" và combobox đều là phần tử có nhãn thật.

- [ ] **Step 4: Commit và push**

```bash
git add tests/e2e/catalog-workspace.mjs
git commit -m "test(danh mục): e2e ô bắt buộc bị giấu và phản hồi thành công/thất bại"
git push origin main
```

- [ ] **Step 5: Chụp lại baseline ảnh TRƯỚC khi deploy**

```bash
gh workflow run "Visual baseline"
gh run watch <id>
git pull --rebase origin main
```
Lý do: CI so ảnh với baseline sinh trên ubuntu+chromium; công chúa đổi mặt nên mọi ảnh có cô ấy đều lệch. Bỏ qua bước này thì `Quality and Deploy` fail ở bước Visual regression và job deploy không chạy.

- [ ] **Step 6: Deploy**

```bash
gh workflow run "Quality and Deploy"
gh run watch <id>
```
Expected: xanh hết, web cập nhật.

---

## Tự rà soát kế hoạch

**Phủ spec:** A→Task 1. B1→Task 6,7. B2→Task 8. B3→Task 5,8. B4→Task 4,5,8. B5→Task 9. B6→Task 9. C→Task 2,3,10. Kiểm thử→Task 11. Không mục nào của spec thiếu task.

**Rủi ro còn lại đã ghi trong spec:** giá trị bộ phận lạ (Task 8 Step 5 có ô giữ lại + test), gợi ý thiếu do phân trang (Task 6 dùng lượt đọc riêng), ảnh CI (Task 11 Step 5).

**Điểm cần người thực thi tự tra trong code, không đoán:** tên biến token màu trong `index.css` (Task 3 Step 2, Task 7 Step 5), biến đếm dòng lỗi trong `CatalogExcelImport` (Task 10 Step 3), cách chọn phần tử của bộ e2e (Task 11 Step 1).
