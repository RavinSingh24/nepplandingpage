import { auth, db } from '/config/firebase-config.js';
import { 
  collection,
  addDoc,
  getDocs,
  query,
  where,
  Timestamp,
  getDoc,
  doc 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Import notification service for sending form notifications
let NotificationService;
try {
  const module = await import('/services/notification-service.js');
  NotificationService = module.NotificationService;
} catch (error) {
  console.warn('NotificationService not available:', error);
}

let questions = [];
let isInitialized = false;

// Show authentication alert dialog
function showAuthAlert() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  
  const dialog = document.createElement('div');
  dialog.className = 'auth-alert-dialog';
  dialog.innerHTML = `
    <h2>Sign In Required</h2>
    <p>You need to be signed in to create forms. Would you like to sign in now?</p>
    <div class="auth-alert-actions">
      <button class="sign-in-btn">Sign In</button>
      <button class="cancel-auth-btn">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  dialog.querySelector('.sign-in-btn').addEventListener('click', () => {
    window.location.href = 'login.html'; // Redirect to your login page
  });

  dialog.querySelector('.cancel-auth-btn').addEventListener('click', () => {
    overlay.remove();
    dialog.remove();
    window.location.href = 'forms.html'; // Redirect back to forms list
  });
}

// Initialize event listeners after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Set up the auth state listener first
  auth.onAuthStateChanged((user) => {
    if (user) {
      // User is signed in
      console.log('User is signed in:', user.email);
      initializePage(); // Initialize the page when user is confirmed signed in
    } else {
      // User is not signed in
      console.log('No user is signed in');
      showAuthAlert();
    }
  });
});

function initializePage() {
  if (isInitialized) {
    console.log('Page already initialized, skipping...');
    return; // Prevent multiple initializations
  }
  
  console.log('=== INITIALIZING CREATE-FORM PAGE ===');
  
  initializeQuestionTypeButtons();
  initializeCancelButton();
  initializeFormSubmission();
  
  // Add a small delay to ensure DOM is fully ready
  setTimeout(() => {
    initializeAudienceSelector();
  }, 100);
  
  isInitialized = true;
  console.log('=== PAGE INITIALIZATION COMPLETE ===');
}

function initializeQuestionTypeButtons() {
  const questionTypeButtons = document.querySelectorAll('.question-type-btn');
  questionTypeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const type = button.getAttribute('data-type');
      if (type) {
        addQuestion(type);
      }
    });
  });
}

function initializeCancelButton() {
  const cancelButton = document.getElementById('cancelForm');
  if (cancelButton) {
    cancelButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
        window.location.href = 'forms.html';
      }
    });
  }
}

function initializeFormSubmission() {
  const form = document.getElementById('createFormForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
}

// Audience Selector Functionality
let selectedGroups = new Set();
let selectedUsers = new Set();
let allGroups = [];
let allUsers = [];

function initializeAudienceSelector() {
  console.log('=== AUDIENCE SELECTOR INITIALIZATION START ===');
  console.log('DOM ready state:', document.readyState);
  
  // Check if audience selector exists
  const audienceSelector = document.querySelector('.audience-selector');
  console.log('audienceSelector element:', audienceSelector);
  
  if (!audienceSelector) {
    console.error('Audience selector not found in DOM');
    // Let's check what form elements we do have
    console.log('Available form elements:', document.querySelectorAll('form, .form-group, .audience-selector'));
    return;
  }
  
  // Initialize audience tab switching
  const audienceTabs = document.querySelectorAll('.audience-tab');
  console.log('Found audience tabs:', audienceTabs.length, audienceTabs);
  
  if (audienceTabs.length === 0) {
    console.error('No audience tabs found');
    console.log('Available buttons:', document.querySelectorAll('button'));
    return;
  }
  
  audienceTabs.forEach((tab, index) => {
    console.log(`Setting up tab ${index}:`, tab);
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.getAttribute('data-target');
      console.log('Tab clicked:', target);
      switchAudienceTab(target);
    });
  });

  // Initialize search functionality
  setupGroupSearch();
  setupUserSearch();
  
  // Load data - add better error handling
  loadGroupsAndUsers().catch(error => {
    console.error('Failed to load groups and users:', error);
  });
  
  // Add click outside functionality to hide search results
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.audience-selector')) {
      // Hide all search results
      document.querySelectorAll('.group-results, .user-results').forEach(container => {
        container.classList.remove('show');
      });
    }
  });
  
  console.log('=== AUDIENCE SELECTOR INITIALIZATION COMPLETE ===');
}

// Test function to check if elements exist
window.testAudienceSelector = function() {
  console.log('=== TESTING AUDIENCE SELECTOR ===');
  console.log('audience-selector:', document.querySelector('.audience-selector'));
  console.log('audience-tabs:', document.querySelectorAll('.audience-tab'));
  console.log('selectedGroups:', document.getElementById('selectedGroups'));
  console.log('groupSearch:', document.getElementById('groupSearch'));
  console.log('Current user:', auth.currentUser);
  console.log('allGroups:', allGroups);
  console.log('allUsers:', allUsers);
  
  // Try to trigger search manually
  if (allGroups.length === 0 && allUsers.length === 0) {
    console.log('No groups/users loaded, trying to load...');
    loadGroupsAndUsers();
  } else {
    console.log('Data is loaded, showing results...');
    showInitialResults();
  }
  
  alert('Check console for audience selector status. Results should now be visible!');
};

function switchAudienceTab(tabName) {
  console.log('Switching to tab:', tabName);
  
  // Update tab buttons
  document.querySelectorAll('.audience-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-target="${tabName}"]`).classList.add('active');

  // Update content sections
  document.querySelectorAll('.audience-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(`${tabName}-selection`).classList.add('active');

  // Clear searches when switching tabs
  clearSearches();
  
  // Show results for the new tab if data is loaded
  if (allGroups.length > 0 || allUsers.length > 0) {
    setTimeout(() => {
      if (tabName === 'groups') {
        displayGroupResults(allGroups, 'groups');
      } else if (tabName === 'individuals') {
        displayUserResults(allUsers, 'users');
      } else if (tabName === 'both') {
        displayGroupResults(allGroups, 'both');
        displayUserResults(allUsers, 'both');
      }
    }, 100);
  }
}

