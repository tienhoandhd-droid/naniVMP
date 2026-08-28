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
