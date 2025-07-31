import NotificationService from '/services/notification-service.js';
import authManager from '/utils/auth-manager.js';

class NotificationsManager {
    constructor() {
        this.currentUser = null;
        this.notifications = [];
        this.filteredNotifications = [];
        this.currentFilter = 'all';
        
        this.initializeElements();
        this.bindEvents();
        this.setupAuthListener();
    }

    initializeElements() {
        this.unreadCount = document.getElementById('unreadCount');
        this.markAllReadBtn = document.getElementById('markAllReadBtn');
        this.notificationsList = document.getElementById('notificationsList');
        this.filterBtns = document.querySelectorAll('.filter-btn');
    }

    bindEvents() {
        // Filter buttons
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFilter(btn.dataset.filter);
            });
        });

        // Mark all read button
        this.markAllReadBtn.addEventListener('click', () => {
            this.markAllAsRead();
        });
    }

    setupAuthListener() {
        authManager.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadNotifications();
                this.startPolling();
            } else {
                window.location.href = '/login.html';
            }
        });
    }

    async loadNotifications() {
        try {
            this.notifications = await NotificationService.getUserNotifications(this.currentUser.uid);
            this.updateUnreadCount();
            this.filterNotifications();
        } catch (error) {
            console.error('Error loading notifications:', error);
            this.showError('Failed to load notifications');
        }
    }

    updateUnreadCount() {
        const unreadCount = this.notifications.filter(n => !n.read).length;
        
        if (unreadCount > 0) {
            this.unreadCount.textContent = unreadCount;
            this.unreadCount.style.display = 'block';
            this.markAllReadBtn.style.display = 'block';
        } else {
            this.unreadCount.style.display = 'none';
            this.markAllReadBtn.style.display = 'none';
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active filter button
        this.filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.filterNotifications();
    }

    filterNotifications() {
        switch (this.currentFilter) {
            case 'unread':
                this.filteredNotifications = this.notifications.filter(n => !n.read);
                break;
            case 'co-owner-invite':
                this.filteredNotifications = this.notifications.filter(n => n.type === 'co-owner-invite');
                break;
            case 'file-shared':
                this.filteredNotifications = this.notifications.filter(n => n.type === 'file-shared');
                break;
            default:
                this.filteredNotifications = [...this.notifications];
        }
        
        this.renderNotifications();
    }

    renderNotifications() {
        if (this.filteredNotifications.length === 0) {
            this.renderEmptyState();
            return;
        }

        this.notificationsList.innerHTML = this.filteredNotifications.map(notification => {
            return this.renderNotificationItem(notification);
        }).join('');
    }

    renderNotificationItem(notification) {
        const isUnread = !notification.read;
        const timeAgo = NotificationService.formatDate(notification.createdAt);
        
        let typeIcon = '';
        let actions = '';
        
        switch (notification.type) {
            case 'co-owner-invite':
                typeIcon = `
                    <div class="notification-type-icon co-owner-invite">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.765Z" />
                        </svg>
                    </div>
                `;
                if (!notification.responded) {
                    actions = `
                        <button class="notification-action-btn accept-btn" onclick="notificationsManager.respondToInvite('${notification.id}', true)">
                            Accept
                        </button>
                        <button class="notification-action-btn decline-btn" onclick="notificationsManager.respondToInvite('${notification.id}', false)">
                            Decline
                        </button>
                    `;
                }
                break;
            case 'file-shared':
                typeIcon = `
                    <div class="notification-type-icon file-shared">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                    </div>
                `;
                actions = `
                    <button class="notification-action-btn view-btn" onclick="notificationsManager.viewSharedFile('${notification.data.fileId}')">
                        View File
                    </button>
                `;
                break;
            case 'event-posted':
                typeIcon = `
                    <div class="notification-type-icon event-posted">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                        </svg>
                    </div>
                `;
                actions = `
                    <button class="notification-action-btn view-btn" onclick="notificationsManager.viewEvent('${notification.data.eventId}')">
                        View Event
                    </button>
                `;
                break;
            case 'group-invite':
                typeIcon = `
                    <div class="notification-type-icon group-invite">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                        </svg>
                    </div>
                `;
                actions = `
                    <button class="notification-action-btn view-btn" onclick="notificationsManager.viewGroup('${notification.data.groupId}')">
                        View Group
                    </button>
                `;
                break;
            case 'announcement':
                typeIcon = `
                    <div class="notification-type-icon announcement">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
                        </svg>
                    </div>
                `;
                actions = `
                    <button class="notification-action-btn view-btn" onclick="notificationsManager.viewAnnouncement('${notification.data.announcementId}')">
                        View Announcement
                    </button>
                `;
                break;
            case 'form-due':
                typeIcon = `
                    <div class="notification-type-icon form-due">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                    </div>
                `;
                actions = `
                    <button class="notification-action-btn view-btn" onclick="notificationsManager.viewForm('${notification.data.formId}')">
                        View Form
                    </button>
                `;
                break;
            case 'form-posted':
                typeIcon = `
                    <div class="notification-type-icon form-posted">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                        </svg>
                    </div>
                `;
                actions = `
                    <button class="notification-action-btn view-btn" onclick="notificationsManager.viewForm('${notification.data.formId}')">
                        View Form
                    </button>
                `;
                break;
            case 'resource-shared':
                typeIcon = `
                    <div class="notification-type-icon resource-shared">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v3.776" />
                        </svg>
                    </div>
                `;
                actions = `
                    <button class="notification-action-btn view-btn" onclick="notificationsManager.viewResource('${notification.data.resourceId}')">
                        View Resource
                    </button>
                `;
                break;
            default:
                typeIcon = `
                    <div class="notification-type-icon announcement">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                        </svg>
                    </div>
                `;
        }

        return `
            <div class="notification-item ${notification.type} ${isUnread ? 'unread' : 'read'}" data-id="${notification.id}">
                ${isUnread ? '<div class="notification-badge"></div>' : ''}
                <div class="notification-content">
                    ${typeIcon}
                    <div class="notification-details">
                        <div class="notification-header">
                            <h3 class="notification-title">${notification.title}</h3>
                            <span class="notification-time">${timeAgo}</span>
                        </div>
                        <p class="notification-message">${notification.message}</p>
                        <div class="notification-actions">
                            ${actions}
                            ${isUnread ? `<button class="notification-action-btn mark-read-btn" onclick="notificationsManager.markAsRead('${notification.id}')">Mark as Read</button>` : ''}
                            <button class="notification-action-btn delete-btn" onclick="notificationsManager.deleteNotification('${notification.id}')">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderEmptyState() {
        const filterText = this.currentFilter === 'all' ? 'notifications' : 
                          this.currentFilter === 'unread' ? 'unread notifications' :
                          this.currentFilter === 'co-owner-invite' ? 'invitations' : 'file shares';
        
        this.notificationsList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                <h3>No ${filterText} found</h3>
                <p>When you receive notifications, they'll appear here.</p>
            </div>
        `;
    }

    async markAsRead(notificationId) {
        try {
            await NotificationService.markAsRead(this.currentUser.uid, notificationId);
            
            // Update local state
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification) {
                notification.read = true;
            }
            
            this.updateUnreadCount();
            this.filterNotifications();
            this.showSuccess('Notification marked as read');
        } catch (error) {
            console.error('Error marking notification as read:', error);
            this.showError('Failed to mark notification as read');
        }
    }

    async markAllAsRead() {
        try {
            await NotificationService.markAllAsRead(this.currentUser.uid);
            
            // Update local state
            this.notifications.forEach(n => n.read = true);
            
            this.updateUnreadCount();
            this.filterNotifications();
            this.showSuccess('All notifications marked as read');
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            this.showError('Failed to mark all notifications as read');
        }
    }

    async deleteNotification(notificationId) {
        try {
            await NotificationService.deleteNotification(this.currentUser.uid, notificationId);
            
            // Remove from local state
            this.notifications = this.notifications.filter(n => n.id !== notificationId);
            
            this.updateUnreadCount();
            this.filterNotifications();
            this.showSuccess('Notification deleted');
        } catch (error) {
            console.error('Error deleting notification:', error);
            this.showError('Failed to delete notification');
        }
    }

    async respondToInvite(notificationId, accept) {
        try {
            await NotificationService.respondToCoOwnerInvite(this.currentUser.uid, notificationId, accept);
            
            // Update local state
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification) {
                notification.read = true;
                notification.responded = true;
                notification.accepted = accept;
            }
            
            this.updateUnreadCount();
            this.filterNotifications();
            
            const message = accept ? 'Invitation accepted! You are now a co-owner.' : 'Invitation declined.';
            this.showSuccess(message);
        } catch (error) {
            console.error('Error responding to invitation:', error);
            this.showError('Failed to respond to invitation');
        }
    }

    viewSharedFile(fileId) {
        // Navigate to resources page and open the file
        window.location.href = `/resources?file=${fileId}`;
    }

    viewEvent(eventId) {
        // Navigate to events page and show the event details
        window.location.href = `/events.html?event=${eventId}`;
    }

    viewGroup(groupId) {
        // Navigate to groups page and show the group details
        window.location.href = `/groups.html?group=${groupId}`;
    }

    viewAnnouncement(announcementId) {
        // Navigate to announcements page and show the announcement
        window.location.href = `/announcements.html?announcement=${announcementId}`;
    }

    viewForm(formId) {
        // Navigate to forms page and show the form
        window.location.href = `/forms.html?form=${formId}`;
    }

    viewResource(resourceId) {
        // Navigate to resources page and show the resource
        window.location.href = `/resources.html?resource=${resourceId}`;
    }

    startPolling() {
        // Check for new notifications every 30 seconds
        setInterval(async () => {
            try {
                // Only poll if user is authenticated
                if (!this.currentUser || !this.currentUser.uid) {
                    return;
                }
                
                const newCount = await NotificationService.getUnreadCount(this.currentUser.uid);
                const currentUnread = this.notifications.filter(n => !n.read).length;
                
                if (newCount > currentUnread) {
                    // New notifications arrived, reload
                    await this.loadNotifications();
                }
            } catch (error) {
                console.error('Error polling for notifications:', error);
            }
        }, 30000);
    }

    showSuccess(message) {
        // Create a temporary success notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--success-color);
            color: white;
            padding: 1rem;
            border-radius: 8px;
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showError(message) {
        // Create a temporary error notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--error-color);
            color: white;
            padding: 1rem;
            border-radius: 8px;
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize the notifications manager
const notificationsManager = new NotificationsManager();

// Make it globally available for inline event handlers
window.notificationsManager = notificationsManager;