function setupGroupSearch() {
  console.log('Setting up group search...');
  
  const groupSearch = document.getElementById('groupSearch');
  const groupSearchBoth = document.getElementById('groupSearchBoth');
  
  console.log('Group search elements:', { groupSearch: !!groupSearch, groupSearchBoth: !!groupSearchBoth });
  
  if (groupSearch) {
    groupSearch.addEventListener('input', (e) => {
      searchGroups(e.target.value, 'groups');
    });
    groupSearch.addEventListener('focus', () => {
      // Show all groups when focusing
      if (allGroups.length > 0) {
        searchGroups(groupSearch.value || '', 'groups');
      }
    });
    groupSearch.addEventListener('click', () => {
      // Show all groups when clicking
      if (allGroups.length > 0) {
        searchGroups(groupSearch.value || '', 'groups');
      }
    });
  }
  
  if (groupSearchBoth) {
    groupSearchBoth.addEventListener('input', (e) => {
      searchGroups(e.target.value, 'both');
    });
    groupSearchBoth.addEventListener('focus', () => {
      // Show all groups when focusing
      if (allGroups.length > 0) {
        searchGroups(groupSearchBoth.value || '', 'both');
      }
    });
    groupSearchBoth.addEventListener('click', () => {
      // Show all groups when clicking
      if (allGroups.length > 0) {
        searchGroups(groupSearchBoth.value || '', 'both');
      }
    });
  }
}

