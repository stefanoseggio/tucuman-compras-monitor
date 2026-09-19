import { Impit, type ImpitResponse } from 'impit';

// One Impit instance per actor run: it holds the connection pool and TLS
// session cache, and gives every request a real, internally-consistent
// Chrome TLS/HTTP2 fingerprint instead of Node's native (and distinctively
// bot-shaped) one - see AGENTS.md for why this was added.
const impit = new Impit({ browser: 'chrome' });

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

// A per-attempt timeout bounds a single hung request; without it, nothing but the
// actor's outer 3600s platform timeout stands between one stalled TCP connection
// and the whole run stalling. 45s mirrors the proven value in santafe-compras-monitor's
// http.ts (a 2000-row listing answers in ~3s there; this portal's pages are smaller).
const DEFAULT_TIMEOUT_MS = 45_000;

function isRetriableStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Internal only - carries the status so the retry loop can discriminate 4xx from 5xx. */
class HttpStatusError extends Error {
    constructor(public readonly status: number) {
        super(`HTTP ${status}`);
        this.name = 'HttpStatusError';
    }
}

// No proxy needed - verified live 2026-09-04: comprasbys.tucuman.gob.ar is reachable
// with a plain 200 OK from a plain datacenter IP, unlike pba-tenders-monitor's and
// cordoba-compras-monitor's targets.
//
// Retries with exponential backoff on network errors, per-attempt timeouts, and
// 408/425/429/5xx only. A permanent 4xx (e.g. a bad query param, a removed page) is
// deterministic and will never succeed on retry, so it throws immediately instead of
// burning the retry budget.
export async function fetchWithRetry(
    url: string,
    maxRetries = 4,
    baseDelayMs = 1000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ImpitResponse> {
    let lastError: Error = new Error('unreachable');
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await impit.fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
            if (response.ok) return response;
            if (!isRetriableStatus(response.status)) throw new HttpStatusError(response.status);
            lastError = new HttpStatusError(response.status);
        } catch (error) {
            if (error instanceof HttpStatusError && !isRetriableStatus(error.status)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
        }
        if (attempt < maxRetries) {
            await sleep(baseDelayMs * 2 ** attempt);
        }
    }
    throw lastError;
}

// The portal serves `Content-Type: text/html;charset=ISO-8859-1` (verified live via
// response headers, not assumed) - Node's fetch() Response.text() always decodes as
// UTF-8 regardless of the server's declared charset, which would corrupt any raw
// (non HTML-entity) accented byte in the page. Reading the raw bytes and decoding them
// explicitly with the real charset is the only correct way to handle this. See
// AGENTS.md for what fraction of the actual field data this turned out to affect.
export async function fetchHtmlWithRetry(
    url: string,
    maxRetries = 4,
    baseDelayMs = 1000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
    const response = await fetchWithRetry(url, maxRetries, baseDelayMs, timeoutMs);
    const buffer = await response.arrayBuffer();
    return new TextDecoder('iso-8859-1').decode(buffer);
}
