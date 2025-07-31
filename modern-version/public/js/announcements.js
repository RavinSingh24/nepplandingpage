import { auth, db } from '/config/firebase-config.js';
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc,
  updateDoc,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

class AnnouncementsManager {
  constructor() {
    this.currentUser = null;
    this.userGroups = [];
    this.announcements = [];
    this.editingAnnouncement = null;
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.initializeElements();
    this.bindEvents();
    this.setupAuthListener();
  }

  initializeElements() {
    this.createBtn = document.querySelector('.create-announcement');
    this.popup = document.querySelector('.announcement-popup');
    this.overlay = document.querySelector('.overlay');
    this.closeBtn = document.querySelector('.close-popup');
    this.submitBtn = document.querySelector('.popup-submit');
    this.audienceRadios = document.querySelectorAll('input[name="audience"]');
    
    // Additional elements that will be available after DOM load
    this.messageInput = document.querySelector('#popupMessage');
    this.cancelBtn = document.querySelector('.popup-cancel');
    this.popupContent = document.querySelector('.popup-content');
    this.errorDiv = document.querySelector('.popup-error');
    this.announcementsList = document.querySelector('.announcements-list');

    // Note: initializeAudienceSelector() and addGroupSelectionToPopup() 
    // will be called after authentication in setupAuthListener()
  }

  addGroupSelectionToPopup() {
    // Ensure user is authenticated before proceeding
    if (!this.currentUser || !this.currentUser.uid) {
      console.log('User not authenticated yet, skipping audience selector initialization');
      return;
    }
    
    // Make sure messageInput exists before proceeding
    if (!this.messageInput) {
      this.messageInput = document.querySelector('#popupMessage');
      if (!this.messageInput) {
        console.error('Message input not found, cannot initialize audience selector');
        return;
      }
    }
    
    // Get user's display name for personalized greeting
    const userName = this.currentUser.displayName || this.currentUser.email?.split('@')[0] || 'User';
    
    const userGreetingAndFormHTML = `
      <div class="user-greeting" style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(255, 214, 0, 0.1); border: 1px solid #ffd600; border-radius: 8px;">
        <p style="margin: 0; color: #ffd600; font-weight: 500;">
          <span style="color: #ffffff;">Hello, </span>${userName}! 
          <span style="color: #ffffff;">What would you like to announce?</span>
        </p>
      </div>
      <div class="form-group">
        <label for="announcementTitle">Title:</label>
        <input type="text" id="announcementTitle" class="form-input" placeholder="Announcement title..." maxlength="100">
      </div>
      <div class="form-group">
        <label for="scheduledDate">Schedule for later (optional):</label>
        <input type="datetime-local" id="scheduledDate" class="form-input">
      </div>
    `;
    
    // Insert before textarea
    this.messageInput.insertAdjacentHTML('beforebegin', userGreetingAndFormHTML);
    
    this.titleInput = document.getElementById('announcementTitle');
    this.scheduledDateInput = document.getElementById('scheduledDate');
    
    // Initialize audience selector now that user is authenticated
    this.initializeAudienceSelector();
  }

  initializeAudienceSelector() {
    this.selectedGroups = new Set();
    this.selectedUsers = new Set();
    this.allGroups = [];
    this.allUsers = [];
    
    // Get references to audience selector elements
    this.audienceSelector = document.querySelector('.audience-selector');
    this.audienceTabs = document.querySelectorAll('.audience-tab');
    this.audienceSections = document.querySelectorAll('.audience-section');
    
    // Group elements
    this.selectedGroupsContainer = document.querySelector('#selectedGroups');
    this.groupSearch = document.querySelector('#groupSearch');
    this.groupResults = document.querySelector('#groupResults');
    
    // User elements
    this.selectedUsersContainer = document.querySelector('#selectedUsers');
    this.userSearch = document.querySelector('#userSearch');
    this.userResults = document.querySelector('#userResults');
    
    // Both mode elements
    this.bothGroupsContainer = document.querySelector('#selectedGroupsBoth');
    this.bothUsersContainer = document.querySelector('#selectedUsersBoth');
    this.bothGroupSearch = document.querySelector('#groupSearchBoth');
    this.bothUserSearch = document.querySelector('#userSearchBoth');
    this.bothGroupResults = document.querySelector('#groupResultsBoth');
    this.bothUserResults = document.querySelector('#userResultsBoth');
    
    this.bindAudienceEvents();
    this.loadGroupsAndUsers();
  }

