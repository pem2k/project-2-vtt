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

  it('keeps an exact CLIENT_ORIGIN entry as a string', () => {
    expect(buildCorsOptions('https://open-vtt.example')).toEqual({
      origin: ['https://open-vtt.example'],
      methods: ['GET', 'POST'],
    });
  });

  it('matches one preview label from a * wildcard entry', () => {
    const { origin, methods } = buildCorsOptions('https://project-2-vtt-*.vercel.app');

    expect(methods).toEqual(['GET', 'POST']);
    expect(origin).toHaveLength(1);
    expect(origin[0]).toBeInstanceOf(RegExp);
    expect(origin[0].test('https://project-2-vtt-git-abc123.vercel.app')).toBe(true);
  });

  it('does not let a wildcard origin match a different domain', () => {
    const { origin } = buildCorsOptions('https://project-2-vtt-*.vercel.app');

    expect(origin[0]).toBeInstanceOf(RegExp);
    expect(origin[0].test('https://project-2-vtt-git-abc123.vercel.com')).toBe(false);
    expect(origin[0].test('https://evil.example')).toBe(false);
    expect(origin[0].test('https://project-2-vtt-git-abc123.vercel.app.evil.com')).toBe(false);
  });

  it('does not let a wildcard match extra subdomain dots or slashes', () => {
    const { origin } = buildCorsOptions('https://project-2-vtt-*.vercel.app');

    expect(origin[0]).toBeInstanceOf(RegExp);
    expect(origin[0].test('https://project-2-vtt-abc.def.vercel.app')).toBe(false);
    expect(origin[0].test('https://foo.project-2-vtt-abc.vercel.app')).toBe(false);
    expect(origin[0].test('https://project-2-vtt-abc/def.vercel.app')).toBe(false);
    expect(origin[0].test('https://project-2-vtt-abcXvercelYapp')).toBe(false);
    expect(origin[0].test('https://project-2-vtt-.vercel.app')).toBe(false);
  });

  it('escapes regex metacharacters outside the wildcard', () => {
    const { origin } = buildCorsOptions('https://my+app-*.example.com');

    expect(origin[0]).toBeInstanceOf(RegExp);
    expect(origin[0].test('https://my+app-preview.example.com')).toBe(true);
    expect(origin[0].test('https://myyyapp-preview.example.com')).toBe(false);
  });

  it('keeps an exact origin as a string when a wildcard entry is also configured', () => {
    const { origin } = buildCorsOptions(
      ' https://open-vtt.example , https://project-2-vtt-*.vercel.app ',
    );

    expect(origin[0]).toBe('https://open-vtt.example');
    expect(origin[1]).toBeInstanceOf(RegExp);
    expect(origin[1].test('https://project-2-vtt-preview.vercel.app')).toBe(true);
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
