#!/bin/bash

# Deploy ArtHub to Firebase Hosting
# This script prepares and deploys the site to Firebase

echo "🚀 Preparing ArtHub for Firebase Hosting deployment..."

# Create Firebase config from environment variables
echo "📝 Creating Firebase configuration..."
if [ -f ".env" ]; then
    echo "🔐 Loading Firebase config from .env file..."
    source .env
    cat > firebase-config-local.js << EOF
// Firebase Configuration - Generated from environment variables
window.FIREBASE_API_KEY = "${FIREBASE_API_KEY}";
window.FIREBASE_AUTH_DOMAIN = "${FIREBASE_AUTH_DOMAIN}";
window.FIREBASE_PROJECT_ID = "${FIREBASE_PROJECT_ID}";
window.FIREBASE_STORAGE_BUCKET = "${FIREBASE_STORAGE_BUCKET}";
window.FIREBASE_MESSAGING_SENDER_ID = "${FIREBASE_MESSAGING_SENDER_ID}";
window.FIREBASE_APP_ID = "${FIREBASE_APP_ID}";
window.FIREBASE_MEASUREMENT_ID = "${FIREBASE_MEASUREMENT_ID}";

console.log('🔥 Firebase config loaded from environment');
console.log('Project ID:', window.FIREBASE_PROJECT_ID);
EOF
else
    echo "❌ .env file not found! Please create .env with your Firebase credentials."
    echo "Expected format:"
    echo "FIREBASE_API_KEY=your_api_key_here"
    echo "FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com"
    echo "FIREBASE_PROJECT_ID=your_project_id"
    echo "# ... etc"
    exit 1
fi

echo "✅ Firebase configuration created"

# Verify critical files exist
echo "🔍 Verifying deployment files..."
if [ ! -f "index.html" ]; then
    echo "❌ index.html not found!"
    exit 1
fi

if [ ! -f "arthub.html" ]; then
    echo "❌ arthub.html not found!"
    exit 1
fi

if [ ! -f "firebase-config.js" ]; then
    echo "❌ firebase-config.js not found!"
    exit 1
fi

if [ ! -f "firebase.json" ]; then
    echo "❌ firebase.json not found!"
    exit 1
fi

echo "✅ All required files present"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

echo "🔥 Firebase CLI version: $(firebase --version)"

# Verify firebase-config-local.js exists and has correct content
if [ ! -f "firebase-config-local.js" ]; then
    echo "❌ firebase-config-local.js missing! Creating it from .env..."
    if [ -f ".env" ]; then
        source .env
        cat > firebase-config-local.js << EOF
// Firebase Configuration - Generated from environment variables
window.FIREBASE_API_KEY = "${FIREBASE_API_KEY}";
window.FIREBASE_AUTH_DOMAIN = "${FIREBASE_AUTH_DOMAIN}";
window.FIREBASE_PROJECT_ID = "${FIREBASE_PROJECT_ID}";
window.FIREBASE_STORAGE_BUCKET = "${FIREBASE_STORAGE_BUCKET}";
window.FIREBASE_MESSAGING_SENDER_ID = "${FIREBASE_MESSAGING_SENDER_ID}";
window.FIREBASE_APP_ID = "${FIREBASE_APP_ID}";
window.FIREBASE_MEASUREMENT_ID = "${FIREBASE_MEASUREMENT_ID}";

console.log('🔥 Firebase config loaded from environment');
console.log('Project ID:', window.FIREBASE_PROJECT_ID);
EOF
        echo "✅ firebase-config-local.js created from .env"
    else
        echo "❌ Cannot create firebase-config-local.js: .env file not found!"
        exit 1
    fi
else
    echo "✅ firebase-config-local.js exists"
fi

# Deploy to Firebase Hosting
echo "🚀 Deploying to Firebase Hosting..."
echo "📍 Project: arthub-c46b2"
echo "🌐 Your site will be available at: https://arthub-c46b2.web.app"

# Note: This requires authentication
# firebase login
# firebase deploy --only hosting --project arthub-c46b2

echo "🏁 Deployment script ready!"
echo ""
echo "To complete deployment:"
echo "1. Run: firebase login"
echo "2. Run: firebase deploy --only hosting --project arthub-c46b2"
echo ""
echo "Or set up GitHub Actions with Firebase Service Account for automatic deployment."