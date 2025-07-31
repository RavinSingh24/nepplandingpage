import { auth, db } from '/config/firebase-config.js';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Import notification service for welcome messages
let NotificationService;
try {
  const module = await import('/services/notification-service.js');
  NotificationService = module.default;
} catch (error) {
  console.warn('NotificationService not available during auth:', error);
}

const AuthService = {
  async login(email, password) {
    return await signInWithEmailAndPassword(auth, email, password);
  },
  
  async register(email, password, userData) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: userData.displayName });
    
    // Store additional user data in Firestore
    await setDoc(doc(db, "users", userCredential.user.uid), {
      displayName: userData.displayName,
      email: email,
      role: userData.role || 'user',
      department: userData.department || '',
      createdAt: new Date().toISOString()
    });
    
    // Send welcome notification to new user
    if (NotificationService) {
      try {
        await NotificationService.sendWelcomeNotification(userCredential.user.uid, email);
        console.log('Welcome notification sent to new user');
      } catch (error) {
        console.warn('Failed to send welcome notification:', error);
        // Don't throw error - registration should still succeed
      }
    }
    
    return userCredential;
  },

  async resetPassword(email) {
    return await sendPasswordResetEmail(auth, email);
  },

  async getCurrentUser() {
    if (!auth.currentUser) return null;
    
    return new Promise((resolve) => {
      if (auth.currentUser) {
        resolve({
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          displayName: auth.currentUser.displayName
        });
      } else {
        resolve(null);
      }
    });
  },

  // Search users by name or email (for user targeting)
  async searchUsers(searchTerm) {
    const usersRef = collection(db, "users");
    const q = query(usersRef, 
      where("displayName", ">=", searchTerm),
      where("displayName", "<=", searchTerm + '\uf8ff')
    );
    
    const snapshot = await getDocs(q);
    const users = [];
    snapshot.forEach(doc => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });
    return users;
  }
};

export { AuthService };