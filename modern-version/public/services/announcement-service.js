import { db } from '/config/firebase-config.js';
import { 
  collection, 
  addDoc, 
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

export const AnnouncementService = {
  async create(announcement) {
    const announcementData = {
      ...announcement,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, "announcements"), announcementData);
    
    // Send notifications for the announcement
    try {
      await this.sendAnnouncementNotifications({
        id: docRef.id,
        ...announcementData
      });
    } catch (notificationError) {
      console.warn('Error sending announcement notifications:', notificationError);
      // Don't fail announcement creation if notifications fail
    }
    
    return docRef;
  },

  // Send notifications for new announcements
  async sendAnnouncementNotifications(announcement) {
    try {
      // Import services dynamically to avoid circular dependencies
      const NotificationService = (await import('/services/notification-service.js')).default;
      
      // Get creator's display name
      const userRef = doc(db, 'users', announcement.createdBy);
      const userDoc = await getDoc(userRef);
      const creatorName = userDoc.exists() ? 
        (userDoc.data().displayName || userDoc.data().email?.split('@')[0] || 'Someone') : 
        'Someone';

      const notifications = [];
      const recipientIds = new Set(); // Prevent duplicate notifications

      // Notify group members if announcement has a groupId
      if (announcement.groupId) {
        try {
          const GroupsService = (await import('/services/groups-service.js')).default;
          const group = await GroupsService.getGroupDetails(announcement.groupId);
          if (group && group.members) {
            for (const memberId of group.members) {
              if (memberId !== announcement.createdBy && !recipientIds.has(memberId)) {
                recipientIds.add(memberId);
                notifications.push(
                  NotificationService.createAnnouncementNotification(
                    announcement.id,
                    announcement.title,
                    announcement.content,
                    announcement.createdBy,
                    creatorName,
                    memberId
                  )
                );
              }
            }
          }
        } catch (groupError) {
          console.warn(`Could not load group ${announcement.groupId} for notifications:`, groupError);
        }
      }

      // Send all notifications
      if (notifications.length > 0) {
        await Promise.allSettled(notifications);
        console.log(`Sent ${notifications.length} announcement notifications for: ${announcement.title}`);
      }

    } catch (error) {
      console.error('Error sending announcement notifications:', error);
      throw error;
    }
  },
  
  async getAll(pageSize = 10, startAfterDoc = null) {
    let q = query(
      collection(db, "announcements"),
      orderBy("time", "desc"),
      limit(pageSize)
    );
    
    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }
    
    return await getDocs(q);
  },
  
  async delete(id) {
    return await deleteDoc(doc(db, "announcements", id));
  }
};