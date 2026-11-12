import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

describe('GET /health', () => {
  let httpServer;

  afterEach(async () => {
    if (!httpServer) return;

    httpServer.close();
    await once(httpServer, 'close');
    httpServer = undefined;
  });

  async function getHealth() {
    ({ httpServer } = createServer());
    httpServer.listen(0);
    await once(httpServer, 'listening');
    const { port } = httpServer.address();
    return fetch(`http://127.0.0.1:${port}/health`);
  }

  it('returns 200 and status ok with no auth', async () => {
    const res = await getHealth();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
