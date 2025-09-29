#!/bin/bash

# Deploy ArtHub to Firebase Hosting
# This script prepares and deploys the site to Firebase

echo "🚀 Preparing ArtHub for Firebase Hosting deployment..."

# Create Firebase config from environment variables
echo "📝 Creating Firebase configuration..."
cat > firebase-config-local.js << EOF
// Firebase Configuration - Generated for deployment
window.FIREBASE_API_KEY = "AIzaSyB78EbKxjIxBPBudIHw6zVvfyVjZjMeDUk";
window.FIREBASE_AUTH_DOMAIN = "arthub-c46b2.firebaseapp.com";
window.FIREBASE_PROJECT_ID = "arthub-c46b2";
window.FIREBASE_STORAGE_BUCKET = "arthub-c46b2.firebasestorage.app";
window.FIREBASE_MESSAGING_SENDER_ID = "354841988675";
window.FIREBASE_APP_ID = "1:354841988675:web:9e62897abf73d69d3f8ef6";
window.FIREBASE_MEASUREMENT_ID = "G-QKFQXVBHFH";

console.log('🔥 Firebase config loaded for deployment');
console.log('Project ID:', window.FIREBASE_PROJECT_ID);
EOF

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
    echo "❌ firebase-config-local.js missing! Creating it..."
    cat > firebase-config-local.js << EOF
// Firebase Configuration - Generated for deployment
window.FIREBASE_API_KEY = "AIzaSyB78EbKxjIxBPBudIHw6zVvfyVjZjMeDUk";
window.FIREBASE_AUTH_DOMAIN = "arthub-c46b2.firebaseapp.com";
window.FIREBASE_PROJECT_ID = "arthub-c46b2";
window.FIREBASE_STORAGE_BUCKET = "arthub-c46b2.firebasestorage.app";
window.FIREBASE_MESSAGING_SENDER_ID = "354841988675";
window.FIREBASE_APP_ID = "1:354841988675:web:9e62897abf73d69d3f8ef6";
window.FIREBASE_MEASUREMENT_ID = "G-QKFQXVBHFH";

console.log('🔥 Firebase config loaded for deployment');
console.log('Project ID:', window.FIREBASE_PROJECT_ID);
EOF
    echo "✅ firebase-config-local.js created"
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