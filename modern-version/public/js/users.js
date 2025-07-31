import { auth, db } from '/config/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

class UsersDirectory {
  constructor() {
    this.currentUser = null;
    this.users = [];
    this.filteredUsers = [];
    this.currentPage = 1;
    this.usersPerPage = 15; // 5 columns x 3 rows
    this.searchQuery = '';
    this.sortBy = 'newest';
    this.filterBy = 'all';
    this.minSearchLength = 2; // Require at least 2 characters
    
    this.init();
  }

  init() {
    this.initializeElements();
    this.bindEvents();
    this.checkAuthentication();
  }

  initializeElements() {
    this.usersList = document.getElementById('usersList');
    this.userSearch = document.getElementById('userSearch');
    this.sortSelect = document.getElementById('sortBy');
    this.filterSelect = document.getElementById('filterBy');
    this.pagination = document.getElementById('pagination');
    this.prevPageBtn = document.getElementById('prevPage');
    this.nextPageBtn = document.getElementById('nextPage');
    this.pageInfo = document.getElementById('pageInfo');
  }

  bindEvents() {
    // Search functionality
    this.userSearch.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.filterAndDisplayUsers();
    });

    // Sort functionality
    this.sortSelect.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.filterAndDisplayUsers();
    });

    // Filter functionality
    this.filterSelect.addEventListener('change', (e) => {
      this.filterBy = e.target.value;
      this.filterAndDisplayUsers();
    });

    // Pagination
    this.prevPageBtn.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.displayUsers();
      }
    });

    this.nextPageBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(this.filteredUsers.length / this.usersPerPage);
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.displayUsers();
      }
    });
  }

  checkAuthentication() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.currentUser = user;
        await this.loadUsers();
      } else {
        // Allow viewing without authentication but with limited functionality
        await this.loadUsers();
      }
    });
  }

  async loadUsers() {
    try {
      this.showLoading();
      
      // Get all users who have public profiles or are active members
      const usersQuery = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      
      this.users = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        // Skip current user
        if (this.currentUser && userId === this.currentUser.uid) {
          continue;
        }
        
        // Only include users with public profiles or minimal privacy settings
        if (userData.profilePrivacy === 'private') {
          continue;
        }

        // Get additional stats for each user
        const userStats = await this.getUserStats(userId);
        
        this.users.push({
          id: userId,
          ...userData,
          ...userStats
        });
      }
      
      this.filterAndDisplayUsers();
      
    } catch (error) {
      console.error('Error loading users:', error);
      this.showError('Failed to load users');
    }
  }

  async getUserStats(userId) {
    const stats = {
      formsCreated: 0,
      groupsJoined: 0,
      daysActive: 0,
      isNewMember: false,
      isActive: false
    };

    try {
      // Count public forms
      const formsQuery = query(
        collection(db, 'forms'),
        where('createdBy', '==', userId),
        where('type', '==', 'public')
      );
      const formsSnapshot = await getDocs(formsQuery);
      stats.formsCreated = formsSnapshot.size;

      // Count groups
      const groupsQuery = query(
        collection(db, 'groups'),
        where('members', 'array-contains', userId)
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      stats.groupsJoined = groupsSnapshot.size;

      // Calculate activity metrics
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        if (userData.createdAt) {
          const joinDate = this.getDateFromTimestamp(userData.createdAt);
          const today = new Date();
          const timeDiff = today - joinDate;
          stats.daysActive = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
          
          // New member if joined within last 30 days
          stats.isNewMember = stats.daysActive <= 30;
        }

        // Consider active if they have forms, groups, or recent activity
        stats.isActive = stats.formsCreated > 0 || stats.groupsJoined > 0;
        
        if (userData.lastLoginAt) {
          const lastLogin = this.getDateFromTimestamp(userData.lastLoginAt);
          const daysSinceLogin = Math.floor((new Date() - lastLogin) / (1000 * 60 * 60 * 24));
          stats.isActive = stats.isActive || daysSinceLogin <= 7;
        }
      }
    } catch (error) {
      console.log('Could not get stats for user:', userId);
    }

    return stats;
  }

  filterAndDisplayUsers() {
    // Check if search query meets minimum length requirement
    if (this.searchQuery.length > 0 && this.searchQuery.length < this.minSearchLength) {
      this.showSearchPrompt();
      return;
    }

    let filtered = [...this.users];

    // Apply search filter only if we have enough characters
    if (this.searchQuery.length >= this.minSearchLength) {
      filtered = filtered.filter(user => 
        (user.displayName && user.displayName.toLowerCase().includes(this.searchQuery)) ||
        (user.email && user.email.toLowerCase().includes(this.searchQuery)) ||
        (user.bio && user.bio.toLowerCase().includes(this.searchQuery))
      );
    } else if (this.searchQuery.length === 0) {
      // Show prompt when search is empty
      this.showSearchPrompt();
      return;
    }

    // Apply category filter
    switch (this.filterBy) {
      case 'active':
        filtered = filtered.filter(user => user.isActive);
        break;
      case 'public-profile':
        filtered = filtered.filter(user => user.profilePrivacy !== 'private');
        break;
      // 'all' requires no additional filtering
    }

    // Apply sorting
    switch (this.sortBy) {
      case 'newest':
        filtered.sort((a, b) => {
          const aDate = this.getDateFromTimestamp(a.createdAt);
          const bDate = this.getDateFromTimestamp(b.createdAt);
          return bDate - aDate;
        });
        break;
      case 'oldest':
        filtered.sort((a, b) => {
          const aDate = this.getDateFromTimestamp(a.createdAt);
          const bDate = this.getDateFromTimestamp(b.createdAt);
          return aDate - bDate;
        });
        break;
      case 'name':
        filtered.sort((a, b) => {
          const aName = a.displayName || a.email || '';
          const bName = b.displayName || b.email || '';
          return aName.localeCompare(bName);
        });
        break;
      case 'active':
        filtered.sort((a, b) => {
          const aScore = (a.formsCreated || 0) + (a.groupsJoined || 0);
          const bScore = (b.formsCreated || 0) + (b.groupsJoined || 0);
          return bScore - aScore;
        });
        break;
    }

    this.filteredUsers = filtered;
    this.currentPage = 1; // Reset to first page
    this.displayUsers();
  }

  showSearchPrompt() {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = `
      <div class="search-prompt">
        <div class="search-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
            <path d="M480 272C480 317.9 465.1 360.3 440 394.7L566.6 521.4C579.1 533.9 579.1 554.2 566.6 566.7C554.1 579.2 533.8 579.2 521.3 566.7L394.7 440C360.3 465.1 317.9 480 272 480C157.1 480 64 386.9 64 272C64 157.1 157.1 64 272 64C386.9 64 480 157.1 480 272zM272 416C351.5 416 416 351.5 416 272C416 192.5 351.5 128 272 128C192.5 128 128 192.5 128 272C128 351.5 192.5 416 272 416z"/>
          </svg>
        </div>
        <p>Enter at least ${this.minSearchLength} characters to search for users</p>
        <small>Search by name, email, or bio to find specific users</small>
      </div>
    `;
    
    // Hide pagination when showing prompt
    const pagination = document.getElementById('pagination');
    if (pagination) {
      pagination.style.display = 'none';
    }
  }

  displayUsers() {
    if (this.filteredUsers.length === 0) {
      this.showEmpty();
      return;
    }

    // Calculate pagination
    const startIndex = (this.currentPage - 1) * this.usersPerPage;
    const endIndex = startIndex + this.usersPerPage;
    const usersToShow = this.filteredUsers.slice(startIndex, endIndex);
    const totalPages = Math.ceil(this.filteredUsers.length / this.usersPerPage);

    // Generate users HTML
    const usersHtml = usersToShow.map(user => this.generateUserCardHtml(user)).join('');
    this.usersList.innerHTML = usersHtml;

    // Show and update pagination
    const pagination = document.getElementById('pagination');
    if (pagination) {
      pagination.style.display = 'block';
    }
    this.updatePagination(totalPages);

    // Add click handlers
    this.addUserCardHandlers();
  }

  generateUserCardHtml(user) {
    const displayName = user.displayName || 'Anonymous User';
    const email = user.showEmail !== false ? (user.email || '') : '';
    const bio = user.bio || '';
    const formsCreated = user.formsCreated || 0;
    const groupsJoined = user.groupsJoined || 0;
    const daysActive = user.daysActive || 0;

    // Generate badges
    let badges = '';
    if (user.isNewMember) {
      badges += '<span class="user-badge new-member">New Member</span>';
    }
    if (user.isActive) {
      badges += '<span class="user-badge active">Active</span>';
    }

    // Generate avatar
    let avatarContent = `<span>${displayName.charAt(0).toUpperCase()}</span>`;
    if (user.photoURL) {
      avatarContent = `<img src="${user.photoURL}" alt="${displayName}">`;
    }

    return `
      <div class="user-card" data-user-id="${user.id}">
        <div class="user-avatar-section">
          <div class="user-avatar">
            ${avatarContent}
          </div>
          <div class="user-info">
            <h3>${displayName}</h3>
            ${email ? `<p class="user-email">${email}</p>` : '<p class="user-email">Email private</p>'}
          </div>
        </div>
        
        ${bio ? `<div class="user-bio">${bio}</div>` : ''}
        
        <div class="user-stats">
          <div class="user-stat">
            <span class="user-stat-number">${formsCreated}</span>
            <span class="user-stat-label">Forms</span>
          </div>
          <div class="user-stat">
            <span class="user-stat-number">${groupsJoined}</span>
            <span class="user-stat-label">Groups</span>
          </div>
          <div class="user-stat">
            <span class="user-stat-number">${daysActive}</span>
            <span class="user-stat-label">Days</span>
          </div>
        </div>
        
        ${badges ? `<div class="user-badges">${badges}</div>` : ''}
      </div>
    `;
  }

  addUserCardHandlers() {
    const userCards = this.usersList.querySelectorAll('.user-card');
    userCards.forEach(card => {
      card.addEventListener('click', () => {
        const userId = card.getAttribute('data-user-id');
        window.location.href = `/html/user-profile.html?id=${userId}`;
      });
    });
  }

  updatePagination(totalPages) {
    if (totalPages <= 1) {
      this.pagination.style.display = 'none';
      return;
    }

    this.pagination.style.display = 'flex';
    this.pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
    
    this.prevPageBtn.disabled = this.currentPage === 1;
    this.nextPageBtn.disabled = this.currentPage === totalPages;
  }

  showLoading() {
    this.usersList.innerHTML = '<div class="loading-state">Loading users...</div>';
    this.pagination.style.display = 'none';
  }

  showEmpty() {
    this.usersList.innerHTML = `
      <div class="empty-state">
        <h3>No users found</h3>
        <p>Try adjusting your search criteria or filters.</p>
      </div>
    `;
    this.pagination.style.display = 'none';
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
    
    // Default fallback
    return new Date(0);
  }

  showError(message) {
    this.usersList.innerHTML = `
      <div class="empty-state">
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
    this.pagination.style.display = 'none';
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new UsersDirectory();
});
