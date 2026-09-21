import {
  authConflictMessage,
  appleLoginGoogleConflictMessage,
  googleLoginAppleConflictMessage,
  googleLoginCredentialsConflictMessage,
  googleLoginSignUpPromptMessage,
  oauthConflictMethod,
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

  it('returns email Apple message when method is apple', () => {
    expect(authConflictMessage({ field: 'email', method: 'apple' })).toBe(
      'This email is already linked to an Apple account. Please continue with Apple.',
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

  it('returns Apple redirect for Google login on Apple accounts', () => {
    expect(googleLoginAppleConflictMessage()).toContain('Apple');
  });
});

describe('oauthConflictMethod', () => {
  it('returns credentials when password is set', () => {
    expect(oauthConflictMethod({ password: 'hashed', appleSub: null })).toBe('credentials');
  });

  it('returns apple when appleSub is set and password is null', () => {
    expect(oauthConflictMethod({ password: null, appleSub: 'sub' })).toBe('apple');
  });

  it('returns google when password and appleSub are empty', () => {
    expect(oauthConflictMethod({ password: null, appleSub: null })).toBe('google');
  });
});

describe('apple login messages', () => {
  it('returns Google redirect for Apple login on Google accounts', () => {
    expect(appleLoginGoogleConflictMessage()).toContain('Google');
  });
});
