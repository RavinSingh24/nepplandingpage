import { auth, db, storage } from '/config/firebase-config.js';
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  orderBy, 
  limit 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

class ProfileManager {
  constructor() {
    this.currentUser = null;
    this.init();
  }

  init() {
    // Add a small delay to ensure Firebase has time to check for existing session
    setTimeout(() => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          console.log('User authenticated:', user.email);
          this.currentUser = user;
          await this.loadUserProfile();
          this.setupEventListeners();
          this.displayUserInfo();
        } else {
          console.log('No user found, redirecting to login');
          window.location.href = '/login.html';
        }
      });
    }, 500); // Increased delay to allow for session restoration
  }

  // Display user info
  displayUserInfo() {
    if (!this.currentUser) return;

    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileEmail = document.getElementById('profileEmail');
    const profileInitial = document.getElementById('profileInitial');
    const displayNameInput = document.getElementById('displayName');
    const emailInput = document.getElementById('email');
    const memberSinceElement = document.getElementById('memberSince');

    if (profileDisplayName) {
      profileDisplayName.textContent = this.currentUser.displayName || 'No display name';
    }
    
    if (profileEmail) {
      profileEmail.textContent = this.currentUser.email || 'No email';
    }
    
    if (profileInitial) {
      const name = this.currentUser.displayName || this.currentUser.email || 'U';
      profileInitial.textContent = name.charAt(0).toUpperCase();
    }
    
    if (displayNameInput) {
      displayNameInput.value = this.currentUser.displayName || '';
    }
    
    if (emailInput) {
      emailInput.value = this.currentUser.email || '';
    }

    // Load profile picture if exists
    if (this.currentUser.photoURL) {
      this.displayProfilePicture(this.currentUser.photoURL);
    }

    // Set member since date
    if (memberSinceElement && this.currentUser.metadata?.creationTime) {
      const creationDate = new Date(this.currentUser.metadata.creationTime);
      memberSinceElement.textContent = creationDate.toLocaleDateString();
    }
  }

  displayProfilePicture(photoURL) {
    const profileImage = document.getElementById('profileImage');
    const profileInitial = document.getElementById('profileInitial');
    
    if (profileImage && profileInitial) {
      profileImage.src = photoURL;
      profileImage.style.display = 'block';
      profileInitial.style.display = 'none';
    }
  }

  // Load user profile data
  async loadUserProfile() {
    try {
      const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Update bio field
        const bioInput = document.getElementById('bio');
        if (bioInput && userData.bio) {
          bioInput.value = userData.bio;
        }

        // Load profile picture from Firestore if different from auth
        if (userData.photoURL && userData.photoURL !== this.currentUser.photoURL) {
          this.displayProfilePicture(userData.photoURL);
        }
      }
      
      // Load user statistics
      await this.loadUserStatistics();
      
      // Load recent activity
      await this.loadRecentActivity();
      
      // Load privacy settings
      await this.loadPrivacySettings();
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  // Load user statistics
  async loadUserStatistics() {
    try {
      const stats = {
        formsCreated: 0,
        formsBookmarked: 0,
        responsesReceived: 0,
        responsesSubmitted: 0
      };

      // Count forms created by user
      try {
        const formsQuery = query(
          collection(db, 'forms'),
          where('createdBy', '==', this.currentUser.uid)
        );
        const formsSnapshot = await getDocs(formsQuery);
        stats.formsCreated = formsSnapshot.size;

        // Count responses received on user's forms
        for (const formDoc of formsSnapshot.docs) {
          try {
            const responsesQuery = query(collection(db, 'forms', formDoc.id, 'responses'));
            const responsesSnapshot = await getDocs(responsesQuery);
            stats.responsesReceived += responsesSnapshot.size;
          } catch (error) {
            console.log('Could not access responses for form:', formDoc.id);
          }
        }
      } catch (error) {
        console.log('Forms data not accessible:', error.message);
      }

      // Count bookmarked forms
      try {
        const userDoc = await getDoc(doc(db, 'users', this.currentUser.uid));
        const bookmarkedForms = userDoc.exists() ? (userDoc.data().bookmarkedForms || []) : [];
        stats.formsBookmarked = bookmarkedForms.length;
      } catch (error) {
        console.log('User data not accessible:', error.message);
      }

      // Update statistics display
      this.updateStatisticsDisplay(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
      // Show default stats if there's an error
      this.updateStatisticsDisplay({
        formsCreated: 0,
        formsBookmarked: 0,
        responsesReceived: 0,
        responsesSubmitted: 0
      });
    }
  }

  updateStatisticsDisplay(stats) {
    const elements = {
      formsCreated: document.getElementById('formsCreated'),
      formsBookmarked: document.getElementById('formsBookmarked'),
      responsesReceived: document.getElementById('responsesReceived'),
      responsesSubmitted: document.getElementById('responsesSubmitted')
    };

    if (elements.formsCreated) elements.formsCreated.textContent = stats.formsCreated;
    if (elements.formsBookmarked) elements.formsBookmarked.textContent = stats.formsBookmarked;
    if (elements.responsesReceived) elements.responsesReceived.textContent = stats.responsesReceived;
    if (elements.responsesSubmitted) elements.responsesSubmitted.textContent = stats.responsesSubmitted;
  }

  // Load recent activity
  async loadRecentActivity() {
    const activityList = document.getElementById('recentActivity');
    if (!activityList) return;

    try {
      const activities = [];

      // Get recent forms created
      try {
        const recentFormsQuery = query(
          collection(db, 'forms'),
          where('createdBy', '==', this.currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const recentFormsSnapshot = await getDocs(recentFormsQuery);
        
        recentFormsSnapshot.forEach(doc => {
          const form = doc.data();
          activities.push({
            type: 'form_created',
            title: 'Created a new form',
            description: form.title,
            time: form.createdAt?.toDate() || new Date(),
            icon: 'plus'
          });
        });
      } catch (error) {
        console.log('Could not load recent forms:', error.message);
      }

      // Sort by time
      activities.sort((a, b) => b.time - a.time);
      
      // Render activities
      if (activities.length === 0) {
        activityList.innerHTML = `
          <div class="activity-item">
            <div class="activity-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </div>
            <div class="activity-content">
              <div class="activity-title">Welcome to NEPP!</div>
              <div class="activity-description">Your activity will appear here as you use the platform</div>
              <div class="activity-time">Today</div>
            </div>
          </div>
        `;
      } else {
        activityList.innerHTML = activities.map(activity => `
          <div class="activity-item">
            <div class="activity-icon">
              ${this.getActivityIcon(activity.type)}
            </div>
            <div class="activity-content">
              <div class="activity-title">${activity.title}</div>
              <div class="activity-description">${activity.description}</div>
              <div class="activity-time">${this.formatRelativeTime(activity.time)}</div>
            </div>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Error loading activity:', error);
      activityList.innerHTML = '<div class="loading-state">Unable to load recent activity</div>';
    }
  }

  // Get activity icon based on type
  getActivityIcon(type) {
    switch (type) {
      case 'form_created':
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>`;
      case 'response_submitted':
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>`;
      default:
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>`;
    }
  }

  // Format relative time
  formatRelativeTime(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
  }

  // Setup event listeners
  setupEventListeners() {
    // Save profile button
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveProfile());
    }
    
    // Save privacy settings button
    const savePrivacyBtn = document.getElementById('savePrivacyBtn');
    if (savePrivacyBtn) {
      savePrivacyBtn.addEventListener('click', () => this.savePrivacySettings());
    }
    
    // Delete account button
    const deleteBtn = document.getElementById('deleteAccountBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteAccount());
    }

    // Change avatar button
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    const avatarInput = document.getElementById('avatarInput');
    
    if (changeAvatarBtn && avatarInput) {
      changeAvatarBtn.addEventListener('click', () => {
        avatarInput.click();
      });

      avatarInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          this.uploadProfilePicture(e.target.files[0]);
        }
      });
    }
  }

  // Upload profile picture
  async uploadProfilePicture(file) {
    try {
      // Validate file
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('Image size must be less than 5MB');
        return;
      }

      const changeAvatarBtn = document.getElementById('changeAvatarBtn');
      if (changeAvatarBtn) {
        changeAvatarBtn.textContent = 'Uploading...';
        changeAvatarBtn.disabled = true;
      }

      // Upload to Firebase Storage
      const storageRef = ref(storage, `profile-pictures/${this.currentUser.uid}/${Date.now()}-${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Update user profile
      await updateProfile(this.currentUser, {
        photoURL: downloadURL
      });

      // Update Firestore user document
      await setDoc(doc(db, 'users', this.currentUser.uid), {
        photoURL: downloadURL,
        updatedAt: new Date()
      }, { merge: true });

      // Update display
      this.displayProfilePicture(downloadURL);

      alert('Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert('Failed to upload profile picture: ' + error.message);
    } finally {
      const changeAvatarBtn = document.getElementById('changeAvatarBtn');
      if (changeAvatarBtn) {
        changeAvatarBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
          </svg>
          Change Photo
        `;
        changeAvatarBtn.disabled = false;
      }
    }
  }

  // Save profile changes
  async saveProfile() {
    try {
      const displayName = document.getElementById('displayName')?.value.trim();
      const bio = document.getElementById('bio')?.value.trim();
      
      // Update Firebase Auth profile
      if (displayName && displayName !== this.currentUser.displayName) {
        await updateProfile(this.currentUser, { displayName });
      }
      
      // Update Firestore user document
      const userDocRef = doc(db, 'users', this.currentUser.uid);
      await setDoc(userDocRef, {
        displayName: displayName || '',
        bio: bio || '',
        email: this.currentUser.email,
        updatedAt: new Date()
      }, { merge: true });
      
      // Update display
      this.displayUserInfo();
      
      // Show success feedback
      const button = document.getElementById('saveProfileBtn');
      if (button) {
        const originalText = button.innerHTML;
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Saved!
        `;
        button.style.background = '#28a745';
        
        setTimeout(() => {
          button.innerHTML = originalText;
          button.style.background = '';
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile: ' + error.message);
    }
  }

  // Delete account
  async deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    if (!confirm('This will permanently delete all your data. Are you absolutely sure?')) {
      return;
    }

    try {
      // Note: In a real app, you'd want to delete user data from Firestore first
      await this.currentUser.delete();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('For security reasons, please log out and log back in before deleting your account.');
      } else {
        alert('Failed to delete account: ' + error.message);
      }
    }
  }

  // Save privacy settings
  async savePrivacySettings() {
    if (!this.currentUser) return;

    const profileVisibility = document.getElementById('profileVisibility').value;
    const emailVisibility = document.getElementById('emailVisibility').value;
    const showActivityStatus = document.getElementById('showActivityStatus').checked;
    const groupNotifications = document.getElementById('groupNotifications').checked;
    const formNotifications = document.getElementById('formNotifications').checked;

    const privacySettings = {
      profileVisibility,
      emailVisibility,
      showActivityStatus,
      groupNotifications,
      formNotifications,
      updatedAt: new Date()
    };

    try {
      await setDoc(doc(db, 'users', this.currentUser.uid), {
        privacySettings
      }, { merge: true });
      
      this.showSuccessMessage('Privacy settings saved successfully!');
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      this.showErrorMessage('Failed to save privacy settings');
    }
  }

  // Load privacy settings
  async loadPrivacySettings() {
    if (!this.currentUser) return;

    try {
      const userDocRef = doc(db, 'users', this.currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists() && userDoc.data().privacySettings) {
        const settings = userDoc.data().privacySettings;
        
        document.getElementById('profileVisibility').value = settings.profileVisibility || 'public';
        document.getElementById('emailVisibility').value = settings.emailVisibility || 'members';
        document.getElementById('showActivityStatus').checked = settings.showActivityStatus !== false;
        document.getElementById('groupNotifications').checked = settings.groupNotifications !== false;
        document.getElementById('formNotifications').checked = settings.formNotifications !== false;
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error);
    }
  }
}

// Initialize profile manager
document.addEventListener('DOMContentLoaded', () => {
  new ProfileManager();
});
