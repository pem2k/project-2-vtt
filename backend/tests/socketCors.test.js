import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCorsOptions, createServer } from '../src/server.js';

describe('buildCorsOptions', () => {
  it('falls back to the local dev frontend origin when CLIENT_ORIGIN is unset', () => {
    expect(buildCorsOptions(undefined)).toEqual({
      origin: ['http://localhost:5173'],
      methods: ['GET', 'POST'],
    });
  });

  it('reads one or more hosted origins from CLIENT_ORIGIN', () => {
    expect(buildCorsOptions('https://open-vtt.example, https://staging.open-vtt.example')).toEqual({
      origin: ['https://open-vtt.example', 'https://staging.open-vtt.example'],
      methods: ['GET', 'POST'],
    });
  });
});

describe('Socket.IO CORS handshake', () => {
  // Stands in for a deployed frontend URL. The point is that the server honors
  // whatever CLIENT_ORIGIN is configured — not a hardcoded localhost origin — so
  // this passes identically once the app is hosted under a real domain.
  const allowedOrigin = 'https://open-vtt.example';
  let httpServer;
  let previousClientOrigin;

  beforeEach(() => {
    previousClientOrigin = process.env.CLIENT_ORIGIN;
    process.env.CLIENT_ORIGIN = allowedOrigin;
  });

  afterEach(async () => {
    if (previousClientOrigin === undefined) delete process.env.CLIENT_ORIGIN;
    else process.env.CLIENT_ORIGIN = previousClientOrigin;

    if (httpServer) {
      httpServer.close();
      await once(httpServer, 'close');
      httpServer = undefined;
    }
  });

  // Returns the Socket.IO polling handshake response for a given browser Origin.
  // The fetch target is the in-process test server's own ephemeral port — not a
  // deployment concern, just where the server under test happens to bind.
  async function handshake(origin) {
    ({ httpServer } = createServer());
    httpServer.listen(0);
    await once(httpServer, 'listening');
    const { port } = httpServer.address();
    return fetch(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`, {
      headers: { Origin: origin },
    });
  }

  it('echoes the configured frontend origin on the handshake', async () => {
    const res = await handshake(allowedOrigin);
    expect(res.headers.get('access-control-allow-origin')).toBe(allowedOrigin);
  });

  it('does not echo an origin that is not configured', async () => {
    const res = await handshake('https://evil.example');
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });
});
