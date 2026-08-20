export type AuthConflictField = 'email' | 'phone' | 'username';
export type AuthConflictMethod = 'google' | 'credentials';

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

  return 'An account already exists with this email address. Please log in instead.';
}

export function googleLoginCredentialsConflictMessage(): string {
  return 'An account with this email already exists. Please log in using your email and password.';
}

export function googleLoginSignUpPromptMessage(): string {
  return 'No account found with this email. Please sign up.';
}
