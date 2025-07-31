import { auth } from '/config/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

/**
 * Global authentication utility that provides shared user state across all modules
 */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.listeners = [];
        this.authInitialized = false;
        this.setupAuthListener();
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    metadata: user.metadata
                };
            } else {
                this.currentUser = null;
            }
            
            this.authInitialized = true;
            
            // Notify all listeners about the auth state change
            this.listeners.forEach(callback => callback(this.currentUser));
        });
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthInitialized() {
        return this.authInitialized;
    }

    // Subscribe to auth state changes
    onAuthStateChanged(callback) {
        this.listeners.push(callback);
        
        // Only call immediately if auth has been initialized
        if (this.authInitialized) {
            callback(this.currentUser);
        }
        
        // Return unsubscribe function
        return () => {
            const index = this.listeners.indexOf(callback);
            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        };
    }
}

// Create global instance
const authManager = new AuthManager();

export default authManager;
