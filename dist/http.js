async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
// Native fetch(), no proxy needed - verified live 2026-09-04: comprasbys.tucuman.gob.ar
// is reachable with a plain 200 OK from a plain datacenter IP, unlike pba-tenders-monitor's
// and cordoba-compras-monitor's targets.
export async function fetchWithRetry(url, maxRetries = 4, baseDelayMs = 1000) {
    let lastError = new Error('unreachable');
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { redirect: 'follow' });
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            return response;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await sleep(baseDelayMs * 2 ** attempt);
            }
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
export async function fetchHtmlWithRetry(url, maxRetries = 4, baseDelayMs = 1000) {
    const response = await fetchWithRetry(url, maxRetries, baseDelayMs);
    const buffer = await response.arrayBuffer();
    return new TextDecoder('iso-8859-1').decode(buffer);
}
//# sourceMappingURL=http.js.map