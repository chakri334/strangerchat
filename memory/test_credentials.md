# StumbleChat Test Credentials

## Admin (for /api/admin/* endpoints)
- Header: `x-admin-token: stumblechat_admin_2026`
- Source: `backend/.env` → `ADMIN_TOKEN`

## Email Auth (OTP)
- DEV mode: `/api/auth/email/send-otp` returns the 6-digit `dev_code` in the response body.
- Use that code in `/api/auth/email/verify-otp` to receive a session token.
- Example test email: `test@example.com`

## Google OAuth
- Real Google account required. Configured in `backend/.env`:
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

## MongoDB
- `MONGO_URL=mongodb://localhost:27017`
- `DB_NAME=stumblechat`
- Collections: `users`, `reports`, `sessions`, `email_otps`
