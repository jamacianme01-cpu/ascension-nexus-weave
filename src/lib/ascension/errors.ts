export type AscensionErrorCode =
  | "LIVE_GATEWAY_NOT_CONFIGURED"
  | "LIVE_STATE_UNAVAILABLE"
  | "MALFORMED_SOURCE"
  | "INTEGRITY_FAILURE";

export class AscensionSourceError extends Error {
  readonly code: AscensionErrorCode;
  readonly detail?: string | undefined;
  constructor(code: AscensionErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "AscensionSourceError";
    this.code = code;
    this.detail = detail;
  }
}

export function asAscensionError(error: unknown): AscensionSourceError | undefined {
  return error instanceof AscensionSourceError ? error : undefined;
}