function setupUserSearch() {
  console.log('Setting up user search...');
  
  const userSearch = document.getElementById('userSearch');
  const userSearchBoth = document.getElementById('userSearchBoth');
  
  console.log('User search elements:', { userSearch: !!userSearch, userSearchBoth: !!userSearchBoth });
  
  if (userSearch) {
    userSearch.addEventListener('input', (e) => {
      searchUsers(e.target.value, 'users');
    });
    userSearch.addEventListener('focus', () => {
      // Show all users when focusing
      if (allUsers.length > 0) {
        searchUsers(userSearch.value || '', 'users');
      }
    });
    userSearch.addEventListener('click', () => {
      // Show all users when clicking
      if (allUsers.length > 0) {
        searchUsers(userSearch.value || '', 'users');
      }
    });
  }
  
  if (userSearchBoth) {
    userSearchBoth.addEventListener('input', (e) => {
      searchUsers(e.target.value, 'both');
    });
    userSearchBoth.addEventListener('focus', () => {
      // Show all users when focusing
      if (allUsers.length > 0) {
        searchUsers(userSearchBoth.value || '', 'both');
      }
    });
    userSearchBoth.addEventListener('click', () => {
      // Show all users when clicking
      if (allUsers.length > 0) {
        searchUsers(userSearchBoth.value || '', 'both');
      }
    });
  }
}

async function loadGroupsAndUsers() {
  console.log('Loading groups and users...');
  
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user found');
      return;
    }

    console.log('Current user:', currentUser.email);

    // Load only groups where the current user is a member
    const groupsQuery = query(
      collection(db, 'groups'),
      where('members', 'array-contains', currentUser.uid)
    );
    const groupsSnapshot = await getDocs(groupsQuery);
    allGroups = [];
    groupsSnapshot.forEach(doc => {
      const groupData = doc.data();
      // Double-check that user is actually a member (extra security)
      if (groupData.members && groupData.members.includes(currentUser.uid)) {
        allGroups.push({ id: doc.id, ...groupData });
      }
    });

    console.log(`Loaded ${allGroups.length} groups where user is a member`);

    // Load all users (for individual user selection)
    const usersSnapshot = await getDocs(collection(db, 'users'));
    allUsers = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      // Don't include the current user in the list (they can't send forms to themselves)
      if (doc.id !== currentUser.uid) {
        allUsers.push({ id: doc.id, ...userData });
      }
    });

    console.log(`Loaded ${allUsers.length} users (excluding current user)`);
    
    // After loading data, show initial state for the currently active tab
    showInitialResults();
    
  } catch (error) {
    console.error('Error loading groups and users:', error);
  }
}

function showInitialResults() {
  // Get the currently active tab
  const activeTab = document.querySelector('.audience-tab.active');
  if (!activeTab) return;
  
  const target = activeTab.getAttribute('data-target');
  console.log('Showing initial results for tab:', target);
  
  // Show results based on active tab
  if (target === 'groups') {
    displayGroupResults(allGroups, 'groups');
  } else if (target === 'individuals') {
    displayUserResults(allUsers, 'users');
  } else if (target === 'both') {
    displayGroupResults(allGroups, 'both');
    displayUserResults(allUsers, 'both');
  }
  
  // Also populate the search fields to show there are options available
  setTimeout(() => {
    showEmptySearchResults();
  }, 200);
}

function showEmptySearchResults() {
  // Show empty search results for the current active tab to indicate search is working
  const activeTab = document.querySelector('.audience-tab.active');
  if (!activeTab) return;
  
  const target = activeTab.getAttribute('data-target');
  
  if (target === 'groups') {
    searchGroups('', 'groups');
  } else if (target === 'individuals') {
    searchUsers('', 'users');
  } else if (target === 'both') {
    searchGroups('', 'both');
    searchUsers('', 'both');
  }
}

function searchGroups(query, mode = 'groups') {
  console.log(`Searching groups with query: "${query}", mode: ${mode}`);
  console.log(`Available groups:`, allGroups);
  
  let filteredGroups;
  if (!query || query.trim() === '') {
    // Show all groups if query is empty
    filteredGroups = allGroups;
  } else {
    filteredGroups = allGroups.filter(group => 
      group.name?.toLowerCase().includes(query.toLowerCase()) ||
      group.description?.toLowerCase().includes(query.toLowerCase())
    );
  }
  
  console.log(`Filtered groups:`, filteredGroups);
  displayGroupResults(filteredGroups, mode);
}

