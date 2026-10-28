// Shared by the tx.taxi hosts. Host-only cookies are used for local previews.
export const supportedFiatCurrencies = ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'USD'];

export function readSharedPreference(name: 'txtaxi_language' | 'txtaxi_currency'): string | null {
  try {
    const entry = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
    return entry ? decodeURIComponent(entry.substring(name.length + 1)) : null;
  } catch {
    return null;
  }
}

export function writeSharedPreference(name: 'txtaxi_language' | 'txtaxi_currency', value: string): void {
  try {
    const secure = location.protocol === 'https:';
    const taxiHost = location.hostname === 'tx.taxi' || location.hostname.endsWith('.tx.taxi');
    const domain = secure && taxiHost ? '; Domain=.tx.taxi' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}${domain}`;
  } catch { /* Browsing remains available when cookies are disabled. */ }
}
