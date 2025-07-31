import { auth, db } from '/config/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { CalendarWidget } from '/components/calendar-widget.js';
import { initializeAuth } from '/utils/auth-utils.js';

let currentUser = null;
let calendar = null;

// Initialize authentication and load dashboard
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await updateUserDisplayName(user);
    await loadDashboardData();
    initializeCalendar();
  } else {
    window.location.href = '/login.html';
  }
});

async function updateUserDisplayName(user) {
  try {
    // First try to get user data from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    let displayName = 'NEPP User';
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.firstName && userData.lastName) {
        displayName = `${userData.firstName} ${userData.lastName}`;
      } else if (userData.firstName) {
        displayName = userData.firstName;
      } else if (userData.lastName) {
        displayName = userData.lastName;
      }
    }
    
    // Fallback to auth display name or email
    if (displayName === 'NEPP User') {
      displayName = user.displayName || user.email?.split('@')[0] || 'NEPP User';
    }
    
    // Update the display name element
    const userDisplayElement = document.getElementById('user-display-name');
    if (userDisplayElement) {
      userDisplayElement.textContent = displayName;
    }
  } catch (error) {
    console.error('Error updating user display name:', error);
    // Fallback to basic auth info
    const userDisplayElement = document.getElementById('user-display-name');
    if (userDisplayElement) {
      userDisplayElement.textContent = user.displayName || user.email?.split('@')[0] || 'NEPP User';
    }
  }
}

async function loadDashboardData() {
  try {
    await Promise.all([
      loadAnnouncements(),
      loadForms()
    ]);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

async function loadForms() {
  try {
    if (!auth.currentUser) {
      console.log('No current user, cannot load forms');
      return;
    }

    const formsRef = collection(db, "forms");
    const q = query(
      formsRef,
      where("createdBy", "==", auth.currentUser.uid),
      limit(5)
    );
    const querySnapshot = await getDocs(q);
    const forms = [];
    querySnapshot.forEach(doc => {
      forms.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort forms by dueDate in JavaScript (if available)
    forms.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return b.dueDate.toDate() - a.dueDate.toDate();
    });
    
    const container = document.getElementById('formsList');
    if (!container) {
      console.error('Forms container not found');
      return;
    }

    if (forms.length === 0) {
      container.innerHTML = '<div class="empty-state">No forms created yet. <a href="create-form.html">Create your first form</a></div>';
      return;
    }

    container.innerHTML = forms.map(form => `
      <div class="form-item">
        <div class="form-header">
          <h4 class="form-title">
            <a href="view-form.html?id=${form.id}">${form.title}</a>
          </h4>
          ${form.dueDate ? `
            <span class="form-due-date">
              Due: ${formatDate(form.dueDate.toDate())}
            </span>
          ` : ''}
        </div>
        <p class="form-description">${form.description || 'No description'}</p>
        <div class="form-actions">
          <a href="edit-form.html?id=${form.id}" class="edit-form-link">Edit</a>
          <a href="form-results.html?id=${form.id}" class="view-results-link">Results</a>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading forms:', error);
    const container = document.getElementById('formsList');
    if (container) {
      container.innerHTML = '<div class="empty-state error">Error loading forms. Please try again.</div>';
    }
  }
}

async function loadAnnouncements() {
  try {
    const q = query(
        collection(db, "announcements"), 
        orderBy("createdAt", "desc"), 
        limit(3)
    );
    const querySnapshot = await getDocs(q);
    const announcements = [];
    querySnapshot.forEach(doc => announcements.push({ id: doc.id, ...doc.data() }));

    const container = document.getElementById('announcementsList');
    if (!container) return;

    if (announcements.length === 0) {
        container.innerHTML = '<div class="empty-state">No announcements yet.</div>';
        return;
    }
    
    container.innerHTML = announcements.map(announcement => {
      const time = announcement.createdAt ? announcement.createdAt.toDate() : new Date();
      const isScheduled = announcement.scheduledFor && announcement.scheduledFor.toDate() > new Date();
      
      return `
        <div class="announcement-item">
          <div class="announcement-header">
            <h4 class="announcement-title">${announcement.title || 'Untitled'}</h4>
            ${isScheduled ? '<span class="scheduled-badge">Scheduled</span>' : ''}
          </div>
          <p class="announcement-message">${announcement.message}</p>
          <div class="announcement-meta">
            <span class="announcement-author">By: ${announcement.authorName || 'Anonymous'}</span>
            <span class="announcement-time">${formatTimeAgo(time)}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error displaying announcements:', error);
  }
}

function formatTimeAgo(date) {
    if (!date) return 'Unknown';
    
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));

    if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}

function formatDate(date) {
    if (!date) return 'No date';
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const inputDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (inputDate.getTime() === today.getTime()) {
        return 'Today';
    } else if (inputDate.getTime() === tomorrow.getTime()) {
        return 'Tomorrow';
    } else if (inputDate.getTime() === yesterday.getTime()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function initializeCalendar() {
    try {
        calendar = new CalendarWidget('calendarWidget');
        
        // Load events into calendar
        loadUpcomingEvents();
        
        // Add event listener for date selection
        document.getElementById('calendarWidget').addEventListener('dateSelected', (e) => {
            console.log('Date selected:', e.detail.date);
        });
    } catch (error) {
        console.error('Error initializing calendar:', error);
    }
}

async function loadUpcomingEvents() {
    try {
        const eventsRef = collection(db, "events");
        const q = query(eventsRef, orderBy("date", "asc"), limit(10));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach(doc => {
            const event = doc.data();
            if (event.date && calendar) {
                let eventDate;
                
                // Handle different date formats
                if (typeof event.date === 'string') {
                    // Date stored as string
                    eventDate = new Date(event.date);
                } else if (event.date && typeof event.date.toDate === 'function') {
                    // Firestore Timestamp
                    eventDate = event.date.toDate();
                } else if (event.date instanceof Date) {
                    // Already a Date object
                    eventDate = event.date;
                } else {
                    console.warn('Unknown date format:', event.date);
                    return; // Skip this event
                }
                
                // Only add if we have a valid date
                if (eventDate instanceof Date && !isNaN(eventDate)) {
                    calendar.addEvent(eventDate, {
                        title: event.title,
                        description: event.description,
                        id: doc.id
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error loading events for calendar:', error);
    }
}
