import authManager from '/utils/auth-manager.js';

class SidebarManager {
    constructor() {
        this.currentUser = null;
        this.notificationBadge = null;
        this.init();
    }

    async init() {
        await this.loadSidebar();
        this.setupAuthListener();
        this.highlightCurrentPage();
        this.initializeNotificationBadge();
    }

    async loadSidebar() {
        try {
            const response = await fetch('/components/sidebar.html');
            const html = await response.text();
            
            const sidebarContainer = document.querySelector('.sidebar');
            if (sidebarContainer) {
                sidebarContainer.innerHTML = html;
            } else {
                console.error('Sidebar container not found');
            }
        } catch (error) {
            console.error('Error loading sidebar:', error);
        }
    }

    setupAuthListener() {
        // Subscribe to global auth state changes
        authManager.onAuthStateChanged((user) => {
            this.currentUser = user;
            this.updateSidebarUser(user);
            
            if (user) {
                this.startNotificationPolling();
            } else {
                this.stopNotificationPolling();
            }
        });
    }

    initializeNotificationBadge() {
        this.notificationBadge = document.getElementById('sidebar-notification-badge');
    }

    async updateNotificationBadge() {
        if (!this.currentUser || !this.notificationBadge) return;
        
        try {
            const NotificationService = (await import('/services/notification-service.js')).default;
            const unreadCount = await NotificationService.getUnreadCount(this.currentUser.uid);
            
            if (unreadCount > 0) {
                this.notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                this.notificationBadge.style.display = 'flex';
            } else {
                this.notificationBadge.style.display = 'none';
            }
        } catch (error) {
            console.error('Error updating notification badge:', error);
        }
    }

    startNotificationPolling() {
        // Update immediately
        this.updateNotificationBadge();
        
        // Update every 30 seconds
        this.notificationInterval = setInterval(() => {
            this.updateNotificationBadge();
        }, 30000);
    }

    stopNotificationPolling() {
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            this.notificationInterval = null;
        }
        
        if (this.notificationBadge) {
            this.notificationBadge.style.display = 'none';
        }
    }

    updateSidebarUser(user = this.currentUser) {
        const userNameElement = document.getElementById('sidebar-user-name');
        const userBadgeElement = document.getElementById('sidebar-user-badge');
        
        if (userNameElement) {
            if (user) {
                userNameElement.textContent = user.displayName || user.email || 'NEPP User';
            } else {
                userNameElement.textContent = 'NEPP User';
            }
        }
        
        if (userBadgeElement) {
            this.updateProfilePicture(user, userBadgeElement);
        }
    }

    updateProfilePicture(user, badgeElement) {
        // Clear existing content
        badgeElement.innerHTML = '';
        
        if (user && user.photoURL) {
            // User has a profile picture
            const img = document.createElement('img');
            img.src = user.photoURL;
            img.alt = 'User Profile Picture';
            img.onerror = () => {
                // If image fails to load, fallback to emoji
                badgeElement.innerHTML = '🟡';
            };
            badgeElement.appendChild(img);
        } else {
            // No user or no profile picture, use emoji fallback
            badgeElement.innerHTML = '🟡';
        }
    }

    highlightCurrentPage() {
        const currentPage = window.location.pathname.split('/').pop();
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        
        sidebarItems.forEach(item => {
            const href = item.getAttribute('href');
            const hrefPage = href.split('/').pop();
            if (hrefPage === currentPage) {
                item.classList.add('active');
            }
        });
    }

    // Method to refresh notification badge (can be called from other modules)
    refreshNotificationBadge() {
        this.updateNotificationBadge();
    }

    // Method to get current user from other modules
    getCurrentUser() {
        return this.currentUser;
    }
}

// Create global instance
const sidebarManager = new SidebarManager();

// Export for use in other modules
export default sidebarManager;
