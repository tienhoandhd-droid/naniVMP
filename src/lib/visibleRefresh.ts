export interface VisibleRefreshOptions {
  isVisible: () => boolean;
  refresh: () => void | Promise<unknown>;
  now?: () => number;
  coalesceMs?: number;
}

export interface VisibleRefreshController {
  request: () => void;
}

/** Gộp các tín hiệu hiển thị trang thành một silent refresh đang được kiểm soát. */
export function createVisibleRefreshController({
  isVisible,
  refresh,
  now = Date.now,
  coalesceMs = 1000,
}: VisibleRefreshOptions): VisibleRefreshController {
  let inFlight = false;
  let completedAt: number | undefined;

  const finish = () => {
    inFlight = false;
    completedAt = now();
  };

  const request = () => {
    if (!isVisible() || inFlight) return;
    if (completedAt !== undefined && now() - completedAt < coalesceMs) return;

    inFlight = true;
    try {
      Promise.resolve(refresh()).then(finish, finish);
    } catch {
      finish();
    }
  };

  return { request };
}

export interface VisiblePollingOptions extends VisibleRefreshOptions {
  intervalMs: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (id: unknown) => void;
}

/** Hỏi lại định kỳ nhưng bỏ qua mọi nhịp lúc tab đang ẩn. Làm mới ngay khi
 *  tab hiện lại là việc của listener visibilitychange nơi dùng (xem
 *  AuthenticatedApp) — ở đây chỉ lo không gọi máy chủ khi không ai nhìn.
 *  Trả về hàm dừng vòng kiểm. */
export function startVisiblePolling({
  intervalMs,
  schedule = (fn, ms) => setInterval(fn, ms),
  cancel = (id) => clearInterval(id as ReturnType<typeof setInterval>),
  ...refreshOptions
}: VisiblePollingOptions): () => void {
  const controller = createVisibleRefreshController(refreshOptions);
  const id = schedule(controller.request, intervalMs);
  return () => cancel(id);
}
