function fail(exitCode) {
  process.exit(exitCode);
}

function parseProduction(value) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:") fail(2);

  return {
    database: decodeURIComponent(url.pathname).replace(/^\/+/, "").split("/")[0].toLowerCase(),
    host: url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, ""),
  };
}

function parseLocal(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const isLoopback = new Set(["127.0.0.1", "localhost", "::1"]).has(host);

  if (
    url.protocol !== "postgresql:" ||
    url.search !== "" ||
    url.hash !== "" ||
    !isLoopback ||
    url.port !== "54322" ||
    url.pathname !== "/postgres"
  ) {
    fail(3);
  }

  return {
    database: "postgres",
    host,
    password: decodeURIComponent(url.password),
    port: url.port,
    user: decodeURIComponent(url.username),
  };
}

try {
  const production = parseProduction(process.env.SUPABASE_DB_URL);
  const local = parseLocal(process.env.VMP_TEST_DB_URL);

  if (production.host === local.host && production.database === local.database) fail(3);

  process.stdout.write([
    "LOCAL_PGHOST", local.host,
    "LOCAL_PGPORT", local.port,
    "LOCAL_PGUSER", local.user,
    "LOCAL_PGPASSWORD", local.password,
    "LOCAL_PGDATABASE", local.database,
  ].join("\0") + "\0");
} catch {
  fail(2);
}
