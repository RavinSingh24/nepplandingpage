import { db } from '/config/firebase-config.js';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

export const FormsService = {
  async create(form) {
    const docRef = await addDoc(collection(db, "forms"), {
      ...form,
      targetUsers: form.targetUsers || [], // Array of user IDs
      isPublic: form.isPublic || false,
      createdAt: serverTimestamp(),
    });

    // Send notifications to targeted users
    try {
      await this.sendFormNotifications({
        id: docRef.id,
        ...form
      });
    } catch (notificationError) {
      console.warn('Error sending form notifications:', notificationError);
      // Don't fail form creation if notifications fail
    }

    return docRef;
  },

  // Send notifications for new forms
  async sendFormNotifications(form) {
    try {
      // Import services dynamically to avoid circular dependencies
      const NotificationService = (await import('/services/notification-service.js')).default;
      
      // Get creator's display name
      const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
      const userRef = doc(db, 'users', form.createdBy);
      const userDoc = await getDoc(userRef);
      const creatorName = userDoc.exists() ? 
        (userDoc.data().displayName || userDoc.data().email?.split('@')[0] || 'Unknown User') : 
        'Unknown User';

      const notifications = [];
      const recipientIds = new Set(); // Prevent duplicate notifications

      // Notify targeted users
      if (form.targetUsers && form.targetUsers.length > 0) {
        for (const userId of form.targetUsers) {
          if (userId !== form.createdBy && !recipientIds.has(userId)) {
            recipientIds.add(userId);
            notifications.push(
              NotificationService.createNewFormNotification(
                form.id,
                form.title,
                form.createdBy,
                creatorName,
                userId
              )
            );
          }
        }
      }

      // Send all notifications
      if (notifications.length > 0) {
        await Promise.allSettled(notifications);
        console.log(`Sent ${notifications.length} form notifications for form: ${form.title}`);
      }

    } catch (error) {
      console.error('Error sending form notifications:', error);
      throw error;
    }
  },

  async getAll(userId) {
    try {
      if (!userId) {
        console.error('No userId provided to getAll()');
        return [];
      }

      const q = query(collection(db, "forms"), 
        where("isPublic", "==", true));
      
      const [publicForms, targetedForms] = await Promise.all([
        getDocs(q),
        getDocs(query(collection(db, "forms"),
          where("targetUsers", "array-contains", userId)))
      ]);

      const forms = [];
      publicForms.forEach(doc => forms.push({ id: doc.id, ...doc.data() }));
      targetedForms.forEach(doc => {
        if (!forms.some(f => f.id === doc.id)) {
          forms.push({ id: doc.id, ...doc.data() });
        }
      });

      return forms.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    } catch (error) {
      console.error('Error fetching forms:', error);
      return [];
    }
  },

  // Get forms due within a specific number of days
  async getFormsDueIn(days = 1) {
    try {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      const q = query(collection(db, "forms"), 
        where("dueDate", "==", targetDateStr));
      
      const snapshot = await getDocs(q);
      const forms = [];
      snapshot.forEach(doc => forms.push({ id: doc.id, ...doc.data() }));

      return forms;
    } catch (error) {
      console.error('Error fetching forms due in', days, 'days:', error);
      return [];
    }
  },

  // Get all users who should receive notifications for a form
  async getFormNotificationRecipients(form) {
    try {
      const recipients = [];
      
      // Add target users
      if (form.targetUsers && form.targetUsers.length > 0) {
        recipients.push(...form.targetUsers);
      }
      
      // If it's a public form, we'd need to get all users (but this might be too many)
      // For now, we'll only notify targeted users
      
      return [...new Set(recipients)]; // Remove duplicates
    } catch (error) {
      console.error('Error getting form notification recipients:', error);
      return [];
    }
  }
};