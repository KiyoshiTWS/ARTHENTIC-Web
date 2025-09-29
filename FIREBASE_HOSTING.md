# Firebase Hosting Deployment

This project is configured for Firebase Hosting deployment.

## Setup Instructions

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase Hosting (if needed)
```bash
firebase init hosting
```
- Select your existing Firebase project (arthub-c46b2)
- Use "." as your public directory
- Configure as single-page app: Yes
- Don't overwrite index.html: No

### 4. Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

## Configuration

- **Public Directory**: `.` (root directory)
- **Single Page App**: Yes (rewrites all routes to index.html)
- **Cache Settings**: 
  - Static assets (JS, CSS, images): 1 year cache
  - HTML/JSON files: No cache (always fresh)

## Ignored Files

The following files/directories are excluded from deployment:
- Database files (*.db, *.sqlite)
- Environment files (.env*)
- Firebase config files (firebase-config-local.js)
- Development files (README.md, LICENSE)
- Git repository (.git, .github)
- Helper scripts (helpers/)

## Custom Domain (Optional)

After deployment, you can add a custom domain in Firebase Console:
1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow the DNS configuration instructions

## GitHub Actions Integration

The existing GitHub Actions workflow in `.github/workflows/pages.yml` can be modified to deploy to Firebase Hosting instead of GitHub Pages.