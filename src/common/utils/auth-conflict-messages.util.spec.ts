import {
  authConflictMessage,
  googleLoginCredentialsConflictMessage,
  googleLoginSignUpPromptMessage,
} from './auth-conflict-messages.util.js';

describe('authConflictMessage', () => {
  it('returns email credentials message by default', () => {
    expect(authConflictMessage({ field: 'email' })).toBe(
      'An account with this email already exists. Please log in.',
    );
  });

  it('returns email Google message when method is google', () => {
    expect(authConflictMessage({ field: 'email', method: 'google' })).toBe(
      'An account with this email already exists. Please log in using Google.',
    );
  });

  it('returns phone conflict message', () => {
    expect(authConflictMessage({ field: 'phone' })).toBe(
      'An account with this phone number already exists. Please log in.',
    );
  });

  it('returns username conflict message', () => {
    expect(authConflictMessage({ field: 'username' })).toContain('username');
  });
});

describe('google login messages', () => {
  it('returns credentials redirect when email account exists', () => {
    expect(googleLoginCredentialsConflictMessage()).toContain('email and password');
  });

  it('returns sign up prompt when no account', () => {
    expect(googleLoginSignUpPromptMessage()).toContain('sign up');
  });
});
