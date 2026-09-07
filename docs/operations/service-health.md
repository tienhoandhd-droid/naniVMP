# Service health check

GitHub Actions runs `.github/workflows/service-health.yml` at minutes 7, 22, 37, and 52 of each hour, and it can be run manually with **workflow_dispatch**. It performs only three GET requests:

1. the public site at `https://tienhoandhd-droid.github.io/naniVMP/`;
2. the real JavaScript module referenced by that page; and
3. `${VITE_SUPABASE_URL}/auth/v1/health`, authenticated with `VITE_SUPABASE_ANON`.

Every request, including reading the page HTML, has an 8-second timeout. The checker reads at most 512 KiB of page HTML and cancels unused module/Auth response bodies. `VITE_SUPABASE_URL` must be one root `https://<project>.supabase.co/` URL: alternate hosts, ports, paths, query strings, and fragments fail before any request is made. The log contains only check labels and HTTP status codes; it never writes request bodies or the anonymous key. A non-2xx response, missing module asset, invalid endpoint URL, missing configuration, oversized HTML, or timeout fails the Actions run.

Configure `VITE_SUPABASE_URL` as a repository variable. Configure `VITE_SUPABASE_ANON` as a repository secret (the workflow also accepts the existing repository variable during migration). No external alert recipient, webhook, POST request, or business-data logging is configured. GitHub Actions’ failed workflow status is the only signal.

GitHub schedules are best effort: queued or delayed runs can occur during platform load, and no run occurs while GitHub Actions or the repository is unavailable. The schedule therefore does not provide a guaranteed fifteen-minute outage-detection interval.

The key-bearing health request must match the public `EXPECTED_SUPABASE_HOST` deployment identity in the checker. A project move requires an explicit reviewed change to that constant.