function searchUsers(query, mode = 'users') {
  console.log(`Searching users with query: "${query}", mode: ${mode}`);
  console.log(`Available users:`, allUsers);
  
  let filteredUsers;
  if (!query || query.trim() === '') {
    // Show all users if query is empty
    filteredUsers = allUsers;
  } else {
    filteredUsers = allUsers.filter(user => 
      user.displayName?.toLowerCase().includes(query.toLowerCase()) ||
      user.email?.toLowerCase().includes(query.toLowerCase())
    );
  }
  
  console.log(`Filtered users:`, filteredUsers);
  displayUserResults(filteredUsers, mode);
}

function displayGroupResults(groups, mode = 'groups') {
  const resultsContainer = mode === 'both' ? 
    document.getElementById('groupResultsBoth') : 
    document.getElementById('groupResults');
  
  if (!resultsContainer) {
    console.error(`Group results container not found for mode: ${mode}`);
    return;
  }

  if (groups.length === 0) {
    resultsContainer.innerHTML = '<div class="no-results">No groups found. Create a group first to assign forms to groups.</div>';
  } else {
    resultsContainer.innerHTML = groups.map(group => `
      <div class="group-result" onclick="selectGroup('${group.id}', '${mode}')">
        <div class="group-result-name">${group.name}</div>
        <div class="group-result-description">${group.description || 'No description'}</div>
      </div>
    `).join('');
  }
  
  resultsContainer.classList.add('show');
  console.log(`Displayed ${groups.length} groups for mode: ${mode}`);
}

function displayUserResults(users, mode = 'users') {
  const resultsContainer = mode === 'both' ? 
    document.getElementById('userResultsBoth') : 
    document.getElementById('userResults');
  
  if (!resultsContainer) {
    console.error(`User results container not found for mode: ${mode}`);
    return;
  }

  if (users.length === 0) {
    resultsContainer.innerHTML = '<div class="no-results">No users found. Users must sign up to receive forms.</div>';
  } else {
    resultsContainer.innerHTML = users.map(user => `
      <div class="user-result" onclick="selectUser('${user.id}', '${mode}')">
        <div class="user-result-name">${user.displayName || 'Unknown User'}</div>
        <div class="user-result-email">${user.email}</div>
      </div>
    `).join('');
  }
  
  resultsContainer.classList.add('show');
  console.log(`Displayed ${users.length} users for mode: ${mode}`);
}

window.selectGroup = function(groupId, mode = 'groups') {
  selectedGroups.add(groupId);
  updateSelectedGroups(mode);
  clearGroupSearch(mode);
};

window.selectUser = function(userId, mode = 'users') {
  selectedUsers.add(userId);
  updateSelectedUsers(mode);
  clearUserSearch(mode);
};

function updateSelectedGroups(mode = 'groups') {
  const containers = mode === 'both' ? 
    [document.getElementById('selectedGroupsBoth')] : 
    mode === 'groups' ? 
    [document.getElementById('selectedGroups')] : 
    [document.getElementById('selectedGroups'), document.getElementById('selectedGroupsBoth')];
  
  containers.forEach(container => {
    if (!container) return;
    
    container.innerHTML = Array.from(selectedGroups).map(groupId => {
      const group = allGroups.find(g => g.id === groupId);
      return group ? `
        <div class="selected-group">
          <span>${group.name}</span>
          <button type="button" onclick="removeGroup('${groupId}')">&times;</button>
        </div>
      ` : '';
    }).join('');
  });
}

function updateSelectedUsers(mode = 'users') {
  const containers = mode === 'both' ? 
    [document.getElementById('selectedUsersBoth')] : 
    mode === 'users' ? 
    [document.getElementById('selectedUsers')] : 
    [document.getElementById('selectedUsers'), document.getElementById('selectedUsersBoth')];
  
  containers.forEach(container => {
    if (!container) return;
    
    container.innerHTML = Array.from(selectedUsers).map(userId => {
      const user = allUsers.find(u => u.id === userId);
      return user ? `
        <div class="selected-user">
          <span>${user.displayName || user.email}</span>
          <button type="button" onclick="removeUser('${userId}')">&times;</button>
        </div>
      ` : '';
    }).join('');
  });
}

