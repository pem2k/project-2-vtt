import { vi } from 'vitest';

/**
 * Creates a chainable mock Supabase client for testing PostgREST queries and RPCs.
 * Spies on each chained method are exposed via client._spies for explicit assertions.
 */
export function createMockSupabase({ data = null, error = null } = {}) {
  const result = { data, error };

  const spies = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };

  const builder = {
    select: spies.select,
    insert: spies.insert,
    update: spies.update,
    delete: spies.delete,
    eq: spies.eq,
    order: spies.order,
    single: spies.single,
    maybeSingle: spies.maybeSingle,
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: null, error }).then(onFulfilled, onRejected);
    },
  };

  spies.select.mockReturnValue(builder);
  spies.insert.mockReturnValue(builder);
  spies.update.mockReturnValue(builder);
  spies.delete.mockReturnValue(builder);
  spies.eq.mockReturnValue(builder);

  return {
    from: vi.fn(() => builder),
    rpc: vi.fn().mockResolvedValue(result),
    _builder: builder,
    _spies: spies,
  };
}

/**
 * Creates a mock Socket.IO client for testing acknowledgment callbacks and timeouts.
 */
export function createMockAckSocket({
  ok = true,
  error = null,
  connected = true,
  autoAck = true,
} = {}) {
  return {
    connected,
    emit: vi.fn((event, payload, cb) => {
      if (autoAck && typeof cb === 'function') {
        cb(ok ? { ok: true } : { ok: false, error });
      }
    }),
  };
}
