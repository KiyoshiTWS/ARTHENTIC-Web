// Client-side ArtHub functionality for GitHub Pages
class ArtHubClient {
    constructor() {
        this.currentUser = null;
        this.posts = [];
        this.users = [];
        this.notifications = [];
        this.messages = [];
        this.savedPosts = [];
        this.settings = {
            notifications: true,
            privacy: 'public',
            autoplay: false
        };
        this.init();
    }

    init() {
        // Load data from localStorage
        this.loadData();
        
        // Initialize with demo data if empty
        if (this.posts.length === 0) {
            this.initDemoData();
        }
        
        // Check if user is logged in
        const token = localStorage.getItem('arthub_token');
        if (token) {
            this.currentUser = JSON.parse(localStorage.getItem('arthub_user'));
        }
    }

    loadData() {
        const postsData = localStorage.getItem('arthub_posts');
        const usersData = localStorage.getItem('arthub_users');
        const notificationsData = localStorage.getItem('arthub_notifications');
        const messagesData = localStorage.getItem('arthub_messages');
        const savedPostsData = localStorage.getItem('arthub_saved');
        const settingsData = localStorage.getItem('arthub_settings');
        
        this.posts = postsData ? JSON.parse(postsData) : [];
        this.users = usersData ? JSON.parse(usersData) : [];
        this.notifications = notificationsData ? JSON.parse(notificationsData) : [];
        this.messages = messagesData ? JSON.parse(messagesData) : [];
        this.savedPosts = savedPostsData ? JSON.parse(savedPostsData) : [];
        this.settings = settingsData ? JSON.parse(settingsData) : this.settings;
    }

    saveData() {
        localStorage.setItem('arthub_posts', JSON.stringify(this.posts));
        localStorage.setItem('arthub_users', JSON.stringify(this.users));
        localStorage.setItem('arthub_notifications', JSON.stringify(this.notifications));
        localStorage.setItem('arthub_messages', JSON.stringify(this.messages));
        localStorage.setItem('arthub_saved', JSON.stringify(this.savedPosts));
        localStorage.setItem('arthub_settings', JSON.stringify(this.settings));
    }

    initDemoData() {
        // Create demo users
        this.users = [
            {
                id: 1,
                username: 'RinCC',
                email: 'demo@example.com',
                profile_picture: 'images/services/cclogo.png',
                created_at: new Date().toISOString()
            },
            {
                id: 2,
                username: 'Monder',
                email: 'creative@example.com',
                profile_picture: 'images/services/IMG_4276.PNG',
                created_at: new Date().toISOString()
            }
        ];

        // Create demo posts
        this.posts = [
            {
                id: 1,
                user_id: 1,
                body: 'Welcome to ArtHub! Share your creative works and connect with fellow artists.',
                image_url: 'images/work/Protected/full hsgirls.PNG',
                created_at: new Date().toISOString(),
                likes: [],
                comments: [],
                context: {
                    id: 1,
                    text: 'This is a demo post showcasing digital art protection features.',
                    user_id: 1,
                    username: 'Rin'
                }
            },
            {
                id: 2,
                user_id: 2,
                body: 'Perfectio',
                image_url: 'images/work/Protected/Perfectio.JPG',
                created_at: new Date(Date.now() - 86400000).toISOString(),
                likes: [],
                comments: []
            }
        ];

        // Create demo notifications
        this.notifications = [
            {
                id: 1,
                user_id: this.currentUser ? this.currentUser.id : 1,
                type: 'like',
                title: 'New Like',
                message: 'RinCC liked your post',
                read: false,
                created_at: new Date().toISOString()
            },
            {
                id: 2,
                user_id: this.currentUser ? this.currentUser.id : 1,
                type: 'comment',
                title: 'New Comment',
                message: 'Monder commented on your post',
                read: false,
                created_at: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: 3,
                user_id: this.currentUser ? this.currentUser.id : 1,
                type: 'follow',
                title: 'New Follower',
                message: 'RinCC started following you',
                read: true,
                created_at: new Date(Date.now() - 86400000).toISOString()
            }
        ];

        // Create demo messages
        this.messages = [
            {
                id: 1,
                from_user_id: 2,
                to_user_id: this.currentUser ? this.currentUser.id : 1,
                message: 'Love your latest artwork! What tools did you use?',
                read: false,
                created_at: new Date().toISOString()
            },
            {
                id: 2,
                from_user_id: this.currentUser ? this.currentUser.id : 1,
                to_user_id: 2,
                message: 'Thanks! I used Photoshop and some custom brushes.',
                read: true,
                created_at: new Date(Date.now() - 1800000).toISOString()
            }
        ];

        this.saveData();
    }

