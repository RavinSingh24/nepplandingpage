import { 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy,
    serverTimestamp,
    getDoc 
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { db, auth } from '/config/firebase-config.js';

class NotificationService {
    constructor() {
        this.collectionName = 'notifications'; // Keep for backward compatibility if needed
    }

    // Create a new notification using subcollection approach
    async createNotification(notificationData) {
        try {
            const notification = {
                type: notificationData.type, // 'co-owner-invite', 'file-shared', 'announcement', etc.
                title: notificationData.title,
                message: notificationData.message,
                senderId: notificationData.senderId,
                read: false,
                data: notificationData.data || {}, // Additional data like groupId, fileId, etc.
                createdAt: serverTimestamp()
            };

            // Use subcollection: users/{recipientId}/notifications
            const userNotificationsRef = collection(db, 'users', notificationData.recipientId, 'notifications');
            const docRef = await addDoc(userNotificationsRef, notification);
            
            return {
                id: docRef.id,
                ...notification,
                createdAt: new Date()
            };
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    // Get notifications for a user using subcollection
    async getUserNotifications(userId) {
        try {
            if (!userId) {
                console.warn('No userId provided to getUserNotifications');
                return [];
            }

            // Query the user's notification subcollection
            const userNotificationsRef = collection(db, 'users', userId, 'notifications');
            const userNotificationsQuery = query(
                userNotificationsRef,
                orderBy('createdAt', 'desc')
            );
            
            const snapshot = await getDocs(userNotificationsQuery);
            const notifications = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                notifications.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date()
                });
            });
            
            return notifications;
        } catch (error) {
            console.warn('Error getting user notifications:', error.message);
            // Return empty array to prevent app crashes
            return [];
        }
    }

    // Get unread notification count
    async getUnreadCount(userId) {
        try {
            if (!userId) return 0;
            
            // Get all notifications for the user and count unread ones
            const notifications = await this.getUserNotifications(userId);
            return notifications.filter(notification => !notification.read).length;
        } catch (error) {
            console.error('Error getting unread count:', error);
            return 0;
        }
    }

    // Mark notification as read using subcollection
    async markAsRead(userId, notificationId) {
        try {
            if (!userId || !notificationId) {
                console.warn('Missing userId or notificationId for markAsRead');
                return;
            }

            const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
            await updateDoc(notificationRef, {
                read: true
            });
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }

    // Mark all notifications as read for a user using subcollection
    async markAllAsRead(userId) {
        try {
            if (!userId) {
                console.warn('No userId provided to markAllAsRead');
                return;
            }

            const userNotificationsRef = collection(db, 'users', userId, 'notifications');
            const unreadQuery = query(
                userNotificationsRef,
                where('read', '==', false)
            );
            
            const snapshot = await getDocs(unreadQuery);
            
            const updatePromises = [];
            snapshot.forEach(doc => {
                updatePromises.push(updateDoc(doc.ref, { read: true }));
            });
            
            await Promise.all(updatePromises);
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            throw error;
        }
    }

    // Delete notification using subcollection
    async deleteNotification(userId, notificationId) {
        try {
            if (!userId || !notificationId) {
                console.warn('Missing userId or notificationId for deleteNotification');
                return;
            }

            const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
            await deleteDoc(notificationRef);
        } catch (error) {
            console.error('Error deleting notification:', error);
            throw error;
        }
    }

    // Create co-owner invitation notification
    async createCoOwnerInvite(groupId, groupName, senderId, senderName, recipientId) {
        return await this.createNotification({
            type: 'co-owner-invite',
            title: 'Co-Owner Invitation',
            message: `${senderName} has invited you to be a co-owner of the group "${groupName}"`,
            recipientId: recipientId,
            senderId: senderId,
            data: {
                groupId: groupId,
                groupName: groupName,
                action: 'accept_co_owner'
            }
        });
    }

    // Handle co-owner invitation response
    async respondToCoOwnerInvite(userId, notificationId, accept) {
        try {
            const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
            const notificationDoc = await getDoc(notificationRef);
            
            if (!notificationDoc.exists()) {
                throw new Error('Notification not found');
            }
            
            const notification = notificationDoc.data();
            const groupId = notification.data.groupId;
            
            if (accept) {
                // Add user as co-owner to the group
                const GroupsService = (await import('/services/groups-service.js')).default;
                await GroupsService.addCoOwner(groupId, userId);
                
                // Update notification status
                await updateDoc(notificationRef, {
                    read: true,
                    responded: true,
                    accepted: true
                });
            } else {
                // Just mark as responded and declined
                await updateDoc(notificationRef, {
                    read: true,
                    responded: true,
                    accepted: false
                });
            }
            
            return true;
        } catch (error) {
            console.error('Error responding to co-owner invite:', error);
            throw error;
        }
    }

    // Create file sharing notification
    async createFileShareNotification(fileId, fileName, senderId, senderName, recipientId) {
        return await this.createNotification({
            type: 'file-shared',
            title: 'File Shared',
            message: `${senderName} shared a file "${fileName}" with you`,
            recipientId: recipientId,
            senderId: senderId,
            data: {
                fileId: fileId,
                fileName: fileName,
                action: 'view_file'
            }
        });
    }

    // Create event notification
    async createEventNotification(eventId, eventTitle, eventDate, eventTime, senderId, senderName, recipientId) {
        const eventDateTime = new Date(`${eventDate}T${eventTime || '00:00'}`);
        const formattedDate = eventDateTime.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formattedTime = eventTime ? new Date(`2000-01-01T${eventTime}`).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }) : '';
        
        return await this.createNotification({
            type: 'event-posted',
            title: 'New Event Posted',
            message: `${senderName} posted a new event "${eventTitle}" on ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ''}`,
            recipientId: recipientId,
            senderId: senderId,
            data: {
                eventId: eventId,
                eventTitle: eventTitle,
                eventDate: eventDate,
                eventTime: eventTime,
                action: 'view_event'
            }
        });
    }

    // Create group invitation notification
    async createGroupInviteNotification(groupId, groupName, senderId, senderName, recipientId) {
        return await this.createNotification({
            type: 'group-invite',
            title: 'Group Invitation',
            message: `${senderName} added you to the group "${groupName}"`,
            recipientId: recipientId,
            senderId: senderId,
            data: {
                groupId: groupId,
                groupName: groupName,
                action: 'view_group'
            }
        });
    }

    // Create announcement notification
    async createAnnouncementNotification(announcementId, title, content, senderId, senderName, recipientId) {
        return await this.createNotification({
            type: 'announcement',
            title: 'New Announcement',
            message: `${senderName} posted: "${title}"`,
            recipientId: recipientId,
            senderId: senderId,
            data: {
                announcementId: announcementId,
                announcementTitle: title,
                announcementContent: content,
                action: 'view_announcement'
            }
        });
    }

    // Create form due notification
    async createFormDueNotification(formId, formTitle, recipientId, dueDate) {
        const dueDateFormatted = dueDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        return await this.createNotification({
            type: 'form-due',
            title: 'Form Due Soon',
            message: `Form "${formTitle}" is due on ${dueDateFormatted}`,
            recipientId: recipientId,
            senderId: null, // System notification
            data: {
                formId: formId,
                formTitle: formTitle,
                dueDate: dueDate.toISOString(),
                action: 'view_form'
            }
        });
    }

    // Create new form notification
    async createNewFormNotification(formId, formTitle, senderId, senderName, recipientId) {
        return await this.createNotification({
            type: 'form-posted',
            title: 'New Form Available',
            message: `${senderName} posted a new form "${formTitle}"`,
            recipientId: recipientId,
            senderId: senderId,
            data: {
                formId: formId,
                formTitle: formTitle,
                action: 'view_form'
            }
        });
    }

    // Create resource shared notification (for resources page)
    async createResourceSharedNotification(resourceId, resourceName, senderId, senderName, recipientId) {
        return await this.createNotification({
            type: 'resource-shared',
            title: 'Resource Shared',
            message: `${senderName} shared a resource "${resourceName}" with you`,
            recipientId: recipientId,
            senderId: senderId,
            data: {
                resourceId: resourceId,
                resourceName: resourceName,
                action: 'view_resource'
            }
        });
    }

    // Send welcome notification to new users
    async sendWelcomeNotification(userId, userEmail) {
        try {
            const welcomeNotification = {
                type: 'welcome',
                title: '🎉 Welcome to NEPP!',
                message: `Welcome to the NoVA Extracurricular Pyramid Program platform! We're excited to have you join our educational community. 

⚠️ Please note: NEPP is currently in active development. You may encounter bugs or features that are still being refined. Your patience and feedback are greatly appreciated as we work to improve the platform.

🚀 Get started by:
• Joining groups with invite codes
• Creating your first form or announcement
• Exploring the resources section
• Connecting with other members

If you experience any issues or have suggestions, please use the feedback option in Settings.`,
                senderId: 'system',
                recipientId: userId,
                data: {
                    isWelcomeMessage: true,
                    userEmail: userEmail
                }
            };

            return await this.createNotification(welcomeNotification);
        } catch (error) {
            console.error('Error sending welcome notification:', error);
            throw error;
        }
    }

    // Format date for display
    formatDate(date) {
        if (!date) return 'Unknown';
        
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffMinutes = Math.ceil(diffTime / (1000 * 60));
        const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffMinutes < 60) {
            return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

export default new NotificationService();
