# API Documentation

## Base URL
```
https://galafy.onrender.com
```

All endpoints are prefixed with `/api` as configured in the application.

---

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <access_token>
```

The `access_token` is obtained from the login or Google OAuth endpoints.

---

## User Authentication Endpoints

### 1. Sign Up
Create a new user account. User will receive a verification code via email.

**Endpoint:** `POST /api/users/signup`

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "kycTier": "T1"
}
```

**Validation Rules:**
- `username`: Required, string
- `email`: Required, valid email format
- `password`: Required, string, minimum 6 characters
- `kycTier`: Required, one of: `"T1"`, `"T2"`, `"T3"`

**Success Response (201):**
```json
{
  "id": "uuid-string",
  "username": "johndoe",
  "email": "john@example.com",
  "kycTier": "T1",
  "isVerified": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "message": "Account created successfully. Please check your email for verification code."
}
```

**Error Responses:**
- `409 Conflict`: User with this email already exists
- `400 Bad Request`: Validation errors (missing fields, invalid format)

---

### 2. Verify Account
Verify user account with the verification code received via email.

**Endpoint:** `POST /api/users/verify`

**Request Body:**
```json
{
  "email": "john@example.com",
  "verificationCode": "123456"
}
```

**Validation Rules:**
- `email`: Required, valid email format
- `verificationCode`: Required, string (6-digit code)

**Success Response (200):**
```json
{
  "id": "uuid-string",
  "username": "johndoe",
  "email": "john@example.com",
  "kycTier": "T1",
  "isVerified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "message": "Account verified successfully"
}
```

**Error Responses:**
- `404 Not Found`: User not found
- `400 Bad Request`: Account is already verified
- `401 Unauthorized`: Invalid verification code or code has expired (expires after 15 minutes)

---

### 3. Resend Verification Code
Request a new verification code if the previous one expired.

**Endpoint:** `POST /api/users/resend-verification`

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Validation Rules:**
- `email`: Required, valid email format

**Success Response (200):**
```json
{
  "message": "If the email exists and account is unverified, a new verification code has been sent"
}
```

**Error Responses:**
- `400 Bad Request`: Account is already verified

**Note:** For security, the response message is the same whether the email exists or not.

---

### 4. Login
Authenticate user and receive JWT access token.

**Endpoint:** `POST /api/users/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Validation Rules:**
- `email`: Required, valid email format
- `password`: Required, string

**Success Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-string",
    "username": "johndoe",
    "email": "john@example.com",
    "kycTier": "T1",
    "isVerified": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: 
  - Invalid email or password
  - Account not verified (message: "Please verify your account before logging in. Check your email for verification code.")
  - Account created with Google sign-in (message: "This account was created with Google sign-in. Please use Google authentication to login.")

**Token Expiry:** 1 hour

---

### 5. Google OAuth Login
Authenticate using Google OAuth token.

**Endpoint:** `POST /api/auth/google`

**Request Body:**
```json
{
  "idtoken": "google-idToken-string"
}
```

**Success Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-string",
    "username": "John Doe",
    "email": "john@gmail.com",
    "kycTier": "T1",
    "isVerified": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid Google token

**Note:** 
- If user doesn't exist, account is automatically created with `isVerified: true`
- Google OAuth users don't have passwords set

---

## Password Reset Endpoints

### 6. Forgot Password
Request a password reset link via email. User will receive an email with a JWT token link.

**Endpoint:** `POST /api/users/forgot-password`

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Validation Rules:**
- `email`: Required, valid email format

**Success Response (200):**
```json
{
  "message": "If the email exists, a password reset link has been sent"
}
```

**Note:** 
- For security, the response message is the same whether the email exists or not
- The reset link expires in 1 hour
- Link format: `${FRONTEND_URL}/reset-password?token=<jwt-token>`

---

### 7. Reset Password
Reset password using the JWT token from the reset link.

**Endpoint:** `POST /api/users/reset-password`

**Request Body:**
```json
{
  "token": "jwt-token-from-reset-link",
  "newPassword": "newpassword123"
}
```

**Validation Rules:**
- `token`: Required, string (JWT token from email link)
- `newPassword`: Required, string, minimum 6 characters

**Success Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired token
- `404 Not Found`: User not found

**Note:** Token expires 1 hour after generation.

---

## User Management Endpoints

### 8. Get All Users
Retrieve all users (throttled: 3 requests per minute).

**Endpoint:** `GET /api/users`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
[
  {
    "id": "uuid-string",
    "username": "johndoe",
    "email": "john@example.com",
    "kycTier": "T1",
    "isVerified": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  ...
]
```

**Error Responses:**
- `404 Not Found`: No users found
- `401 Unauthorized`: Missing or invalid token

---

### 9. Get User by ID
Retrieve a specific user by their UUID.

