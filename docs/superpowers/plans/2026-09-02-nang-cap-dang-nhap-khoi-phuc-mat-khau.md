# Nâng cấp đăng nhập và khôi phục mật khẩu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng luồng đăng nhập, yêu cầu email khôi phục và đặt mật khẩu mới rõ ràng, an toàn, responsive; đặt mật khẩu xong phải quay về đăng nhập.

**Architecture:** Giữ Supabase Auth và validator thuần hiện có. `LoginScreen` sở hữu các bước chưa xác thực; tín hiệu `PASSWORD_RECOVERY` được bắt sớm tại ranh giới Supabase rồi đưa qua `useAuth` để `AppShell` render một `PasswordRecoveryScreen` chuyên biệt trước protected shell. Không thêm dependency form hay routing mới.

**Tech Stack:** React 18, TypeScript, Supabase JS 2, CSS token Lotus Pearl, Node test runner, Puppeteer mock Supabase.

## Global Constraints

- Không thêm OAuth, đăng ký tài khoản, route framework hoặc dependency form mới.
- Không tiết lộ email có tài khoản hay không; không log token hoặc mật khẩu.
- Mật khẩu mới tối thiểu 8 ký tự ở cả recovery và đổi mật khẩu trong ứng dụng.
- Sau khi đặt mật khẩu mới, kết thúc phiên recovery và quay về đăng nhập; không tự động vào dashboard.
- Desktop giữ bố cục hai cột; mobile ưu tiên form, không tràn và control chính tối thiểu 44px.
- Chỉ chạy targeted unit/E2E, typecheck, design drift và build theo kỷ luật phạm vi của repo.

---

### Task 1: Chuẩn hóa luật mật khẩu và lỗi recovery

**Files:**
- Modify: `src/lib/passwordForm.ts`
- Modify: `src/components/auth/ChangePwModal.tsx`
- Modify: `tests/unit/password-form.test.mjs`

**Interfaces:**
- Consumes: `ChangePasswordValues`, lỗi thô từ Supabase.
- Produces: `PASSWORD_MIN_LENGTH = 8`, `validateChangePassword(...)`, `recoverySessionErrorMessage(error)` và các thông điệp đồng nhất cho UI đổi/recovery.

- [x] **Step 1: Viết unit test thất bại** — `7d80011`

Thêm các ca literal:

```js
test("mật khẩu mới phải có ít nhất 8 ký tự ở cả đổi và recovery", () => {
  assert.match(String(validateChangePassword(
    { cu: "mat-khau-cu", moi: "abc123", nhacLai: "abc123" }).moi), /8 ký tự/);
  assert.match(String(validateChangePassword(
    { cu: "", moi: "abc123", nhacLai: "abc123" }, { recovery: true }).moi), /8 ký tự/);
});

test("dịch lỗi phiên recovery hết hạn mà không lộ lỗi kỹ thuật", () => {
  assert.match(recoverySessionErrorMessage(new Error("Auth session missing")), /hết hạn|không hợp lệ/i);
  assert.match(recoverySessionErrorMessage(new Error("Failed to fetch")), /Không kết nối được/);
});
```

- [x] **Step 2: Chạy RED** — `7d80011`

Run:

```powershell
node --import tsx --test tests/unit/password-form.test.mjs
```

Expected: FAIL vì validator hiện chấp nhận 6 ký tự và chưa export `recoverySessionErrorMessage`.

- [x] **Step 3: Cài đặt tối thiểu** — `7d80011`

Trong `passwordForm.ts`:

```ts
export const PASSWORD_MIN_LENGTH = 8;

// Trong validateChangePassword:
else if (moi.length < PASSWORD_MIN_LENGTH) {
  errors.moi = `Mật khẩu mới tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`;
}

export function recoverySessionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/network|fetch/i.test(message)) return "Không kết nối được máy chủ. Vui lòng thử lại";
  return "Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ";
}
```

Đổi các nhánh lỗi Supabase `at least 6` thành pattern tổng quát `at least \d+|password.*too short` và copy `8 ký tự`.
Trong `ChangePwModal`, import `PASSWORD_MIN_LENGTH` và thay cả hai mô tả `tối thiểu 6 ký tự` bằng giá trị 8 từ hằng dùng chung để UI không lệch validator.

- [x] **Step 4: Chạy GREEN và commit** — `7d80011`

```powershell
node --import tsx --test tests/unit/password-form.test.mjs
git add -- src/lib/passwordForm.ts src/components/auth/ChangePwModal.tsx tests/unit/password-form.test.mjs
git commit -m "fix(auth): nang chuan mat khau moi"
```

Expected: toàn bộ `password-form` PASS.

---

### Task 2: Bắt recovery trước protected shell và hoàn tất phiên an toàn

