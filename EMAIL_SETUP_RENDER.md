# Email Setup for Render (SMTP Connection Timeout Fix)

## The Problem

**Error:** `ETIMEDOUT` when trying to send emails from Render

**Root Cause:** Render (and most cloud hosting providers) **block outbound SMTP connections** on ports 587 and 465 for security reasons. This prevents Gmail SMTP from working.

## Solution: Use SendGrid (Recommended)

SendGrid is a cloud email service that works perfectly with Render and has a generous free tier (100 emails/day).

### Step 1: Create SendGrid Account

1. Sign up at https://sendgrid.com (free tier available)
2. Verify your email address

### Step 2: Create API Key

1. Go to **Settings** → **API Keys** in SendGrid dashboard
2. Click **Create API Key**
3. Name it (e.g., "Render Production")
4. Select **Full Access** or **Restricted Access** (with Mail Send permissions)
5. Copy the API key (you'll only see it once!)

### Step 3: Verify Sender Identity

1. Go to **Settings** → **Sender Authentication**
2. Either:
   - **Single Sender Verification**: Add and verify your email address
   - **Domain Authentication**: Verify your domain (better for production)

### Step 4: Set Environment Variables in Render

In your Render dashboard, add these environment variables:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=SG.your-actual-sendgrid-api-key-here
SMTP_FROM=noreply@yourdomain.com
```

**Important Notes:**
- `SMTP_USER` must be exactly `"apikey"` (literal string) for SendGrid
- `SMTP_PASSWORD` is your SendGrid API key (starts with `SG.`)
- `SMTP_FROM` should be a verified sender email in SendGrid

### Step 5: Redeploy

After setting environment variables, redeploy your service on Render.

## Alternative Solutions

### Option 2: Mailgun

1. Sign up at https://mailgun.com (free tier: 5,000 emails/month)
2. Get SMTP credentials from dashboard
3. Set environment variables:

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@yourdomain.mailgun.org
SMTP_PASSWORD=your-mailgun-password
SMTP_FROM=noreply@yourdomain.com
```

### Option 3: AWS SES

1. Set up AWS SES in your AWS account
2. Get SMTP credentials
3. Set environment variables:

```env
SMTP_HOST=email-smtp.region.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-aws-ses-smtp-username
SMTP_PASSWORD=your-aws-ses-smtp-password
SMTP_FROM=noreply@yourdomain.com
```

### Option 4: Resend (Modern Alternative)

Resend is a modern email API. You'd need to modify the email service to use their API instead of SMTP.

## Testing

After setup, test by:
1. Triggering a signup or password reset
2. Check Render logs for "SMTP connection verified successfully"
3. Check your email inbox

## Troubleshooting

**Still getting timeout?**
- Verify environment variables are set correctly in Render
- Check SendGrid dashboard for any account restrictions
- Ensure sender email is verified in SendGrid
- Check Render logs for specific error messages

**Emails not arriving?**
- Check spam folder
- Verify sender email is authenticated in SendGrid
- Check SendGrid Activity Feed for delivery status
- Ensure you haven't exceeded free tier limits

## Why Gmail SMTP Doesn't Work on Render

Render blocks outbound connections to prevent abuse. SMTP ports (587, 465) are commonly blocked. Professional email services like SendGrid:
- Use API-based sending (more reliable)
- Have better deliverability
- Provide analytics and monitoring
- Are designed for transactional emails
- Work with cloud hosting providers

