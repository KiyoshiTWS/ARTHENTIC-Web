// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  linkWithCredential,
  EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
  getFirestore, 
  initializeFirestore,
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  increment, 
  orderBy, 
  query, 
  limit,
  where,
  onSnapshot,
  serverTimestamp,
  getDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  enableNetwork,
  disableNetwork,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration - Using environment variables for security

// Check if configuration is loaded (optional external config)
if (window.FIREBASE_PROJECT_ID) {
  console.log('✅ External Firebase configuration detected');
  console.log('📊 Project ID:', window.FIREBASE_PROJECT_ID);
} else {
  console.log('✅ Using embedded Firebase configuration');
  console.log('📊 Project ID: arthub-c46b2');
}

// Connection resilience variables
let connectionRetryCount = 0;
const MAX_CONNECTION_RETRIES = 3;
let isReconnecting = false;
let connectionHealthTimer = null;

const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY || "AIzaSyB78EbKxjIxBPBudIHw6zVvfyVjZjMeDUk",
  authDomain: window.FIREBASE_AUTH_DOMAIN || "arthub-c46b2.firebaseapp.com", 
  projectId: window.FIREBASE_PROJECT_ID || "arthub-c46b2",
  storageBucket: window.FIREBASE_STORAGE_BUCKET || "arthub-c46b2.firebasestorage.app",
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "354841988675",
  appId: window.FIREBASE_APP_ID || "1:354841988675:web:9e62897abf73d69d3f8ef6",
  measurementId: window.FIREBASE_MEASUREMENT_ID || "G-QKFQXVBHFH"
};

console.log('🔧 Using Firebase configuration:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  fromWindow: !!window.FIREBASE_PROJECT_ID
});

// Initialize Firebase with comprehensive error handling
let app, db, auth;
let activeListeners = new Map(); // Track active listeners for cleanup
let isFirestoreHealthy = true;

try {
  app = initializeApp(firebaseConfig);
  
  // Initialize Firebase Authentication
  auth = getAuth(app);
  console.log('🔐 Firebase Authentication initialized');
  
  // Force long polling and add additional resilience settings
  try {
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false,
      ignoreUndefinedProperties: true // Prevent undefined field errors
    });
    console.log('✅ Firestore initialized with forced long polling and error resilience');
  } catch (error) {
    console.log('⚠️ Fallback to standard Firestore:', error);
    db = getFirestore(app);
  }
  
  // Add global error handler for unhandled Firestore errors
  window.addEventListener('unhandledrejection', handleUnhandledFirestoreError);
  window.addEventListener('error', handleFirestoreError);
  
  console.log('🔥 Firebase initialized successfully with connection resilience');
  console.log('🔥 Firebase app:', app);
  console.log('🔥 Firestore db:', db);
  
  // Start connection health monitoring after successful initialization
  startConnectionHealthMonitoring();
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  handleCriticalFirebaseError(error);
}

// Connection health monitoring functions
function startConnectionHealthMonitoring() {
  if (connectionHealthTimer) clearInterval(connectionHealthTimer);
  
  connectionHealthTimer = setInterval(async () => {
    try {
      if (db && !isReconnecting && isFirestoreHealthy) {
        // Lightweight connection check with timeout
        const healthCheckPromise = enableNetwork(db);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        );
        
        await Promise.race([healthCheckPromise, timeoutPromise]);
        
        // If we get here, connection is healthy
        if (connectionRetryCount > 0) {
          console.log('✅ Connection fully restored');
          connectionRetryCount = 0;
        }
      }
    } catch (error) {
      console.warn('🔄 Connection health check failed, attempting reconnection:', error);
      
      // Check for specific Firestore assertion failures
      if (error.message && error.message.includes('INTERNAL ASSERTION FAILED')) {
        isFirestoreHealthy = false;
        console.error('🚨 Firestore assertion failure in health check');
      }
      
      handleConnectionFailure();
    }
  }, 30000); // Check every 30 seconds
  
  console.log('🔍 Connection health monitoring started');
}

// Handle connection failures with exponential backoff
function handleConnectionFailure() {
  if (isReconnecting || connectionRetryCount >= MAX_CONNECTION_RETRIES) return;
  
  isReconnecting = true;
  connectionRetryCount++;
  
  const backoffDelay = Math.min(1000 * Math.pow(2, connectionRetryCount), 10000);
  
  console.log(`🔄 Attempting reconnection ${connectionRetryCount}/${MAX_CONNECTION_RETRIES} in ${backoffDelay}ms...`);
  
  setTimeout(async () => {
    try {
      if (db) {
        // Clean up existing listeners before reconnecting
        await cleanupActiveListeners();
        
        await disableNetwork(db);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Longer wait
        await enableNetwork(db);
        
        console.log('✅ Firebase connection restored');
        connectionRetryCount = 0;
        isReconnecting = false;
        isFirestoreHealthy = true;
        
        // Notify app to refresh data
        window.dispatchEvent(new CustomEvent('firestore-reconnected'));
      }
    } catch (error) {
      console.error('❌ Reconnection failed:', error);
      isReconnecting = false;
      
      if (connectionRetryCount >= MAX_CONNECTION_RETRIES) {
        console.warn('⚠️ Max reconnection attempts reached');
        handleCriticalFirebaseError(error);
      }
    }
  }, backoffDelay);
}

// Handle critical Firebase errors that require page refresh
function handleCriticalFirebaseError(error) {
  console.error('🚨 Critical Firebase error detected:', error);
  isFirestoreHealthy = false;
  
  // Show user-friendly error message
  if (typeof window !== 'undefined' && window.toast) {
    window.toast('Connection error detected. Please refresh the page if issues persist.', 'warning');
  }
  
  // Auto-refresh after critical errors (with user consent in production)
  if (connectionRetryCount >= MAX_CONNECTION_RETRIES) {
    setTimeout(() => {
      if (confirm('The application encountered a connection error. Would you like to refresh the page to restore functionality?')) {
        window.location.reload();
      }
    }, 5000);
  }
}

// Handle unhandled Firestore promise rejections
function handleUnhandledFirestoreError(event) {
  const error = event.reason;
  if (error && error.message && error.message.includes('FIRESTORE') && error.message.includes('INTERNAL ASSERTION FAILED')) {
    console.error('🚨 Firestore internal assertion failure detected:', error);
    event.preventDefault(); // Prevent default error logging
    
    isFirestoreHealthy = false;
    handleConnectionFailure();
    
    // Provide user feedback
    if (typeof window !== 'undefined' && window.toast) {
      window.toast('Temporary connection issue detected. Attempting to reconnect...', 'info');
    }
  }
}

// Handle synchronous Firestore errors
function handleFirestoreError(event) {
  const error = event.error;
  if (error && error.message && error.message.includes('FIRESTORE') && error.message.includes('INTERNAL ASSERTION FAILED')) {
    console.error('🚨 Firestore synchronous error detected:', error);
    event.preventDefault();
    
    isFirestoreHealthy = false;
    handleConnectionFailure();
  }
}

// Clean up active listeners to prevent memory leaks
async function cleanupActiveListeners() {
  console.log('🧹 Cleaning up active Firestore listeners...');
  
  for (const [key, unsubscribe] of activeListeners) {
    try {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    } catch (error) {
      console.warn(`⚠️ Error cleaning up listener ${key}:`, error);
    }
  }
  
  activeListeners.clear();
  console.log('✅ Active listeners cleaned up');
}

// Register a listener for cleanup
function registerListener(key, unsubscribe) {
  activeListeners.set(key, unsubscribe);
}

// Check if Firestore is healthy
function getFirestoreHealth() {
  return isFirestoreHealthy;
}

// Demo Mode localStorage Database Manager
class DemoArtHubClient {
  constructor() {
    this.currentUser = null;
    this.listeners = [];
  }

  // Demo localStorage helpers
  getCollection(name) {
    return JSON.parse(localStorage.getItem(`demo_${name}`) || '[]');
  }

  setCollection(name, data) {
    localStorage.setItem(`demo_${name}`, JSON.stringify(data));
    this.notifyListeners(name);
  }

  addToCollection(name, item) {
    const items = this.getCollection(name);
    const newItem = { id: Date.now().toString(), ...item, created_at: new Date() };
    items.unshift(newItem);
    this.setCollection(name, items);
    return newItem;
  }

  notifyListeners(collection) {
    this.listeners.forEach(listener => {
      if (listener.collection === collection) {
        listener.callback();
      }
    });
  }