window.removeGroup = function(groupId) {
  selectedGroups.delete(groupId);
  updateSelectedGroups();
  updateSelectedGroups('both');
};

window.removeUser = function(userId) {
  selectedUsers.delete(userId);
  updateSelectedUsers();
  updateSelectedUsers('both');
};

function clearGroupSearch(mode = 'groups') {
  const searchInput = mode === 'both' ? 
    document.getElementById('groupSearchBoth') : 
    document.getElementById('groupSearch');
  const resultsContainer = mode === 'both' ? 
    document.getElementById('groupResultsBoth') : 
    document.getElementById('groupResults');
  
  if (searchInput) searchInput.value = '';
  if (resultsContainer) resultsContainer.classList.remove('show');
}

function clearUserSearch(mode = 'users') {
  const searchInput = mode === 'both' ? 
    document.getElementById('userSearchBoth') : 
    document.getElementById('userSearch');
  const resultsContainer = mode === 'both' ? 
    document.getElementById('userResultsBoth') : 
    document.getElementById('userResults');
  
  if (searchInput) searchInput.value = '';
  if (resultsContainer) resultsContainer.classList.remove('show');
}

function clearSearches() {
  clearGroupSearch('groups');
  clearGroupSearch('both');
  clearUserSearch('users');
  clearUserSearch('both');
}

// Add question function with improved functionality
function addQuestion(type) {
  console.log('Adding question of type:', type); // Debug log
  const questionNumber = questions.length + 1;
  const questionData = {
    type: type,
    question: '',
    required: false,
    options: type === 'Multiple Choice' || type === 'Checkboxes' ? [''] : [],
    correctAnswer: type === 'Multiple Choice' ? '' : null,
    id: Date.now()
  };
  
  questions.push(questionData);
  
  const questionHTML = `
    <div class="question-card" data-id="${questionData.id}" data-type="${type}">
      <div class="question-header">
        <h4>Question ${questionNumber}</h4>
        <button type="button" class="delete-question-btn" onclick="deleteQuestion(${questionData.id})">Delete</button>
      </div>
      <div class="question-content">
        <input type="text" class="question-text" placeholder="Enter your question" required>
        <div class="question-options">
          ${getQuestionTypeHTML(type, questionData.id)}
        </div>
        <label class="required-toggle">
          <input type="checkbox" class="required-checkbox">
          Required
        </label>
      </div>
    </div>
  `;
  
  const questionsContainer = document.getElementById('questionsContainer');
  if (questionsContainer) {
    questionsContainer.insertAdjacentHTML('beforeend', questionHTML);
  }
}

function getQuestionTypeHTML(type, id) {
  switch (type.trim()) {
    case 'Multiple Choice':
      return `
        <div class="options-list" data-id="${id}">
          <div class="option-item">
            <input type="text" placeholder="Option 1" required>
            <input type="radio" name="correct-${id}" class="correct-option" style="width: 20px; height: 20px; margin: 0 10px;">
            <label style="color: #FFD600; margin-right: 10px;">Correct</label>
            <button type="button" class="remove-option-btn">Remove</button>
          </div>
          <button type="button" class="add-option-btn">Add Option</button>
        </div>
      `;
    case 'Checkboxes':
      return `
        <div class="options-list" data-id="${id}">
          <div class="option-item">
            <input type="text" placeholder="Option 1" required>
            <input type="checkbox" class="checkbox-option" style="width: 20px; height: 20px; margin: 0 10px;">
            <button type="button" class="remove-option-btn">Remove</button>
          </div>
          <button type="button" class="add-option-btn">Add Option</button>
        </div>
      `;
    case 'Short Answer':
      return '<input type="text" disabled placeholder="Short answer text">';
    case 'Long Answer':
      return '<textarea disabled placeholder="Long answer text"></textarea>';
    case 'File Upload':
      return `
        <div class="file-upload-config">
          <label>Allowed file types:</label>
          <div class="file-types">
            <label><input type="checkbox" value="pdf"> PDF</label>
            <label><input type="checkbox" value="image"> Images</label>
            <label><input type="checkbox" value="doc"> Documents</label>
          </div>
          <label>Max file size (MB):</label>
          <input type="number" min="1" max="50" value="10" class="file-size-limit">
        </div>
      `;
    case 'Poll':
      return `
        <div class="options-list" data-id="${id}">
          <div class="option-item">
            <input type="text" placeholder="Option 1" required>
            <button type="button" class="remove-option-btn">Remove</button>
          </div>
          <button type="button" class="add-option-btn">Add Option</button>
        </div>
      `;
    case 'Linear Scale':
      return `
        <div class="linear-scale-config">
          <div class="scale-inputs">
            <div>
              <label>Start:</label>
              <input type="number" min="0" max="10" value="0" class="scale-start">
            </div>
            <div>
              <label>End:</label>
              <input type="number" min="0" max="10" value="5" class="scale-end">
            </div>
          </div>
          <div class="scale-labels">
            <input type="text" placeholder="Start label (e.g., Poor)" class="scale-start-label">
            <input type="text" placeholder="End label (e.g., Excellent)" class="scale-end-label">
          </div>
        </div>
      `;
    default:
      return '';
  }
}