    // Authentication methods
    register(username, email, password) {
        return new Promise((resolve, reject) => {
            // Check if user exists
            const existingUser = this.users.find(u => u.username === username || u.email === email);
            if (existingUser) {
                reject({ error: 'User already exists' });
                return;
            }

            // Create new user
            const newUser = {
                id: this.users.length + 1,
                username,
                email,
                profile_picture: null,
                created_at: new Date().toISOString()
            };

            this.users.push(newUser);
            this.saveData();

            // Create session
            const token = 'demo_token_' + Date.now();
            localStorage.setItem('arthub_token', token);
            localStorage.setItem('arthub_user', JSON.stringify(newUser));
            
            this.currentUser = newUser;
            resolve({ token, user: newUser });
        });
    }

    login(usernameOrEmail, password) {
        return new Promise((resolve, reject) => {
            const user = this.users.find(u => 
                u.username === usernameOrEmail || u.email === usernameOrEmail
            );

            if (!user) {
                reject({ error: 'Invalid login credentials' });
                return;
            }

            // Create session
            const token = 'demo_token_' + Date.now();
            localStorage.setItem('arthub_token', token);
            localStorage.setItem('arthub_user', JSON.stringify(user));
            
            this.currentUser = user;
            resolve({ token, user });
        });
    }

    logout() {
        localStorage.removeItem('arthub_token');
        localStorage.removeItem('arthub_user');
        this.currentUser = null;
    }

    // Post methods
    getPosts() {
        return new Promise((resolve) => {
            const postsWithDetails = this.posts.map(post => {
                const user = this.users.find(u => u.id === post.user_id);
                return {
                    ...post,
                    username: user ? user.username : 'Unknown',
                    profile_picture: user ? user.profile_picture : null,
                    likes_count: post.likes ? post.likes.length : 0,
                    comments_count: post.comments ? post.comments.length : 0,
                    user_liked: this.currentUser && post.likes ? 
                        post.likes.includes(this.currentUser.id) : false
                };
            });

            resolve(postsWithDetails.reverse()); // Most recent first
        });
    }

    createPost(body, imageUrl = null) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const newPost = {
                id: this.posts.length + 1,
                user_id: this.currentUser.id,
                body,
                image_url: imageUrl,
                created_at: new Date().toISOString(),
                likes: [],
                comments: []
            };

