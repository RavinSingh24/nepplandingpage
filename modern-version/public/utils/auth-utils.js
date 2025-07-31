import { auth } from '/config/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

export function initializeAuth(redirectToLogin = true) {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        const displayName = user.displayName || user.email?.split('@')[0] || "NEPP User";
        
        // Update all instances of user name display
        const userNameElements = document.querySelectorAll('#sidebar-user-name, #user-display-name');
        userNameElements.forEach(element => {
          if (element) {
            element.textContent = displayName;
          }
        });
        
        resolve({ user, displayName });
      } else if (redirectToLogin) {
        window.location.href = '/login.html';
      } else {
        resolve(null);
      }
    }, reject);
  });
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function getDisplayName(user) {
  return user?.displayName || user?.email?.split('@')[0] || "NEPP User";
}