  // Debug methods
  clearAllDemoData() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('demo_')) {
        localStorage.removeItem(key);
      }
    });
    localStorage.removeItem('arthub_user');
    localStorage.removeItem('arthub_token');
    console.log('✅ All demo data cleared');
  }

  checkUsernameExists(username) {
    const users = this.getCollection('users');
    // Case-insensitive check to prevent duplicates like "User" and "user"
    const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    console.log(`Username "${username}" exists:`, !!exists);
    if (exists) console.log('User data:', exists);
    return !!exists;
  }

  listAllUsers() {
    const users = this.getCollection('users');
    console.log('All registered users:', users.map(u => ({ username: u.username, email: u.email, id: u.id })));
    return users;
  }

  // User Management
  async loginUser(username, password) {
    const users = this.getCollection('users');
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
      if (user.email_verified === false) {
        throw new Error('Please verify your email before logging in. Check your email for verification link.');
      }
      
      this.currentUser = user;
      localStorage.setItem('arthub_user', JSON.stringify(user));
      localStorage.setItem('arthub_token', 'demo_token_' + user.id);
      return { success: true, user };
    }
    throw new Error('Invalid credentials');
  }

  async registerUser(username, email, password, requireEmailVerification = true) {
    const users = this.getCollection('users');
    
    // Case-insensitive check to prevent duplicates but preserve capitalization
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Username already exists');
    }

    const newUser = {
      id: Date.now().toString(),
      username, // Keep original capitalization
      email,
      password,
      profile_picture: null,
      followers: [],
      following: [],
      posts_count: 0,
      created_at: new Date(),
      email_verified: !requireEmailVerification, // Skip verification in demo mode
      verification_token: requireEmailVerification ? this.generateVerificationToken() : null,
      is_admin: username.toLowerCase() === 'kiyoshi'
    };

    users.push(newUser);
    this.saveCollection('users', users);
    
    // Send verification email if required
    if (requireEmailVerification && newUser.verification_token) {
      await this.sendVerificationEmail(email, newUser.verification_token);
    }
    
    // Only set current user if email verification is not required
    if (!requireEmailVerification) {
      this.currentUser = newUser;
      localStorage.setItem('arthub_user', JSON.stringify(newUser));
      localStorage.setItem('arthub_token', 'demo_token_' + newUser.id);
    }
    
    return { 
      success: true, 
      user: newUser, 
      requiresVerification: requireEmailVerification,
      message: requireEmailVerification ? 'Registration successful! Please check your email to verify your account.' : 'Registration successful!'
    };
  }

  saveCollection(name, data) {
    localStorage.setItem(`demo_${name}`, JSON.stringify(data));
    this.notifyListeners(name);
  }

  async resetPassword(email, newPassword) {
    const users = this.getCollection('users');
    const userIndex = users.findIndex(u => u.email === email);
    
    if (userIndex === -1) {
      return false; // User not found
    }

    // Update the user's password
    users[userIndex].password = newPassword;
    this.saveCollection('users', users);
    
    return true; // Success
  }

  getCurrentUser() {
    if (!this.currentUser) {
      const stored = localStorage.getItem('arthub_user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    }
    return this.currentUser;
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('arthub_user');
    localStorage.removeItem('arthub_token');
    this.listeners = [];
  }
  
  generateVerificationToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  
  async sendVerificationEmail(email, token) {
    // In a real implementation, this would send an actual email
    // For demo purposes, we'll just log it
    console.log(`Verification email would be sent to ${email} with token: ${token}`);
    console.log(`Verification link: ${window.location.origin}/verify-email?token=${token}`);
    return { success: true, message: 'Verification email sent (check console for demo link)' };
  }
  
  async verifyEmail(token) {
    const users = this.getCollection('users');
    const userIndex = users.findIndex(u => u.verification_token === token);
    
    if (userIndex === -1) {
      throw new Error('Invalid verification token');
    }
    
    users[userIndex].email_verified = true;
    users[userIndex].verification_token = null;
    this.saveCollection('users', users);
    
    return { success: true, message: 'Email verified successfully' };
  }

  async resetPassword(email, newPassword) {
    const users = this.getCollection('users');
    const userIndex = users.findIndex(u => u.email === email);
    
    if (userIndex === -1) {
      return false; // User not found
    }

    // Update the user's password
    users[userIndex].password = newPassword;
    this.saveCollection('users', users);
    
    return true; // Success
  }
  
  // Demo-specific methods for local storage operations
  async getSavesCount(postId) {
    const savedPosts = this.getCollection('saved_posts');
    return savedPosts.filter(sp => sp.post_id === postId).length;
  }
  
  async getCommentsCount(postId) {
    const comments = this.getCollection('comments');
    return comments.filter(c => c.post_id === postId).length;
  }
  
  async getApprovedContext(postId) {
    const contexts = this.getCollection('contexts');
    const approvedContext = contexts.find(c => 
      c.post_id === postId && 
      (c.admin_approved === true || c.approval_rate >= 90)
    );
    
    if (approvedContext) {
      return {
        id: approvedContext.id,
        text: approvedContext.text,
        approved: true,
        upvotes: approvedContext.upvotes || 0,
        downvotes: approvedContext.downvotes || 0,
        approval_rate: approvedContext.approval_rate || 0
      };
    }
    return null;
  }
  
  async addContext(postId, contextText) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    const context = {
      post_id: postId,
      user_id: this.currentUser.id,
      text: contextText,
      votes: [],
      upvotes: 0,
      downvotes: 0,
      approved: false,
      admin_approved: false
    };
    
    const newContext = this.addToCollection('contexts', context);
    return { success: true, id: newContext.id };
  }
  
  async voteOnContext(contextId, vote) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    const contexts = this.getCollection('contexts');
    const contextIndex = contexts.findIndex(c => c.id === contextId);
    
    if (contextIndex === -1) {
      throw new Error('Context not found');
    }
    
    const context = contexts[contextIndex];
    const votes = context.votes || [];
    const existingVoteIndex = votes.findIndex(v => v.user_id === this.currentUser.id);
    
    let newVotes = [...votes];
    let upvotes = context.upvotes || 0;
    let downvotes = context.downvotes || 0;
    
    // Remove existing vote if any
    if (existingVoteIndex !== -1) {
      const existingVote = votes[existingVoteIndex];
      if (existingVote.vote === 'up') upvotes--;
      if (existingVote.vote === 'down') downvotes--;
      newVotes.splice(existingVoteIndex, 1);
    }
    
    // Add new vote
    newVotes.push({ user_id: this.currentUser.id, vote });
    if (vote === 'up') upvotes++;
    if (vote === 'down') downvotes++;
    
    // Calculate approval rate
    const totalVotes = upvotes + downvotes;
    const approvalRate = totalVotes > 0 ? (upvotes / totalVotes) * 100 : 0;
    const approved = approvalRate >= 90;
    
    contexts[contextIndex] = {
      ...context,
      votes: newVotes,
      upvotes,
      downvotes,
      approved,
      approval_rate: approvalRate
    };
    
    this.setCollection('contexts', contexts);
    return { success: true, approved, approvalRate, upvotes, downvotes };
  }

  // Posts Management
  async createPost(text, imageData = null, context = null) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    const post = {
      user_id: this.currentUser.id,
      username: this.currentUser.username,
      profile_picture: this.currentUser.profile_picture,
      body: text,
      image_url: imageData,
      context: context,
      likes: [],
      like_count: 0,
      comment_count: 0,
      saves: [],
      created_at: new Date()
    };

    return this.addToCollection('posts', post);
  }

  // Get posts (non-realtime)
  async getPosts() {
    const posts = this.getCollection('posts').map(post => ({
      ...post,
      user_liked: post.likes?.includes(this.currentUser?.id) || false,
      user_saved: post.saves?.includes(this.currentUser?.id) || false
    }));
    return posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  subscribeToFeed(callback) {
    const updateFeed = () => {
      const posts = this.getCollection('posts').map(post => ({
        ...post,
        user_liked: post.likes?.includes(this.currentUser?.id) || false,
        user_saved: post.saves?.includes(this.currentUser?.id) || false
      }));
      callback(posts);
    };

    this.listeners.push({ collection: 'posts', callback: updateFeed });
    updateFeed(); // Initial load
    
    return () => {
      this.listeners = this.listeners.filter(l => l.callback !== updateFeed);
    };
  }

  async likePost(postId) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    const posts = this.getCollection('posts');
    const post = posts.find(p => p.id === postId);
    
    if (!post) throw new Error('Post not found');
    
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const isLiked = likes.includes(this.currentUser.id);
    
    if (isLiked) {
      post.likes = likes.filter(id => id !== this.currentUser.id);
      post.like_count = (post.like_count || 0) - 1;
    } else {
      post.likes = [...likes, this.currentUser.id];
      post.like_count = (post.like_count || 0) + 1;
      
      // Create notification
      if (post.user_id !== this.currentUser.id) {
        this.createNotification(post.user_id, 'like', `${this.currentUser.username} liked your post`, postId);
      }
    }
    
    this.setCollection('posts', posts);
    return { liked: !isLiked, count: post.like_count };
  }

  async savePost(postId) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    const posts = this.getCollection('posts');
    const post = posts.find(p => p.id === postId);
    
    if (!post) throw new Error('Post not found');
    
    const savedPosts = this.getCollection('saved_posts');
    const existingSave = savedPosts.find(sp => sp.user_id === this.currentUser.id && sp.post_id === postId);
    
    if (existingSave) {
      // Unsave - remove from saved_posts
      const updatedSavedPosts = savedPosts.filter(sp => 
        !(sp.user_id === this.currentUser.id && sp.post_id === postId)
      );
      this.setCollection('saved_posts', updatedSavedPosts);
      return { saved: false };
    } else {
      // Save - add to saved_posts
      const newSavedPost = {
        id: Date.now().toString(),
        user_id: this.currentUser.id,
        post_id: postId,
        saved_at: new Date().toISOString()
      };
      savedPosts.push(newSavedPost);
      this.setCollection('saved_posts', savedPosts);
      return { saved: true };
    }
  }

  // Get saved posts for current user
  async getSavedPosts() {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    const savedPosts = this.getCollection('saved_posts')
      .filter(savedPost => savedPost.user_id === this.currentUser.id)
      .sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
    
    const posts = this.getCollection('posts');
    
    return savedPosts
      .map(savedPost => {
        const post = posts.find(p => p.id === savedPost.post_id);
        if (!post) return null;
        
        return {
          ...post,
          user_liked: Array.isArray(post.likes) ? post.likes.includes(this.currentUser.id) : false,
          user_saved: true, // Always true since these are saved posts
          saved_at: savedPost.saved_at
        };
      })
      .filter(post => post !== null);
  }

  // Check if a post is saved by current user
  isPostSaved(postId) {
    if (!this.currentUser) return false;
    const posts = this.getCollection('posts');
    const post = posts.find(p => p.id === postId);
    if (!post) return false;
    const saves = Array.isArray(post.saves) ? post.saves : [];
    return saves.includes(this.currentUser.id);
  }

  // Comments Management
  async getComments(postId) {
    const comments = this.getCollection('comments');
    return comments.filter(c => c.post_id === postId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  async addComment(postId, text) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    const comment = {
      post_id: postId,
      user_id: this.currentUser.id,
      username: this.currentUser.username,
      profile_picture: this.currentUser.profile_picture,
      text: text,
      created_at: new Date()
    };

    const newComment = this.addToCollection('comments', comment);
    
    // Update post comment count
    const posts = this.getCollection('posts');
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.comment_count = (post.comment_count || 0) + 1;
      this.setCollection('posts', posts);
      
      // Create notification
      if (post.user_id !== this.currentUser.id) {
        this.createNotification(post.user_id, 'comment', `${this.currentUser.username} commented on your post`, postId);
      }
    }

    return newComment;
  }

  // Notifications
  async createNotification(userId, type, message, relatedId = null) {
    const notification = {
      user_id: userId,
      type: type,
      message: message,
      related_id: relatedId,
      read: false,
      created_at: new Date()
    };

    this.addToCollection('notifications', notification);
  }

  async getNotifications() {
    if (!this.currentUser) return [];
    
    const notifications = this.getCollection('notifications');
    return notifications
      .filter(n => n.user_id === this.currentUser.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 50);
  }

  // Utility functions
  formatTimeAgo(date) {
    if (!date) return 'just now';
    
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000);
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return Math.floor(diff / 604800) + 'w';
  }

  async getSuggestedUsers() {
    const users = this.getCollection('users');
    return users.filter(u => u.id !== this.currentUser?.id).slice(0, 5);
  }
  
  // Update username with cooldown and alias tracking
  async updateUsername(userId, newUsername) {
    const users = this.getCollection('users');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    const user = users[userIndex];
    
    // Check cooldown (1 week)
    if (user.lastUsernameChange) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const lastChange = new Date(user.lastUsernameChange);
      
      if (lastChange > weekAgo) {
        throw new Error('You can only change your username once per week');
      }
    }
    
    // Check if username is taken
    const existingUser = users.find(u => u.username === newUsername && u.id !== userId);
    if (existingUser) {
      throw new Error('Username is already taken');
    }
    
    // Add old username to alias history
    if (!user.previousUsernames) {
      user.previousUsernames = [];
    }
    
    if (user.username !== newUsername) {
      user.previousUsernames.unshift({
        username: user.username,
        changedAt: new Date().toISOString()
      });
      
      // Keep only last 10 aliases
      user.previousUsernames = user.previousUsernames.slice(0, 10);
    }
    
    // Update username and timestamp
    user.username = newUsername;
    user.lastUsernameChange = new Date().toISOString();
    
    users[userIndex] = user;
    this.setCollection('users', users);
    
    // Update current user if it's the same
    if (this.currentUser && this.currentUser.id === userId) {
      this.currentUser = user;
      localStorage.setItem('arthub_user', JSON.stringify(user));
    }
    
    return user;
  }
  
  // Clear alias history
  async clearAliasHistory(userId) {
    const users = this.getCollection('users');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    users[userIndex].previousUsernames = [];
    this.setCollection('users', users);
    
    return true;
  }
  
  // Update about me
  async updateAboutMe(userId, aboutMe) {
    const users = this.getCollection('users');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    users[userIndex].aboutMe = aboutMe.substring(0, 500); // Limit to 500 characters
    this.setCollection('users', users);
    
    // Update current user if it's the same
    if (this.currentUser && this.currentUser.id === userId) {
      this.currentUser.aboutMe = aboutMe;
      localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
    }
    
    return users[userIndex];
  }
  
  // Get user stats
  async getUserStats(userId) {
    const posts = this.getCollection('posts');
    const userPosts = posts.filter(p => p.author === userId);
    
    let likesReceived = 0;
    userPosts.forEach(post => {
      likesReceived += (post.likes || []).length;
    });
    
    return {
      postCount: userPosts.length,
      likesReceived,
      followers: 0 // Could implement following system
    };
  }
  
  // Admin Methods
  async getPendingContexts() {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    const contexts = this.getCollection('contexts');
    return contexts.filter(c => c.admin_approved !== true).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  
  async adminApproveContext(contextId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    const contexts = this.getCollection('contexts');
    const contextIndex = contexts.findIndex(c => c.id === contextId);
    
    if (contextIndex === -1) {
      throw new Error('Context not found');
    }
    
    contexts[contextIndex] = {
      ...contexts[contextIndex],
      admin_approved: true,
      admin_reviewed_at: new Date().toISOString(),
      admin_reviewed_by: this.currentUser.id
    };
    
    this.setCollection('contexts', contexts);
    return { success: true };
  }
  
  async adminRejectContext(contextId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    const contexts = this.getCollection('contexts');
    const contextIndex = contexts.findIndex(c => c.id === contextId);
    
    if (contextIndex === -1) {
      throw new Error('Context not found');
    }
    
    contexts[contextIndex] = {
      ...contexts[contextIndex],
      admin_approved: false,
      admin_reviewed_at: new Date().toISOString(),
      admin_reviewed_by: this.currentUser.id
    };
    
    this.setCollection('contexts', contexts);
    return { success: true };
  }
  
  async adminRemovePost(postId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    const posts = this.getCollection('posts');
    const postIndex = posts.findIndex(p => p.id === postId);
    
    if (postIndex === -1) {
      throw new Error('Post not found');
    }
    
    posts[postIndex] = {
      ...posts[postIndex],
      admin_removed: true,
      admin_removed_at: new Date().toISOString(),
      admin_removed_by: this.currentUser.id,
      visibility: 'removed'
    };
    
    this.setCollection('posts', posts);
    this.notifyListeners('posts');
    return { success: true };
  }
  
  async adminBanUser(userId, reason) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    const users = this.getCollection('users');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    users[userIndex] = {
      ...users[userIndex],
      banned: true,
      banned_at: new Date().toISOString(),
      banned_by: this.currentUser.id,
      ban_reason: reason
    };
    
    this.setCollection('users', users);
    
    // Hide all posts by this user
    const posts = this.getCollection('posts');
    const updatedPosts = posts.map(post => {
      if (post.author === userId || post.user_id === userId) {
        return {
          ...post,
          visibility: 'hidden',
          hidden_reason: 'User banned'
        };
      }
      return post;
    });
    
    this.setCollection('posts', updatedPosts);
    this.notifyListeners('posts');
    return { success: true };
  }
  
  async getPostContextSubmissions(postId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    const contexts = this.getCollection('contexts');
    return contexts
      .filter(c => c.post_id === postId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  
  // Delete comment (comment owner or admin)
  async deleteComment(commentId) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    const comments = this.getCollection('comments');
    const commentIndex = comments.findIndex(c => c.id === commentId);
    
    if (commentIndex === -1) {
      throw new Error('Comment not found');
    }
    
    const comment = comments[commentIndex];
    
    // Check if user owns the comment or is admin
    if (comment.user_id !== this.currentUser.id && 
        !this.currentUser.is_admin && 
        this.currentUser.username !== 'Kiyoshi') {
      throw new Error('You can only delete your own comments');
    }
    
    // Remove comment
    comments.splice(commentIndex, 1);
    this.setCollection('comments', comments);
    
    // Update post comment count
    const posts = this.getCollection('posts');
    const post = posts.find(p => p.id === comment.post_id);
    if (post) {
      post.comment_count = Math.max((post.comment_count || 0) - 1, 0);
      this.setCollection('posts', posts);
    }
    
    return { success: true };
  }

  async getTrendingTags(limit = 15) {
    console.log('💾 DemoArtHubClient.getTrendingTags() called');
    try {
      const posts = this.getCollection('posts');
      console.log('💾 Got', posts.length, 'posts from localStorage');
      
      const tagCounts = {};
      const tagOriginalCase = {}; // Store original case for display
      
      posts.forEach((post, index) => {
        console.log(`💾 Processing post ${index + 1}:`, post.id, 'tags:', post.tags);
        if (post.tags && Array.isArray(post.tags)) {
          post.tags.forEach(tag => {
            if (tag && typeof tag === 'string' && tag.trim()) {
              const normalizedTag = tag.trim().toLowerCase();
              // Keep the original case of the first occurrence for display
              if (!tagOriginalCase[normalizedTag]) {
                tagOriginalCase[normalizedTag] = tag.trim();
              }
              tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + 1;
            }
          });
        }
      });
      
      console.log('💾 Tag counts:', tagCounts);
      
      // Sort tags by usage count and return the most popular ones
      const result = Object.entries(tagCounts)
        .filter(([tag, count]) => count >= 1) // Show tags used at least once
        .sort(([,a], [,b]) => b - a)
        .slice(0, limit)
        .map(([tag, count]) => ({
          tag: tagOriginalCase[tag],
          count: count,
          normalizedTag: tag
        }));
        
      console.log('💾 Final trending tags result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error in Demo getTrendingTags:', error);
      throw new Error('Failed to get trending tags: ' + error.message);
    }
  }
}

