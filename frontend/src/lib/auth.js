// Pure auth helpers — form validation and Supabase-error → friendly-message
// mapping. Kept side-effect-free so they're cheap to unit test; the actual
// supabase.auth calls live in the useAuth provider.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Supabase Auth's default minimum password length.
const MIN_PASSWORD_LENGTH = 6;

/**
 * Validate login/signup form input before hitting the network.
 * @returns {string|null} a user-facing error, or null when valid.
 */
export function validateCredentials({ email, password }, { requireStrongPassword = false } = {}) {
  const trimmedEmail = email?.trim() ?? '';

  if (!trimmedEmail && !password) return 'Enter your email and password.';
  if (!trimmedEmail) return 'Enter your email.';
  if (!password) return 'Enter your password.';
  if (!EMAIL_RE.test(trimmedEmail)) return 'Enter a valid email address.';
  if (requireStrongPassword && password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Map a Supabase AuthError to a friendly message. Matches on both the stable
 * error `code` and the human message (older responses only carry the message).
 * @returns {string|null} the message, or null when there is no error.
 */
export function authErrorMessage(error) {
  if (!error) return null;

  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();

  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'An account with this email already exists.';
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email before logging in.';
  }
  if (msg.includes('password should be at least')) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return 'Something went wrong. Please try again.';
}
