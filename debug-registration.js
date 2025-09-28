// Debug and Clear Registration Data
// Run this in your browser console to troubleshoot registration issues

console.log('=== ARTHUB REGISTRATION DEBUG ===');

// Check if we're using Firebase or Demo mode
if (window.artHubClient) {
    console.log('Client type:', window.artHubClient.constructor.name);
    
    if (window.artHubClient.constructor.name === 'DemoArtHubClient') {
        console.log('=== DEMO MODE - localStorage Data ===');
        
        // Show current users in localStorage
        const users = JSON.parse(localStorage.getItem('demo_users') || '[]');
        console.log('Existing users:', users.map(u => u.username));
        
        // Clear all demo data (CAUTION: This will delete all your demo data)
        console.log('To clear all demo data, run: clearDemoData()');
        window.clearDemoData = function() {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('demo_')) {
                    localStorage.removeItem(key);
                }
            });
            localStorage.removeItem('arthub_user');
            localStorage.removeItem('arthub_token');
            console.log('✅ Demo data cleared! Refresh the page.');
        };
        
        // Check specific username
        window.checkUsername = function(username) {
            const users = JSON.parse(localStorage.getItem('demo_users') || '[]');
            const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
            console.log(`Username "${username}" exists:`, !!exists);
            if (exists) {
                console.log('Existing user data:', exists);
            }
        };
        
    } else if (window.artHubClient.constructor.name === 'FirebaseArtHubClient') {
        console.log('=== FIREBASE MODE ===');
        console.log('Check Firebase Console > Authentication and Firestore for existing users');
        console.log('Firebase project:', window.FIREBASE_PROJECT_ID || 'demo-project');
    }
} else {
    console.log('❌ ArtHub client not initialized');
}

console.log('=== Available Debug Commands ===');
console.log('- checkUsername("your-username") - Check if username exists');
console.log('- clearDemoData() - Clear all demo data (DEMO MODE ONLY)');
console.log('=================================');