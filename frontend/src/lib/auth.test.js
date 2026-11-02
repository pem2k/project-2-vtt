import { describe, it, expect } from 'vitest';
import { validateCredentials, authErrorMessage } from './auth.js';

describe('validateCredentials', () => {
  it('flags empty email and password', () => {
    expect(validateCredentials({ email: '', password: '' })).toBeTruthy();
  });

  it('flags a missing email', () => {
    expect(validateCredentials({ email: '  ', password: 'secret1' })).toMatch(/email/i);
  });

  it('flags a missing password', () => {
    expect(validateCredentials({ email: 'a@b.com', password: '' })).toMatch(/password/i);
  });

  it('flags a malformed email', () => {
    expect(validateCredentials({ email: 'not-an-email', password: 'secret1' })).toMatch(/valid/i);
  });

  it('enforces a minimum password length only when asked (signup)', () => {
    expect(
      validateCredentials({ email: 'a@b.com', password: '123' }, { requireStrongPassword: true }),
    ).toMatch(/6 characters/i);
    // login path does not reject a short password up front
    expect(validateCredentials({ email: 'a@b.com', password: '123' })).toBeNull();
  });

  it('passes valid credentials', () => {
    expect(validateCredentials({ email: 'player@example.com', password: 'secret1' })).toBeNull();
  });
});

describe('authErrorMessage', () => {
  it('returns null when there is no error', () => {
    expect(authErrorMessage(null)).toBeNull();
  });

  it('maps a duplicate-email signup error', () => {
    expect(authErrorMessage({ message: 'User already registered' })).toMatch(/already exists/i);
    expect(authErrorMessage({ code: 'user_already_exists' })).toMatch(/already exists/i);
  });

  it('maps invalid login credentials', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toMatch(
      /invalid email or password/i,
    );
    expect(authErrorMessage({ code: 'invalid_credentials' })).toMatch(/invalid email or password/i);
  });

  it('falls back to a generic message for unknown errors', () => {
    const msg = authErrorMessage({ message: 'teapot exploded' });
    expect(msg).toBeTruthy();
    expect(msg).not.toMatch(/teapot/i);
  });
});
