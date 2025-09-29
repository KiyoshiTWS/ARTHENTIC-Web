// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
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
  disableNetwork
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration - Using environment variables for security

// Check if configuration is loaded
if (!window.FIREBASE_PROJECT_ID) {
  console.warn('⚠️ Firebase configuration not loaded. Falling back to demo mode.');
}

// Connection resilience variables
let connectionRetryCount = 0;
const MAX_CONNECTION_RETRIES = 3;
let isReconnecting = false;
let connectionHealthTimer = null;

const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY || "demo-api-key",
  authDomain: window.FIREBASE_AUTH_DOMAIN || "arthub-demo.firebaseapp.com",
  projectId: window.FIREBASE_PROJECT_ID || "arthub-demo",
  storageBucket: window.FIREBASE_STORAGE_BUCKET || "arthub-demo.appspot.com",
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: window.FIREBASE_APP_ID || "demo-app-id",
  measurementId: window.FIREBASE_MEASUREMENT_ID || "G-DEMO"
};

// Initialize Firebase
let app, db;
try {
  app = initializeApp(firebaseConfig);
  
  // Force long polling to avoid WebChannel 400 errors and internal assertion failures
  try {
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false
    });
    console.log('✅ Firestore initialized with forced long polling');
  } catch (error) {
    console.log('⚠️ Fallback to standard Firestore:', error);
    db = getFirestore(app);
  }
  
  console.log('🔥 Firebase initialized successfully with connection resilience');
  console.log('🔥 Firebase app:', app);
  console.log('🔥 Firestore db:', db);
  
  // Start connection health monitoring after successful initialization
  startConnectionHealthMonitoring();
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  throw error;
}

// Connection health monitoring functions
function startConnectionHealthMonitoring() {
  if (connectionHealthTimer) clearInterval(connectionHealthTimer);
  
  connectionHealthTimer = setInterval(async () => {
    try {
      if (db && !isReconnecting) {
        // Lightweight connection check
        await enableNetwork(db);
      }
    } catch (error) {
      console.warn('🔄 Connection health check failed, attempting reconnection:', error);
      handleConnectionFailure();
    }
  }, 30000); // Check every 30 seconds
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
        await disableNetwork(db);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await enableNetwork(db);
        
        console.log('✅ Firebase connection restored');
        connectionRetryCount = 0;
        isReconnecting = false;
      }
    } catch (error) {
      console.error('❌ Reconnection failed:', error);
      isReconnecting = false;
      
      if (connectionRetryCount >= MAX_CONNECTION_RETRIES) {
        console.warn('⚠️ Max reconnection attempts reached');
      }
    }
  }, backoffDelay);
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
    
    if (users.find(u => u.username === username)) {
      throw new Error('Username already exists');
    }

    const newUser = {
      id: Date.now().toString(),
      username,
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
    this.currentUser = null;
    this.unsubscribers = [];
  }

  // User Management
  async loginUser(username, password) {
    try {
      // Simple username/password check (in production, use Firebase Auth)
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        if (userData.password === password) {
          this.currentUser = { id: querySnapshot.docs[0].id, ...userData };
          localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
          localStorage.setItem('arthub_token', 'firebase_token_' + this.currentUser.id);
          return { success: true, user: this.currentUser };
        }
      }
      throw new Error('Invalid credentials');
    } catch (error) {
      throw new Error('Login failed: ' + error.message);
    }
  }

  async registerUser(username, email, password) {
    try {
      // Check if username exists
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, where('username', '==', username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        throw new Error('Username already exists');
      }

      // Create new user
      const newUser = {
        username,
        email,
        password, // In production, hash this!
        profile_picture: null,
        followers: [],
        following: [],
        posts_count: 0,
        created_at: serverTimestamp()
      };

      const docRef = await addDoc(usersRef, newUser);
      this.currentUser = { id: docRef.id, ...newUser };
      localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
      localStorage.setItem('arthub_token', 'firebase_token_' + this.currentUser.id);
      
      return { success: true, user: this.currentUser };
    } catch (error) {
      throw new Error('Registration failed: ' + error.message);
    }
  }

  getCurrentUser() {
    // Always check localStorage for the most recent user data
    const stored = localStorage.getItem('arthub_user');
    if (stored) {
      this.currentUser = JSON.parse(stored);
    }
    return this.currentUser;
  }

  async updateUserProfile(updates) {
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      // Update in Firebase
      await updateDoc(doc(this.db, 'users', this.currentUser.id), updates);
      
      // Update local user object
      this.currentUser = { ...this.currentUser, ...updates };
      
      // Update localStorage
      localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
      
      return this.currentUser;
    } catch (error) {
      throw new Error('Failed to update user profile: ' + error.message);
    }
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
      const post = {
        user_id: this.currentUser.id,
        username: this.currentUser.username,
        profile_picture: this.currentUser.profile_picture,
        body: text,
        image_url: imageData,
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
    
    const unsubscriber = onSnapshot(q, 
      // Success callback
      async (snapshot) => {
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
        const data = doc.data();
        
        // Calculate counts
        const likesCount = data.likes?.length || 0;
        const savesCount = await this.getSavesCount(doc.id);
        const commentsCount = await this.getCommentsCount(doc.id);
        
        // Get approved context
        const context = await this.getApprovedContext(doc.id);
        
        // Get 3 most recent comments for Facebook-style display
        const recent_comments = await this.getRecentComments(doc.id, 3);
        
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
      }
        callback(posts);
        }
      },
      // Error callback with reconnection logic
      (error) => {
        console.error('📡 Feed subscription error:', error);
        
        if (this.isConnectionError(error)) {
          console.log('🔄 Attempting to reconnect feed subscription...');
          handleConnectionFailure();
          
          // Retry subscription after a delay
          setTimeout(() => {
            if (!isReconnecting) {
              this.subscribeToFeed(callback);
            }
          }, 5000);
        }
      }
    );

    this.unsubscribers.push(unsubscriber);
    return unsubscriber;
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
}

// Export Firebase client
let defaultClient;
try {
  const artHubClient = new FirebaseArtHubClient();
  console.log('🔥 Using Firebase - Data stored in cloud');
  console.log('🔥 Firebase client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(artHubClient)));
  
  window.firebaseArtHubClient = artHubClient;
  console.log('🔥 Firebase client attached to window');
  
  // Also make it available for module imports
  window.artHubClient = artHubClient;
  defaultClient = artHubClient;
} catch (error) {
  console.error('❌ Failed to initialize Firebase client:', error);
  
  // Fallback to demo client
  const demoClient = new DemoArtHubClient();
  window.firebaseArtHubClient = demoClient;
  window.artHubClient = demoClient;
  
  if (window.FIREBASE_PROJECT_ID === 'arthub-demo' || !window.FIREBASE_PROJECT_ID) {
    console.log('ℹ️ Using demo mode (Firebase config not loaded)');
    console.log('ℹ️ To use real Firebase: ensure firebase-config-local.js is loaded or GitHub Secrets are configured');
  } else {
    console.log('⚠️ Using demo client as fallback due to Firebase connection error');
  }
  
  console.log('📋 If you see this on GitHub Pages, check that all Firebase secrets are properly configured');
  
  defaultClient = demoClient;
}

export default defaultClient;