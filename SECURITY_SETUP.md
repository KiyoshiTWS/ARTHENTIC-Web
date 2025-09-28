# SECURITY SETUP - REQUIRED

⚠️ **IMPORTANT**: This project requires Firebase configuration to function properly.

## 🔐 Setting up Firebase Configuration Securely

### For Local Development:

1. **Copy the template file:**
   ```bash
   cp firebase-config-template.js firebase-config-local.js
   ```

2. **Get your Firebase config:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings > General > Your apps
   - Copy the Firebase SDK configuration

3. **Update `firebase-config-local.js`:**
   Replace the placeholder values with your actual Firebase configuration:
   ```javascript
   window.FIREBASE_API_KEY = "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX";
   window.FIREBASE_AUTH_DOMAIN = "your-project.firebaseapp.com";
   // ... etc
   ```

4. **Never commit `firebase-config-local.js`** - it's already in .gitignore

### For GitHub Pages Deployment:

1. **Go to your GitHub repository**
2. **Settings > Secrets and variables > Actions**
3. **Add the following Repository Secrets:**
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
   - `FIREBASE_MEASUREMENT_ID`

4. **The GitHub Actions workflow will automatically inject these during deployment**

## 🚨 Security Note

The old Firebase configuration with exposed API keys has been removed from the codebase. The system now uses environment variables and GitHub Secrets for secure deployment.

## 🔧 Fallback Mode

If no Firebase configuration is provided, the application will fall back to demo mode using localStorage, but with limited functionality.