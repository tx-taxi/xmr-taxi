import { Application, Request, Response } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { MoneroApi } from './monero-api';

const ORIGIN = 'https://xmr.tx.taxi';
const HEX64 = /^[0-9a-f]{64}$/i;
const HEIGHT = /^(0|[1-9]\d{0,9})$/;
const HTML_PATH = process.env.XMR_INDEX_HTML_PATH ?? '/usr/share/nginx/html/browser/en-US/index.html';
const CARD_LOGO = process.env.XMR_CARD_LOGO_PATH ?? path.join(__dirname, '../../../assets/xmr-card-logo.svg');

type Kind = 'tx' | 'block';
type Entity = { kind: Kind; id: string; title: string; description: string; detail: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

function replaceMeta(html: string, attribute: 'name' | 'property', key: string, value: string): string {
  const tag = new RegExp(`<meta\\s+${attribute}="${key}"[^>]*>`, 'i');
  return html.replace(tag, `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`);
}

export class XmrEntityMetaRoutes {
  constructor(private readonly api: MoneroApi) {}

  public initRoutes(app: Application): void {
    app.get('/tx/:id', this.page('tx'));
    app.get('/block/:id', this.page('block'));
    app.get('/og/xmr/:kind/:id.png', this.card.bind(this));
  }

  private validId(kind: Kind, id: string): boolean {
    return kind === 'tx' ? HEX64.test(id) : HEX64.test(id) || HEIGHT.test(id);
  }

  private async entity(kind: Kind, id: string): Promise<Entity> {
    const shortId = HEX64.test(id) ? `${id.slice(0, 12)}...${id.slice(-8)}` : id;
    const fallback: Entity = kind === 'tx'
      ? { kind, id, title: `Monero transaction ${shortId}`, description: `Look up public metadata for Monero transaction ${id} on xmr.tx.taxi. Amounts and recipients are private.`, detail: 'Public transaction metadata' }
      : { kind, id, title: `Monero block ${shortId}`, description: `Look up public metadata for Monero block ${id} on xmr.tx.taxi.`, detail: 'Public block metadata' };

    try {
      const result = await Promise.race([
        kind === 'tx'
          ? this.api.getTransactionByHash(id)
          : HEX64.test(id) ? this.api.getBlockByHash(id) : this.api.getBlockByHeight(Number(id)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (!result) return fallback;
      if (kind === 'tx' && 'tx_hash' in result) {
        const location = result.in_pool ? 'Pending' : result.block_height !== undefined ? `Block ${result.block_height.toLocaleString('en-US')}` : 'Confirmed';
        return {
          ...fallback,
          description: `Monero transaction ${id}. ${location}. Public transaction metadata on xmr.tx.taxi; amounts and recipients are private.`,
          detail: location,
        };
      }
      if (kind === 'block' && 'block_header' in result) {
        const header = result.block_header;
        return {
          kind, id,
          title: `Monero block ${header.height.toLocaleString('en-US')}`,
          description: `Monero block ${header.height.toLocaleString('en-US')} (${header.hash}). ${header.num_txes} non-miner transactions. Explore public block metadata on xmr.tx.taxi.`,
          detail: `${header.num_txes} non-miner transactions`,
        };
      }
    } catch (_) {
      // A provider outage must not turn an entity share into a 502.
    }
    return fallback;
  }

  private page(kind: Kind) {
    return async (req: Request, res: Response): Promise<void> => {
      const id = req.params.id.toLowerCase();
      if (!this.validId(kind, id)) {
        res.status(404).send('Not found');
        return;
      }
      try {
        const [template, entity] = await Promise.all([readFile(HTML_PATH, 'utf8'), this.entity(kind, id)]);
        const url = `${ORIGIN}/${kind}/${id}`;
        const image = `${ORIGIN}/og/xmr/${kind}/${id}.png?v=20260925-brand`;
        let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(entity.title)} | xmr.tx.taxi</title>`);
        html = html.replace(/<link id="canonical"[^>]*>/i, `<link id="canonical" rel="canonical" href="${url}">`);
        for (const [attribute, key, value] of [
          ['name', 'description', entity.description],
          ['property', 'og:type', 'article'],
          ['property', 'og:title', entity.title],
          ['property', 'og:description', entity.description],
          ['property', 'og:url', url],
          ['property', 'og:image', image],
          ['property', 'og:image:alt', entity.title],
          ['name', 'twitter:title', entity.title],
          ['name', 'twitter:description', entity.description],
          ['name', 'twitter:image', image],
          ['name', 'twitter:image:alt', entity.title],
        ] as Array<['name' | 'property', string, string]>) {
          html = replaceMeta(html, attribute, key, value);
        }
        res.setHeader('Cache-Control', 'public, max-age=30, stale-if-error=300');
        res.type('html').send(html);
      } catch (err) {
        res.status(503).send('Explorer page temporarily unavailable');
      }
    };
  }

  private async card(req: Request, res: Response): Promise<void> {
    const kind = req.params.kind as Kind;
    const id = req.params.id.toLowerCase();
    if ((kind !== 'tx' && kind !== 'block') || !this.validId(kind, id)) {
      res.status(404).send('Not found');
      return;
    }
    try {
      const entity = await this.entity(kind, id);
      const label = kind === 'tx' ? 'TRANSACTION' : 'BLOCK';
      const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="630" fill="#111111"/><rect width="1200" height="8" fill="#ff6600"/>
        <path d="M55 170H1145 M55 510H1145" stroke="#383838"/>
        <text x="55" y="248" fill="#ff6600" font-size="26" font-family="DejaVu Sans, sans-serif" font-weight="bold">MONERO ${label}</text>
        <text x="55" y="317" fill="#fff" font-size="43" font-family="DejaVu Sans, sans-serif" font-weight="bold">${escapeHtml(entity.title)}</text>
        <text x="55" y="372" fill="#c7c7c7" font-size="25" font-family="DejaVu Sans, sans-serif">${escapeHtml(entity.detail)}</text>
        <text x="55" y="557" fill="#aeaeae" font-size="22" font-family="DejaVu Sans Mono, monospace">${escapeHtml(id)}</text>
      </svg>`;
      const logo = await sharp(CARD_LOGO).resize({ width: 350 }).png().toBuffer();
      const png = await sharp(Buffer.from(svg))
        .composite([{ input: logo, left: 55, top: 54 }]).png().toBuffer();
      res.setHeader('Cache-Control', 'public, max-age=300, stale-if-error=3600');
      res.type('png').send(png);
    } catch (_) {
      res.status(503).send('Card temporarily unavailable');
    }
  }
}