// Firebase Database Manager
class FirebaseArtHubClient {
  constructor() {
    if (!db) {
      throw new Error('Firestore database not initialized');
    }
    this.db = db;
    this.auth = auth;  // Available but not required
    this.currentUser = null;
    this.unsubscribers = [];
    
    // Try to use Firebase Auth if configured, otherwise use localStorage
    if (auth) {
      try {
        onAuthStateChanged(this.auth, async (firebaseUser) => {
          if (firebaseUser) {
            console.log('🔐 User authenticated:', firebaseUser.uid);
            try {
              const userDoc = await getDoc(doc(this.db, 'users', firebaseUser.uid));
              if (userDoc.exists()) {
                this.currentUser = {
                  id: firebaseUser.uid,
                  email: firebaseUser.email,
                  ...userDoc.data()
                };
                localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
                window.dispatchEvent(new CustomEvent('authStateChanged', { 
                  detail: { user: this.currentUser } 
                }));
              }
            } catch (error) {
              console.error('Error loading user data:', error);
            }
          } else {
            console.log('🔐 User signed out');
            this.currentUser = null;
          }
        });
      } catch (error) {
        console.log('⚠️ Firebase Auth not configured, using localStorage auth');
      }
    }
  }

  // User Management - Works with or without Firebase Auth
  async loginUser(username, password) {
    try {
      if (!username || !password) {
        throw new Error('Please enter username and password');
      }

      console.log('🔐 Attempting login for:', username);

      // First, check if user exists and has localStorage auth (password field)
      const usersRef = collection(this.db, 'users');
      let q, querySnapshot;
      
      // Check if username is email or username
      if (username.includes('@')) {
        q = query(usersRef, where('email', '==', username));
      } else {
        q = query(usersRef, where('username', '==', username));
      }
      
      querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error('Invalid username or password');
      }

      const userData = querySnapshot.docs[0].data();
      const userId = querySnapshot.docs[0].id;
      
      // If user has password field, use localStorage auth
      if (userData.password) {
        if (userData.password === password) {
          this.currentUser = { id: userId, ...userData };
          localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
          localStorage.setItem('arthub_token', 'firebase_token_' + this.currentUser.id);
          console.log('✅ User logged in with localStorage auth:', this.currentUser.username);
          return { success: true, user: this.currentUser };
        } else {
          throw new Error('Invalid username or password');
        }
      }
      
      // If no password field, try Firebase Auth
      if (this.auth && auth) {
        try {
          const userEmail = userData.email;
          const userCredential = await signInWithEmailAndPassword(this.auth, userEmail, password);
          const firebaseUser = userCredential.user;
          
          this.currentUser = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            username: userData.username,
            ...userData
          };
          
          localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
          localStorage.setItem('arthub_token', await firebaseUser.getIdToken());
          
          console.log('✅ User logged in with Firebase Auth:', this.currentUser.username);
          return { success: true, user: this.currentUser };
        } catch (authError) {
          console.error('❌ Firebase Auth error:', authError.code);
          throw new Error('Invalid username or password');
        }
      }
      