**Endpoint:** `GET /api/users/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Path Parameters:**
- `id`: User UUID (string)

**Success Response (200):**
```json
{
  "id": "uuid-string",
  "username": "johndoe",
  "email": "john@example.com",
  "kycTier": "T1",
  "isVerified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: User with ID not found
- `401 Unauthorized`: Missing or invalid token

---

### 10. Get User by Email
Retrieve a user by their email address.

**Endpoint:** `GET /api/users/email?email=user@example.com`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `email`: User email address (required)

**Success Response (200):**
```json
{
  "id": "uuid-string",
  "username": "johndoe",
  "email": "john@example.com",
  "kycTier": "T1",
  "isVerified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- Returns `null` if user not found
- `401 Unauthorized`: Missing or invalid token

---

### 11. Create User (Admin)
Create a new user (typically for admin use or Google OAuth).

**Endpoint:** `POST /api/users`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "kycTier": "T1",
  "isVerified": false
}
```

**Validation Rules:**
- `username`: Required, string
- `email`: Required, valid email format
- `password`: Optional, string, minimum 6 characters (if provided)
- `kycTier`: Required, one of: `"T1"`, `"T2"`, `"T3"`
- `isVerified`: Optional, boolean (defaults to false)

**Success Response (201):**
```json
{
  "id": "uuid-string",
  "username": "johndoe",
  "email": "john@example.com",
  "kycTier": "T1",
  "isVerified": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Validation errors
- `401 Unauthorized`: Missing or invalid token

---

### 12. Update User
Update user information.

**Endpoint:** `PATCH /api/users/:id`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Path Parameters:**
- `id`: User UUID (string)

**Request Body:**
```json
{
  "username": "newusername",
  "email": "newemail@example.com",
  "password": "newpassword123",
  "kycTier": "T2"
}
```

**Validation Rules:**
- All fields are optional
- If provided, must follow same validation as CreateUserDto
- Password will be hashed automatically if provided

**Success Response (200):**
```json
{
  "id": "uuid-string",
  "username": "newusername",
  "email": "newemail@example.com",
  "kycTier": "T2",
  "isVerified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: User with ID not found
- `400 Bad Request`: Validation errors
- `401 Unauthorized`: Missing or invalid token

---

### 13. Delete User
Delete a user account.

**Endpoint:** `DELETE /api/users/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Path Parameters:**
- `id`: User UUID (string)

**Success Response (200):**
```json
{
  "id": "uuid-string",
  "username": "johndoe",
  "email": "john@example.com",
  "kycTier": "T1",
  "isVerified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: User with ID not found
- `401 Unauthorized`: Missing or invalid token

---

## Data Models

### User Object
```typescript
{
  id: string;                    // UUID
  username: string;
  email: string;
  password?: string;              // Never returned in responses
  kycTier: "T1" | "T2" | "T3";
  isVerified: boolean;
  verificationCode?: string;     // Never returned in responses
  createdAt: string;              // ISO 8601 date string
  updatedAt: string;              // ISO 8601 date string
}
```

### KYC Tier Enum
- `T1`: Tier 1 (default)
- `T2`: Tier 2
- `T3`: Tier 3

---

## Error Response Format

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Error message or array of validation errors",
  "error": "Error type"
}
```

### Common HTTP Status Codes
- `200 OK`: Success
- `201 Created`: Resource created successfully
- `400 Bad Request`: Validation errors or bad request
- `401 Unauthorized`: Authentication required or invalid credentials
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists (e.g., email already registered)

---

## Rate Limiting

- **GET /api/users**: Limited to 3 requests per minute
- Other endpoints: Default rate limiting applies (5 requests per minute)

---

## CORS

CORS is enabled for all origins. The API accepts requests from any domain.

---

## Example Frontend Integration

### JavaScript/TypeScript Example

```typescript
const API_BASE_URL = 'https://your-render-url.onrender.com/api';

// Sign Up
async function signup(username: string, email: string, password: string, kycTier: string) {
  const response = await fetch(`${API_BASE_URL}/users/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, email, password, kycTier }),
  });
  return response.json();
}

// Verify Account
async function verifyAccount(email: string, verificationCode: string) {
  const response = await fetch(`${API_BASE_URL}/users/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, verificationCode }),
  });
  return response.json();
}

// Login
async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token);
  }
  return data;
}

// Authenticated Request Example
async function getUsers() {
  const token = localStorage.getItem('access_token');
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return response.json();
}

// Forgot Password
async function forgotPassword(email: string) {
  const response = await fetch(`${API_BASE_URL}/users/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  return response.json();
}

// Reset Password (token from URL query parameter)
async function resetPassword(token: string, newPassword: string) {
  const response = await fetch(`${API_BASE_URL}/users/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, newPassword }),
  });
  return response.json();
}
```

---

## Notes for Frontend Developers

1. **Password Reset Flow:**
   - User requests reset → receives email with link containing JWT token
   - Frontend should extract token from URL: `?token=<jwt-token>`
   - Send token + new password to reset endpoint

2. **Account Verification Flow:**
   - User signs up → receives 6-digit code via email
   - User enters code within 15 minutes
   - If expired, use resend-verification endpoint

3. **Token Storage:**
   - Store `access_token` from login response
   - Include in `Authorization: Bearer <token>` header for protected routes
   - Token expires after 1 hour

4. **Error Handling:**
   - Always check `response.ok` or status code
   - Parse error messages from response body
   - Handle 401 errors by redirecting to login

5. **Google OAuth:**
   - Get Google ID token from Google Sign-In
   - Send to `/api/auth/google` endpoint
   - User is automatically created if doesn't exist

---

## Testing Endpoints

You can test endpoints using tools like:
- Postman
- cURL
- Thunder Client (VS Code extension)
- Insomnia

**Example cURL commands:**


```

