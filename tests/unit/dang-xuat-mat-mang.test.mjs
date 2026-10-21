import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import { authStorageKey, dangXuatChac } from "../../src/lib/dangXuat.ts";

/* Máy dùng chung: bấm "Thoát" lúc mất mạng thì supabase-js 2.108 trả lỗi
   AuthRetryableFetchError và GIỮ NGUYÊN vé trong localStorage — kể cả khi
   gọi signOut({ scope: "local" }), vì scope local vẫn gọi /logout trước khi
   xoá. Tải lại trang là vào lại được tài khoản của người trước. */

const URL_SB = "https://gialap.supabase.co";

function phienGia() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: "HS256" })}.${b64({ sub: "u1", role: "authenticated", exp, aal: "aal1" })}.sig`,
    refresh_token: "rt", expires_at: exp, expires_in: 3600, token_type: "bearer",
    user: { id: "u1", aud: "authenticated", email: "a@vi-du.test" },
  };
}

function dungClient(fetchGia) {
  const kho = new Map();
  const storage = {
    getItem: (k) => kho.get(k) ?? null,
    setItem: (k, v) => { kho.set(k, v); },
    removeItem: (k) => { kho.delete(k); },
  };
  const sb = createClient(URL_SB, "anon", {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: authStorageKey(URL_SB) },
    global: { fetch: fetchGia },
  });
  kho.set(authStorageKey(URL_SB), JSON.stringify(phienGia()));
  return { sb, kho, storage };
}

test("authStorageKey trùng khoá mặc định của supabase-js (không đá người dùng đang đăng nhập)", () => {
  const macDinh = createClient(URL_SB, "anon", { auth: { persistSession: false } });
  assert.equal(authStorageKey(URL_SB), macDinh.auth.storageKey);
});

test("mất mạng khi đăng xuất: vẫn xoá phiên cục bộ và báo chưa thu hồi được trên máy chủ", async () => {
  const goi = [];
  const { sb, kho, storage } = dungClient(async (url) => {
    goi.push(String(url));
    throw new TypeError("Failed to fetch");
  });
  const suKien = [];
  sb.auth.onAuthStateChange((sk) => { suKien.push(sk); });
  const loiGoc = console.error;
  const loiGhi = [];
  console.error = (...a) => { loiGhi.push(a); };
  let kq;
  try {
    kq = await dangXuatChac(sb.auth, storage, authStorageKey(URL_SB));
  } finally {
    console.error = loiGoc;
  }

  assert.equal(kq.thuHoiMayChu, false);
  assert.ok(kq.loi, "phải trả lỗi gốc để giao diện báo cho người dùng");
  assert.ok(loiGhi.length >= 1, "lỗi không được nuốt im lặng");
  assert.ok(goi.some((u) => u.includes("/auth/v1/logout")), "vẫn thử thu hồi trên máy chủ trước");
  assert.equal(kho.has(authStorageKey(URL_SB)), false, "vé phải bị xoá khỏi máy");
  const { data } = await sb.auth.getSession();
  assert.equal(data.session, null, "tải lại trang không còn đăng nhập");
  assert.ok(suKien.includes("SIGNED_OUT"), "các nơi đang nghe SIGNED_OUT phải nhận được");
});

test("mạng tốt: thu hồi trên máy chủ (scope global như trước) và xoá phiên", async () => {
  const goi = [];
  const { sb, kho, storage } = dungClient(async (url) => {
    goi.push(String(url));
    return new Response(null, { status: 204 });
  });
  const kq = await dangXuatChac(sb.auth, storage, authStorageKey(URL_SB));
  assert.deepEqual(kq, { thuHoiMayChu: true });
  assert.ok(goi.some((u) => u.includes("/auth/v1/logout?scope=global")));
  assert.equal(kho.has(authStorageKey(URL_SB)), false);
});