// Delete question function
window.deleteQuestion = function(id) {
  const questionElement = document.querySelector(`.question-card[data-id="${id}"]`);
  if (questionElement) {
    questionElement.remove();
    questions = questions.filter(q => q.id !== id);
    updateQuestionNumbers();
  }
};

function updateQuestionNumbers() {
  document.querySelectorAll('.question-card').forEach((card, index) => {
    card.querySelector('h4').textContent = `Question ${index + 1}`;
  });
}

// Add event delegation for dynamically added elements
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('add-option-btn')) {
    const optionsList = e.target.closest('.options-list');
    if (optionsList) {
      const questionId = optionsList.dataset.id;
      const optionsCount = optionsList.querySelectorAll('.option-item').length;
      addNewOption(optionsList, questionId, optionsCount + 1);
    }
  } else if (e.target.classList.contains('remove-option-btn')) {
    const optionItem = e.target.closest('.option-item');
    const optionsList = optionItem?.parentElement;
    if (optionsList && optionsList.querySelectorAll('.option-item').length > 1) {
      optionItem.remove();
    }
  }
});

/**
 * Send form notifications to all target users (group members + individual users)
 * @param {string} formId - The ID of the created form
 * @param {string} formTitle - The title of the form
 * @param {string} senderId - ID of the user who created the form
 * @param {string} senderName - Name of the user who created the form
 */
