export type AuthConflictField = 'email' | 'phone' | 'username';
export type AuthConflictMethod = 'google' | 'apple' | 'credentials';

export function oauthConflictMethod(user: {
  password?: string | null;
  appleSub?: string | null;
}): AuthConflictMethod {
  if (user.password) {
    return 'credentials';
  }
  if (user.appleSub) {
    return 'apple';
  }
  return 'google';
}

export function authConflictMessage(options: {
  field: AuthConflictField;
  method?: AuthConflictMethod;
}): string {
  const { field, method } = options;

  if (field === 'phone') {
    return 'An account already exists with this phone number. Please log in instead.';
  }

  if (field === 'username') {
    return 'That username is already taken. Try a different one.';
  }

  if (method === 'google') {
    return 'This email is already linked to a Google account. Please continue with Google.';
  }

  if (method === 'apple') {
    return 'This email is already linked to an Apple account. Please continue with Apple.';
  }

  return 'An account already exists with this email address. Please log in instead.';
}

export function googleLoginCredentialsConflictMessage(): string {
  return 'An account with this email already exists. Please log in using your email and password.';
}

export function appleLoginCredentialsConflictMessage(): string {
  return googleLoginCredentialsConflictMessage();
}

export function googleLoginAppleConflictMessage(): string {
  return 'This account was created with Apple. Please continue with Apple to sign in.';
}

export function appleLoginGoogleConflictMessage(): string {
  return 'This account was created with Google. Please continue with Google to sign in.';
}

export function oauthOnlyLoginMessage(method: Exclude<AuthConflictMethod, 'credentials'>): string {
  return method === 'apple' ? googleLoginAppleConflictMessage() : appleLoginGoogleConflictMessage();
}

export function googleLoginSignUpPromptMessage(): string {
  return 'No account found with this email. Please sign up.';
}

export function appleLoginSignUpPromptMessage(): string {
  return googleLoginSignUpPromptMessage();
}