**Files:**
- Modify: `src/lib/supabaseClient.ts`
- Modify: `src/hooks/index.ts`
- Modify: `src/App.tsx`
- Create: `src/components/auth/PasswordRecoveryScreen.tsx`
- Create: `tests/unit/password-recovery-screen.test.mjs`

**Interfaces:**
- Produces từ `supabaseClient.ts`:

```ts
export type PasswordRecoverySignal = "ready" | "invalid";
export function subscribePasswordRecovery(
  listener: (signal: PasswordRecoverySignal) => void,
): () => void;
export function clearPasswordRecoverySignal(): void;
export async function kiemTraPhienKhoiPhuc(): Promise<void>;
```

- `useAuth()` bổ sung:

```ts
recoverySignal: PasswordRecoverySignal | null;
clearRecovery: () => void;
```

- `PasswordRecoveryScreen` nhận:

```ts
type Props = {
  signal: PasswordRecoverySignal;
  onCompleted: () => Promise<void>;
  onRequestNewLink: () => Promise<void>;
};
```

- [x] **Step 1: Viết static component test thất bại** — `c786a4e`

Render `PasswordRecoveryScreen` bằng `renderToStaticMarkup` và kiểm:

```js
assert.match(htmlReady, /Đặt mật khẩu mới/);
assert.equal((htmlReady.match(/autoComplete="new-password"/g) || []).length, 2);
assert.match(htmlReady, /Tối thiểu 8 ký tự/);
assert.match(htmlInvalid, /hết hạn|không hợp lệ/i);
assert.match(htmlInvalid, /Yêu cầu liên kết mới/);
```

Test không gọi submit và không đưa secret vào fixture.

- [x] **Step 2: Chạy RED** — `c786a4e`

```powershell
node --import tsx --test tests/unit/password-recovery-screen.test.mjs
```

Expected: FAIL vì component chưa tồn tại.

- [x] **Step 3: Tạo bộ bắt tín hiệu recovery sticky ở ranh giới SDK** — `c786a4e`

Ngay sau khi tạo Supabase client, đăng ký một listener sống theo vòng đời module. Khi nhận `PASSWORD_RECOVERY`, lưu tín hiệu `ready` và báo cho toàn bộ subscriber. Khi URL chứa lỗi recovery (`type=recovery` cùng `error`, `error_code=otp_expired` hoặc `error_description`), khởi tạo tín hiệu `invalid`. `subscribePasswordRecovery` phải phát lại tín hiệu đã lưu bằng `queueMicrotask` cho subscriber đến muộn; `clearPasswordRecoverySignal` xóa nó sau khi rời luồng.

`kiemTraPhienKhoiPhuc()` gọi `supabase.auth.getSession()` và ném `RECOVERY_SESSION_INVALID` nếu không có session/error. Không đọc hoặc trả token về UI.

- [x] **Step 4: Nối tín hiệu vào `useAuth` và `AppShell`** — `c786a4e`, `eceeb8c`

Trong `useAuth`, subscribe/unsubscribe tín hiệu, trả `recoverySignal` và `clearRecovery`. Khi `logout`, luôn clear recovery signal/state.

Thứ tự render bắt buộc:

```tsx
if (recoverySignal) {
  return <PasswordRecoveryScreen signal={recoverySignal} ... />;
}
if (!user) {
  return <LoginScreen onLogin={...} />;
}
```

Ở commit trung gian này, `onCompleted` và `onRequestNewLink` đều gọi `logout()` rồi clear recovery để quay về màn login hiện có. Task 3 bổ sung notice thành công và mở thẳng bước forgot mà không làm Task 2 phụ thuộc vào interface chưa tồn tại.

Xóa listener `PASSWORD_RECOVERY` và state `khoiPhucMk` khỏi `VerifiedAppShell`; `ChangePwModal` chỉ còn phục vụ đổi mật khẩu khi đã vào app.

- [x] **Step 5: Cài đặt `PasswordRecoveryScreen` và chạy GREEN** — `c786a4e`

Component dùng `LuxuryBrandPanel`, hai trường có label/id riêng, `autocomplete="new-password"`, nút hiện/ẩn 44px, mô tả rule 8 ký tự, submit form bằng Enter. Trước `datLaiMatKhauKhoiPhuc`, gọi `kiemTraPhienKhoiPhuc`; map lỗi bằng `recoverySessionErrorMessage`. `signal="invalid"` chỉ render giải thích và nút yêu cầu liên kết mới, không render form.

```powershell
node --import tsx --test tests/unit/password-recovery-screen.test.mjs tests/unit/password-form.test.mjs
npm run typecheck
```

Expected: PASS và typecheck exit `0`.