  bindAudienceEvents() {
    // Tab switching
    this.audienceTabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchAudienceTab(tab.dataset.target));
    });
    
    // Group search events
    if (this.groupSearch) {
      this.groupSearch.addEventListener('input', (e) => this.searchGroups(e.target.value));
      this.groupSearch.addEventListener('focus', () => this.showGroupResults());
    }
    
    if (this.bothGroupSearch) {
      this.bothGroupSearch.addEventListener('input', (e) => this.searchGroups(e.target.value, 'both'));
      this.bothGroupSearch.addEventListener('focus', () => this.showGroupResults('both'));
    }
    
    // User search events
    if (this.userSearch) {
      this.userSearch.addEventListener('input', (e) => this.searchUsers(e.target.value));
      this.userSearch.addEventListener('focus', () => this.showUserResults());
    }
    
    if (this.bothUserSearch) {
      this.bothUserSearch.addEventListener('input', (e) => this.searchUsers(e.target.value, 'both'));
      this.bothUserSearch.addEventListener('focus', () => this.showUserResults('both'));
    }
    
    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.group-search') && !e.target.closest('.group-results')) {
        this.hideGroupResults();
      }
      if (!e.target.closest('.user-search') && !e.target.closest('.user-results')) {
        this.hideUserResults();
      }
    });
  }

  async loadGroupsAndUsers() {
    try {
      // Check if user is authenticated
      if (!this.currentUser || !this.currentUser.uid) {
        console.log('User not authenticated yet, skipping group and user loading');
        return;
      }

      // Load all groups user has access to
      const groupsQuery = query(
        collection(db, 'groups'),
        where('members', 'array-contains', this.currentUser.uid)
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      this.allGroups = [];
      groupsSnapshot.forEach(doc => {
        this.allGroups.push({ id: doc.id, ...doc.data() });
      });
      
      // Load all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      this.allUsers = [];
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        // Don't include current user in selection
        if (doc.id !== this.currentUser.uid) {
          this.allUsers.push({ id: doc.id, ...userData });
        }
      });
    } catch (error) {
      console.error('Error loading groups and users:', error);
    }
  }

  switchAudienceTab(tabName) {
    // Update active tab
    this.audienceTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.target === tabName);
    });
    
    // Update active section - map the tab names to actual section IDs
    const sectionIdMap = {
      'groups': 'groups-selection',
      'individuals': 'individuals-selection', 
      'both': 'both-selection'
    };
    
    this.audienceSections.forEach(section => {
      section.classList.toggle('active', section.id === sectionIdMap[tabName]);
    });
    
    // Clear search inputs and hide results
    this.clearSearches();
  }

  clearSearches() {
    if (this.groupSearch) this.groupSearch.value = '';
    if (this.userSearch) this.userSearch.value = '';
    if (this.bothGroupSearch) this.bothGroupSearch.value = '';
    if (this.bothUserSearch) this.bothUserSearch.value = '';
    this.hideGroupResults();
    this.hideUserResults();
  }

  searchGroups(query, mode = 'groups') {
    if (!query.trim()) {
      this.hideGroupResults(mode);
      return;
    }
    
    const filteredGroups = this.allGroups.filter(group =>
      group.name.toLowerCase().includes(query.toLowerCase()) ||
      group.description?.toLowerCase().includes(query.toLowerCase())
    );
    
    this.displayGroupResults(filteredGroups, mode);
  }

  displayGroupResults(groups, mode = 'groups') {
    const resultsContainer = mode === 'both' ? this.bothGroupResults : this.groupResults;
    if (!resultsContainer) return;
    
    if (groups.length === 0) {
      resultsContainer.innerHTML = '<div class="no-results">No groups found</div>';
    } else {
      resultsContainer.innerHTML = groups.map(group => `
        <div class="group-result" onclick="announcementsManager.selectGroup('${group.id}', '${mode}')">
          <div class="group-result-name">${group.name}</div>
          <div class="group-result-description">${group.description || 'No description'}</div>
          <div class="group-result-meta">
            <span>${group.members?.length || 0} members</span>
          </div>
        </div>
      `).join('');
    }
    
    this.showGroupResults(mode);
  }

  searchUsers(query, mode = 'users') {
    if (!query.trim()) {
      this.hideUserResults(mode);
      return;
    }
    
    const filteredUsers = this.allUsers.filter(user =>
      user.name?.toLowerCase().includes(query.toLowerCase()) ||
      user.email?.toLowerCase().includes(query.toLowerCase())
    );
    
    this.displayUserResults(filteredUsers, mode);
  }

  displayUserResults(users, mode = 'users') {
    const resultsContainer = mode === 'both' ? this.bothUserResults : this.userResults;
    if (!resultsContainer) return;
    
    if (users.length === 0) {
      resultsContainer.innerHTML = '<div class="no-results">No users found</div>';
    } else {
      resultsContainer.innerHTML = users.map(user => `
        <div class="user-result" onclick="announcementsManager.selectUser('${user.id}', '${mode}')">
          <div class="user-result-name">${user.name || user.email}</div>
          <div class="user-result-email">${user.email}</div>
        </div>
      `).join('');
    }
    
    this.showUserResults(mode);
  }

  selectGroup(groupId, mode = 'groups') {
    this.selectedGroups.add(groupId);
    this.updateSelectedGroups(mode);
    this.clearGroupSearch(mode);
  }

  selectUser(userId, mode = 'users') {
    this.selectedUsers.add(userId);
    this.updateSelectedUsers(mode);
    this.clearUserSearch(mode);
  }

  removeGroup(groupId) {
    this.selectedGroups.delete(groupId);
    this.updateSelectedGroups();
    this.updateSelectedGroups('both');
  }

  removeUser(userId) {
    this.selectedUsers.delete(userId);
    this.updateSelectedUsers();
    this.updateSelectedUsers('both');
  }

  updateSelectedGroups(mode = 'groups') {
    const containers = mode === 'both' ? [this.bothGroupsContainer] : 
                     mode === 'groups' ? [this.selectedGroupsContainer] : 
                     [this.selectedGroupsContainer, this.bothGroupsContainer];
    
    containers.forEach(container => {
      if (!container) return;
      
      if (this.selectedGroups.size === 0) {
        container.innerHTML = '<span class="placeholder">No groups selected</span>';
      } else {
        container.innerHTML = Array.from(this.selectedGroups).map(groupId => {
          const group = this.allGroups.find(g => g.id === groupId);
          return `
            <div class="selected-group">
              <span>${group?.name || 'Unknown Group'}</span>
              <button onclick="announcementsManager.removeGroup('${groupId}')" type="button">×</button>
            </div>
          `;
        }).join('');
      }
    });
  }

  updateSelectedUsers(mode = 'users') {
    const containers = mode === 'both' ? [this.bothUsersContainer] : 
                     mode === 'users' ? [this.selectedUsersContainer] : 
                     [this.selectedUsersContainer, this.bothUsersContainer];
    
    containers.forEach(container => {
      if (!container) return;
      
      if (this.selectedUsers.size === 0) {
        container.innerHTML = '<span class="placeholder">No users selected</span>';
      } else {
        container.innerHTML = Array.from(this.selectedUsers).map(userId => {
          const user = this.allUsers.find(u => u.id === userId);
          return `
            <div class="selected-user">
              <span>${user?.name || user?.email || 'Unknown User'}</span>
              <button onclick="announcementsManager.removeUser('${userId}')" type="button">×</button>
            </div>
          `;
        }).join('');
      }
    });
  }

  showGroupResults(mode = 'groups') {
    const resultsContainer = mode === 'both' ? this.bothGroupResults : this.groupResults;
    if (resultsContainer) resultsContainer.classList.add('show');
  }

  hideGroupResults(mode = null) {
    if (!mode || mode === 'groups') {
      if (this.groupResults) this.groupResults.classList.remove('show');
    }
    if (!mode || mode === 'both') {
      if (this.bothGroupResults) this.bothGroupResults.classList.remove('show');
    }
  }

  showUserResults(mode = 'users') {
    const resultsContainer = mode === 'both' ? this.bothUserResults : this.userResults;
    if (resultsContainer) resultsContainer.classList.add('show');
  }

  hideUserResults(mode = null) {
    if (!mode || mode === 'users') {
      if (this.userResults) this.userResults.classList.remove('show');
    }
    if (!mode || mode === 'both') {
      if (this.bothUserResults) this.bothUserResults.classList.remove('show');
    }
  }

  clearGroupSearch(mode = 'groups') {
    if (mode === 'both' && this.bothGroupSearch) {
      this.bothGroupSearch.value = '';
      this.hideGroupResults('both');
    } else if (this.groupSearch) {
      this.groupSearch.value = '';
      this.hideGroupResults('groups');
    }
  }

  clearUserSearch(mode = 'users') {
    if (mode === 'both' && this.bothUserSearch) {
      this.bothUserSearch.value = '';
      this.hideUserResults('both');
    } else if (this.userSearch) {
      this.userSearch.value = '';
      this.hideUserResults('users');
    }
  }

  bindEvents() {
    if (this.createBtn) {
      this.createBtn.addEventListener('click', () => this.showCreatePopup());
    }
    
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => this.hidePopup());
    }
    
    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', () => this.handleSubmit());
    }
    
    if (this.popup) {
      // Close popup when clicking outside
      this.popup.addEventListener('click', (e) => {
        if (e.target === this.popup) this.hidePopup();
      });
    }
    
    // Escape key to close popup
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.popup && this.popup.style.display !== 'none') {
        this.hidePopup();
      }
    });
  }

  setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.currentUser = user;
        
        // Now that user is authenticated, initialize audience selector components
        this.addGroupSelectionToPopup();
        
        await this.loadUserGroups();
        await this.loadAnnouncements();
        
        // Check for announcement parameter in URL (for notifications)
        this.checkForAnnouncementParameter();
      } else {
        // Redirect to login if not authenticated
        window.location.href = '/login.html';
      }
    });
  }

  checkForAnnouncementParameter() {
    const urlParams = new URLSearchParams(window.location.search);
    const announcementId = urlParams.get('announcement');
    
    if (announcementId) {
      // Scroll to the announcement after a short delay to ensure everything is loaded
      setTimeout(() => {
        const announcementElement = document.querySelector(`[data-announcement-id="${announcementId}"]`);
        if (announcementElement) {
          announcementElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight the announcement briefly
          announcementElement.style.backgroundColor = 'rgba(255, 214, 0, 0.2)';
          setTimeout(() => {
            announcementElement.style.backgroundColor = '';
          }, 3000);
        }
        // Clean up the URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }, 1000);
    }
  }

  async loadUserGroups() {
    try {
      const groupsQuery = query(
        collection(db, 'groups'),
        where('members', 'array-contains', this.currentUser.uid)
      );
      
      const groupsSnapshot = await getDocs(groupsQuery);
      this.userGroups = [];
      
      groupsSnapshot.forEach(doc => {
        const group = doc.data();
        this.userGroups.push({ id: doc.id, ...group });
      });
    } catch (error) {
      console.error('Error loading user groups:', error);
    }
  }

  async loadAnnouncements() {
    try {
      console.log('Loading announcements for user:', this.currentUser?.uid);
      console.log('User groups:', this.userGroups);
      
      // Start with a simple query to get all announcements the user can see
      const announcementsQuery = query(
        collection(db, 'announcements'),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(announcementsQuery);
      this.announcements = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log('Found announcement:', doc.id, data);
        this.announcements.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          scheduledFor: data.scheduledFor?.toDate() || null
        });
      });
      
      console.log('Total announcements loaded:', this.announcements.length);
      this.displayAnnouncements();
    } catch (error) {
      console.error('Error loading announcements:', error);
      this.showError('Failed to load announcements');
    }
  }

  displayAnnouncements() {
    console.log('displayAnnouncements called with:', this.announcements.length, 'announcements');
    console.log('announcementsList element:', this.announcementsList);
    
    if (!this.announcementsList) {
      console.error('announcements-list element not found!');
      return;
    }

    if (this.announcements.length === 0) {
      this.announcementsList.innerHTML = `
        <div class="empty-state">
          <p>No announcements yet.</p>
        </div>
      `;
      return;
    }

    this.announcementsList.innerHTML = this.announcements.map(announcement => {
      const isOwner = announcement.createdBy === this.currentUser?.uid;
      const isScheduled = announcement.scheduledFor && announcement.scheduledFor > new Date();
      const userLiked = announcement.likes && announcement.likes.includes(this.currentUser?.uid);
      
      // Build audience display
      let audienceDisplay = [];
      
      // Handle new format (targetGroups/targetUsers)
      if (announcement.targetGroups && announcement.targetGroups.length > 0) {
        const groupNames = announcement.targetGroups.map(groupId => {
          const group = this.userGroups.find(g => g.id === groupId);
          return group ? group.name : 'Unknown Group';
        });
        audienceDisplay.push(`Groups: ${groupNames.join(', ')}`);
      }
      
      if (announcement.targetUsers && announcement.targetUsers.length > 0) {
        const userNames = announcement.targetUsers.map(userId => {
          const user = this.allUsers.find(u => u.id === userId);
          return user ? (user.name || user.email) : 'Unknown User';
        });
        audienceDisplay.push(`Users: ${userNames.join(', ')}`);
      }
      
      // Handle legacy format (groupId)
      if (!audienceDisplay.length && announcement.groupId) {
        const groupName = this.userGroups.find(g => g.id === announcement.groupId)?.name || 'General';
        audienceDisplay.push(`Group: ${groupName}`);
      }
      
      const audienceText = audienceDisplay.length > 0 ? audienceDisplay.join(' • ') : 'No audience specified';
      
      return `
        <div class="announcement-item ${isScheduled ? 'scheduled' : ''}" data-id="${announcement.id}">
          <div class="announcement-header">
            <div class="announcement-info">
              <h3 class="announcement-title">${announcement.title || 'Untitled'}</h3>
              <div class="announcement-meta">
                <span class="announcement-author">By: ${announcement.authorName || 'Anonymous'}</span>
                <span class="announcement-audience">Audience: ${audienceText}</span>
                <span class="announcement-date">${this.formatDate(announcement.createdAt)}</span>
                ${isScheduled ? `<span class="scheduled-badge">Scheduled for ${this.formatDate(announcement.scheduledFor)}</span>` : ''}
              </div>
            </div>
            ${isOwner ? `
              <div class="announcement-actions">
                <button class="action-btn edit-btn" onclick="announcementsManager.editAnnouncement('${announcement.id}')" title="Edit">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </button>
                <button class="action-btn delete-btn" onclick="announcementsManager.deleteAnnouncement('${announcement.id}')" title="Delete">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            ` : ''}
          </div>
          <div class="announcement-content">
            <p class="announcement-message">${announcement.message}</p>
            <button class="like-button ${userLiked ? 'liked' : ''}" onclick="announcementsManager.toggleLike('${announcement.id}', this)" title="Like this announcement">
              <span class="like-icon">👍</span>
              <span class="like-count">${announcement.likeCount || 0}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  showCreatePopup() {
    // Ensure user is authenticated before showing popup
    if (!this.currentUser || !this.currentUser.uid) {
      console.log('User not authenticated, cannot show create popup');
      return;
    }
    
    // Initialize audience selector if not already done
    if (!this.titleInput) {
      this.addGroupSelectionToPopup();
    }
    
    this.editingAnnouncement = null;
    this.resetForm();
    this.popupContent.querySelector('h2').textContent = 'Create Announcement';
    this.submitBtn.textContent = 'Post';
    this.popup.style.display = 'flex';
    
    // Focus on title input if it exists
    if (this.titleInput) {
      this.titleInput.focus();
    }
  }

  showEditPopup(announcement) {
    this.editingAnnouncement = announcement;
    this.titleInput.value = announcement.title || '';
    this.messageInput.value = announcement.message || '';
    
    // Reset and populate audience selector
    this.selectedGroups.clear();
    this.selectedUsers.clear();
    
    // Handle both old format (groupId) and new format (targetGroups/targetUsers)
    if (announcement.targetGroups && announcement.targetGroups.length > 0) {
      announcement.targetGroups.forEach(groupId => this.selectedGroups.add(groupId));
    } else if (announcement.groupId) {
      // Legacy support for old announcements
      this.selectedGroups.add(announcement.groupId);
    }
    
    if (announcement.targetUsers && announcement.targetUsers.length > 0) {
      announcement.targetUsers.forEach(userId => this.selectedUsers.add(userId));
    }
    
    this.updateSelectedGroups();
    this.updateSelectedUsers();
    
    if (announcement.scheduledFor) {
      const date = new Date(announcement.scheduledFor);
      this.scheduledDateInput.value = date.toISOString().slice(0, 16);
    }
    
    this.popupContent.querySelector('h2').textContent = 'Edit Announcement';
    this.submitBtn.textContent = 'Update';
    this.popup.style.display = 'flex';
    this.titleInput.focus();
  }

  hidePopup() {
    this.popup.style.display = 'none';
    this.resetForm();
    this.editingAnnouncement = null;
  }

  resetForm() {
    // Only reset form elements if they exist
    if (this.titleInput) this.titleInput.value = '';
    if (this.messageInput) this.messageInput.value = '';
    if (this.scheduledDateInput) this.scheduledDateInput.value = '';
    if (this.errorDiv) this.errorDiv.textContent = '';
    
    // Reset audience selector if it's been initialized
    if (this.selectedGroups) {
      this.selectedGroups.clear();
      this.selectedUsers.clear();
      this.updateSelectedGroups();
      this.updateSelectedUsers();
      this.clearSearches();
      
      // Reset to groups tab (using correct tab name)
      this.switchAudienceTab('groups');
    }
  }

  async handleSubmit() {
    const title = this.titleInput.value.trim();
    const message = this.messageInput.value.trim();
    const scheduledDate = this.scheduledDateInput.value;

    // Validation
    if (!title) {
      this.showError('Title is required');
      return;
    }
    
    if (!message) {
      this.showError('Message is required');
      return;
    }

    // Check if at least one audience is selected
    if (this.selectedGroups.size === 0 && this.selectedUsers.size === 0) {
      this.showError('Please select at least one group or user as audience');
      return;
    }

    try {
      const announcementData = {
        title,
        message,
        targetGroups: Array.from(this.selectedGroups),
        targetUsers: Array.from(this.selectedUsers),
        authorName: this.currentUser.displayName || this.currentUser.email,
        createdBy: this.currentUser.uid,
        updatedAt: serverTimestamp()
      };

      if (scheduledDate) {
        announcementData.scheduledFor = new Date(scheduledDate);
      }

      if (this.editingAnnouncement) {
        // Update existing announcement
        announcementData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'announcements', this.editingAnnouncement.id), announcementData);
        this.showSuccess('Announcement updated successfully');
      } else {
        // Create new announcement
        announcementData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'announcements'), announcementData);
        this.showSuccess('Announcement created successfully');
      }

      this.hidePopup();
      await this.loadAnnouncements();
    } catch (error) {
      console.error('Error saving announcement:', error);
      this.showError('Failed to save announcement');
    }
  }

  async editAnnouncement(announcementId) {
    const announcement = this.announcements.find(a => a.id === announcementId);
    if (announcement) {
      this.showEditPopup(announcement);
    }
  }

  async deleteAnnouncement(announcementId) {
    if (!confirm('Are you sure you want to delete this announcement?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'announcements', announcementId));
      this.showSuccess('Announcement deleted successfully');
      await this.loadAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      this.showError('Failed to delete announcement');
    }
  }

  async toggleLike(announcementId, button) {
    try {
      if (!this.currentUser) return;

      const announcementRef = doc(db, 'announcements', announcementId);
      const announcementDoc = await getDoc(announcementRef);
      
      if (!announcementDoc.exists()) return;

      const data = announcementDoc.data();
      const likes = data.likes || [];
      const likeCount = data.likeCount || 0;
      const userLiked = likes.includes(this.currentUser.uid);

      let newLikes, newLikeCount;
      if (userLiked) {
        // Remove like
        newLikes = likes.filter(uid => uid !== this.currentUser.uid);
        newLikeCount = Math.max(0, likeCount - 1);
        button.classList.remove('liked');
      } else {
        // Add like
        newLikes = [...likes, this.currentUser.uid];
        newLikeCount = likeCount + 1;
        button.classList.add('liked');
      }

      // Update Firestore
      await updateDoc(announcementRef, {
        likes: newLikes,
        likeCount: newLikeCount
      });

      // Update UI
      const countElement = button.querySelector('.like-count');
      if (countElement) {
        countElement.textContent = newLikeCount;
      }

      // Update the local announcements array
      const announcementIndex = this.announcements.findIndex(a => a.id === announcementId);
      if (announcementIndex !== -1) {
        this.announcements[announcementIndex].likes = newLikes;
        this.announcements[announcementIndex].likeCount = newLikeCount;
      }

    } catch (error) {
      console.error('Error toggling like:', error);
      this.showError('Failed to update like');
    }
  }

  formatDate(date) {
    if (!date) return 'Unknown date';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  showError(message) {
    this.errorDiv.textContent = message;
    this.errorDiv.style.color = '#ff3860';
  }

  showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      z-index: 1000;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Initialize the announcements manager
const announcementsManager = new AnnouncementsManager();

// Make it globally available for inline event handlers
window.announcementsManager = announcementsManager;