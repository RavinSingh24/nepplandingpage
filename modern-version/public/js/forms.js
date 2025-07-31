import { auth, db } from '/config/firebase-config.js';
import { 
  collection,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  doc,
  setDoc,
  arrayUnion,
  arrayRemove,
  updateDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { initializeAuth } from '/utils/auth-utils.js';

// Initialize the page with loading states
document.addEventListener('DOMContentLoaded', () => {
  const containers = ['allFormsList', 'userFormsList', 'bookmarkedFormsList'];
  containers.forEach(id => {
    const container = document.getElementById(id);
    if (container) {
      container.innerHTML = '<p class="loading">Loading forms...</p>';
    }
  });
});

// Auth state observer - use centralized auth utility
initializeAuth().then(() => {
  loadForms();
  loadBookmarkedForms();
  checkForFormParameter();
});

// Check for form parameter in URL (for notifications)
function checkForFormParameter() {
  const urlParams = new URLSearchParams(window.location.search);
  const formId = urlParams.get('form');
  
  if (formId) {
    // Navigate to view form page after a short delay to ensure everything is loaded
    setTimeout(() => {
      window.location.href = `view-form.html?id=${formId}`;
      // Clean up the URL parameter
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }, 500);
  }
}

// Load all forms that the user can access (created by others)
async function loadAllAccessibleForms() {
  try {
    const currentUserId = auth.currentUser.uid;
    let allAccessibleForms = [];

    // Get user's groups first
    const userGroupsQuery = query(
      collection(db, 'groups'),
      where('members', 'array-contains', currentUserId)
    );
    
    const userGroups = await getDocs(userGroupsQuery);
    const userGroupIds = userGroups.docs.map(doc => doc.id);

    // Get all public forms (excluding user's own forms)
    const publicQuery = query(
      collection(db, 'forms'),
      where('type', '==', 'public'),
      orderBy('createdAt', 'desc')
    );
    
    const publicSnapshot = await getDocs(publicQuery);
    
    // Filter public forms to exclude user's own forms and check group access
    for (const formDoc of publicSnapshot.docs) {
      const formData = formDoc.data();
      
      // Skip user's own forms
      if (formData.createdBy === currentUserId) {
        continue;
      }
      
      // Check if user has access to this form
      if (!formData.group) {
        // No group restriction - truly public
        allAccessibleForms.push(formDoc);
      } else if (userGroupIds.includes(formData.group)) {
        // User is member of the form's group
        allAccessibleForms.push(formDoc);
      }
    }

    // Get private forms from user's groups (excluding user's own forms)
    if (userGroupIds.length > 0) {
      const privateFormsQuery = query(
        collection(db, 'forms'),
        where('type', '==', 'private'),
        where('group', 'in', userGroupIds),
        orderBy('createdAt', 'desc')
      );
      const privateFormsSnapshot = await getDocs(privateFormsQuery);
      
      // Filter out user's own private forms
      privateFormsSnapshot.docs.forEach(formDoc => {
        const formData = formDoc.data();
        if (formData.createdBy !== currentUserId) {
          allAccessibleForms.push(formDoc);
        }
      });
    }

    // Sort all forms by creation date (most recent first)
    allAccessibleForms.sort((a, b) => {
      const aTime = a.data().createdAt?.toDate() || new Date(0);
      const bTime = b.data().createdAt?.toDate() || new Date(0);
      return bTime - aTime;
    });

    // Create a snapshot-like object to work with existing displayForms function
    const filteredSnapshot = {
      docs: allAccessibleForms,
      empty: allAccessibleForms.length === 0,
      forEach: function(callback) {
        this.docs.forEach(callback);
      }
    };
    
    displayForms(filteredSnapshot, 'allFormsList');
  } catch (error) {
    console.error("Error loading accessible forms:", error);
    const container = document.getElementById('allFormsList');
    if (container) {
      container.innerHTML = '<p class="error">Error loading forms</p>';
    }
  }
}

// Main forms loading function
async function loadForms() {
  if (!auth.currentUser) return;

  try {
    // Load all accessible forms (from others)
    await loadAllAccessibleForms();

    // Load user's created forms
    const userFormsQuery = query(
      collection(db, 'forms'),
      where('createdBy', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const userFormsSnapshot = await getDocs(userFormsQuery);
    displayForms(userFormsSnapshot, 'userFormsList');

  } catch (error) {
    console.error("Error loading forms:", error);
    const containers = ['allFormsList', 'userFormsList'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = `<p class="error">Error: ${error.message}</p>`;
      }
    });
  }
}

function displayForms(snapshot, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = ''; // Clear existing content

  if (snapshot.empty) {
    container.innerHTML = '<p class="no-forms">No forms available</p>';
    return;
  }

let debounceTimer;
document.querySelector('.forms-search input').addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const searchTerm = e.target.value.toLowerCase();
    const formCards = document.querySelectorAll('.form-card');
    formCards.forEach(card => {
      const title = card.querySelector('h3').textContent.toLowerCase();
      const description = card.querySelector('.form-description').textContent.toLowerCase();
      card.style.display = title.includes(searchTerm) || description.includes(searchTerm) ? 'block' : 'none';
    });
  }, 300); // 300ms debounce
});

  snapshot.forEach(async (doc) => {
    const form = doc.data();
    const formDate = form.createdAt.toDate().toLocaleDateString();
    const dueDate = form.dueDate ? form.dueDate.toDate().toLocaleDateString() : 'No due date';

    // Check if form is bookmarked
    const isBookmarked = await checkIfBookmarked(doc.id);
    
    // Get group name if form is assigned to a group
    let groupName = '';
    if (form.group) {
      try {
        const groupDoc = await getDoc(doc(db, 'groups', form.group));
        if (groupDoc.exists()) {
          groupName = groupDoc.data().name;
        }
      } catch (error) {
        console.error('Error fetching group info:', error);
      }
    }

    const formCard = document.createElement('div');
    formCard.className = 'form-card';
    formCard.innerHTML = `
      <div class="form-header">
        <h3>${form.title}</h3>
        <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-form-id="${doc.id}" title="${isBookmarked ? 'Remove bookmark' : 'Add bookmark'}">
          <svg xmlns="http://www.w3.org/2000/svg" ${isBookmarked ? 'fill="currentColor"' : 'fill="none"'} viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="bookmark-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
          </svg>
        </button>
      </div>
      <p class="form-description">${form.description || 'No description provided'}</p>
      ${groupName ? `<div class="form-group-badge">
        <span class="group-icon">👥</span>
        <span class="group-name">${groupName}</span>
      </div>` : ''}
      <div class="form-meta">
        <span class="form-date">Created: ${formDate}</span>
        <span class="form-due">Due: ${dueDate}</span>
      </div>
      <div class="form-creator">
        <span class="creator-name">By: ${form.creatorName || 'Unknown'}</span>
      </div>
      <div class="form-actions">
        <button class="view-form-btn" data-form-id="${doc.id}">View Form</button>
        ${auth.currentUser?.uid === form.createdBy ? `
          <button class="edit-form-btn" data-form-id="${doc.id}">Edit</button>
          <button class="delete-form-btn" data-form-id="${doc.id}">Delete</button>
        ` : ''}
      </div>
    `;

    // Add click event for viewing the form
    formCard.querySelector('.view-form-btn').addEventListener('click', () => {
      window.location.href = `view-form.html?id=${doc.id}`;
    });

    // Add bookmark functionality
    const bookmarkBtn = formCard.querySelector('.bookmark-btn');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleBookmark(doc.id, bookmarkBtn);
      });
    }

    // Add click events for edit and delete if they exist
    const editBtn = formCard.querySelector('.edit-form-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        window.location.href = `edit-form.html?id=${doc.id}`;
      });
    }

    const deleteBtn = formCard.querySelector('.delete-form-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this form?')) {
          deleteForm(doc.id);
        }
      });
    }

    container.appendChild(formCard);
  });
}

