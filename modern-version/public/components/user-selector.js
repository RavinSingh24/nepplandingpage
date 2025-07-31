import { AuthService } from '/services/auth-service.js';

export class UserSelector {
  constructor(containerId) {
    // Store references to DOM elements we'll need
    this.container = document.getElementById(containerId);
    // Keep track of users that have been selected
    this.selectedUsers = new Set();
    // Set up the component
    this.init();
  }

  init() {
    // Create the HTML structure
    this.container.innerHTML = `
      <div class="user-selector">
        <input type="text" class="user-search" placeholder="Search users...">
        <div class="selected-users"></div>
        <div class="search-results" style="display:none;"></div>
      </div>
    `;

    // Get references to the important elements
    this.searchInput = this.container.querySelector('.user-search');
    this.resultsContainer = this.container.querySelector('.search-results');
    this.selectedContainer = this.container.querySelector('.selected-users');

    // Add the search handler with debouncing
    // Debouncing prevents too many database queries while typing
    this.searchInput.addEventListener('input', this.debounce(async (e) => {
      const searchTerm = e.target.value.trim();
      
      // Only search if user has typed at least 2 characters
      if (searchTerm.length < 2) {
        this.resultsContainer.style.display = 'none';
        return;
      }

      try {
        // Search users in Firebase using AuthService
        const users = await AuthService.searchUsers(searchTerm);
        this.displayResults(users);
      } catch (error) {
        console.error('Search failed:', error);
        // You might want to show an error message to the user
      }
    }, 300)); // Wait 300ms after user stops typing before searching
  }

  // Utility function to prevent too many rapid searches
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  displayResults(users) {
    if (!users.length) {
      this.resultsContainer.style.display = 'none';
      return;
    }

    // Filter out users that are already selected
    const availableUsers = users.filter(user => !this.selectedUsers.has(user.id));

    // Create the HTML for search results
    this.resultsContainer.innerHTML = availableUsers.map(user => `
      <div class="user-result" data-id="${user.id}" data-name="${user.displayName}">
        <span>${user.displayName}</span>
        ${user.department ? `<small>${user.department}</small>` : ''}
      </div>
    `).join('');

    // Show the results container
    this.resultsContainer.style.display = 'block';

    // Add click handlers to each result
    this.resultsContainer.querySelectorAll('.user-result').forEach(el => {
      el.addEventListener('click', () => {
        const userId = el.dataset.id;
        const userName = el.dataset.name;
        this.selectUser(userId, userName);
      });
    });
  }

  selectUser(userId, userName) {
    // Add user to selected set
    this.selectedUsers.add(userId);

    // Create and display the selected user tag
    const userTag = document.createElement('div');
    userTag.className = 'selected-user';
    userTag.innerHTML = `
      <span>${userName}</span>
      <button type="button" data-id="${userId}">&times;</button>
    `;

    // Add remove button handler
    userTag.querySelector('button').addEventListener('click', () => {
      this.selectedUsers.delete(userId);
      userTag.remove();
    });

    // Add the tag to the selected container
    this.selectedContainer.appendChild(userTag);

    // Clear the search
    this.resultsContainer.style.display = 'none';
    this.searchInput.value = '';
  }

  // Get all selected user IDs - used when saving the form
  getSelectedUsers() {
    return Array.from(this.selectedUsers);
  }

  // Clear all selections - used after form submission
  clear() {
    this.selectedUsers.clear();
    this.selectedContainer.innerHTML = '';
    this.searchInput.value = '';
    this.resultsContainer.style.display = 'none';
  }
}