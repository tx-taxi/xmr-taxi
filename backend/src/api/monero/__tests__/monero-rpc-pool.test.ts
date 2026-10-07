import { AddressInfo } from 'net';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { MoneroRpcPool } from '../monero-rpc';

type RpcBody = { method?: string; params?: Record<string, unknown> };
type RpcReply = { status?: number; body: unknown };
type RpcHandler = (path: string, body: RpcBody) => RpcReply | Promise<RpcReply>;

async function makeRpcServer(handler: RpcHandler): Promise<{
  url: string;
  calls: RpcBody[];
  close: () => Promise<void>;
}> {
  const calls: RpcBody[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
    });
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) as RpcBody : {};
      calls.push(body);
      const result = await handler(req.url ?? '/', body);
      res.statusCode = result.status ?? 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
}

describe('MoneroRpcPool', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('uses fallback while the primary daemon is still syncing', async () => {
    const primary = await makeRpcServer((_path, body) => {
      if (body.method === 'get_info') {
        return {
          body: {
            result: {
              status: 'OK',
              height: 100,
              target_height: 1_000,
              synchronized: false,
              top_block_hash: '00',
            },
          },
        };
      }
      return { status: 500, body: { error: 'primary should not serve data while syncing' } };
    });
    const fallback = await makeRpcServer((_path, body) => ({
      body: { result: { count: body.method === 'get_block_count' ? 1_000 : 0, status: 'OK' } },
    }));

    try {
      const pool = new MoneroRpcPool({
        rpcUrl: primary.url,
        fallbackRpcUrls: [fallback.url],
        timeoutMs: 500,
        requirePrimarySync: true,
        primaryHealthCheckIntervalMs: 1_000,
      });

      const count = await pool.jsonRpc<{ count: number }>('get_block_count');

      expect(count.count).toBe(1_000);
      expect(primary.calls.map((call) => call.method)).toEqual(['get_info']);
      expect(fallback.calls.map((call) => call.method)).toEqual(['get_block_count']);
    } finally {
      await primary.close();
      await fallback.close();
    }
  });

  it('falls back when the synced primary fails a read', async () => {
    const primary = await makeRpcServer((_path, body) => {
      if (body.method === 'get_info') {
        return {
          body: {
            result: {
              status: 'OK',
              height: 1_000,
              target_height: 1_000,
              synchronized: true,
              top_block_hash: '00',
            },
          },
        };
      }
      return { status: 502, body: { error: 'temporary primary failure' } };
    });
    const fallback = await makeRpcServer(() => ({
      body: { result: { count: 1_000, status: 'OK' } },
    }));

    try {
      const pool = new MoneroRpcPool({
        rpcUrl: primary.url,
        fallbackRpcUrls: [fallback.url],
        timeoutMs: 500,
        requirePrimarySync: true,
        primaryHealthCheckIntervalMs: 1_000,
      });

      const count = await pool.jsonRpc<{ count: number }>('get_block_count');

      expect(count.count).toBe(1_000);
      expect(primary.calls[0].method).toBe('get_info');
      expect(primary.calls.filter((call) => call.method === 'get_block_count')).toHaveLength(1);
      expect(fallback.calls.map((call) => call.method)).toEqual(['get_block_count']);
    } finally {
      await primary.close();
      await fallback.close();
    }
  });

  it('tries subsequent public fallbacks when the first fallback fails', async () => {
    const primary = await makeRpcServer(() => ({ status: 503, body: { error: 'primary unavailable' } }));
    const firstFallback = await makeRpcServer(() => ({ status: 503, body: { error: 'first fallback unavailable' } }));
    const secondFallback = await makeRpcServer(() => ({ body: { result: { count: 1_000, status: 'OK' } } }));

    try {
      const pool = new MoneroRpcPool({
        rpcUrl: primary.url,
        fallbackRpcUrls: [firstFallback.url, secondFallback.url],
        timeoutMs: 500,
        requirePrimarySync: false,
      });

      const count = await pool.jsonRpc<{ count: number }>('get_block_count');

      expect(count.count).toBe(1_000);
      expect(primary.calls).toHaveLength(1);
      expect(firstFallback.calls).toHaveLength(1);
      expect(secondFallback.calls.map((call) => call.method)).toEqual(['get_block_count']);
    } finally {
      await primary.close();
      await firstFallback.close();
      await secondFallback.close();
    }
  });

  it('bounds an unresponsive primary to one timeout before serving from fallback', async () => {
    const primary = await makeRpcServer(() => new Promise<RpcReply>(() => undefined));
    const fallback = await makeRpcServer(() => ({ body: { result: { count: 1_000, status: 'OK' } } }));

    try {
      const pool = new MoneroRpcPool({
        rpcUrl: primary.url,
        fallbackRpcUrls: [fallback.url],
        timeoutMs: 75,
        requirePrimarySync: false,
      });
      const startedAt = Date.now();
      const count = await pool.jsonRpc<{ count: number }>('get_block_count');

      expect(count.count).toBe(1_000);
      expect(Date.now() - startedAt).toBeLessThan(500);
      expect(primary.calls).toHaveLength(1);
    } finally {
      await primary.close();
      await fallback.close();
    }
  });

  it('keeps a failed primary out of subsequent reads until cooldown ends without requiring sync checks', async () => {
    let primaryAvailable = false;
    const primary = await makeRpcServer(() => primaryAvailable
      ? { body: { result: { count: 1_001, status: 'OK' } } }
      : { status: 503, body: { error: 'primary unavailable' } });
    const fallback = await makeRpcServer(() => ({ body: { result: { count: 1_000, status: 'OK' } } }));

    try {
      const pool = new MoneroRpcPool({
        rpcUrl: primary.url,
        fallbackRpcUrls: [fallback.url],
        timeoutMs: 500,
        requirePrimarySync: false,
        primaryHealthCheckIntervalMs: 1_000,
      });
      expect((await pool.jsonRpc<{ count: number }>('get_block_count')).count).toBe(1_000);
      primaryAvailable = true;
      expect((await pool.jsonRpc<{ count: number }>('get_block_count')).count).toBe(1_000);
      expect(primary.calls).toHaveLength(1);

      await new Promise((resolve) => setTimeout(resolve, 1_025));
      expect((await pool.jsonRpc<{ count: number }>('get_block_count')).count).toBe(1_001);
      expect(primary.calls).toHaveLength(2);
    } finally {
      await primary.close();
      await fallback.close();
    }
  });

  it('shares a single primary health check across concurrent cold reads', async () => {
    const primary = await makeRpcServer(async (_path, body) => {
      if (body.method === 'get_info') {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { body: { result: { status: 'OK', height: 1_000, synchronized: true } } };
      }
      return { body: { result: { count: 1_000, status: 'OK' } } };
    });
    const fallback = await makeRpcServer(() => ({ status: 503, body: { error: 'fallback should not be needed' } }));

    try {
      const pool = new MoneroRpcPool({
        rpcUrl: primary.url,
        fallbackRpcUrls: [fallback.url],
        timeoutMs: 500,
        requirePrimarySync: true,
      });
      const results = await Promise.all(Array.from({ length: 8 }, () => pool.jsonRpc<{ count: number }>('get_block_count')));

      expect(results.every((result) => result.count === 1_000)).toBe(true);
      expect(primary.calls.filter((call) => call.method === 'get_info')).toHaveLength(1);
      expect(fallback.calls).toHaveLength(0);
    } finally {
      await primary.close();
      await fallback.close();
    }
  });

  it('keeps transport retries when there are no fallback daemons', async () => {
    let attempts = 0;
    const primary = await makeRpcServer(() => ++attempts === 1
      ? { status: 503, body: { error: 'temporary failure' } }
      : { body: { result: { count: 1_000, status: 'OK' } } });

    try {
      const pool = new MoneroRpcPool({ rpcUrl: primary.url, timeoutMs: 500 });
      expect((await pool.jsonRpc<{ count: number }>('get_block_count')).count).toBe(1_000);
      expect(primary.calls).toHaveLength(2);
    } finally {
      await primary.close();
    }
  });
});