            this.posts.push(newPost);
            this.saveData();
            resolve(newPost);
        });
    }

    likePost(postId) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const post = this.posts.find(p => p.id === postId);
            if (!post) {
                reject({ error: 'Post not found' });
                return;
            }

            if (!post.likes) post.likes = [];

            const userLikedIndex = post.likes.indexOf(this.currentUser.id);
            if (userLikedIndex > -1) {
                // Unlike
                post.likes.splice(userLikedIndex, 1);
            } else {
                // Like
                post.likes.push(this.currentUser.id);
            }

            this.saveData();
            resolve({ liked: userLikedIndex === -1, count: post.likes.length });
        });
    }

    addComment(postId, text) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const post = this.posts.find(p => p.id === postId);
            if (!post) {
                reject({ error: 'Post not found' });
                return;
            }

            if (!post.comments) post.comments = [];

            const newComment = {
                id: Date.now(),
                user_id: this.currentUser.id,
                username: this.currentUser.username,
                text,
                created_at: new Date().toISOString()
            };

            post.comments.push(newComment);
            this.saveData();
            resolve(newComment);
        });
    }

    addContext(postId, text) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const post = this.posts.find(p => p.id === postId);
            if (!post) {
                reject({ error: 'Post not found' });
                return;
            }

            post.context = {
                id: Date.now(),
                text,
                user_id: this.currentUser.id,
                username: this.currentUser.username
            };

            this.saveData();
            resolve(post.context);
        });
    }

    // Utility methods
    formatTimeAgo(dateString) {
        const now = new Date();
        const date = new Date(dateString);
        const diffInMs = now - date;
        const diffInMinutes = Math.floor(diffInMs / 60000);
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        if (diffInHours < 24) return `${diffInHours}h ago`;
        if (diffInDays < 7) return `${diffInDays}d ago`;
        return date.toLocaleDateString();
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    // Notifications methods
    getNotifications() {
        return new Promise((resolve) => {
            const userNotifications = this.notifications.filter(n => 
                !this.currentUser || n.user_id === this.currentUser.id
            );
            resolve(userNotifications.reverse()); // Most recent first
        });
    }

    markNotificationRead(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
            this.saveData();
        }
    }

    getUnreadNotificationCount() {
        if (!this.currentUser) return 0;
        return this.notifications.filter(n => 
            n.user_id === this.currentUser.id && !n.read
        ).length;
    }

    addNotification(userId, type, title, message) {
        const notification = {
            id: Date.now() + Math.random(),
            user_id: userId,
            type,
            title,
            message,
            read: false,
            created_at: new Date().toISOString()
        };
        this.notifications.push(notification);
        this.saveData();
        return notification;
    }

    // Messages methods
    getMessages() {
        return new Promise((resolve) => {
            if (!this.currentUser) {
                resolve([]);
                return;
            }
            
            const userMessages = this.messages.filter(m => 
                m.from_user_id === this.currentUser.id || m.to_user_id === this.currentUser.id
            );
            
            // Group by conversation partner
            const conversations = {};
            userMessages.forEach(msg => {
                const partnerId = msg.from_user_id === this.currentUser.id ? 
                    msg.to_user_id : msg.from_user_id;
                if (!conversations[partnerId]) {
                    conversations[partnerId] = [];
                }
                conversations[partnerId].push(msg);
            });
            
            // Get partner info and format conversations
            const formattedConversations = Object.keys(conversations).map(partnerId => {
                const partner = this.users.find(u => u.id === parseInt(partnerId));
                const msgs = conversations[partnerId].sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                );
                return {
                    partner,
                    messages: msgs,
                    lastMessage: msgs[0],
                    unreadCount: msgs.filter(m => !m.read && m.to_user_id === this.currentUser.id).length
                };
            });
            
            resolve(formattedConversations);
        });
    }

    sendMessage(toUserId, message) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const newMessage = {
                id: Date.now(),
                from_user_id: this.currentUser.id,
                to_user_id: toUserId,
                message,
                read: false,
                created_at: new Date().toISOString()
            };

            this.messages.push(newMessage);
            this.saveData();
            resolve(newMessage);
        });
    }

    // Saved posts methods
    savePost(postId) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const existingIndex = this.savedPosts.findIndex(s => 
                s.user_id === this.currentUser.id && s.post_id === postId
            );

            if (existingIndex > -1) {
                // Unsave
                this.savedPosts.splice(existingIndex, 1);
                this.saveData();
                resolve({ saved: false });
            } else {
                // Save
                const savedPost = {
                    id: Date.now(),
                    user_id: this.currentUser.id,
                    post_id: postId,
                    created_at: new Date().toISOString()
                };
                this.savedPosts.push(savedPost);
                this.saveData();
                resolve({ saved: true });
            }
        });
    }

    getSavedPosts() {
        return new Promise((resolve) => {
            if (!this.currentUser) {
                resolve([]);
                return;
            }

            const userSavedPosts = this.savedPosts.filter(s => s.user_id === this.currentUser.id);
            const savedPostsWithDetails = userSavedPosts.map(saved => {
                const post = this.posts.find(p => p.id === saved.post_id);
                if (post) {
                    const user = this.users.find(u => u.id === post.user_id);
                    return {
                        ...post,
                        username: user ? user.username : 'Unknown',
                        profile_picture: user ? user.profile_picture : null,
                        likes_count: post.likes ? post.likes.length : 0,
                        comments_count: post.comments ? post.comments.length : 0,
                        user_liked: post.likes ? post.likes.includes(this.currentUser.id) : false,
                        saved_at: saved.created_at
                    };
                }
                return null;
            }).filter(Boolean);

            resolve(savedPostsWithDetails.reverse()); // Most recently saved first
        });
    }

    isPostSaved(postId) {
        if (!this.currentUser) return false;
        return this.savedPosts.some(s => 
            s.user_id === this.currentUser.id && s.post_id === postId
        );
    }

    // Settings methods
    updateSettings(newSettings) {
        return new Promise((resolve) => {
            this.settings = { ...this.settings, ...newSettings };
            this.saveData();
            resolve(this.settings);
        });
    }

    getSettings() {
        return this.settings;
    }

    // Explore methods (trending/popular posts)
    getExplorePosts() {
        return new Promise((resolve) => {
            // Sort posts by engagement (likes + comments)
            const postsWithEngagement = this.posts.map(post => {
                const user = this.users.find(u => u.id === post.user_id);
                const likesCount = post.likes ? post.likes.length : 0;
                const commentsCount = post.comments ? post.comments.length : 0;
                const engagement = likesCount + commentsCount;
                
                return {
                    ...post,
                    username: user ? user.username : 'Unknown',
                    profile_picture: user ? user.profile_picture : null,
                    likes_count: likesCount,
                    comments_count: commentsCount,
                    user_liked: this.currentUser && post.likes ? 
                        post.likes.includes(this.currentUser.id) : false,
                    engagement
                };
            });

            // Sort by engagement, then by date
            const sortedPosts = postsWithEngagement.sort((a, b) => {
                if (b.engagement !== a.engagement) {
                    return b.engagement - a.engagement;
                }
                return new Date(b.created_at) - new Date(a.created_at);
            });

            resolve(sortedPosts);
        });
    }

    // Enhanced like method with notifications
    likePost(postId) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const post = this.posts.find(p => p.id === postId);
            if (!post) {
                reject({ error: 'Post not found' });
                return;
            }

            if (!post.likes) post.likes = [];

            const userLikedIndex = post.likes.indexOf(this.currentUser.id);
            if (userLikedIndex > -1) {
                // Unlike
                post.likes.splice(userLikedIndex, 1);
            } else {
                // Like
                post.likes.push(this.currentUser.id);
                
                // Add notification for post owner (if not self-like)
                if (post.user_id !== this.currentUser.id) {
                    this.addNotification(
                        post.user_id,
                        'like',
                        'New Like',
                        `${this.currentUser.username} liked your post`
                    );
                }
            }

            this.saveData();
            resolve({ liked: userLikedIndex === -1, count: post.likes.length });
        });
    }

    // Enhanced comment method with notifications
    addComment(postId, text) {
        return new Promise((resolve, reject) => {
            if (!this.currentUser) {
                reject({ error: 'Must be logged in' });
                return;
            }

            const post = this.posts.find(p => p.id === postId);
            if (!post) {
                reject({ error: 'Post not found' });
                return;
            }

            if (!post.comments) post.comments = [];

            const newComment = {
                id: Date.now(),
                user_id: this.currentUser.id,
                username: this.currentUser.username,
                text,
                created_at: new Date().toISOString()
            };

            post.comments.push(newComment);
            
            // Add notification for post owner (if not self-comment)
            if (post.user_id !== this.currentUser.id) {
                this.addNotification(
                    post.user_id,
                    'comment',
                    'New Comment',
                    `${this.currentUser.username} commented on your post`
                );
            }
            
            this.saveData();
            resolve(newComment);
        });
    }

    // User avatar update method
    updateUserAvatar(imageData) {
        if (!this.currentUser) return;
        
        // Update current user's profile picture
        this.currentUser.profile_picture = imageData;
        
        // Update in users array
        const userIndex = this.users.findIndex(u => u.id === this.currentUser.id);
        if (userIndex > -1) {
            this.users[userIndex].profile_picture = imageData;
        }
        
        // Save to localStorage
        localStorage.setItem('arthub_user', JSON.stringify(this.currentUser));
        this.saveData();
        
        return this.currentUser;
    }
}

// Initialize global instance
window.artHubClient = new ArtHubClient();