// Implement delete form functionality
async function deleteForm(formId) {
  try {
    await deleteDoc(doc(db, 'forms', formId));
    await loadForms(); // Reload forms after deletion
  } catch (error) {
    console.error("Error deleting form:", error);
    alert("Failed to delete form. Please try again.");
  }
}

// Implement search functionality
document.querySelector('.forms-search input').addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const formCards = document.querySelectorAll('.form-card');
  
  formCards.forEach(card => {
    const title = card.querySelector('h3').textContent.toLowerCase();
    const description = card.querySelector('.form-description').textContent.toLowerCase();
    const isVisible = title.includes(searchTerm) || description.includes(searchTerm);
    card.style.display = isVisible ? 'block' : 'none';
  });
});

// Add create form button navigation
document.getElementById('createFormBtn').addEventListener('click', () => {
  window.location.href = 'create-form.html';
});

// Add this at the end of the file
document.getElementById('viewResultsBtn').addEventListener('click', () => {
  const userForms = document.querySelectorAll('#userFormsList .form-card');
  if (userForms.length === 0) {
    alert('You have no forms to view results for');
    return;
  }

  // If user has forms, show a dialog to select which form to view
  const dialog = document.createElement('div');
  dialog.className = 'form-select-dialog';
  dialog.innerHTML = `
    <div class="dialog-content">
      <h2>Select a Form</h2>
      <div class="form-list">
        ${Array.from(userForms).map(form => `
          <button class="form-select-btn" data-form-id="${form.querySelector('[data-form-id]').dataset.formId}">
            ${form.querySelector('h3').textContent}
          </button>
        `).join('')}
      </div>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.addEventListener('click', (e) => {
    if (e.target.classList.contains('form-select-btn')) {
      const formId = e.target.dataset.formId;
      window.location.href = `form-results.html?id=${formId}`;
    } else if (e.target.classList.contains('cancel-btn') || e.target === dialog) {
      dialog.remove();
    }
  });
});

// Function to load and display bookmarked forms
async function loadBookmarkedForms() {
  const container = document.getElementById('bookmarkedFormsList');
  if (!container) return;

  if (!auth.currentUser) {
    container.innerHTML = '<p>Please log in to view your bookmarked forms.</p>';
    return;
  }

  try {
    // Get user's bookmarks
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    const bookmarkedFormIds = userDoc.exists() ? (userDoc.data().bookmarkedForms || []) : [];

    if (bookmarkedFormIds.length === 0) {
      container.innerHTML = '<p>No bookmarked forms yet.</p>';
      return;
    }

    // Get user's groups for permission checking
    const userGroupsQuery = query(
      collection(db, 'groups'),
      where('members', 'array-contains', auth.currentUser.uid)
    );
    const userGroups = await getDocs(userGroupsQuery);
    const userGroupIds = userGroups.docs.map(doc => doc.id);

    // Get bookmarked forms with permission filtering
    const accessibleBookmarkedForms = [];
    const inaccessibleFormIds = [];

    for (const formId of bookmarkedFormIds) {
      try {
        const formDoc = await getDoc(doc(db, 'forms', formId));
        
        if (formDoc.exists()) {
          const formData = formDoc.data();
          let hasAccess = false;

          // Check if user has access to this form
          if (formData.createdBy === auth.currentUser.uid) {
            // User created this form
            hasAccess = true;
          } else if (formData.type === 'public') {
            // Public form - check if no group restriction or user is in the group
            if (!formData.group) {
              hasAccess = true;
            } else if (userGroupIds.includes(formData.group)) {
              hasAccess = true;
            }
          } else if (formData.type === 'private' && formData.group && userGroupIds.includes(formData.group)) {
            // Private form - user must be in the group
            hasAccess = true;
          }

          if (hasAccess) {
            accessibleBookmarkedForms.push({ id: formId, data: formData });
          } else {
            inaccessibleFormIds.push(formId);
          }
        } else {
          // Form doesn't exist anymore
          inaccessibleFormIds.push(formId);
        }
      } catch (error) {
        console.warn(`Cannot access bookmarked form ${formId}:`, error);
        inaccessibleFormIds.push(formId);
      }
    }

    // Clean up bookmarks for inaccessible forms
    if (inaccessibleFormIds.length > 0) {
      try {
        const updatedBookmarks = bookmarkedFormIds.filter(id => !inaccessibleFormIds.includes(id));
        await updateDoc(userDocRef, {
          bookmarkedForms: updatedBookmarks
        });
        console.log(`Removed ${inaccessibleFormIds.length} inaccessible bookmarks`);
      } catch (cleanupError) {
        console.warn('Could not clean up inaccessible bookmarks:', cleanupError);
      }
    }

    container.innerHTML = '';

    if (accessibleBookmarkedForms.length === 0) {
      container.innerHTML = '<p>No accessible bookmarked forms.</p>';
      return;
    }
    
    accessibleBookmarkedForms.forEach(({ id, data: form }) => {
      const formDate = form.createdAt.toDate().toLocaleDateString();
      const dueDate = form.dueDate ? form.dueDate.toDate().toLocaleDateString() : 'No due date';

      const formCard = document.createElement('div');
      formCard.className = 'form-card';
      formCard.innerHTML = `
        <h3>${form.title}</h3>
        <p class="form-description">${form.description || 'No description provided'}</p>
        <div class="form-meta">
          <span class="form-date">Created: ${formDate}</span>
          <span class="form-due">Due: ${dueDate}</span>
        </div>
        <div class="form-creator">
          <span class="creator-name">By: ${form.creatorName || 'Unknown'}</span>
        </div>
        <div class="form-actions">
          <button class="view-form-btn" data-form-id="${id}">View Form</button>
          <button class="remove-bookmark-btn" data-form-id="${id}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
            Remove Bookmark
          </button>
        </div>
      `;

      // Add click event for viewing the form
      formCard.querySelector('.view-form-btn').addEventListener('click', () => {
        window.location.href = `view-form.html?id=${id}`;
      });

      // Add remove bookmark functionality
      formCard.querySelector('.remove-bookmark-btn').addEventListener('click', async () => {
        await removeBookmark(id);
        loadBookmarkedForms(); // Refresh the bookmarked forms list
      });

      container.appendChild(formCard);
    });

  } catch (error) {
    console.error('Error loading bookmarked forms:', error);
    container.innerHTML = '<p>Error loading bookmarked forms.</p>';
  }
}

// Bookmark functionality
async function checkIfBookmarked(formId) {
  try {
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    const bookmarkedForms = userDoc.exists() ? (userDoc.data().bookmarkedForms || []) : [];
    return bookmarkedForms.includes(formId);
  } catch (error) {
    console.error('Error checking bookmark status:', error);
    return false;
  }
}

async function toggleBookmark(formId, buttonElement) {
  try {
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    const currentBookmarks = userDoc.exists() ? (userDoc.data().bookmarkedForms || []) : [];
    
    const isCurrentlyBookmarked = currentBookmarks.includes(formId);
    
    if (isCurrentlyBookmarked) {
      // Remove bookmark
      await updateDoc(userDocRef, {
        bookmarkedForms: arrayRemove(formId)
      });
      
      // Update button UI
      buttonElement.classList.remove('bookmarked');
      buttonElement.title = 'Add bookmark';
      const icon = buttonElement.querySelector('.bookmark-icon');
      icon.setAttribute('fill', 'none');
      
      // Show success message
      showNotification('Bookmark removed', 'success');
    } else {
      // Add bookmark
      await updateDoc(userDocRef, {
        bookmarkedForms: arrayUnion(formId)
      });
      
      // Update button UI
      buttonElement.classList.add('bookmarked');
      buttonElement.title = 'Remove bookmark';
      const icon = buttonElement.querySelector('.bookmark-icon');
      icon.setAttribute('fill', 'currentColor');
      
      // Show success message
      showNotification('Form bookmarked', 'success');
    }
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    showNotification('Failed to update bookmark', 'error');
  }
}

async function removeBookmark(formId) {
  try {
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userDocRef, {
      bookmarkedForms: arrayRemove(formId)
    });
    showNotification('Bookmark removed', 'success');
  } catch (error) {
    console.error('Error removing bookmark:', error);
    showNotification('Failed to remove bookmark', 'error');
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
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