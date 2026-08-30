import {
  HTTP_429_MAX_RETRIES,
  HTTP_429_RETRY_AFTER_CAP_MS,
  REQUEST_TIMEOUT_MS,
} from "../constants.js";
import type { FetchLike } from "../types.js";

export type FetchRetryOptions = {
  fetchImpl: FetchLike;
  label: string;
  init?: RequestInit;
  retry403?: boolean;
};

export async function fetchWith429Retries(
  input: string,
  options: FetchRetryOptions,
): Promise<Response> {
  const { fetchImpl, label, init, retry403 = false } = options;
  let retry403Count = 0;
  let attempt429 = 0;

  for (;;) {
    let response: Response;
    try {
      response = await fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`${label} request failed: ${(err as Error).message}`);
    }

    if (retry403 && response.status === 403 && retry403Count === 0) {
      retry403Count += 1;
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    if (response.status !== 429) {
      return response;
    }

    if (attempt429 >= HTTP_429_MAX_RETRIES) {
      return response;
    }

    const retryAfter = response.headers.get("retry-after");
    let waitMs = 1000 * 2 ** attempt429;
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs >= 0) {
        waitMs = Math.min(secs * 1000, HTTP_429_RETRY_AFTER_CAP_MS);
      }
    }
    await new Promise((r) => setTimeout(r, waitMs));
    attempt429 += 1;
  }
}