- [x] **Step 6: Commit ranh giới recovery** — `c786a4e`

```powershell
git add -- src/lib/supabaseClient.ts src/hooks/index.ts src/App.tsx src/components/auth/PasswordRecoveryScreen.tsx tests/unit/password-recovery-screen.test.mjs
git commit -m "feat(auth): dua recovery ra truoc protected shell"
```

---

### Task 3: Nâng cấp UX/UI đăng nhập và quên mật khẩu

**Files:**
- Modify: `src/components/auth/LoginScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `tests/unit/login-screen.test.mjs`
- Modify: `tests/unit/login-screen-sdk-boundary.test.mjs`

**Interfaces:**
- `LoginScreen` nhận thêm:

```ts
type LoginScreenMode = "login" | "forgot";
type Props = {
  onLogin: (profile: AppUser) => void;
  initialMode?: LoginScreenMode;
  notice?: string;
};
```

- Trạng thái nội bộ: `login | forgot | forgot-sent`; `forgot-sent` giữ email đã chuẩn hóa và `resendAt` để đếm ngược 60 giây.

- [x] **Step 1: Viết component test thất bại** — `0e449fc`

Mở rộng test static để kiểm:

```js
assert.match(loginHtml, /vq-login-password-label-row/);
assert.match(loginHtml, /Quên mật khẩu\?/);
assert.match(forgotHtml, /Khôi phục mật khẩu/);
assert.match(forgotHtml, /Gửi liên kết đặt lại/);
assert.match(forgotHtml, /Quay lại đăng nhập/);
assert.doesNotMatch(forgotHtml, /autoComplete="current-password"/);
```

Giữ test SDK boundary: static render `LoginScreen` không nạp `supabaseClient.ts`.

- [x] **Step 2: Chạy RED** — `0e449fc`

```powershell
node --import tsx --test tests/unit/login-screen.test.mjs tests/unit/login-screen-sdk-boundary.test.mjs
```

Expected: FAIL vì chưa có `initialMode="forgot"`, label row và copy mới.

- [x] **Step 3: Tách ba trạng thái trong `LoginScreen`** — `0e449fc`

- `login`: giữ email/password, Caps Lock và show password; chuyển `Quên mật khẩu?` vào `.vq-login-password-label-row` cạnh label.
- `forgot`: một form email; submit qua `guiMailQuenMatKhau`, thông báo lỗi email inline, lỗi mạng/rate limit ở alert, nút phụ quay lại.
- `forgot-sent`: panel status với câu `Nếu email này thuộc hệ thống, liên kết đặt lại đã được gửi`, email người dùng vừa nhập, hướng dẫn Hộp thư đến/Spam; nút gửi lại disabled tới khi bộ đếm về 0.
- Khi đổi bước, đưa focus về heading bằng ref và giữ email đã nhập; không giữ mật khẩu.
- `notice` từ recovery thành công hiển thị `role="status"` trên bước login.

Trong `AppShell`, thêm:

```ts
const [authMode, setAuthMode] = useState<LoginScreenMode>("login");
const [authNotice, setAuthNotice] = useState("");
```

`onCompleted` của recovery đặt notice `Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.`, gọi logout/clear recovery rồi đặt `authMode="login"`. `onRequestNewLink` gọi logout/clear recovery rồi đặt `authMode="forgot"`. Khi chưa có user, truyền `initialMode={authMode}` và `notice={authNotice}` vào `LoginScreen`.

- [x] **Step 4: Tinh chỉnh CSS Lotus Pearl** — `0e449fc`

Thêm class có phạm vi `.vq-login-*` cho label row, back button, sent panel, resend row và recovery requirements. Dùng token hiện có; một CTA plum; control chính tối thiểu 44px; focus-visible rõ. Ở `max-width: 768px`, giảm phần brand và khoảng dọc để form/CTA nằm sớm; ẩn daily wish ngoài bước login. Thêm nhánh `@media (prefers-reduced-motion: reduce)` để bỏ transform/transition của CTA xác thực.

- [x] **Step 5: Chạy GREEN và commit** — `0e449fc`

```powershell
node --import tsx --test tests/unit/login-screen.test.mjs tests/unit/login-screen-sdk-boundary.test.mjs
npm run typecheck
git add -- src/components/auth/LoginScreen.tsx src/App.tsx src/index.css tests/unit/login-screen.test.mjs tests/unit/login-screen-sdk-boundary.test.mjs
git commit -m "feat(auth): nang cap dang nhap va quen mat khau"
```

Expected: PASS, SDK boundary giữ nguyên và typecheck exit `0`.

---

### Task 4: Chứng minh luồng thật, accessibility và responsive

**Files:**
- Create: `tests/e2e/auth-recovery-flow.mjs`
- Modify: `tests/e2e/gia-lap-supabase.mjs` nếu fixture cần ghi nhận request cập nhật mật khẩu.
- Modify: `docs/superpowers/plans/2026-09-02-nang-cap-dang-nhap-khoi-phuc-mat-khau.md`

**Interfaces:**
- Consumes: local app URL qua `VMP_E2E_URL`, `caiGiaLap`, `phienGia`, `NGUOI_DUNG`.
- Produces: một targeted Chrome gate cho login/forgot/recovery; không gọi Supabase production.

- [x] **Step 1: Viết E2E thất bại cho forgot flow** — `eceeb8c`

Không nhét phiên, mở app ở 1440×900 rồi kiểm:

1. `Quên mật khẩu?` nằm cùng hàng nhãn mật khẩu.
2. Click mở form chỉ-email; Enter gửi đúng một request `/auth/v1/recover`.
3. Panel thành công dùng thông báo không liệt kê tài khoản và nút gửi lại bị khóa/có đếm ngược.
4. Quay lại giữ email nhưng không có mật khẩu.

Ở 390×844 kiểm không tràn ngang, input/CTA cao ít nhất 44px và CTA chính nằm trong chiều cao trang hợp lý.

- [x] **Step 2: Viết E2E thất bại cho recovery flow** — `eceeb8c`

Dựng recovery URL giả có JWT payload của `NGUOI_DUNG`, `expires_at`, `refresh_token`, `token_type=bearer`, `type=recovery`; mọi request bị `caiGiaLap` chặn. Kiểm:

1. Mở link hợp lệ render `Đặt mật khẩu mới`, không render dashboard.
2. Mật khẩu 7 ký tự bị chặn; hai ô lệch bị chặn.
3. Cặp hợp lệ gửi `PUT /auth/v1/user`, sau đó gọi logout và quay về login với thông báo thành công.
4. URL lỗi `type=recovery&error=access_denied&error_code=otp_expired` render trạng thái hết hạn và nút yêu cầu link mới dẫn tới form forgot.

- [x] **Step 3: Chạy RED, hoàn thiện fixture tối thiểu rồi chạy GREEN** — `eceeb8c`, `2d80ea3`

```powershell
$env:VMP_E2E_URL='http://127.0.0.1:4175/'; node tests/e2e/auth-recovery-flow.mjs
```

Expected RED: thiếu các trạng thái/UI mới. Nếu fixture cần ghi nhận request, chỉ thêm bộ đếm/last body cho `/auth/v1/recover`, `PUT /auth/v1/user`, `/auth/v1/logout`; không thay dữ liệu nghiệp vụ. Expected GREEN: tất cả assertion đạt.

- [ ] **Step 4: Chạy gate phát hành hẹp**

```powershell
node --import tsx --test tests/unit/login-form.test.mjs tests/unit/login-screen.test.mjs tests/unit/login-screen-sdk-boundary.test.mjs tests/unit/password-form.test.mjs tests/unit/password-recovery-screen.test.mjs
$env:VMP_E2E_URL='http://127.0.0.1:4175/'; node tests/e2e/dang-nhap.mjs
$env:VMP_E2E_URL='http://127.0.0.1:4175/'; node tests/e2e/auth-recovery-flow.mjs
npm run typecheck
npm run drift
$env:VITE_MANUAL_PLANNED_DEADLINES_ENABLED='true'; npm run build
git diff --check
```

Expected: tất cả exit `0`; build chỉ còn cảnh báo font/env/dynamic-import đã biết.

- [x] **Step 5: Kiểm tra trực quan và accessibility** — `d39a039`, `2d80ea3`

Chụp bằng Chrome giả lập ở 1440×900 và 390×844 cho `login`, `forgot`, `forgot-sent`, `recovery-ready`, `recovery-invalid`. Xác nhận một CTA chính, trục chữ thẳng, focus ring rõ, không cắt nội dung. Chạy kiểm tra bàn phím Tab/Shift+Tab/Enter và axe WCAG 2.2 AA trên hai kích thước; ghi chính xác vi phạm nếu còn. Xóa ảnh tạm sau khi xem.

- [x] **Step 6: Cập nhật bằng chứng và commit** — `eceeb8c`, `d39a039`, `2d80ea3`

Đánh dấu checkbox, ghi số test đạt/hỏng, cảnh báo build còn lại và kết quả accessibility vào cuối plan, rồi:

```powershell
git add -- tests/e2e/auth-recovery-flow.mjs tests/e2e/gia-lap-supabase.mjs docs/superpowers/plans/2026-09-02-nang-cap-dang-nhap-khoi-phuc-mat-khau.md
git commit -m "test(auth): bao ve luong khoi phuc mat khau"
```
