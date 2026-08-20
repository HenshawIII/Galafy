import {
  authConflictMessage,
  googleLoginCredentialsConflictMessage,
  googleLoginSignUpPromptMessage,
} from './auth-conflict-messages.util.js';

describe('authConflictMessage', () => {
  it('returns email credentials message by default', () => {
    expect(authConflictMessage({ field: 'email' })).toBe(
      'An account already exists with this email address. Please log in instead.',
    );
  });

  it('returns email Google message when method is google', () => {
    expect(authConflictMessage({ field: 'email', method: 'google' })).toBe(
      'This email is already linked to a Google account. Please continue with Google.',
    );
  });

  it('returns phone conflict message', () => {
    expect(authConflictMessage({ field: 'phone' })).toBe(
      'An account already exists with this phone number. Please log in instead.',
    );
  });

  it('returns username conflict message', () => {
    expect(authConflictMessage({ field: 'username' })).toBe(
      'That username is already taken. Try a different one.',
    );
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
