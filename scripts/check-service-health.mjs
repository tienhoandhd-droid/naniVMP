import { pathToFileURL } from "node:url";

export const SITE_URL = "https://tienhoandhd-droid.github.io/naniVMP/";
// Public deployment identity, not a credential. Review this when moving the project.
export const EXPECTED_SUPABASE_HOST = "ivembmikfhtyzhtqebgh.supabase.co";
export const REQUEST_TIMEOUT_MS = 8_000;
export const MAX_HTML_BYTES = 512 * 1024;

function httpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an HTTPS URL`);
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error(`${label} must be an HTTPS URL`);
  }
  return url;
}

function supabaseProjectUrl(value) {
  const url = httpsUrl(value, "VITE_SUPABASE_URL");
  if (!/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
    || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VITE_SUPABASE_URL must be a root Supabase project URL");
  }
  if (url.hostname !== EXPECTED_SUPABASE_HOST) throw new Error("VITE_SUPABASE_URL does not match this deployment");
  return url;
}

function requiredEnvironment(name, environment) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function moduleAssetUrl(pageHtml, pageUrl) {
  for (const match of pageHtml.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1];
    const type = attributes.match(/\btype\s*=\s*(["'])module\1/i);
    const source = attributes.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i)?.[2];
    if (!type || !source) continue;
    const assetUrl = new URL(source, pageUrl);
    if (!assetUrl.pathname.endsWith(".js")) {
      throw new Error("module asset is not JavaScript");
    }
    return httpsUrl(assetUrl.href, "module asset");
  }
  throw new Error("deployed page has no module JavaScript asset");
}

async function readBoundedHtml(response, maximumBytes) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`site HTML exceeds ${maximumBytes} bytes`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw new Error(`site HTML exceeds ${maximumBytes} bytes`);
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const html = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    html.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(html);
}

function discardResponseBody(response) {
  void response.body?.cancel().catch(() => {});
}

async function get(url, { fetchImpl, headers, timeoutMs, label, consume }) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(url, { method: "GET", headers, redirect: "error", signal: controller.signal }),
      timeout,
    ]);
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    return await Promise.race([consume(response), timeout]);
  } catch (error) {
    if (error?.message?.startsWith(`${label} `)) throw error;
    throw new Error(`${label} request failed`);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServiceHealth({
  websiteUrl = SITE_URL,
  supabaseUrl,
  anonKey,
  fetchImpl = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new Error("timeoutMs must be a positive integer up to 30000");
  }
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function");

  const site = httpsUrl(websiteUrl, "websiteUrl");
  const supabase = supabaseProjectUrl(supabaseUrl);
  if (!anonKey?.trim()) throw new Error("VITE_SUPABASE_ANON is required");

  const siteResponse = await get(site, {
    fetchImpl,
    timeoutMs,
    label: "site",
    consume: async (response) => ({ status: response.status, html: await readBoundedHtml(response, MAX_HTML_BYTES) }),
  });
  const module = moduleAssetUrl(siteResponse.html, site);
  const moduleResponse = await get(module, {
    fetchImpl,
    timeoutMs,
    label: "module",
    consume: async (response) => {
      discardResponseBody(response);
      return response.status;
    },
  });
  const authHealth = new URL("auth/v1/health", supabase);
  const authResponse = await get(authHealth, {
    fetchImpl,
    headers: { apikey: anonKey },
    timeoutMs,
    label: "supabase-auth",
    consume: async (response) => {
      discardResponseBody(response);
      return response.status;
    },
  });

  return {
    checks: [
      { name: "site", status: siteResponse.status },
      { name: "module", status: moduleResponse },
      { name: "supabase-auth", status: authResponse },
    ],
  };
}

function isDirectInvocation() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectInvocation()) {
  try {
    const result = await checkServiceHealth({
      supabaseUrl: requiredEnvironment("VITE_SUPABASE_URL", process.env),
      anonKey: requiredEnvironment("VITE_SUPABASE_ANON", process.env),
    });
    for (const check of result.checks) console.log(`${check.name}: HTTP ${check.status}`);
  } catch (error) {
    console.error(`[service-health] ${error.message}`);
    process.exitCode = 1;
  }
}
