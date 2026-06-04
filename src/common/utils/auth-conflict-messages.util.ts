export type AuthConflictField = 'email' | 'phone' | 'username';
export type AuthConflictMethod = 'google' | 'credentials';

export function authConflictMessage(options: {
  field: AuthConflictField;
  method?: AuthConflictMethod;
}): string {
  const { field, method } = options;

  if (field === 'phone') {
    return 'An account with this phone number already exists. Please log in.';
  }

  if (field === 'username') {
    return 'An account with this username already exists. Please choose a different username.';
  }

  if (method === 'google') {
    return 'An account with this email already exists. Please log in using Google.';
  }

  return 'An account with this email already exists. Please log in.';
}

export function googleLoginCredentialsConflictMessage(): string {
  return 'An account with this email already exists. Please log in using your email and password.';
}

export function googleLoginSignUpPromptMessage(): string {
  return 'No account found with this email. Please sign up.';
}
