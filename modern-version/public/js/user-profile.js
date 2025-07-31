import { auth, db } from '/config/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

class UserProfileViewer {
  constructor() {
    this.currentUser = null;
    this.targetUserId = null;
    this.targetUserData = null;
    this.init();
  }

  init() {
    // Get user ID from URL params
    const urlParams = new URLSearchParams(window.location.search);
    this.targetUserId = urlParams.get('id');
    
    if (!this.targetUserId) {
      this.showError('No user ID provided');
      return;
    }

    // Wait for auth state
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.currentUser = user;
        await this.loadTargetUser();
      } else {
        // Allow viewing without being logged in, but with limited functionality
        await this.loadTargetUser();
      }
    });
  }

  async loadTargetUser() {
    try {
      const userDoc = await getDoc(doc(db, 'users', this.targetUserId));
      
      if (!userDoc.exists()) {
        this.showError('User not found');
        return;
      }

      this.targetUserData = userDoc.data();
      
      // Check if user profile is public or if it's the current user
      const isOwnProfile = this.currentUser && this.currentUser.uid === this.targetUserId;
      const isPublicProfile = this.targetUserData.profilePrivacy !== 'private';
      
      if (!isOwnProfile && !isPublicProfile) {
        this.showError('This profile is private');
        return;
      }

      // Only redirect to edit profile if explicitly requested, not for viewing
      // Remove automatic redirect to allow viewing own public profile

      await this.displayUserProfile();
      await this.loadUserStatistics();
      await this.loadUserActivity();
      await this.loadUserGroups();
      this.setupActionButtons();
      
    } catch (error) {
      console.error('Error loading user profile:', error);
      this.showError('Failed to load user profile');
    }
  }

  async displayUserProfile() {
    if (!this.targetUserData) return;

    // Update page title
    document.title = `${this.targetUserData.displayName || 'User'} - NEPP`;
    
    // Display user information
    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileEmail = document.getElementById('profileEmail');
    const profileInitial = document.getElementById('profileInitial');
    const profileBio = document.getElementById('profileBio');
    const memberSince = document.getElementById('memberSince');

    if (profileDisplayName) {
      profileDisplayName.textContent = this.targetUserData.displayName || 'Anonymous User';
    }
    
    // Only show email if user allows it or it's public
    if (profileEmail) {
      if (this.targetUserData.showEmail !== false) {
        profileEmail.textContent = this.targetUserData.email || 'Email not available';
      } else {
        profileEmail.textContent = 'Email private';
      }
    }
    
    if (profileInitial) {
      const name = this.targetUserData.displayName || this.targetUserData.email || 'U';
      profileInitial.textContent = name.charAt(0).toUpperCase();
    }

    // Display bio if available
    if (profileBio && this.targetUserData.bio) {
      profileBio.textContent = this.targetUserData.bio;
      profileBio.style.display = 'block';
    }

    // Display profile picture if available
    if (this.targetUserData.photoURL) {
      this.displayProfilePicture(this.targetUserData.photoURL);
    }

    // Display member since date
    if (memberSince && this.targetUserData.createdAt) {
      const creationDate = this.getDateFromTimestamp(this.targetUserData.createdAt);
      memberSince.textContent = creationDate.toLocaleDateString();
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

  async loadUserStatistics() {
    try {
      const stats = {
        formsCreated: 0,
        groupsJoined: 0,
        responsesSubmitted: 0,
        daysActive: 0
      };

      // Count public forms created by user
      try {
        const formsQuery = query(
          collection(db, 'forms'),
          where('createdBy', '==', this.targetUserId),
          where('type', '==', 'public') // Only count public forms
        );
        const formsSnapshot = await getDocs(formsQuery);
        stats.formsCreated = formsSnapshot.size;
      } catch (error) {
        console.log('Could not load forms data:', error.message);
      }

      // Count groups user is member of
      try {
        const groupsQuery = query(
          collection(db, 'groups'),
          where('members', 'array-contains', this.targetUserId)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        stats.groupsJoined = groupsSnapshot.size;
      } catch (error) {
        console.log('Could not load groups data:', error.message);
      }

      // Calculate days since joining
      if (this.targetUserData.createdAt) {
        const joinDate = this.getDateFromTimestamp(this.targetUserData.createdAt);
        const today = new Date();
        const timeDiff = today - joinDate;
        stats.daysActive = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      }

      this.updateStatisticsDisplay(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  }

  updateStatisticsDisplay(stats) {
    const elements = {
      formsCreated: document.getElementById('formsCreated'),
      groupsJoined: document.getElementById('groupsJoined'),
      responsesSubmitted: document.getElementById('responsesSubmitted'),
      daysActive: document.getElementById('daysActive')
    };

    if (elements.formsCreated) elements.formsCreated.textContent = stats.formsCreated;
    if (elements.groupsJoined) elements.groupsJoined.textContent = stats.groupsJoined;
    if (elements.responsesSubmitted) elements.responsesSubmitted.textContent = stats.responsesSubmitted;
    if (elements.daysActive) elements.daysActive.textContent = stats.daysActive;
  }

  async loadUserActivity() {
    const activityList = document.getElementById('recentActivity');
    if (!activityList) return;

    try {
      const activities = [];

      // Get recent public forms created
      try {
        const recentFormsQuery = query(
          collection(db, 'forms'),
          where('createdBy', '==', this.targetUserId),
          where('type', '==', 'public'),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const recentFormsSnapshot = await getDocs(recentFormsQuery);
        
        recentFormsSnapshot.forEach(doc => {
          const form = doc.data();
          activities.push({
            type: 'form_created',
            title: 'Created a public form',
            description: form.title,
            time: this.getDateFromTimestamp(form.createdAt),
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
              <div class="activity-title">No recent public activity</div>
              <div class="activity-description">This user hasn't created any public content recently</div>
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

  async loadUserGroups() {
    const groupsList = document.getElementById('userGroups');
    if (!groupsList) return;

    try {
      const groupsQuery = query(
        collection(db, 'groups'),
        where('members', 'array-contains', this.targetUserId),
        where('type', '==', 'open') // Only show public groups
      );
      
      const groupsSnapshot = await getDocs(groupsQuery);
      
      if (groupsSnapshot.empty) {
        groupsList.innerHTML = `
          <div class="loading-state">
            <p>This user is not a member of any public groups.</p>
          </div>
        `;
        return;
      }

      const groupsHtml = groupsSnapshot.docs.map(doc => {
        const group = doc.data();
        const memberCount = group.members ? group.members.length : 0;
        const maxMembers = group.maxMembers || 'Unlimited';
        
        return `
          <div class="group-item" onclick="window.location.href='/html/groups.html'">
            <div class="group-name">${group.name}</div>
            <div class="group-description">${group.description || 'No description available'}</div>
            <div class="group-meta">
              <span class="group-type ${group.type}">${group.type}</span>
              <span>${memberCount} members</span>
              <span>Max: ${maxMembers}</span>
            </div>
          </div>
        `;
      }).join('');

      groupsList.innerHTML = groupsHtml;
    } catch (error) {
      console.error('Error loading user groups:', error);
      groupsList.innerHTML = '<div class="loading-state">Unable to load groups</div>';
    }
  }

  setupActionButtons() {
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const viewFormsBtn = document.getElementById('viewFormsBtn');

    // Send message button (placeholder for future messaging feature)
    if (sendMessageBtn && this.currentUser) {
      sendMessageBtn.style.display = 'flex';
      sendMessageBtn.addEventListener('click', () => {
        alert('Messaging feature coming soon!');
      });
    }

    // View public forms button
    if (viewFormsBtn) {
      viewFormsBtn.addEventListener('click', () => {
        window.location.href = `/html/forms.html?creator=${this.targetUserId}`;
      });
    }
  }

  getActivityIcon(type) {
    switch (type) {
      case 'form_created':
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>`;
      default:
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>`;
    }
  }

  formatRelativeTime(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
  }

  showError(message) {
    const errorContainer = document.getElementById('errorContainer');
    const profileContainer = document.querySelector('.profile-container');
    
    if (errorContainer && profileContainer) {
      profileContainer.style.display = 'none';
      errorContainer.style.display = 'flex';
      
      const errorContent = errorContainer.querySelector('.error-content p');
      if (errorContent) {
        errorContent.textContent = message;
      }
    }
  }

  // Helper method to safely convert various timestamp formats to Date
  getDateFromTimestamp(timestamp) {
    if (!timestamp) {
      return new Date(0); // Default to epoch if no timestamp
    }
    
    // If it's a Firestore Timestamp with toDate method
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // If it's already a Date object
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // If it's a string or number, try to parse it
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      const parsed = new Date(timestamp);
      return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }
    
    // If it has seconds and nanoseconds (Firestore Timestamp-like object)
    if (timestamp && typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000);
    }
    
    // Fallback to epoch
    return new Date(0);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new UserProfileViewer();
});