      // No valid auth method
      throw new Error('Invalid username or password');
    } catch (error) {
      console.error('Login error:', error);
      if (error.message.includes('Invalid username or password')) {
        throw error;
      }
      throw new Error('Login failed: ' + error.message);
    }
  }

  async registerUser(username, email, password, useFirebaseAuth = true) {
    try {
      if (!username || username.length < 3) {
        throw new Error('Username must be at least 3 characters');
      }
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      
      console.log('📝 Registering new user:', username, '| Firebase Auth:', useFirebaseAuth);
      
      const usersRef = collection(this.db, 'users');
      const allUsersSnapshot = await getDocs(usersRef);
      const usernameLower = username.toLowerCase();
      const emailLower = email.toLowerCase();
      
      // Check if username exists
      const usernameExists = allUsersSnapshot.docs.some(doc => 
        doc.data().username.toLowerCase() === usernameLower
      );
      
      if (usernameExists) {
        throw new Error('Username already taken');
      }

      // Check if email exists
      const emailExists = allUsersSnapshot.docs.some(doc => 
        doc.data().email.toLowerCase() === emailLower
      );
      
      if (emailExists) {
        throw new Error('Email already registered');
      }

      // NEW USERS: Use Firebase Auth (recommended)
      if (useFirebaseAuth && this.auth && auth) {
        try {
          console.log('🔐 Creating Firebase Auth account for:', email);
          const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
          const firebaseUser = userCredential.user;
          
          await updateProfile(firebaseUser, { displayName: username });

          const newUser = {
            username,
            email,
            profile_picture: null,
            about_me: '',
            is_premium: false,
            followers: [],
            following: [],
            posts_count: 0,
            auth_type: 'firebase_auth', // Mark as Firebase Auth user
            created_at: serverTimestamp()
          };

          // Use Firebase UID as document ID for Firebase Auth users
          await setDoc(doc(this.db, 'users', firebaseUser.uid), newUser);
          
          this.currentUser = { 
            id: firebaseUser.uid, 
            email: firebaseUser.email,
            auth_type: 'firebase_auth',
            ...newUser 
          };
          
          localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
          localStorage.setItem('arthub_token', await firebaseUser.getIdToken());
          localStorage.setItem('arthub_auth_type', 'firebase_auth');
          
          console.log('✅ New user registered with Firebase Auth:', this.currentUser.username);
          console.log('📊 User document created with ID:', firebaseUser.uid);
          return { success: true, user: this.currentUser };
        } catch (authError) {
          console.error('❌ Firebase Auth registration failed:', authError.code, authError.message);
          
          // If Firebase Auth fails, inform user
          if (authError.code === 'auth/email-already-in-use') {
            throw new Error('Email already in use. Please try logging in instead.');
          }
          
          throw new Error('Registration failed: ' + authError.message);
        }
      }

      // FALLBACK: LocalStorage auth (for compatibility or if Firebase Auth unavailable)
      console.log('⚠️ Using localStorage auth for registration');
      const newUser = {
        username,
        email,
        password, // Store password hash in production!
        profile_picture: null,
        about_me: '',
        is_premium: false,
        followers: [],
        following: [],
        posts_count: 0,
        auth_type: 'localStorage', // Mark as localStorage user
        created_at: serverTimestamp()
      };

      const docRef = await addDoc(usersRef, newUser);
      this.currentUser = { id: docRef.id, auth_type: 'localStorage', ...newUser };
      localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
      localStorage.setItem('arthub_token', 'firebase_token_' + this.currentUser.id);
      localStorage.setItem('arthub_auth_type', 'localStorage');
      
      console.log('✅ User registered with localStorage auth:', this.currentUser.username);
      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }
  
  async logoutUser() {
    try {
      if (this.auth && auth) {
        try {
          await signOut(this.auth);
        } catch (e) {
          console.log('Firebase Auth signout skipped');
        }
      }
      this.currentUser = null;
      localStorage.removeItem('arthub_user');
      localStorage.removeItem('arthub_token');
      console.log('✅ User logged out successfully');
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      throw new Error('Logout failed: ' + error.message);
    }
  }

  // Google Sign-In
  async loginWithGoogle() {
    try {
      console.log('🔐 Attempting Google Sign-In...');
      console.log('🔐 Auth instance:', this.auth ? 'Available' : 'NOT Available');
      console.log('🔐 Global auth:', typeof auth !== 'undefined' ? 'Available' : 'NOT Available');
      
      if (!this.auth && !auth) {
        throw new Error('Firebase Authentication not configured. Please enable Firebase Auth in Console.');
      }

      const authInstance = this.auth || auth;
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      
      console.log('🔐 Opening Google Sign-In popup...');
      const result = await signInWithPopup(authInstance, provider);
      const firebaseUser = result.user;
      
      console.log('✅ Google Sign-In successful:', firebaseUser.email);
      
      // Check if user document exists
      const userDocRef = doc(this.db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.log('📝 Creating new user document...');
        // Create new user document
        const newUser = {
          username: firebaseUser.displayName || firebaseUser.email.split('@')[0],
          email: firebaseUser.email,
          profile_picture: firebaseUser.photoURL,
          about_me: '',
          is_premium: false,
          followers: [],
          following: [],
          posts_count: 0,
          auth_provider: 'google',
          auth_type: 'firebase_auth',
          created_at: serverTimestamp()
        };
        
        await setDoc(userDocRef, newUser);
        
        this.currentUser = {
          id: firebaseUser.uid,
          ...newUser
        };
      } else {
        console.log('✅ User document found');
        this.currentUser = {
          id: firebaseUser.uid,
          ...userDoc.data()
        };
      }
      
      localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
      localStorage.setItem('arthub_token', await firebaseUser.getIdToken());
      localStorage.setItem('arthub_auth_type', 'firebase_auth');
      
      console.log('✅ User logged in with Google:', this.currentUser.username);
      
      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('❌ Google login error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelled');
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup blocked. Please allow popups for this site.');
      } else if (error.message.includes('not configured')) {
        throw error; // Re-throw our custom error
      } else {
        throw new Error('Google login failed: ' + error.message);
      }
    }
  }

  // Facebook Login
  async loginWithFacebook() {
    try {
      if (!this.auth) {
        throw new Error('Firebase Authentication not configured');
      }

      const provider = new FacebookAuthProvider();
      provider.addScope('email');
      provider.addScope('public_profile');
      
      const result = await signInWithPopup(this.auth, provider);
      const firebaseUser = result.user;
      
      // Check if user document exists
      const userDocRef = doc(this.db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // Create new user document
        const newUser = {
          username: firebaseUser.displayName || firebaseUser.email.split('@')[0],
          email: firebaseUser.email,
          profile_picture: firebaseUser.photoURL,
          about_me: '',
          is_premium: false,
          followers: [],
          following: [],
          posts_count: 0,
          auth_provider: 'facebook',
          created_at: serverTimestamp()
        };
        
        await setDoc(userDocRef, newUser);
        
        this.currentUser = {
          id: firebaseUser.uid,
          ...newUser
        };
      } else {
        this.currentUser = {
          id: firebaseUser.uid,
          ...userDoc.data()
        };
      }
      
      localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
      localStorage.setItem('arthub_token', await firebaseUser.getIdToken());
      
      console.log('✅ User logged in with Facebook:', this.currentUser.username);
      
      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Facebook login error:', error);
      
      if (error.code === 'auth/account-exists-with-different-credential') {
        throw new Error('An account already exists with this email using a different sign-in method.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelled');
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup blocked. Please allow popups for this site.');
      } else {
        throw new Error('Facebook login failed: ' + error.message);
      }
    }
  }

  getCurrentUser() {
    // Return current user from localStorage
    if (!this.currentUser) {
      const stored = localStorage.getItem('arthub_user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    }
    return this.currentUser;
  }

  async updateUserProfile(updates) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      // Handle profile picture compression if needed
      if (updates.profile_picture && typeof updates.profile_picture === 'string') {
        // Calculate actual data URL size (more accurate than Blob calculation)
        const sizeInBytes = this.getDataUrlSize(updates.profile_picture);
        
        // Firestore has a 1MB limit per field, be very aggressive with compression
        if (sizeInBytes > 400000) { // 400KB threshold for maximum safety
          console.log('🗜️ Compressing profile picture from', (sizeInBytes / 1024).toFixed(1), 'KB');
          updates.profile_picture = await this.smartCompressImage(updates.profile_picture, 350000); // Target 350KB max
          const newSize = this.getDataUrlSize(updates.profile_picture);
          console.log('✅ Compressed to', (newSize / 1024).toFixed(1), 'KB');
        }
      }
      
      // Split large updates into smaller chunks if needed
      const updateChunks = this.splitLargeUpdate(updates);
      
      for (const chunk of updateChunks) {
        await updateDoc(doc(this.db, 'users', this.currentUser.id), chunk);
      }
      
      // Update local user object
      this.currentUser = { ...this.currentUser, ...updates };
      
      // Update localStorage
      localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
      
      return this.currentUser;
    } catch (error) {
      if (error.message.includes('INTERNAL ASSERTION FAILED') || error.message.includes('longer than') || error.message.includes('1048487 bytes')) {
        // Handle Firestore size limit errors
        console.error('🚨 Firestore size limit error, applying emergency compression...');
        if (updates.profile_picture) {
        // Emergency compression - ultra aggressive settings
        console.log('� Applying ULTRA emergency compression...');
        updates.profile_picture = await this.smartCompressImage(updates.profile_picture, 200000); // Target 200KB max
        const finalSize = this.getDataUrlSize(updates.profile_picture);
        console.log('⚡ Ultra compressed to', (finalSize / 1024).toFixed(1), 'KB');          // Retry the update
          return this.updateUserProfile(updates);
        }
      }
      throw new Error('Failed to update user profile: ' + error.message);
    }
  }
  
  // Helper method to split large updates
  splitLargeUpdate(updates) {
    const chunks = [];
    const maxChunkSize = 500000; // 500KB per chunk
    
    for (const [key, value] of Object.entries(updates)) {
      const valueSize = new Blob([JSON.stringify(value)]).size;
      
      if (valueSize > maxChunkSize) {
        // Handle large fields separately
        chunks.push({ [key]: value });
      } else {
        // Group small fields together
        if (chunks.length === 0 || Object.keys(chunks[chunks.length - 1]).length > 5) {
          chunks.push({});
        }
        chunks[chunks.length - 1][key] = value;
      }
    }
    
    return chunks.length > 0 ? chunks : [updates];
  }
  
  // Calculate accurate data URL size
  getDataUrlSize(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    
    // Remove data URL header to get just the base64 data
    const base64Data = dataUrl.split(',')[1] || dataUrl;
    
    // Calculate size: each base64 character represents 6 bits
    // 4 base64 characters = 3 bytes, so: length * 3/4
    const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);
    
    return sizeInBytes;
  }

  // Smart image compression that iteratively reduces size until target is met
  async smartCompressImage(dataUrl, targetSizeBytes = 400000) {
    let currentImage = dataUrl;
    let currentSize = this.getDataUrlSize(currentImage);
    
    console.log('🎯 Target size:', (targetSizeBytes / 1024).toFixed(1), 'KB');
    console.log('📏 Starting size:', (currentSize / 1024).toFixed(1), 'KB');
    
    // More aggressive compression parameters
    const compressionSteps = [
      { quality: 0.7, maxDimension: 600 },
      { quality: 0.5, maxDimension: 400 },
      { quality: 0.3, maxDimension: 300 },
      { quality: 0.2, maxDimension: 250 },
      { quality: 0.15, maxDimension: 200 },
      { quality: 0.1, maxDimension: 150 },
      { quality: 0.05, maxDimension: 120 }
    ];
    
    for (const step of compressionSteps) {
      if (currentSize <= targetSizeBytes) {
        console.log('✅ Target size achieved:', (currentSize / 1024).toFixed(1), 'KB');
        break;
      }
      
      console.log(`🔄 Trying quality: ${step.quality}, dimension: ${step.maxDimension}px`);
      currentImage = await this.compressImageData(currentImage, step.quality, step.maxDimension);
      currentSize = this.getDataUrlSize(currentImage);
      console.log(`📏 Current size: ${(currentSize / 1024).toFixed(1)}KB`);
    }
    
    // Final check - if still too large, apply ULTRA extreme compression
    if (currentSize > targetSizeBytes) {
      console.log('🚨 Applying ULTRA extreme compression...');
      currentImage = await this.compressImageData(currentImage, 0.02, 100); // 2% quality, 100px max
      currentSize = this.getDataUrlSize(currentImage);
      console.log(`⚡ Ultra final size: ${(currentSize / 1024).toFixed(1)}KB`);
      
      // If STILL too large, apply nuclear compression
      if (currentSize > targetSizeBytes) {
        console.log('☢️ Applying nuclear compression (last resort)...');
        currentImage = await this.compressImageData(currentImage, 0.01, 80); // 1% quality, 80px max
        currentSize = this.getDataUrlSize(currentImage);
        console.log(`☢️ Nuclear size: ${(currentSize / 1024).toFixed(1)}KB`);
      }
    }
    
    return currentImage;
  }

  // Enhanced image compression
  async compressImageData(dataUrl, quality = 0.7, maxDimension = 512) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        const aspectRatio = width / height;
        
        // More intelligent resizing based on aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            width = maxDimension;
            height = Math.round(width / aspectRatio);
          } else {
            height = maxDimension;
            width = Math.round(height * aspectRatio);
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        // Always use JPEG for profile pictures (smaller file size)
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      
      img.onerror = () => {
        console.error('Failed to load image for compression');
        resolve(dataUrl); // Return original on error
      };
      
      img.src = dataUrl;
    });
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('arthub_user');
    localStorage.removeItem('arthub_token');
    // Unsubscribe from real-time listeners
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
  }
  
  async getSavesCount(postId) {
    try {
      const savedPostsRef = collection(this.db, 'saved_posts');
      const q = query(savedPostsRef, where('post_id', '==', postId));
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.warn('Failed to get saves count:', error);
      return 0;
    }
  }
  
  async getCommentsCount(postId) {
    try {
      const commentsRef = collection(this.db, 'comments');
      const q = query(commentsRef, where('post_id', '==', postId));
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.warn('Failed to get comments count:', error);
      return 0;
    }
  }
  
  async getApprovedContext(postId) {
    try {
      const contextsRef = collection(this.db, 'contexts');
      const q = query(contextsRef, where('post_id', '==', postId));
      const snapshot = await getDocs(q);
      
      console.log(`Firebase: Checking contexts for post ${postId}, found ${snapshot.size} contexts`);
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`Context ${doc.id}:`, data);
      });
      
      // Find the first context that meets approval criteria
      for (const doc of snapshot.docs) {
        const contextData = doc.data();
        const isApproved = contextData.approved === true || 
                          contextData.admin_approved === true || 
                          (contextData.approval_rate && contextData.approval_rate >= 90);
        
        if (isApproved) {
          console.log('Firebase: Found approved context for post:', postId, contextData);
          return {
            id: doc.id,
            text: contextData.text || contextData.content,
            approved: true,
            upvotes: contextData.upvotes || 0,
            downvotes: contextData.downvotes || 0,
            approval_rate: contextData.approval_rate || 0
          };
        }
      }
      return null;
    } catch (error) {
      console.warn('Failed to get approved context:', error);
      return null;
    }
  }
  
  async addContext(postId, contextText) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    try {
      console.log('Firebase: Adding context with post_id:', postId, 'type:', typeof postId);
      // Add context to contexts collection
      const contextRef = await addDoc(collection(this.db, 'contexts'), {
        post_id: postId,
        user_id: this.currentUser.id,
        text: contextText,
        created_at: serverTimestamp(),
        votes: [],
        upvotes: 0,
        downvotes: 0,
        approved: false
      });
      
      return { success: true, id: contextRef.id };
    } catch (error) {
      console.error('Error adding context:', error);
      throw new Error('Failed to add context: ' + error.message);
    }
  }
  
  async voteOnContext(contextId, vote) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    try {
      const contextRef = doc(this.db, 'contexts', contextId);
      const contextSnap = await getDoc(contextRef);
      
      if (!contextSnap.exists()) {
        throw new Error('Context not found');
      }
      
      const contextData = contextSnap.data();
      const votes = contextData.votes || [];
      const existingVoteIndex = votes.findIndex(v => v.user_id === this.currentUser.id);
      
      let newVotes = [...votes];
      let upvotes = contextData.upvotes || 0;
      let downvotes = contextData.downvotes || 0;
      
      // Remove existing vote if any
      if (existingVoteIndex !== -1) {
        const existingVote = votes[existingVoteIndex];
        if (existingVote.vote === 'up') upvotes--;
        if (existingVote.vote === 'down') downvotes--;
        newVotes.splice(existingVoteIndex, 1);
      }
      
      // Add new vote
      newVotes.push({ user_id: this.currentUser.id, vote });
      if (vote === 'up') upvotes++;
      if (vote === 'down') downvotes++;
      
      // Calculate approval rate
      const totalVotes = upvotes + downvotes;
      const approvalRate = totalVotes > 0 ? (upvotes / totalVotes) * 100 : 0;
      const approved = approvalRate >= 90; // 90% approval threshold
      
      await updateDoc(contextRef, {
        votes: newVotes,
        upvotes,
        downvotes,
        approved,
        approval_rate: approvalRate
      });
      
      return { success: true, approved, approvalRate, upvotes, downvotes };
    } catch (error) {
      console.error('Error voting on context:', error);
      throw new Error('Failed to vote on context: ' + error.message);
    }
  }

  // Posts Management with connection resilience
  async createPost(text, imageData = null, context = null, tags = [], isNSFW = false) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    return await this.executeWithRetry(async () => {
      // Support both single image (string) and multiple images (array)
      let imageUrl = null;
      let imageUrls = [];
      
      if (imageData) {
        if (Array.isArray(imageData)) {
          // Multiple images
          imageUrls = imageData;
          imageUrl = imageData[0]; // Keep first image for backward compatibility
        } else {
          // Single image
          imageUrl = imageData;
          imageUrls = [imageData];
        }
      }
      
      const post = {
        user_id: this.currentUser.id,
        username: this.currentUser.username,
        profile_picture: this.currentUser.profile_picture,
        body: text,
        image_url: imageUrl, // First image for backward compatibility
        image_urls: imageUrls, // Array of all images
        context: context,
        tags: tags || [],
        is_nsfw: isNSFW,
        likes: [],
        like_count: 0,
        comment_count: 0,
        saves: [],
        created_at: serverTimestamp()
      };

      const docRef = await addDoc(collection(this.db, 'posts'), post);
      
      // Update user's post count
      await updateDoc(doc(this.db, 'users', this.currentUser.id), {
        posts_count: increment(1)
      });

      // Notify followers about new post
      await this.notifyFollowersOfNewPost(docRef.id, this.currentUser.id, text);

      return { id: docRef.id, ...post };
    });
  }

  // Real-time posts listener with connection resilience
  subscribeToFeed(callback) {
    const postsRef = collection(this.db, 'posts');
    const q = query(postsRef, orderBy('created_at', 'desc'), limit(50));
    
    // Create a resilient wrapper with error boundaries
    const createResilientListener = () => {
      try {
        const unsubscriber = onSnapshot(q, 
          // Success callback with error boundaries
          async (snapshot) => {
            try {
              // Only process server data to avoid duplicates during reconnection
              if (!snapshot.metadata.hasPendingWrites) {
                const posts = [];
                
                // Get all saved post IDs for current user
                let savedPostIds = [];
                if (this.currentUser) {
                  try {
                    const savedPostsRef = collection(this.db, 'saved_posts');
                    const savedQuery = query(savedPostsRef, where('user_id', '==', this.currentUser.id));
                    const savedSnapshot = await getDocs(savedQuery);
                    savedPostIds = savedSnapshot.docs.map(doc => doc.data().post_id);
                  } catch (error) {
                    console.warn('Failed to load saved posts for feed:', error);
                  }
                }
                
                for (const doc of snapshot.docs) {
                  try {
                    const data = doc.data();
                    
                    // Calculate counts with error handling
                    const likesCount = data.likes?.length || 0;
                    const savesCount = await this.getSavesCount(doc.id).catch(() => 0);
                    const commentsCount = await this.getCommentsCount(doc.id).catch(() => 0);
                    
                    // Get approved context with error handling
                    const context = await this.getApprovedContext(doc.id).catch(() => []);
                    
                    // Get 3 most recent comments for Facebook-style display
                    const recent_comments = await this.getRecentComments(doc.id, 3).catch(() => []);
                    
                    posts.push({
                      id: doc.id,
                      ...data,
                      created_at: data.created_at?.toDate?.() || new Date(),
                      user_liked: data.likes?.includes(this.currentUser?.id) || false,
                      user_saved: savedPostIds.includes(doc.id),
                      likes_count: likesCount,
                      saves_count: savesCount,
                      comments_count: commentsCount,
                      context: context,
                      recent_comments: recent_comments
                    });
                  } catch (docError) {
                    console.warn(`Error processing post ${doc.id}:`, docError);
                    // Continue processing other posts
                  }
                }
                
                callback(posts);
              }
            } catch (snapshotError) {
              console.error('Error in feed snapshot handler:', snapshotError);
              
              // Check for internal assertion failures
              if (this.isInternalAssertionFailure(snapshotError)) {
                console.log('🔄 Internal assertion failure detected, attempting recovery...');
                this.handleInternalAssertionFailure('subscribeToFeed', createResilientListener);
                return;
              }
              
              // Try to provide empty feed on error rather than crash
              callback([]);
            }
          },
          // Error callback with comprehensive recovery
          (error) => {
            console.error('📡 Feed subscription error:', error);
            
            // Check for internal assertion failures first
            if (this.isInternalAssertionFailure(error)) {
              console.log('🔄 Internal assertion failure in feed subscription, attempting recovery...');
              this.handleInternalAssertionFailure('subscribeToFeed', createResilientListener);
              return;
            }
            
            // Handle connection errors
            if (this.isConnectionError(error)) {
              console.log('🔄 Connection error in feed subscription, attempting reconnection...');
              handleConnectionFailure();
              
              // Retry subscription after exponential backoff
              const retryDelay = Math.min(5000 * Math.pow(2, this.retryCount || 0), 30000);
              setTimeout(() => {
                if (!isReconnecting && this.getFirestoreHealth()) {
                  console.log(`🔄 Retrying feed subscription after ${retryDelay}ms...`);
                  this.subscribeToFeed(callback);
                }
              }, retryDelay);
            } else {
              // Log unhandled errors but don't crash
              console.error('Unhandled feed subscription error:', error);
              this.handleUnhandledFirestoreError(error, 'subscribeToFeed');
            }
          }
        );

        this.unsubscribers.push(unsubscriber);
        registerListener('feedSubscription', unsubscriber);
        return unsubscriber;
      } catch (creationError) {
        console.error('Error creating feed listener:', creationError);
        
        if (this.isInternalAssertionFailure(creationError)) {
          this.handleInternalAssertionFailure('subscribeToFeed', createResilientListener);
          return null;
        }
        
        throw creationError;
      }
    };

    return createResilientListener();
  }

  // Get posts (non-realtime)
  async getPosts() {
    return await this.executeWithRetry(async () => {
      const postsRef = collection(this.db, 'posts');
      const q = query(postsRef, orderBy('created_at', 'desc'), limit(50));
      
      // Use cache first, then network
      const snapshot = await getDocs(q);
      const posts = [];
      
      // Get all saved post IDs for current user
      let savedPostIds = [];
      if (this.currentUser) {
        try {
          const savedPostsRef = collection(this.db, 'saved_posts');
          const savedQuery = query(savedPostsRef, where('user_id', '==', this.currentUser.id));
          const savedSnapshot = await getDocs(savedQuery);
          savedPostIds = savedSnapshot.docs.map(doc => doc.data().post_id);
        } catch (error) {
          console.warn('Failed to load saved posts for getPosts:', error);
        }
      }
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        posts.push({
          id: doc.id,
          ...data,
          created_at: data.created_at?.toDate?.() || new Date(),
          user_liked: data.likes?.includes(this.currentUser?.id) || false,
          user_saved: savedPostIds.includes(doc.id)
        });
      });
      
      return posts;
    });
  }

  async likePost(postId) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      const postRef = doc(this.db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      
      if (!postDoc.exists()) throw new Error('Post not found');
      
      const postData = postDoc.data();
      const likes = Array.isArray(postData.likes) ? postData.likes : [];
      const isLiked = likes.includes(this.currentUser.id);
      
      if (isLiked) {
        // Unlike
        await updateDoc(postRef, {
          likes: arrayRemove(this.currentUser.id),
          like_count: increment(-1)
        });
        return { liked: false, count: (postData.like_count || 0) - 1 };
      } else {
        // Like
        await updateDoc(postRef, {
          likes: arrayUnion(this.currentUser.id),
          like_count: increment(1)
        });
        
        // Create notification for post owner (if not liking own post)
        if (postData.user_id !== this.currentUser.id) {
          await this.createNotification(
            postData.user_id, 
            'like', 
            `${this.currentUser.username} liked your post`,
            postId
          );
        }
        
        return { liked: true, count: (postData.like_count || 0) + 1 };
      }
    } catch (error) {
      throw new Error('Failed to like post: ' + error.message);
    }
  }

  async savePost(postId) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      // Check if post exists
      const postRef = doc(this.db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      
      if (!postDoc.exists()) throw new Error('Post not found');
      
      // Check if already saved
      const savedPostsRef = collection(this.db, 'saved_posts');
      const existingQuery = query(
        savedPostsRef,
        where('user_id', '==', this.currentUser.id),
        where('post_id', '==', postId)
      );
      
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        // Unsave - delete the saved_posts document
        const savedDocId = existingSnapshot.docs[0].id;
        await deleteDoc(doc(this.db, 'saved_posts', savedDocId));
        return { saved: false };
      } else {
        // Save - create new saved_posts document
        await addDoc(savedPostsRef, {
          user_id: this.currentUser.id,
          post_id: postId,
          saved_at: serverTimestamp()
        });
        return { saved: true };
      }
    } catch (error) {
      console.error('Firebase savePost error:', error);
      throw new Error('Failed to save post: ' + error.message);
    }
  }

  // Follow System
  async followUser(targetUserId) {
    if (!this.currentUser) throw new Error('User not authenticated');
    if (targetUserId === this.currentUser.id) throw new Error('Cannot follow yourself');
    
    try {
      // Check if already following
      const followsRef = collection(this.db, 'follows');
      const existingQuery = query(
        followsRef,
        where('follower_id', '==', this.currentUser.id),
        where('following_id', '==', targetUserId)
      );
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        // Unfollow - delete the follow document
        const followDocId = existingSnapshot.docs[0].id;
        await deleteDoc(doc(this.db, 'follows', followDocId));
        
        // Update follower counts
        await updateDoc(doc(this.db, 'users', this.currentUser.id), {
          following_count: increment(-1)
        });
        await updateDoc(doc(this.db, 'users', targetUserId), {
          followers_count: increment(-1)
        });
        
        return { following: false };
      } else {
        // Follow - create new follow document
        await addDoc(followsRef, {
          follower_id: this.currentUser.id,
          following_id: targetUserId,
          followed_at: serverTimestamp()
        });
        
        // Update follower counts
        await updateDoc(doc(this.db, 'users', this.currentUser.id), {
          following_count: increment(1)
        });
        await updateDoc(doc(this.db, 'users', targetUserId), {
          followers_count: increment(1)
        });
        
        // Create notification
        await addDoc(collection(this.db, 'notifications'), {
          user_id: targetUserId,
          type: 'follow',
          from_user_id: this.currentUser.id,
          from_username: this.currentUser.username,
          from_profile_picture: this.currentUser.profile_picture,
          message: `${this.currentUser.username} started following you`,
          read: false,
          created_at: serverTimestamp()
        });
        
      return { following: true };
    }
  } catch (error) {
    console.error('Firebase followUser error:', error);
    throw new Error('Failed to follow/unfollow user: ' + error.message);
  }
}

  async unfollowUser(targetUserId) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const followsRef = collection(this.db, 'follows');
      const q = query(
        followsRef,
        where('follower_id', '==', this.currentUser.id),
        where('following_id', '==', targetUserId)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        // Remove follow relationship
        await deleteDoc(snapshot.docs[0].ref);
        
        // Update follower counts
        await updateDoc(doc(this.db, 'users', this.currentUser.id), {
          following_count: increment(-1)
        });
        await updateDoc(doc(this.db, 'users', targetUserId), {
          followers_count: increment(-1)
        });
        
        return { following: false };
      }
    } catch (error) {
      console.error('Firebase unfollowUser error:', error);
      throw new Error('Failed to unfollow user: ' + error.message);
    }
  }

  async getFollowStatus(targetUserId) {
    if (!this.currentUser) return false;
    
    try {
      const followsRef = collection(this.db, 'follows');
      const q = query(
        followsRef,
        where('follower_id', '==', this.currentUser.id),
        where('following_id', '==', targetUserId)
      );
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking follow status:', error);
      return false;
    }
  }

  async searchUsers(searchTerm) {
    try {
      const usersRef = collection(this.db, 'users');
      const snapshot = await getDocs(usersRef);
      const users = [];
      
      snapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.username.toLowerCase().includes(searchTerm.toLowerCase())) {
          users.push({
            id: doc.id,
            ...userData
          });
        }
      });
      
      return users;
    } catch (error) {
      console.error('Error searching users:', error);
      throw new Error('Failed to search users: ' + error.message);
    }
  }

  async getPostsByTag(tag) {
    try {
      const postsRef = collection(this.db, 'posts');
      const q = query(
        postsRef,
        where('tags', 'array-contains', tag),
        orderBy('created_at', 'desc'),
        limit(50)
      );
      
      const snapshot = await getDocs(q);
      const posts = [];
      
      // Get saved post IDs for current user
      let savedPostIds = [];
      if (this.currentUser) {
        try {
          const savedPostsRef = collection(this.db, 'saved_posts');
          const savedQuery = query(savedPostsRef, where('user_id', '==', this.currentUser.id));
          const savedSnapshot = await getDocs(savedQuery);
          savedPostIds = savedSnapshot.docs.map(doc => doc.data().post_id);
        } catch (error) {
          console.warn('Failed to load saved posts for tag filter:', error);
        }
      }
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        posts.push({
          id: doc.id,
          ...data,
          created_at: data.created_at?.toDate?.() || new Date(),
          user_liked: data.likes?.includes(this.currentUser?.id) || false,
          user_saved: savedPostIds.includes(doc.id)
        });
      });
      
      return posts;
    } catch (error) {
      console.error('Error getting posts by tag:', error);
      throw new Error('Failed to get posts by tag: ' + error.message);
    }
  }

  async getTrendingTags(limit = 15) {
    console.log('🔥 FirebaseArtHubClient.getTrendingTags() called');
    try {
      const posts = await this.getPosts();
      console.log('🔥 Got', posts.length, 'posts from database');
      
      const tagCounts = {};
      const tagOriginalCase = {}; // Store original case for display
      
      posts.forEach((post, index) => {
        console.log(`🔥 Processing post ${index + 1}:`, post.id, 'tags:', post.tags);
        if (post.tags && Array.isArray(post.tags)) {
          post.tags.forEach(tag => {
            if (tag && typeof tag === 'string' && tag.trim()) {
              const normalizedTag = tag.trim().toLowerCase();
              // Keep the original case of the first occurrence for display
              if (!tagOriginalCase[normalizedTag]) {
                tagOriginalCase[normalizedTag] = tag.trim();
              }
              tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + 1;
            }
          });
        }
      });
      
      console.log('🔥 Tag counts:', tagCounts);
      
      // Sort tags by usage count and return the most popular ones
      const result = Object.entries(tagCounts)
        .filter(([tag, count]) => count >= 1) // Show tags used at least once
        .sort(([,a], [,b]) => b - a)
        .slice(0, limit)
        .map(([tag, count]) => ({
          tag: tagOriginalCase[tag],
          count: count,
          normalizedTag: tag
        }));
        
      console.log('🔥 Final trending tags result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error in Firebase getTrendingTags:', error);
      throw new Error('Failed to get trending tags: ' + error.message);
    }
  }

  async getSuggestedArtists() {
    try {
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, limit(5));
      const snapshot = await getDocs(q);
      
      const artists = [];
      for (const doc of snapshot.docs) {
        const userData = doc.data();
        
        // Skip current user
        if (this.currentUser && doc.id === this.currentUser.id) continue;
        
        // Get follower count
        const followsRef = collection(this.db, 'follows');
        const followersQuery = query(followsRef, where('following_id', '==', doc.id));
        const followersSnapshot = await getDocs(followersQuery);
        const followersCount = followersSnapshot.size;
        
        // Get total likes for this artist's posts
        const postsRef = collection(this.db, 'posts');
        const userPostsQuery = query(postsRef, where('user_id', '==', doc.id));
        const postsSnapshot = await getDocs(userPostsQuery);
        
        let totalLikes = 0;
        postsSnapshot.forEach((postDoc) => {
          const postData = postDoc.data();
          totalLikes += (postData.likes || []).length;
        });
        
        artists.push({
          id: doc.id,
          username: userData.username || 'Unknown Artist',
          displayName: userData.displayName || userData.username || 'Unknown Artist',
          email: userData.email,
          avatar: userData.avatar || userData.profile_picture,
          followersCount,
          totalLikes
        });
      }
      
      // Sort by total likes descending (most liked artists first)
      artists.sort((a, b) => b.totalLikes - a.totalLikes);
      
      return artists;
    } catch (error) {
      console.error('Error getting suggested artists:', error);
      return [];
    }
  }

  async editPost(postId, newContent, tags = []) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const postRef = doc(this.db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      
      if (!postSnap.exists()) {
        throw new Error('Post not found');
      }
      
      const postData = postSnap.data();
      
      // Check if user owns the post
      if (postData.user_id !== this.currentUser.id) {
        throw new Error('You can only edit your own posts');
      }
      
      // Prepare update data
      const updateData = {
        body: newContent,
        original_body: postData.original_body || postData.body, // Keep original if already edited
        edited_at: serverTimestamp(),
        last_modified: serverTimestamp()
      };
      
      // Add tags if provided
      if (tags && tags.length > 0) {
        updateData.tags = tags;
      } else {
        // If no tags provided, remove tags field (or keep empty array)
        updateData.tags = [];
      }
      
      // Update post with edit tracking
      await updateDoc(postRef, updateData);
      
      return { success: true };
    } catch (error) {
      console.error('Error editing post:', error);
      throw new Error('Failed to edit post: ' + error.message);
    }
  }

  async reportPost(postId, reportedUsername, reason, details = '') {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      await addDoc(collection(this.db, 'reports'), {
        post_id: postId,
        reported_username: reportedUsername,
        reporter_id: this.currentUser.id,
        reporter_username: this.currentUser.username,
        reason: reason,
        details: details,
        status: 'pending',
        created_at: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error reporting post:', error);
      throw new Error('Failed to report post: ' + error.message);
    }
  }

  async getReports() {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }

    try {
      const reportsRef = collection(this.db, 'reports');
      const q = query(reportsRef, where('status', '==', 'pending'), orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      
      const reports = [];
      snapshot.forEach((doc) => {
        reports.push({
          id: doc.id,
          ...doc.data(),
          created_at: doc.data().created_at?.toDate?.() || new Date()
        });
      });
      
      return reports;
    } catch (error) {
      console.error('Error getting reports:', error);
      throw new Error('Failed to get reports: ' + error.message);
    }
  }

  async dismissReport(reportId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }

    try {
      const reportRef = doc(this.db, 'reports', reportId);
      await updateDoc(reportRef, {
        status: 'dismissed',
        dismissed_by: this.currentUser.id,
        dismissed_at: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error dismissing report:', error);
      throw new Error('Failed to dismiss report: ' + error.message);
    }
  }

  async deletePost(postId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }

    try {
      await deleteDoc(doc(this.db, 'posts', postId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting post:', error);
      throw new Error('Failed to delete post: ' + error.message);
    }
  }

  async banUser(userId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }

    try {
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, {
        is_banned: true,
        banned_by: this.currentUser.id,
        banned_at: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error banning user:', error);
      throw new Error('Failed to ban user: ' + error.message);
    }
  }

  async unbanUser(userId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }

    try {
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, {
        is_banned: false,
        unbanned_by: this.currentUser.id,
        unbanned_at: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error unbanning user:', error);
      throw new Error('Failed to unban user: ' + error.message);
    }
  }

  // Check if a post is saved by current user  
  async isPostSaved(postId) {
    if (!this.currentUser) return false;
    
    try {
      const savedPostsRef = collection(this.db, 'saved_posts');
      const q = query(
        savedPostsRef,
        where('user_id', '==', this.currentUser.id),
        where('post_id', '==', postId)
      );
      
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking if post is saved:', error);
      return false;
    }
  }

  // Get saved posts for current user
  async getSavedPosts() {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      // Query the saved_posts collection
      const savedPostsRef = collection(this.db, 'saved_posts');
      const q = query(
        savedPostsRef,
        where('user_id', '==', this.currentUser.id),
        orderBy('saved_at', 'desc')
      );
      
      const savedSnapshot = await getDocs(q);
      const posts = [];
      
      // Get the actual post data for each saved post
      for (const savedDoc of savedSnapshot.docs) {
        const savedData = savedDoc.data();
        const postRef = doc(this.db, 'posts', savedData.post_id);
        const postDoc = await getDoc(postRef);
        
        if (postDoc.exists()) {
          const postData = postDoc.data();
          posts.push({
            id: postDoc.id,
            ...postData,
            created_at: postData.created_at?.toDate?.() || new Date(),
            user_liked: postData.likes?.includes(this.currentUser?.id) || false,
            user_saved: true, // Always true since these are saved posts
            saved_at: savedData.saved_at?.toDate?.() || new Date()
          });
        }
      }
      
      return posts;
    } catch (error) {
      console.error('Firebase getSavedPosts error:', error);
      throw new Error('Failed to load saved posts: ' + error.message);
    }
  }

  async notifyFollowersOfNewPost(postId, userId, postText) {
    try {
      // Get all followers of the user
      const followsRef = collection(this.db, 'follows');
      const followersQuery = query(followsRef, where('following_id', '==', userId));
      const followersSnapshot = await getDocs(followersQuery);
      
      // Create notifications for each follower
      const notificationPromises = followersSnapshot.docs.map(followDoc => {
        const followerData = followDoc.data();
        return addDoc(collection(this.db, 'notifications'), {
          user_id: followerData.follower_id,
          type: 'new_post',
          from_user_id: userId,
          from_username: this.currentUser.username,
          from_profile_picture: this.currentUser.profile_picture,
          post_id: postId,
          message: `${this.currentUser.username} posted: ${postText.substring(0, 50)}${postText.length > 50 ? '...' : ''}`,
          read: false,
          created_at: serverTimestamp()
        });
      });
      
      await Promise.all(notificationPromises);
    } catch (error) {
      console.warn('Failed to notify followers:', error);
    }
  }

  // Comments Management
  async getComments(postId) {
    try {
      const commentsRef = collection(this.db, 'comments');
      const q = query(
        commentsRef, 
        where('post_id', '==', postId), 
        orderBy('created_at', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const comments = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        comments.push({
          id: doc.id,
          ...data,
          created_at: data.created_at?.toDate?.() || new Date()
        });
      });
      
      return comments;
    } catch (error) {
      throw new Error('Failed to get comments: ' + error.message);
    }
  }

  async addComment(postId, text) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      const comment = {
        post_id: postId,
        user_id: this.currentUser.id,
        username: this.currentUser.username,
        profile_picture: this.currentUser.profile_picture,
        text: text,
        created_at: serverTimestamp()
      };

      const docRef = await addDoc(collection(this.db, 'comments'), comment);
      
      // Update post comment count
      await updateDoc(doc(this.db, 'posts', postId), {
        comment_count: increment(1)
      });

      // Get post owner for notification
      const postDoc = await getDoc(doc(this.db, 'posts', postId));
      if (postDoc.exists()) {
        const postData = postDoc.data();
        if (postData.user_id !== this.currentUser.id) {
          await this.createNotification(
            postData.user_id,
            'comment',
            `${this.currentUser.username} commented on your post`,
            postId
          );
        }
      }

      return { id: docRef.id, ...comment };
    } catch (error) {
      throw new Error('Failed to add comment: ' + error.message);
    }
  }

  // Notifications
  async createNotification(userId, type, message, relatedId = null) {
    try {
      const notification = {
        user_id: userId,
        type: type,
        message: message,
        related_id: relatedId,
        read: false,
        created_at: serverTimestamp()
      };

      await addDoc(collection(this.db, 'notifications'), notification);
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  }

  async getNotifications() {
    if (!this.currentUser) return [];
    
    try {
      const notificationsRef = collection(this.db, 'notifications');
      const q = query(
        notificationsRef,
        where('user_id', '==', this.currentUser.id),
        orderBy('created_at', 'desc'),
        limit(50)
      );
      
      const querySnapshot = await getDocs(q);
      const notifications = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        notifications.push({
          id: doc.id,
          ...data,
          created_at: data.created_at?.toDate?.() || new Date()
        });
      });
      
      return notifications;
    } catch (error) {
      throw new Error('Failed to get notifications: ' + error.message);
    }
  }

  async markAllNotificationsRead() {
    if (!this.currentUser) return;
    
    try {
      const notificationsRef = collection(this.db, 'notifications');
      const q = query(
        notificationsRef,
        where('user_id', '==', this.currentUser.id),
        where('read_status', '==', false)
      );
      
      const querySnapshot = await getDocs(q);
      const updatePromises = [];
      
      querySnapshot.forEach((doc) => {
        updatePromises.push(updateDoc(doc.ref, { read_status: true }));
      });
      
      await Promise.all(updatePromises);
    } catch (error) {
      throw new Error('Failed to mark all notifications as read: ' + error.message);
    }
  }

  // Utility functions
  formatTimeAgo(date) {
    if (!date) return 'just now';
    
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return Math.floor(diff / 604800) + 'w';
  }

  async getSuggestedUsers() {
    try {
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, limit(5));
      const querySnapshot = await getDocs(q);
      
      const users = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (doc.id !== this.currentUser?.id) {
          users.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      return users;
    } catch (error) {
      console.error('Failed to get suggested users:', error);
      return [];
    }
  }
  
  // Update username with cooldown and alias tracking
  async updateUsername(userId, newUsername) {
    try {
      const userRef = doc(this.db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('User not found');
      }
      
      const userData = userSnap.data();
      
      // Check cooldown (1 week)
      if (userData.lastUsernameChange) {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const lastChange = userData.lastUsernameChange.toDate();
        
        if (lastChange > weekAgo) {
          throw new Error('You can only change your username once per week');
        }
      }
      
      // Check if username is taken
      const existingUserQuery = query(
        collection(this.db, 'users'),
        where('username', '==', newUsername)
      );
      const existingUserSnap = await getDocs(existingUserQuery);
      
      if (!existingUserSnap.empty && existingUserSnap.docs[0].id !== userId) {
        throw new Error('Username is already taken');
      }
      
      // Prepare alias history
      const previousUsernames = userData.previousUsernames || [];
      
      if (userData.username !== newUsername) {
        previousUsernames.unshift({
          username: userData.username,
          changedAt: serverTimestamp()
        });
        
        // Keep only last 10 aliases
        previousUsernames.splice(10);
      }
      
      // Update user document
      await updateDoc(userRef, {
        username: newUsername,
        lastUsernameChange: serverTimestamp(),
        previousUsernames
      });
      
      return await this.getUserById(userId);
    } catch (error) {
      console.error('Error updating username:', error);
      throw error;
    }
  }
  
  // Clear alias history
  async clearAliasHistory(userId) {
    try {
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, {
        previousUsernames: []
      });
      return true;
    } catch (error) {
      console.error('Error clearing alias history:', error);
      throw error;
    }
  }
  
  // Update about me
  async updateAboutMe(userId, aboutMe) {
    try {
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, {
        aboutMe: aboutMe.substring(0, 500) // Limit to 500 characters
      });
      return await this.getUserById(userId);
    } catch (error) {
      console.error('Error updating about me:', error);
      throw error;
    }
  }
  
  // Get user stats
  async getUserStats(userId) {
    try {
      // Get user's posts count
      const postsQuery = query(
        collection(this.db, 'posts'),
        where('author', '==', userId)
      );
      const postsSnap = await getDocs(postsQuery);
      
      // Calculate likes received
      let likesReceived = 0;
      postsSnap.forEach(doc => {
        const postData = doc.data();
        likesReceived += (postData.likes || []).length;
      });
      
      // Get followers count (if following system exists)
      const followersQuery = query(
        collection(this.db, 'follows'),
        where('following', '==', userId)
      );
      const followersSnap = await getDocs(followersQuery);
      
      return {
        postCount: postsSnap.size,
        likesReceived,
        followers: followersSnap.size
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return {
        postCount: 0,
        likesReceived: 0,
        followers: 0
      };
    }
  }
  
  // Admin Methods
  async getPendingContexts() {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    try {
      const contextsRef = collection(this.db, 'contexts');
      const q = query(
        contextsRef,
        where('admin_approved', 'in', [null, false]),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting pending contexts:', error);
      throw error;
    }
  }
  
  async adminApproveContext(contextId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    try {
      await updateDoc(doc(this.db, 'contexts', contextId), {
        admin_approved: true,
        admin_reviewed_at: new Date(),
        admin_reviewed_by: this.currentUser.id
      });
      return { success: true };
    } catch (error) {
      console.error('Error approving context:', error);
      throw error;
    }
  }
  
  async adminRejectContext(contextId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    try {
      await updateDoc(doc(this.db, 'contexts', contextId), {
        admin_approved: false,
        admin_reviewed_at: new Date(),
        admin_reviewed_by: this.currentUser.id
      });
      return { success: true };
    } catch (error) {
      console.error('Error rejecting context:', error);
      throw error;
    }
  }
  
  async adminRemovePost(postId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    try {
      // Mark post as removed instead of deleting to maintain audit trail
      await updateDoc(doc(this.db, 'posts', postId), {
        admin_removed: true,
        admin_removed_at: new Date(),
        admin_removed_by: this.currentUser.id,
        visibility: 'removed'
      });
      return { success: true };
    } catch (error) {
      console.error('Error removing post:', error);
      throw error;
    }
  }
  
  async adminBanUser(userId, reason) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    try {
      await updateDoc(doc(this.db, 'users', userId), {
        banned: true,
        banned_at: new Date(),
        banned_by: this.currentUser.id,
        ban_reason: reason
      });
      
      // Also hide all posts by this user
      const postsQuery = query(
        collection(this.db, 'posts'),
        where('author', '==', userId)
      );
      const postsSnap = await getDocs(postsQuery);
      
      const batch = writeBatch(this.db);
      postsSnap.forEach(doc => {
        batch.update(doc.ref, {
          visibility: 'hidden',
          hidden_reason: 'User banned'
        });
      });
      await batch.commit();
      
      return { success: true };
    } catch (error) {
      console.error('Error banning user:', error);
      throw error;
    }
  }
  
  async getPostContextSubmissions(postId) {
    if (!this.currentUser || (!this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi')) {
      throw new Error('Admin access required');
    }
    
    try {
      const contextsRef = collection(this.db, 'contexts');
      const q = query(
        contextsRef,
        where('post_id', '==', postId),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting post context submissions:', error);
      throw error;
    }
  }
  
  // Get recent comments for posts
  async getRecentComments(postId, limitCount = 3) {
    try {
      const commentsRef = collection(this.db, 'comments');
      const q = query(
        commentsRef,
        where('post_id', '==', postId),
        orderBy('created_at', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      const comments = [];
      
      for (const commentDoc of snapshot.docs) {
        const commentData = commentDoc.data();
        
        // Get user info for each comment
        const userDoc = await getDoc(doc(this.db, 'users', commentData.user_id));
        const userData = userDoc.exists() ? userDoc.data() : { username: 'Unknown' };
        
        comments.push({
          id: commentDoc.id,
          ...commentData,
          username: userData.username,
          profile_picture: userData.profile_picture,
          created_at: commentData.created_at?.toDate?.() || new Date(),
          user_liked: commentData.likes?.includes(this.currentUser?.id) || false,
          likes_count: commentData.likes?.length || 0
        });
      }
      
      return comments.reverse(); // Show oldest first
    } catch (error) {
      console.error('Error getting recent comments:', error);
      return [];
    }
  }
  
  // Toggle comment like
  async toggleCommentLike(commentId) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    try {
      const commentRef = doc(this.db, 'comments', commentId);
      const commentDoc = await getDoc(commentRef);
      
      if (!commentDoc.exists()) {
        throw new Error('Comment not found');
      }
      
      const commentData = commentDoc.data();
      const likes = commentData.likes || [];
      const isLiked = likes.includes(this.currentUser.id);
      
      if (isLiked) {
        await updateDoc(commentRef, {
          likes: arrayRemove(this.currentUser.id)
        });
      } else {
        await updateDoc(commentRef, {
          likes: arrayUnion(this.currentUser.id)
        });
      }
      
      return { liked: !isLiked };
    } catch (error) {
      console.error('Error toggling comment like:', error);
      throw new Error('Failed to update comment like: ' + error.message);
    }
  }
  
  // Delete post (for users to delete their own posts)
  async deletePost(postId) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    try {
      // Get the post to check ownership
      const postDoc = await getDoc(doc(this.db, 'posts', postId));
      if (!postDoc.exists()) {
        throw new Error('Post not found');
      }
      
      const postData = postDoc.data();
      if (postData.user_id !== this.currentUser.id && !this.currentUser.is_admin && this.currentUser.username !== 'Kiyoshi') {
        throw new Error('You can only delete your own posts');
      }
      
      // Delete the post
      await deleteDoc(doc(this.db, 'posts', postId));
      
      // Delete associated comments
      const commentsQuery = query(
        collection(this.db, 'comments'),
        where('post_id', '==', postId)
      );
      const commentsSnap = await getDocs(commentsQuery);
      
      const batch = writeBatch(this.db);
      commentsSnap.forEach(commentDoc => {
        batch.delete(commentDoc.ref);
      });
      
      // Delete associated contexts
      const contextsQuery = query(
        collection(this.db, 'contexts'),
        where('post_id', '==', postId)
      );
      const contextsSnap = await getDocs(contextsQuery);
      
      contextsSnap.forEach(contextDoc => {
        batch.delete(contextDoc.ref);
      });
      
      await batch.commit();
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting post:', error);
      throw new Error('Failed to delete post: ' + error.message);
    }
  }
  
  // Delete comment (comment owner or admin)
  async deleteComment(commentId) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }
    
    try {
      const commentRef = doc(this.db, 'comments', commentId);
      const commentDoc = await getDoc(commentRef);
      
      if (!commentDoc.exists()) {
        throw new Error('Comment not found');
      }
      
      const commentData = commentDoc.data();
      const postId = commentData.post_id;
      
      // Check if user owns the comment or is admin
      if (commentData.user_id !== this.currentUser.id && 
          !this.currentUser.is_admin && 
          this.currentUser.username !== 'Kiyoshi') {
        throw new Error('You can only delete your own comments');
      }
      
      // Delete the comment
      await deleteDoc(commentRef);
      
      // Update post comment count
      const postRef = doc(this.db, 'posts', postId);
      await updateDoc(postRef, {
        comment_count: increment(-1)
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }
  
  // Report comment
  async reportComment(commentId, reason, details = '') {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      const report = {
        comment_id: commentId,
        reported_by: this.currentUser.id,
        reporter_username: this.currentUser.username,
        reason: reason,
        details: details,
        status: 'pending',
        created_at: serverTimestamp()
      };
      
      await addDoc(collection(this.db, 'comment_reports'), report);
      return { success: true };
    } catch (error) {
      console.error('Error reporting comment:', error);
      throw error;
    }
  }
  
  // Connection resilience methods
  async executeWithRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a connection-related error
        if (this.isConnectionError(error) && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.warn(`🔄 Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }
  
  // Check if error is connection-related
  isConnectionError(error) {
    const connectionErrorCodes = [
      'unavailable',
      'deadline-exceeded', 
      'resource-exhausted',
      'aborted',
      'internal',
      'unknown'
    ];
    
    return connectionErrorCodes.includes(error.code) || 
           error.message?.includes('network') ||
           error.message?.includes('connection') ||
           error.message?.includes('transport') ||
           error.message?.includes('RPC') ||
           error.message?.includes('WebChannel');
  }
  
  // Cleanup connections
  cleanup() {
    // Clear connection health monitoring
    if (connectionHealthTimer) {
      clearInterval(connectionHealthTimer);
      connectionHealthTimer = null;
    }
    
    // Unsubscribe from all listeners
    this.unsubscribers.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error during unsubscribe:', error);
        }
      }
    });
    this.unsubscribers = [];
  }
} // End of FirebaseArtHubClient class

// Export Firebase modules globally for direct Firestore access
window.firebaseModules = {
  // Firestore
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  increment,
  orderBy,
  query,
  limit,
  where,
  onSnapshot,
  serverTimestamp,
  getDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  enableNetwork,
  disableNetwork,
  setDoc,
  // Authentication
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  linkWithCredential,
  EmailAuthProvider
};
console.log('🔥 Firebase modules exposed globally (Firestore + Auth + Social Login)');

// Export Firebase client - Initialize immediately and ensure window access
let defaultClient;

function initializeFirebaseClient() {
  try {
    console.log('🚀 Initializing Firebase ArtHub Client...');
    console.log('📊 Firebase App initialized:', !!app);
    console.log('📊 Firestore initialized:', !!db);
    console.log('📊 Auth initialized:', !!auth);
    
    if (!db) {
      console.error('❌ Firestore (db) is not initialized!');
      throw new Error('Firestore database not initialized');
    }
    
    const artHubClient = new FirebaseArtHubClient();
    console.log('✅ FirebaseArtHubClient instance created');
    console.log('🔥 Using Firebase - Data stored in cloud');
    console.log('🔥 Firebase client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(artHubClient)));
    
    window.firebaseArtHubClient = artHubClient;
    window.firebaseAuth = auth; // Export auth instance globally
    window.artHubClient = artHubClient;
    
    console.log('✅ Firebase client and auth attached to window');
    console.log('✅ window.firebaseArtHubClient available:', !!window.firebaseArtHubClient);
    console.log('✅ getSavedPosts method available:', typeof window.firebaseArtHubClient.getSavedPosts === 'function');
    console.log('✅ loginUser method available:', typeof window.firebaseArtHubClient.loginUser === 'function');
    
    defaultClient = artHubClient;
    return artHubClient;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase client:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    // Fallback to demo client
    try {
      console.log('🔄 Attempting to initialize DemoArtHubClient as fallback...');
      const demoClient = new DemoArtHubClient();
      window.firebaseArtHubClient = demoClient;
      window.artHubClient = demoClient;
      console.log('✅ DemoArtHubClient initialized successfully');
      
      if (window.FIREBASE_PROJECT_ID === 'arthub-demo' || !window.FIREBASE_PROJECT_ID) {
        console.log('ℹ️ Using demo mode (Firebase config not loaded)');
        console.log('ℹ️ To use real Firebase: ensure firebase-config-local.js is loaded or GitHub Secrets are configured');
      } else {
        console.log('⚠️ Using demo client as fallback due to Firebase connection error');
      }
      
      console.log('📋 If you see this on GitHub Pages, check that all Firebase secrets are properly configured');
      
      defaultClient = demoClient;
      return demoClient;
    } catch (demoError) {
      console.error('❌ CRITICAL: Even demo client failed to initialize!', demoError);
      // Last resort - create minimal client stub
      const stubClient = {
        loginUser: () => Promise.reject(new Error('Firebase client not initialized')),
        registerUser: () => Promise.reject(new Error('Firebase client not initialized'))
      };
      window.firebaseArtHubClient = stubClient;
      window.artHubClient = stubClient;
      console.error('⚠️ Using stub client (all operations will fail)');
      return stubClient;
    }
  }
}

// Initialize immediately when module loads
const initializedClient = initializeFirebaseClient();

// Also make it available for delayed access
window.initializeFirebaseClient = initializeFirebaseClient;

// Dispatch custom event to signal Firebase is ready
if (typeof window !== 'undefined') {
  window.dispatchEvent(new CustomEvent('firebaseReady', { 
    detail: { client: initializedClient }
  }));
  console.log('📢 Dispatched firebaseReady event');
}

export default defaultClient;