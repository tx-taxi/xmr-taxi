/** Only these tx.taxi native origins can ever receive a locale prefix. */
const nativeHosts = new Set(['tx.taxi', 'btc.tx.taxi', 'eth.tx.taxi', 'xmr.tx.taxi', 'ltc.tx.taxi', 'bch.tx.taxi', 'dash.tx.taxi', 'doge.tx.taxi', 'ton.tx.taxi', 'masterchain.ton.tx.taxi', 'lightning.btc.tx.taxi']);
const knownLocales = ['ar', 'ca', 'cs', 'da', 'de', 'es', 'fa', 'fr', 'ko', 'hr', 'hi', 'ne', 'it', 'he', 'ka', 'lt', 'hu', 'mk', 'nl', 'ja', 'nb', 'pl', 'pt', 'ro', 'ru', 'sl', 'fi', 'sv', 'th', 'tr', 'uk', 'vi', 'zh'];
// These XMR locales are already available. Keep them usable when the hub is offline.
const fallback: Readonly<Record<string, readonly string[]>> = { 'xmr.tx.taxi': knownLocales };
let localizedHosts: Readonly<Record<string, readonly string[]>> = fallback;
let lastFetch = 0;
let pending: Promise<void> | undefined;

/** Fetch shared capabilities once per minute, without sending preferences or credentials. */
export function refreshLocalizedCapabilities(routerUrl: string): Promise<void> {
  if (pending) return pending;
  if (Date.now() - lastFetch < 60000) return Promise.resolve();
  try {
    const router = new URL(routerUrl);
    // The production authority is fixed. Loopback is only accepted from loopback preview pages.
    const local = typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(router.hostname);
    if (router.origin !== 'https://tx.taxi' && !(local && loopback && router.protocol === 'http:')) return Promise.resolve();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    pending = fetch(new URL('/api/v1/locale-capabilities', router), { credentials: 'omit', redirect: 'error', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Locale capabilities unavailable');
        const text = await response.text();
        if (text.length > 65536) throw new Error('Invalid locale capabilities');
        const body: unknown = JSON.parse(text);
        if (!body || typeof body !== 'object' || (body as any).version !== 1 || !(body as any).hosts || typeof (body as any).hosts !== 'object' || Array.isArray((body as any).hosts)) throw new Error('Invalid locale capabilities');
        const accepted: Record<string, string[]> = {};
        for (const [host, locales] of Object.entries((body as any).hosts)) {
          if (!nativeHosts.has(host) || !Array.isArray(locales)) continue;
          accepted[host] = locales.filter((locale): locale is string => typeof locale === 'string' && knownLocales.includes(locale));
        }
        localizedHosts = accepted;
      })
      .catch(() => { localizedHosts = fallback; })
      .finally(() => { clearTimeout(timer); lastFetch = Date.now(); pending = undefined; });
    return pending;
  } catch {
    return Promise.resolve();
  }
}

/** Preserve explicit locale paths and never rewrite third-party or unknown URLs. */
export function localizedNativeUrl(value: string, language: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !nativeHosts.has(url.hostname) || !localizedHosts[url.hostname]?.includes(language)) return value;
    if (/^\/(?:ar|ca|cs|da|de|en(?:-US)?|es|fa|fi|fr|he|hi|hr|hu|it|ja|ka|ko|lt|mk|nb|ne|nl|pl|pt(?:-BR)?|ro|ru|sl|sr|sv|th|tr|uk|vi|zh)(?:\/|$)/i.test(url.pathname)) return value;
    url.pathname = `/${language}${url.pathname === '/' ? '/' : url.pathname}`;
    return url.href;
  } catch { return value; }
}
