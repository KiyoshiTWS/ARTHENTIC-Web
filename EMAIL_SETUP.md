# EmailJS Setup Guide for ArtHub

## Overview
ArtHub now includes functional email verification using EmailJS service. This allows real email sending for user registration verification codes.

## Setup Instructions

### 1. Create EmailJS Account
1. Go to [EmailJS.com](https://www.emailjs.com/)
2. Sign up for a free account
3. Create a new email service (Gmail, Outlook, etc.)

### 2. Configure Email Template
1. In EmailJS dashboard, create a new email template
2. Use these template variables:
   - `{{to_name}}` - User's username
   - `{{to_email}}` - User's email address
   - `{{verification_code}}` - 6-digit verification code
   - `{{app_name}}` - Application name (ArtHub)

### 3. Example Email Template
```
Subject: Welcome to {{app_name}} - Verify Your Email

Hi {{to_name}},

Welcome to {{app_name}}! To complete your registration, please use this verification code:

**{{verification_code}}**

This code will expire in 10 minutes for security reasons.

If you didn't create an account with us, please ignore this email.

Best regards,
The {{app_name}} Team
```

### 4. Update ArtHub Configuration
In `arthub.html`, replace these placeholders:

```javascript
// Line ~4872: Initialize EmailJS
emailjs.init('YOUR_PUBLIC_KEY'); // Replace with your EmailJS public key

// Line ~1898 & ~4998: Email sending
await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', {
  // Replace YOUR_SERVICE_ID and YOUR_TEMPLATE_ID
```

### 5. Get Your Keys
- **Public Key**: Found in EmailJS dashboard under "Account" > "General"
- **Service ID**: Found in "Email Services" section
- **Template ID**: Found in "Email Templates" section

## Current Features

### ✅ Email Verification
- Real email sending via EmailJS API
- 6-digit verification codes
- Fallback to console display for demo mode
- 60-second resend countdown with visual feedback

### ✅ Demo Mode Support
- Works without EmailJS configuration
- Verification codes displayed in browser console
- All functionality preserved for testing

### ✅ User Experience
- Professional email templates
- Countdown timer for resend attempts
- Clear error messages and feedback
- Mobile-responsive verification UI

## Testing

### With EmailJS (Production)
1. Configure EmailJS with your credentials
2. Register a new account with real email
3. Check email for verification code
4. Enter code to complete registration

### Without EmailJS (Demo)
1. Use placeholder credentials (already configured)
2. Register with any email address
3. Check browser console for verification code
4. Enter code to complete registration

## Troubleshooting

### Common Issues
1. **Emails not sending**: Check EmailJS service configuration
2. **Template errors**: Verify template variables match exactly
3. **API limits**: Free tier has monthly limits
4. **CORS errors**: Ensure domain is configured in EmailJS

### Demo Mode Fallback
If EmailJS fails, the system automatically falls back to console-based codes, ensuring the registration process always works.

## Security Notes
- Verification codes expire after 10 minutes
- Each user can only have one active code at a time
- Resend functionality has 60-second cooldown
- Email addresses are validated before sending