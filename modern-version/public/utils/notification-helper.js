// Notification Integration Helper
// This utility provides easy-to-use functions for sending notifications from different parts of the app

import NotificationService from '/services/notification-service.js';

class NotificationHelper {
    // Send a notification when a user is added to a group
    static async notifyGroupMemberAdded(groupId, groupName, addedByUserId, addedByUserName, recipientId) {
        try {
            if (addedByUserId === recipientId) {
                // Don't notify users when they add themselves
                return;
            }

            await NotificationService.createGroupInviteNotification(
                groupId,
                groupName,
                addedByUserId,
                addedByUserName,
                recipientId
            );
        } catch (error) {
            console.warn('Failed to send group member notification:', error);
        }
    }

    // Send notifications when a file is shared
    static async notifyFileShared(fileId, fileName, sharedByUserId, sharedByUserName, recipientIds) {
        try {
            const promises = recipientIds
                .filter(recipientId => recipientId !== sharedByUserId) // Don't notify the sharer
                .map(recipientId => 
                    NotificationService.createFileShareNotification(
                        fileId,
                        fileName,
                        sharedByUserId,
                        sharedByUserName,
                        recipientId
                    )
                );

            await Promise.all(promises);
        } catch (error) {
            console.warn('Failed to send file share notifications:', error);
        }
    }

    // Send co-owner invitation notification
    static async notifyCoOwnerInvite(groupId, groupName, invitedByUserId, invitedByUserName, recipientId) {
        try {
            if (invitedByUserId === recipientId) {
                // Don't notify users when they invite themselves
                return;
            }

            await NotificationService.createCoOwnerInvite(
                groupId,
                groupName,
                invitedByUserId,
                invitedByUserName,
                recipientId
            );
        } catch (error) {
            console.warn('Failed to send co-owner invite notification:', error);
        }
    }

    // Send announcement notification
    static async notifyAnnouncement(announcementId, title, message, announcerUserId, announcerUserName, recipientIds) {
        try {
            const promises = recipientIds
                .filter(recipientId => recipientId !== announcerUserId) // Don't notify the announcer
                .map(recipientId => 
                    NotificationService.createAnnouncementNotification(
                        announcementId,
                        title,
                        message,
                        announcerUserId,
                        announcerUserName,
                        recipientId
                    )
                );

            await Promise.all(promises);
        } catch (error) {
            console.warn('Failed to send announcement notifications:', error);
        }
    }

    // Send form due reminder notifications
    static async notifyFormDue(formId, formTitle, dueDate, recipientIds) {
        try {
            const promises = recipientIds.map(recipientId => 
                NotificationService.createFormDueNotification(
                    formId,
                    formTitle,
                    recipientId,
                    dueDate
                )
            );

            await Promise.all(promises);
        } catch (error) {
            console.warn('Failed to send form due notifications:', error);
        }
    }

    // Get user's display name from user document
    static async getUserDisplayName(userId) {
        try {
            const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
            const { db } = await import('/config/firebase-config.js');
            
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                return userData.displayName || userData.email || 'Someone';
            }
            return 'Someone';
        } catch (error) {
            console.warn('Failed to get user display name:', error);
            return 'Someone';
        }
    }

    // Bulk notify multiple recipients
    static async bulkNotify(notificationType, data, recipientIds) {
        try {
            const promises = recipientIds.map(async (recipientId) => {
                switch (notificationType) {
                    case 'group-invite':
                        return this.notifyGroupMemberAdded(
                            data.groupId,
                            data.groupName,
                            data.addedByUserId,
                            data.addedByUserName,
                            recipientId
                        );
                    case 'file-shared':
                        return NotificationService.createFileShareNotification(
                            data.fileId,
                            data.fileName,
                            data.sharedByUserId,
                            data.sharedByUserName,
                            recipientId
                        );
                    case 'announcement':
                        return NotificationService.createAnnouncementNotification(
                            data.announcementId,
                            data.title,
                            data.message,
                            data.announcerUserId,
                            data.announcerUserName,
                            recipientId
                        );
                    default:
                        console.warn('Unknown notification type:', notificationType);
                }
            });

            await Promise.all(promises);
        } catch (error) {
            console.warn('Failed to send bulk notifications:', error);
        }
    }
}

export default NotificationHelper;
