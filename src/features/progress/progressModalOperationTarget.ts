import { progressValidationCode } from "./editableProgressRights.ts";

export interface ProgressModalOperationTarget {
  validationCode: string;
  run<TArgs extends unknown[], TResult>(
    operation: (validationCode: string, ...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult;
}

/**
 * Authority and mutation boundary for one Progress modal.
 * `Activity.id` is a legacy UI key and must never reach item-scoped RPCs.
 */
export function createProgressModalOperationTarget(activity: {
  id: string;
  validationCode?: unknown;
  code?: unknown;
}): ProgressModalOperationTarget {
  const validationCode = progressValidationCode(activity);
  return {
    validationCode,
    run<TArgs extends unknown[], TResult>(
      operation: (targetCode: string, ...args: TArgs) => TResult,
      ...args: TArgs
    ): TResult {
      return operation(validationCode, ...args);
    },
  };
}
