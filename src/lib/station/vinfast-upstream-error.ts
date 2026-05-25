import { VinfastApiError } from './vinfast-api-client';

const TRANSIENT_HTTP_STATUSES = new Set([408, 429]);

export interface VinfastCronSkipResult {
  readonly ok: true;
  readonly skipped: true;
  readonly job: string;
  readonly reason: 'vinfast_upstream_unavailable';
  readonly error: string;
}

export type VinfastCronErrorOutcome =
  | {
      readonly action: 'skip';
      readonly warning: string;
      readonly result: VinfastCronSkipResult;
    }
  | { readonly action: 'fail' };

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isTransientVinfastUpstreamError(err: unknown): boolean {
  if (!(err instanceof VinfastApiError)) {
    return false;
  }

  if (err.kind === 'timeout' || err.kind === 'network_error') {
    return true;
  }

  if (err.kind !== 'http_error' || err.statusCode === undefined) {
    return false;
  }

  return err.statusCode >= 500 || TRANSIENT_HTTP_STATUSES.has(err.statusCode);
}

export function normalizeVinfastBrowserError(err: unknown): unknown {
  if (err instanceof VinfastApiError) {
    return err;
  }

  const message = getErrorMessage(err);
  if (/\btimeout\b|timed out|Timeout \d+ms exceeded/i.test(message)) {
    return new VinfastApiError('timeout', message);
  }

  if (
    /Failed to fetch|net::|ERR_|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up/i.test(
      message,
    )
  ) {
    return new VinfastApiError('network_error', message);
  }

  return err;
}

export function classifyVinfastCronError(
  job: string,
  err: unknown,
): VinfastCronErrorOutcome {
  if (!isTransientVinfastUpstreamError(err)) {
    return { action: 'fail' };
  }

  const result: VinfastCronSkipResult = {
    ok: true,
    skipped: true,
    job,
    reason: 'vinfast_upstream_unavailable',
    error: getErrorMessage(err),
  };

  return {
    action: 'skip',
    warning: `::warning title=VinFast upstream unavailable::${escapeGithubCommandValue(
      `${job} skipped: ${result.error}`,
    )}`,
    result,
  };
}

function escapeGithubCommandValue(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