async function sendFormNotifications(formId, formTitle, senderId, senderName) {
  try {
    const allRecipients = new Set(); // Use Set to avoid duplicate notifications
    
    // Get all group members from selected groups
    for (const groupId of selectedGroups) {
      try {
        const groupDoc = await getDoc(doc(db, 'groups', groupId));
        if (groupDoc.exists()) {
          const groupData = groupDoc.data();
          if (groupData.members && Array.isArray(groupData.members)) {
            groupData.members.forEach(memberId => {
              if (memberId !== senderId) { // Don't notify the form creator
                allRecipients.add(memberId);
              }
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching group ${groupId}:`, error);
      }
    }
    
    // Add individual users from selected users
    selectedUsers.forEach(userId => {
      if (userId !== senderId) { // Don't notify the form creator
        allRecipients.add(userId);
      }
    });
    
    // Send notifications to all recipients
    const notificationPromises = Array.from(allRecipients).map(recipientId => 
      NotificationService.createNewFormNotification(formId, formTitle, senderId, senderName, recipientId)
    );
    
    await Promise.all(notificationPromises);
    console.log(`Sent notifications to ${allRecipients.size} recipients for form: ${formTitle}`);
    
  } catch (error) {
    console.error('Error sending form notifications:', error);
  }
}

/** @type {(e: SubmitEvent) => Promise<void>} */
// Form submission handler
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const user = auth.currentUser;
  if (!user) {
    showAuthAlert();
    return;
  }

  const formTitle = document.getElementById('formTitle').value;
  const formDescription = document.getElementById('formDescription').value;
  const dueDate = document.getElementById('dueDate').value;

  if (!formTitle || questions.length === 0 || !dueDate) {
    alert('Please complete all required fields including at least one question.');
    return;
  }

  // Gather question data
  const formQuestions = [];
  document.querySelectorAll('.question-card').forEach(card => {
    const id = card.dataset.id;
    const question = {
      id: id,
      type: questions.find(q => q.id.toString() === id).type,
      question: card.querySelector('.question-text').value,
      required: card.querySelector('.required-checkbox').checked
    };

    // Handle different question types
    const optionsList = card.querySelector('.options-list');
    if (optionsList) {
      question.options = Array.from(optionsList.querySelectorAll('.option-item input[type="text"]'))
        .map(input => input.value);
      
      if (question.type === 'Multiple Choice') {
        const correctOption = optionsList.querySelector('input[type="radio"]:checked');
        question.correctAnswer = correctOption ? 
          Array.from(optionsList.querySelectorAll('.option-item')).indexOf(correctOption.closest('.option-item')) : -1;
      }
    }

    if (question.type === 'File Upload') {
      const config = card.querySelector('.file-upload-config');
      question.fileTypes = Array.from(config.querySelectorAll('.file-types input:checked'))
        .map(input => input.value);
      question.maxFileSize = parseInt(config.querySelector('.file-size-limit').value);
    }

    if (question.type === 'Linear Scale') {
      const config = card.querySelector('.linear-scale-config');
      question.scaleStart = parseInt(config.querySelector('.scale-start').value);
      question.scaleEnd = parseInt(config.querySelector('.scale-end').value);
      question.startLabel = config.querySelector('.scale-start-label').value;
      question.endLabel = config.querySelector('.scale-end-label').value;
    }

    formQuestions.push(question);
  });

  try {
    // Validate audience selection
    if (selectedGroups.size === 0 && selectedUsers.size === 0) {
      alert('Please select at least one group or user as the target audience.');
      return;
    }

    const formData = {
      title: formTitle,
      description: formDescription,
      dueDate: Timestamp.fromDate(new Date(dueDate)),
      createdBy: auth.currentUser.uid,
      creatorName: auth.currentUser.displayName || auth.currentUser.email || 'Anonymous',
      createdAt: Timestamp.now(),
      questions: formQuestions,
      targetGroups: Array.from(selectedGroups),
      targetUsers: Array.from(selectedUsers)
    };

    const docRef = await addDoc(collection(db, 'forms'), formData);
    const formId = docRef.id;
    
    // Send notifications to all target recipients
    if (NotificationService) {
      await sendFormNotifications(formId, formTitle, user.uid, user.displayName || user.email || 'Anonymous');
    }
    
    window.location.href = 'forms.html';
  } catch (error) {
    console.error('Error creating form:', error);
    alert('Error creating form: ' + error.message);
  }
}

// Add this function after your other functions
function addNewOption(optionsList, questionId, optionNumber) {
  const type = optionsList.closest('.question-card').dataset.type;
  const newOption = document.createElement('div');
  newOption.className = 'option-item';
  
  if (type === 'Multiple Choice') {
    newOption.innerHTML = `
      <input type="text" placeholder="Option ${optionNumber}" required>
      <input type="radio" name="correct-${questionId}" class="correct-option" style="width: 20px; height: 20px; margin: 0 10px;">
      <label style="color: #FFD600; margin-right: 10px;">Correct</label>
      <button type="button" class="remove-option-btn">Remove</button>
    `;
  } else if (type === 'Checkboxes') {
    newOption.innerHTML = `
      <input type="text" placeholder="Option ${optionNumber}" required>
      <input type="checkbox" class="checkbox-option" style="width: 20px; height: 20px; margin: 0 10px;">
      <button type="button" class="remove-option-btn">Remove</button>
    `;
  } else {
    newOption.innerHTML = `
      <input type="text" placeholder="Option ${optionNumber}" required>
      <button type="button" class="remove-option-btn">Remove</button>
    `;
  }
  
  optionsList.insertBefore(newOption, optionsList.querySelector('.add-option-btn'));
}