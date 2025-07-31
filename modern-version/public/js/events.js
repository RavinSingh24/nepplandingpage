import EventsService from '/services/events-service.js';
import GroupsService from '/services/groups-service.js';
import { CalendarWidget } from '/components/calendar-widget.js';
import authManager from '/utils/auth-manager.js';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { db } from '/config/firebase-config.js';

class EventsManager {
    constructor() {
        this.currentUser = null;
        this.userGroups = [];
        this.events = [];
        this.formDueDates = [];
        this.announcements = [];
        this.filteredEvents = [];
        this.currentView = 'list';
        this.calendar = null;
        
        // Initialize services (they are singletons)
        this.eventsService = EventsService;
        this.groupsService = GroupsService;
        this.authManager = authManager;
        
        this.initializeElements();
        this.bindEvents();
        this.setupAuthListener();
    }

    initializeElements() {
        // Header elements
        this.createEventBtn = document.getElementById('createEventBtn');
        
        // Control elements
        this.viewButtons = document.querySelectorAll('.view-btn');
        this.groupFilter = document.getElementById('groupFilter');
        this.timeFilter = document.getElementById('timeFilter');
        this.searchInput = document.getElementById('eventsSearch');
        
        // View elements
        this.eventsListView = document.getElementById('eventsListView');
        this.eventsCalendarView = document.getElementById('eventsCalendarView');
        this.eventsList = document.getElementById('eventsList');
        this.eventsCalendar = document.getElementById('eventsCalendar');
        
        // Sidebar elements
        this.miniCalendar = document.getElementById('miniCalendar');
        this.upcomingEventsList = document.getElementById('upcomingEventsList');
        
        // Modal elements
        this.createEventModal = document.getElementById('createEventModal');
        this.createEventForm = document.getElementById('createEventForm');
        this.cancelCreateEventBtn = document.getElementById('cancelCreateEvent');
        
        // Target audience selector elements
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
        
        this.eventDetailsModal = document.getElementById('eventDetailsModal');
        this.eventDetailsContainer = document.getElementById('eventDetailsContainer');
        this.closeEventDetailsBtn = document.getElementById('closeEventDetails');
        
        // Initialize target audience management
        this.selectedGroups = new Set();
        this.selectedUsers = new Set();
        this.allUsers = [];
        this.allGroups = [];
        this.currentTab = 'groups'; // Track current tab
    }

    bindEvents() {
        // Create event button
        this.createEventBtn.addEventListener('click', () => {
            this.showCreateEventModal();
        });

        // View switching
        this.viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.switchView(button.dataset.view);
            });
        });

        // Filter and search
        this.groupFilter.addEventListener('change', () => {
            this.filterEvents();
        });

        this.timeFilter.addEventListener('change', () => {
            this.filterEvents();
        });

        this.searchInput.addEventListener('input', () => {
            this.filterEvents();
        });

        // Create event form
        this.createEventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateEvent();
        });

        this.cancelCreateEventBtn.addEventListener('click', () => {
            this.hideCreateEventModal();
        });

        // Target audience events
        this.bindAudienceEvents();

        // Event details modal
        this.closeEventDetailsBtn.addEventListener('click', () => {
            this.hideEventDetailsModal();
        });

        // Close modals when clicking outside
        this.createEventModal.addEventListener('click', (e) => {
            if (e.target === this.createEventModal) {
                this.hideCreateEventModal();
            }
        });

        this.eventDetailsModal.addEventListener('click', (e) => {
            if (e.target === this.eventDetailsModal) {
                this.hideEventDetailsModal();
            }
        });
    }

    setupAuthListener() {
        // Subscribe to global auth state changes
        authManager.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                
                // Load all data and initialize calendar
                await this.loadAllData();
                this.initializeCalendar();
                
                // Load groups and users for audience selector
                await this.loadGroupsAndUsers();
                
                // Check for event parameter in URL (for notifications)
                this.checkForEventParameter();
            } else {
                this.showAuthAlert();
            }
        });
    }

    checkForEventParameter() {
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('event');
        
        if (eventId) {
            // Show the event details modal after a short delay to ensure everything is loaded
            setTimeout(() => {
                this.showEventDetails(eventId);
                // Clean up the URL parameter
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            }, 500);
        }
    }

    showAuthAlert() {
        alert('Please log in to access events.');
        window.location.href = 'login.html';
    }

    async loadAllData() {
        try {
            // Load user groups first
            await this.loadUserGroups();
            
            // Load all event data in parallel
            await Promise.all([
                this.loadEvents(),
                this.loadFormDueDates(),
                this.loadScheduledAnnouncements()
            ]);
            
            // Combine and filter all events
            this.combineAllEvents();
            this.filterEvents();
            this.renderEvents();
            this.renderUpcomingEvents();
            
        } catch (error) {
            console.error('Error loading events data:', error);
            this.showError('Failed to load events data');
        }
    }

    async loadFormDueDates() {
        try {
            this.formDueDates = [];
            
            // Get forms created by the user
            const userFormsQuery = query(
                collection(db, 'forms'),
                where('createdBy', '==', this.currentUser.uid)
            );
            
            const userFormsSnapshot = await getDocs(userFormsQuery);
            let allForms = [...userFormsSnapshot.docs];
            
            // Then, get forms from groups the user is a member of
            if (this.userGroups && this.userGroups.length > 0) {
                for (const group of this.userGroups) {
                    try {
                        const groupFormsQuery = query(
                            collection(db, 'forms'),
                            where('groupId', '==', group.id)
                        );
                        
                        const groupFormsSnapshot = await getDocs(groupFormsQuery);
                        // Avoid duplicates
                        const newForms = groupFormsSnapshot.docs.filter(doc => 
                            !allForms.some(existingDoc => existingDoc.id === doc.id)
                        );
                        allForms = [...allForms, ...newForms];
                    } catch (error) {
                        console.log(`Could not load forms for group ${group.id}: ${error.message}`);
                        // Continue with other groups even if one fails
                    }
                }
            }
            
            // Filter for forms with due dates and create calendar events
            this.formDueDates = allForms
                .filter(doc => {
                    const data = doc.data();
                    return data.dueDate != null;
                })
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: `form-${doc.id}`,
                        type: 'form-due',
                        title: `Form Due: ${data.title}`,
                        description: `Form "${data.title}" is due`,
                        date: data.dueDate.toDate(),
                        time: data.dueTime || '23:59',
                        location: 'Online Form',
                        formId: doc.id,
                        visibility: data.type || 'public',
                        createdBy: data.createdBy,
                        category: 'deadline'
                    };
                })
                .sort((a, b) => a.date - b.date); // Sort by due date
                
            console.log(`Loaded ${this.formDueDates.length} form due dates`);
        } catch (error) {
            console.error('Error loading form due dates:', error);
            this.formDueDates = [];
        }
    }

    async loadScheduledAnnouncements() {
        try {
            // Get announcements with scheduled dates that the user has access to
            // First, get announcements created by the user
            const userAnnouncementsQuery = query(
                collection(db, 'announcements'),
                where('createdBy', '==', this.currentUser.uid),
                where('scheduledDate', '!=', null),
                orderBy('scheduledDate', 'asc')
            );
            
            const userAnnouncementsSnapshot = await getDocs(userAnnouncementsQuery);
            let allAnnouncements = [...userAnnouncementsSnapshot.docs];
            
            // Then, get announcements from groups the user is a member of
            if (this.userGroups && this.userGroups.length > 0) {
                for (const group of this.userGroups) {
                    const groupAnnouncementsQuery = query(
                        collection(db, 'announcements'),
                        where('groupId', '==', group.id),
                        where('scheduledDate', '!=', null),
                        orderBy('scheduledDate', 'asc')
                    );
                    
                    const groupAnnouncementsSnapshot = await getDocs(groupAnnouncementsQuery);
                    // Avoid duplicates
                    const newAnnouncements = groupAnnouncementsSnapshot.docs.filter(doc => 
                        !allAnnouncements.some(existingDoc => existingDoc.id === doc.id)
                    );
                    allAnnouncements = [...allAnnouncements, ...newAnnouncements];
                }
            }
            
            this.announcements = allAnnouncements.map(doc => {
                const data = doc.data();
                return {
                    id: `announcement-${doc.id}`,
                    type: 'announcement',
                    title: data.title,
                    description: data.content,
                    date: data.scheduledDate.toDate(),
                    time: data.scheduledTime || '09:00',
                    location: 'Announcement',
                    announcementId: doc.id,
                    visibility: 'public',
                    createdBy: data.createdBy,
                    category: 'announcement'
                };
            });
        } catch (error) {
            console.error('Error loading scheduled announcements:', error);
            this.announcements = [];
        }
    }

    combineAllEvents() {
        // Combine events, form due dates, and announcements
        this.events = [
            ...this.events,
            ...this.formDueDates,
            ...this.announcements
        ];
        
        // Sort by date
        this.events.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    initializeCalendar() {
        // Initialize the main calendar widget
        this.calendar = new CalendarWidget('eventsCalendar');
        
        // Pass events data to calendar
        this.calendar.setEvents(this.events);
        
        // Add event listener for date selection
        document.getElementById('eventsCalendar').addEventListener('dateSelected', (e) => {
            this.handleDateSelection(e.detail.dateString, e.detail.date);
        });
        
        // Initialize mini calendar
        this.miniCalendar = new CalendarWidget('miniCalendar');
        this.miniCalendar.setEvents(this.events);
        this.miniCalendar.setMiniMode(true);
        
        // Add event listener for mini calendar date selection
        document.getElementById('miniCalendar').addEventListener('dateSelected', (e) => {
            this.handleDateSelection(e.detail.dateString, e.detail.date);
        });
    }

    handleDateSelection(dateString, selectedDate) {
        // Ensure events array exists
        if (!this.events) {
            this.events = [];
        }
        
        // Get events for the selected date
        const eventsForDate = this.events.filter(event => {
            const eventDateString = this.formatDateString(new Date(event.date));
            return eventDateString === dateString;
        });

        // Update the events sidebar to show events for this date
        this.displayDayEvents(eventsForDate, selectedDate);
    }

    formatDateString(date) {
        return date.toISOString().split('T')[0];
    }

    displayDayEvents(events, selectedDate) {
        // Find or create a day events display area
        let dayEventsContainer = document.querySelector('.day-events-container');
        
        if (!dayEventsContainer) {
            // Create the container and add it to the sidebar
            dayEventsContainer = document.createElement('div');
            dayEventsContainer.className = 'day-events-container';
            this.eventsSidebar.appendChild(dayEventsContainer);
        }

        const dateStr = selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        if (events.length === 0) {
            dayEventsContainer.innerHTML = `
                <div class="day-events">
                    <h3>Events for ${dateStr}</h3>
                    <p class="no-events">No events scheduled for this date.</p>
                </div>
            `;
        } else {
            dayEventsContainer.innerHTML = `
                <div class="day-events">
                    <h3>Events for ${dateStr}</h3>
                    <div class="day-events-list">
                        ${events.map(event => `
                            <div class="day-event-item" onclick="eventsManager.showEventDetails('${event.id}')">
                                <div class="day-event-time">${this.formatTime(event.time)}</div>
                                <div class="day-event-info">
                                    <div class="day-event-title">${event.title}</div>
                                    <div class="day-event-type">${this.getEventTypeLabel(event.type)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    getEventTypeLabel(type) {
        switch(type) {
            case 'form-due': return 'Form Due';
            case 'announcement': return 'Announcement';
            default: return 'Event';
        }
    }

    formatTime(time) {
        if (!time) return '';
        const [hours, minutes] = time.split(':');
        const hour12 = hours % 12 || 12;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        return `${hour12}:${minutes} ${ampm}`;
    }

    async loadUserGroups() {
        try {
            this.userGroups = await GroupsService.getUserGroups(this.currentUser.uid);
            
            // Populate group filter
            this.populateGroupFilter();
        } catch (error) {
            console.error('Error loading user groups:', error);
            this.userGroups = [];
        }
    }

    async loadEvents() {
        try {
            // Load events created by user or for their groups
            const userGroupIds = this.userGroups.map(group => group.id);
            this.events = await this.eventsService.getUserEvents(this.currentUser.uid, userGroupIds);
        } catch (error) {
            console.error('Error loading events:', error);
            this.events = [];
        }
    }

    renderEvents() {
        if (this.currentView === 'list') {
            this.renderListView();
        } else {
            this.renderCalendarView();
        }
    }

    showError(message) {
        // Simple error notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 1rem;
            border-radius: 8px;
            z-index: 2000;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    populateGroupFilter() {
        // Clear existing options except "All Groups"
        this.groupFilter.innerHTML = '<option value="">All Groups</option>';
        
        // Add user groups
        this.userGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            this.groupFilter.appendChild(option);
        });
    }

    switchView(view) {
        this.currentView = view;
        
        // Update view buttons
        this.viewButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.view === view);
        });
        
        // Update view content
        this.eventsListView.classList.toggle('active', view === 'list');
        this.eventsCalendarView.classList.toggle('active', view === 'calendar');
        
        if (view === 'calendar') {
            this.renderCalendarView();
        }
    }

    filterEvents() {
        let filtered = [...this.events];
        
        // Apply group filter
        const groupId = this.groupFilter.value;
        if (groupId) {
            filtered = EventsService.filterEventsByGroup(filtered, groupId);
        }
        
        // Apply time filter
        const timeFilter = this.timeFilter.value;
        filtered = EventsService.filterEventsByTime(filtered, timeFilter);
        
        // Apply search filter
        const searchTerm = this.searchInput.value;
        filtered = EventsService.searchEvents(filtered, searchTerm);
        
        this.filteredEvents = filtered;
        this.renderEvents();
    }

    renderEvents() {
        if (this.filteredEvents.length === 0) {
            this.renderEmptyState();
            return;
        }

        this.eventsList.innerHTML = this.filteredEvents.map(event => {
            const group = this.userGroups.find(g => g.id === event.groupId);
            const isCreator = event.createdBy === this.currentUser.uid;
            
            // Determine event category for display
            let eventCategory = 'event';
            let categoryText = 'Event';
            
            if (event.type === 'form-due') {
                eventCategory = 'deadline';
                categoryText = 'Form Due';
            } else if (event.type === 'announcement') {
                eventCategory = 'announcement';
                categoryText = 'Announcement';
            }
            
            return `
                <div class="event-card" onclick="eventsManager.showEventDetails('${event.id}')">
                    <div class="event-header">
                        <div class="event-category ${eventCategory}">${categoryText}</div>
                        <h3 class="event-title">${event.title}</h3>
                        <div class="event-time">
                            ${EventsService.formatDate(event.date)} at ${EventsService.formatTime(event.time)}
                        </div>
                    </div>
                    ${event.description ? `<p class="event-description">${event.description}</p>` : ''}
                    <div class="event-meta">
                        <div class="event-details">
                            ${event.location ? `
                                <div class="event-location">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                    </svg>
                                    ${event.location}
                                </div>
                            ` : ''}
                        </div>
                        <div class="event-badges">
                            ${group ? `<span class="event-group">${group.name}</span>` : ''}
                            <span class="event-visibility ${event.visibility}">${event.visibility}</span>
                            ${isCreator ? '<span class="event-creator">Created by you</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderEmptyState() {
        this.eventsList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                <h3>No events found</h3>
                <p>Create an event or adjust your filters to see events.</p>
            </div>
        `;
    }

    renderUpcomingEvents() {
        const upcomingEvents = EventsService.getUpcomingEvents(this.events, 5);
        
        if (upcomingEvents.length === 0) {
            this.upcomingEventsList.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No upcoming events</p>';
            return;
        }

        this.upcomingEventsList.innerHTML = upcomingEvents.map(event => `
            <div class="upcoming-event-item" onclick="eventsManager.showEventDetails('${event.id}')">
                <div class="upcoming-event-date">
                    ${new Date(event.date).getDate()}
                </div>
                <div class="upcoming-event-info">
                    <div class="upcoming-event-title">${event.title}</div>
                    <div class="upcoming-event-time">${EventsService.formatTime(event.time)}</div>
                </div>
            </div>
        `).join('');
    }

    renderMiniCalendar() {
        // Simple mini calendar - you can enhance this
        const now = new Date();
        const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        this.miniCalendar.innerHTML = `
            <h3>${monthName}</h3>
            <div style="text-align: center; color: var(--text-muted); font-size: 0.875rem;">
                Click on calendar view for full calendar
            </div>
        `;
    }

    renderCalendarView() {
        // Create calendar widget container
        this.eventsCalendar.innerHTML = `
            <div class="calendar-container">
                <div id="events-calendar-widget"></div>
                <div class="calendar-legend">
                    <h4>Legend</h4>
                    <div class="legend-item">
                        <span class="legend-color event-type-event"></span>
                        <span>Events</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color event-type-form-due"></span>
                        <span>Form Due Dates</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color event-type-announcement"></span>
                        <span>Scheduled Announcements</span>
                    </div>
                </div>
            </div>
        `;

        // Initialize calendar widget
        const calendarContainer = document.getElementById('events-calendar-widget');
        if (calendarContainer && window.CalendarWidget) {
            this.calendarWidget = new CalendarWidget(calendarContainer);
            
            // Set events on the calendar
            if (this.allEvents && this.allEvents.length > 0) {
                this.calendarWidget.setEvents(this.allEvents);
            }
        }
    }

    // Target Audience methods (similar to announcements)
    bindAudienceEvents() {
        if (!this.audienceTabs) return;
        
        // Tab switching
        this.audienceTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchAudienceTab(tab.dataset.target));
        });
        
        // Group search events
        if (this.groupSearch) {
            this.groupSearch.addEventListener('input', (e) => this.searchGroups(e.target.value));
            this.groupSearch.addEventListener('focus', () => {
                // Show all user's groups when focusing on search
                this.searchGroups(''); // Empty search shows all groups
            });
        }
        
        if (this.bothGroupSearch) {
            this.bothGroupSearch.addEventListener('input', (e) => this.searchGroups(e.target.value, 'both'));
            this.bothGroupSearch.addEventListener('focus', () => {
                // Show all user's groups when focusing on search
                this.searchGroups('', 'both'); // Empty search shows all groups
            });
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

            // Load only groups the user is a member of (security fix)
            this.allGroups = [...this.userGroups]; // Use userGroups which are already filtered
            
            // Load all users (but filter out current user)
            const usersSnapshot = await getDocs(collection(db, 'users'));
            this.allUsers = [];
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                // Don't include current user in selection
                if (doc.id !== this.currentUser.uid) {
                    // Debug: Log user data to see what fields are available
                    console.log('User data for', doc.id, ':', userData);
                    this.allUsers.push({ id: doc.id, ...userData });
                }
            });
            
            console.log('Loaded users:', this.allUsers);
            
            // Display user's groups by default
            this.displayUserGroups();
        } catch (error) {
            console.error('Error loading groups and users:', error);
        }
    }

    displayUserGroups() {
        // Display all user's groups in the groups tab
        if (this.groupResults) {
            this.renderGroupResults(this.allGroups, 'single');
        }
        
        // Display all user's groups in the both tab
        if (this.bothGroupResults) {
            this.renderGroupResults(this.allGroups, 'both');
        }
    }

    switchAudienceTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        this.audienceTabs.forEach(tab => {
            if (tab.dataset.target === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Update sections
        this.audienceSections.forEach(section => {
            if (section.id === `${tabName}-selection`) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });
        
        // Adjust modal size based on selected tab
        const modalContent = this.createEventModal.querySelector('.modal-content');
        if (modalContent) {
            if (tabName === 'both') {
                // Increase modal size for "Both" tab to accommodate all containers
                modalContent.style.maxWidth = '900px';
                modalContent.style.maxHeight = '90vh';
                modalContent.style.overflowY = 'auto';
            } else {
                // Reset to default size for single tabs
                modalContent.style.maxWidth = '600px';
                modalContent.style.maxHeight = '80vh';
                modalContent.style.overflowY = 'auto';
            }
        }
    }

    searchGroups(searchTerm, mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothGroupResults : this.groupResults;
        
        if (!searchTerm.trim()) {
            // Show all user's groups when no search term
            this.renderGroupResults(this.allGroups, mode);
            return;
        }

        // Filter only within user's groups (security - can't search for groups they're not in)
        const filteredGroups = this.allGroups.filter(group => {
            const searchStr = searchTerm.toLowerCase();
            return (
                (group.name && group.name.toLowerCase().includes(searchStr)) ||
                (group.description && group.description.toLowerCase().includes(searchStr))
            );
        });

        this.renderGroupResults(filteredGroups, mode);
    }

    renderGroupResults(groups, mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothGroupResults : this.groupResults;
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';
        
        if (groups.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-groups-message" style="padding: 1rem; text-align: center; color: #8892b0;">
                    ${this.allGroups.length === 0 ? 
                        'You are not a member of any groups yet.' : 
                        'No groups match your search.'}
                </div>
            `;
        } else {
            // Add a compact security notice at the top
            const securityNotice = document.createElement('div');
            securityNotice.className = 'security-notice';
            securityNotice.style.cssText = `
                padding: 0.4rem 0.6rem;
                background: rgba(255, 214, 0, 0.1);
                border: 1px solid #ffd600;
                border-radius: 4px;
                margin-bottom: 0.6rem;
                font-size: 0.75rem;
                color: #ffd600;
                text-align: center;
            `;
            securityNotice.innerHTML = `
                <strong>Security:</strong> Showing your ${groups.length} available groups
            `;
            resultsContainer.appendChild(securityNotice);
            
            groups.forEach(group => {
                if (!this.selectedGroups.has(group.id)) {
                    const groupItem = document.createElement('div');
                    groupItem.className = 'group-item';
                    groupItem.style.cssText = `
                        padding: 0.75rem;
                        border: 1px solid #374a6b;
                        border-radius: 8px;
                        margin-bottom: 0.5rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    `;
                    groupItem.innerHTML = `
                        <div class="group-name" style="font-weight: 500; margin-bottom: 0.25rem;">${group.name}</div>
                        <div class="group-description" style="font-size: 0.85rem; color: #8892b0;">${group.description || 'No description'}</div>
                        <div class="group-member-count" style="font-size: 0.8rem; color: #ffd600; margin-top: 0.25rem;">
                            ${group.members ? group.members.length : 0} members
                        </div>
                    `;
                    
                    groupItem.addEventListener('mouseenter', () => {
                        groupItem.style.borderColor = '#ffd600';
                        groupItem.style.background = 'rgba(255, 214, 0, 0.05)';
                    });
                    
                    groupItem.addEventListener('mouseleave', () => {
                        groupItem.style.borderColor = '#374a6b';
                        groupItem.style.background = 'transparent';
                    });
                    
                    groupItem.addEventListener('click', () => {
                        this.selectGroup(group, mode);
                    });
                    
                    resultsContainer.appendChild(groupItem);
                }
            });
        }
        
        this.showGroupResults(mode);
    }

    selectGroup(group, mode = 'single') {
        if (this.selectedGroups.has(group.id)) return;
        
        this.selectedGroups.add(group.id);
        
        const container = mode === 'both' ? this.bothGroupsContainer : this.selectedGroupsContainer;
        const groupTag = document.createElement('div');
        groupTag.className = 'selected-group';
        groupTag.style.cssText = `
            display: inline-block;
            margin: 0.25rem;
            padding: 0.5rem 0.75rem;
            background: rgba(255, 214, 0, 0.1);
            border: 1px solid #ffd600;
            border-radius: 20px;
            font-size: 0.85rem;
            vertical-align: top;
        `;
        groupTag.innerHTML = `
            <span style="color: #ffffff; margin-right: 0.5rem;">${group.name}</span>
            <button type="button" class="remove-btn" data-group-id="${group.id}" style="
                background: none;
                border: none;
                color: #ffd600;
                font-size: 1rem;
                cursor: pointer;
                padding: 0;
                margin-left: 0.25rem;
            ">×</button>
        `;
        
        groupTag.querySelector('.remove-btn').addEventListener('click', () => {
            this.removeGroup(group.id, mode);
        });
        
        container.appendChild(groupTag);
        
        // Update the container styling to display items in a grid
        container.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 0.25rem;
            min-height: 2rem;
            padding: 0.5rem;
            border: 1px solid #374a6b;
            border-radius: 8px;
            background: rgba(55, 74, 107, 0.1);
        `;
        
        this.clearGroupSearch(mode);
        
        // Sync selections across tabs
        this.syncGroupSelections();
    }

    removeGroup(groupId, mode = 'single') {
        this.selectedGroups.delete(groupId);
        
        // Remove from all containers
        const allContainers = [this.selectedGroupsContainer, this.bothGroupsContainer];
        allContainers.forEach(container => {
            if (container) {
                const groupTag = container.querySelector(`[data-group-id="${groupId}"]`)?.parentElement;
                if (groupTag) {
                    groupTag.remove();
                }
            }
        });
        
        // Refresh search results to show the group as available again
        this.refreshGroupResults();
    }

    searchUsers(searchTerm, mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothUserResults : this.userResults;
        
        if (!searchTerm.trim()) {
            this.hideUserResults(mode);
            return;
        }

        const filteredUsers = this.allUsers.filter(user => {
            const searchStr = searchTerm.toLowerCase();
            return (
                (user.firstName && user.firstName.toLowerCase().includes(searchStr)) ||
                (user.lastName && user.lastName.toLowerCase().includes(searchStr)) ||
                (user.email && user.email.toLowerCase().includes(searchStr))
            );
        });

        this.renderUserResults(filteredUsers, mode);
    }

    renderUserResults(users, mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothUserResults : this.userResults;
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';
        
        if (users.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-users-message" style="padding: 1rem; text-align: center; color: #8892b0;">
                    No users match your search.
                </div>
            `;
        } else {
            users.forEach(user => {
                if (!this.selectedUsers.has(user.id)) {
                    const userItem = document.createElement('div');
                    userItem.className = 'user-item';
                    userItem.style.cssText = `
                        padding: 0.75rem;
                        border: 1px solid #374a6b;
                        border-radius: 8px;
                        margin-bottom: 0.5rem;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    `;
                    
                    // Use displayName from Firestore user document
                    const displayName = user.displayName || user.email.split('@')[0];
                    
                    console.log('User name debug:', { 
                        user: user.email, 
                        displayName: user.displayName,
                        finalDisplayName: displayName,
                        rawUserData: user 
                    });
                    
                    userItem.innerHTML = `
                        <div class="user-name" style="font-weight: 500; margin-bottom: 0.25rem; color: #ffffff;">${displayName}</div>
                        <div class="user-email" style="font-size: 0.85rem; color: #8892b0;">${user.email}</div>
                    `;
                    
                    userItem.addEventListener('mouseenter', () => {
                        userItem.style.borderColor = '#ffd600';
                        userItem.style.background = 'rgba(255, 214, 0, 0.05)';
                    });
                    
                    userItem.addEventListener('mouseleave', () => {
                        userItem.style.borderColor = '#374a6b';
                        userItem.style.background = 'transparent';
                    });
                    
                    userItem.addEventListener('click', () => {
                        this.selectUser(user, mode);
                    });
                    
                    resultsContainer.appendChild(userItem);
                }
            });
        }
        
        this.showUserResults(mode);
    }

    selectUser(user, mode = 'single') {
        if (this.selectedUsers.has(user.id)) return;
        
        this.selectedUsers.add(user.id);
        
        const container = mode === 'both' ? this.bothUsersContainer : this.selectedUsersContainer;
        const userTag = document.createElement('div');
        userTag.className = 'selected-user';
        userTag.style.cssText = `
            display: inline-block;
            margin: 0.25rem;
            padding: 0.5rem 0.75rem;
            background: rgba(255, 214, 0, 0.1);
            border: 1px solid #ffd600;
            border-radius: 20px;
            font-size: 0.85rem;
            vertical-align: top;
        `;
        
        // Use displayName from Firestore user document
        const displayName = user.displayName || user.email.split('@')[0];
        
        userTag.innerHTML = `
            <span style="color: #ffffff; margin-right: 0.5rem;">${displayName}</span>
            <button type="button" class="remove-btn" data-user-id="${user.id}" style="
                background: none;
                border: none;
                color: #ffd600;
                font-size: 1rem;
                cursor: pointer;
                padding: 0;
                margin-left: 0.25rem;
            ">×</button>
        `;
        
        userTag.querySelector('.remove-btn').addEventListener('click', () => {
            this.removeUser(user.id, mode);
        });
        
        container.appendChild(userTag);
        
        // Update the container styling to display items in a grid
        container.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 0.25rem;
            min-height: 2rem;
            padding: 0.5rem;
            border: 1px solid #374a6b;
            border-radius: 8px;
            background: rgba(55, 74, 107, 0.1);
        `;
        
        this.clearUserSearch(mode);
        
        // Sync selections across tabs
        this.syncUserSelections();
    }

    removeUser(userId, mode = 'single') {
        this.selectedUsers.delete(userId);
        
        // Remove from all containers  
        const allContainers = [this.selectedUsersContainer, this.bothUsersContainer];
        allContainers.forEach(container => {
            if (container) {
                const userTag = container.querySelector(`[data-user-id="${userId}"]`)?.parentElement;
                if (userTag) {
                    userTag.remove();
                }
            }
        });
        
        // Refresh search results to show the user as available again
        this.refreshUserResults();
    }

    showGroupResults(mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothGroupResults : this.groupResults;
        if (resultsContainer && resultsContainer.children.length > 0) {
            resultsContainer.style.display = 'block';
        }
    }

    hideGroupResults(mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothGroupResults : this.groupResults;
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
    }

    showUserResults(mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothUserResults : this.userResults;
        if (resultsContainer && resultsContainer.children.length > 0) {
            resultsContainer.style.display = 'block';
        }
    }

    hideUserResults(mode = 'single') {
        const resultsContainer = mode === 'both' ? this.bothUserResults : this.userResults;
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
    }

    clearGroupSearch(mode = 'single') {
        const searchInput = mode === 'both' ? this.bothGroupSearch : this.groupSearch;
        if (searchInput) {
            searchInput.value = '';
        }
        this.hideGroupResults(mode);
    }

    clearUserSearch(mode = 'single') {
        const searchInput = mode === 'both' ? this.bothUserSearch : this.userSearch;
        if (searchInput) {
            searchInput.value = '';
        }
        this.hideUserResults(mode);
    }

    // Sync group selections across tabs
    syncGroupSelections() {
        const allContainers = [this.selectedGroupsContainer, this.bothGroupsContainer];
        
        allContainers.forEach(container => {
            if (container) {
                // Clear and rebuild the container
                container.innerHTML = '';
                
                // Apply container styling
                container.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.25rem;
                    min-height: 2rem;
                    padding: 0.5rem;
                    border: 1px solid #374a6b;
                    border-radius: 8px;
                    background: rgba(55, 74, 107, 0.1);
                `;
                
                // Add all selected groups
                this.selectedGroups.forEach(groupId => {
                    const group = this.allGroups.find(g => g.id === groupId);
                    if (group) {
                        const groupTag = document.createElement('div');
                        groupTag.className = 'selected-group';
                        groupTag.style.cssText = `
                            display: inline-block;
                            margin: 0.25rem;
                            padding: 0.5rem 0.75rem;
                            background: rgba(255, 214, 0, 0.1);
                            border: 1px solid #ffd600;
                            border-radius: 20px;
                            font-size: 0.85rem;
                            vertical-align: top;
                        `;
                        groupTag.innerHTML = `
                            <span style="color: #ffffff; margin-right: 0.5rem;">${group.name}</span>
                            <button type="button" class="remove-btn" data-group-id="${group.id}" style="
                                background: none;
                                border: none;
                                color: #ffd600;
                                font-size: 1rem;
                                cursor: pointer;
                                padding: 0;
                                margin-left: 0.25rem;
                            ">×</button>
                        `;
                        
                        groupTag.querySelector('.remove-btn').addEventListener('click', () => {
                            this.removeGroup(group.id);
                        });
                        
                        container.appendChild(groupTag);
                    }
                });
            }
        });
    }

    // Sync user selections across tabs
    syncUserSelections() {
        const allContainers = [this.selectedUsersContainer, this.bothUsersContainer];
        
        allContainers.forEach(container => {
            if (container) {
                // Clear and rebuild the container
                container.innerHTML = '';
                
                // Apply container styling
                container.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.25rem;
                    min-height: 2rem;
                    padding: 0.5rem;
                    border: 1px solid #374a6b;
                    border-radius: 8px;
                    background: rgba(55, 74, 107, 0.1);
                `;
                
                // Add all selected users
                this.selectedUsers.forEach(userId => {
                    const user = this.allUsers.find(u => u.id === userId);
                    if (user) {
                        const userTag = document.createElement('div');
                        userTag.className = 'selected-user';
                        userTag.style.cssText = `
                            display: inline-block;
                            margin: 0.25rem;
                            padding: 0.5rem 0.75rem;
                            background: rgba(255, 214, 0, 0.1);
                            border: 1px solid #ffd600;
                            border-radius: 20px;
                            font-size: 0.85rem;
                            vertical-align: top;
                        `;
                        
                        // Use displayName from Firestore user document
                        const displayName = user.displayName || user.email.split('@')[0];
                        
                        userTag.innerHTML = `
                            <span style="color: #ffffff; margin-right: 0.5rem;">${displayName}</span>
                            <button type="button" class="remove-btn" data-user-id="${user.id}" style="
                                background: none;
                                border: none;
                                color: #ffd600;
                                font-size: 1rem;
                                cursor: pointer;
                                padding: 0;
                                margin-left: 0.25rem;
                            ">×</button>
                        `;
                        
                        userTag.querySelector('.remove-btn').addEventListener('click', () => {
                            this.removeUser(user.id);
                        });
                        
                        container.appendChild(userTag);
                    }
                });
            }
        });
    }

    // Refresh group search results to show newly available groups
    refreshGroupResults() {
        // Refresh both group result containers
        if (this.currentTab === 'groups' && this.groupResults && this.groupResults.style.display === 'block') {
            this.renderGroupResults(this.allGroups, 'single');
        }
        if (this.currentTab === 'both' && this.bothGroupResults && this.bothGroupResults.style.display === 'block') {
            this.renderGroupResults(this.allGroups, 'both');
        }
    }

    // Refresh user search results to show newly available users
    refreshUserResults() {
        // Only refresh if search results are currently visible and have content
        if (this.currentTab === 'users' && this.userResults && this.userResults.style.display === 'block') {
            const searchTerm = this.userSearch ? this.userSearch.value : '';
            if (searchTerm.trim()) {
                this.searchUsers(searchTerm, 'single');
            }
        }
        if (this.currentTab === 'both' && this.bothUserResults && this.bothUserResults.style.display === 'block') {
            const searchTerm = this.bothUserSearch ? this.bothUserSearch.value : '';
            if (searchTerm.trim()) {
                this.searchUsers(searchTerm, 'both');
            }
        }
    }

    showCreateEventModal() {
        this.createEventForm.reset();
        
        // Clear selections
        this.selectedGroups.clear();
        this.selectedUsers.clear();
        
        // Clear selected containers and apply styling
        const containers = [
            this.selectedGroupsContainer, 
            this.selectedUsersContainer, 
            this.bothGroupsContainer, 
            this.bothUsersContainer
        ];
        
        containers.forEach(container => {
            if (container) {
                container.innerHTML = '';
                container.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.25rem;
                    min-height: 2rem;
                    padding: 0.5rem;
                    border: 1px solid #374a6b;
                    border-radius: 8px;
                    background: rgba(55, 74, 107, 0.1);
                `;
            }
        });
        
        // Clear search inputs
        if (this.groupSearch) this.groupSearch.value = '';
        if (this.userSearch) this.userSearch.value = '';
        if (this.bothGroupSearch) this.bothGroupSearch.value = '';
        if (this.bothUserSearch) this.bothUserSearch.value = '';
        
        // Hide all results initially
        this.hideGroupResults();
        this.hideUserResults();
        this.hideGroupResults('both');
        this.hideUserResults('both');
        
        // Reset to groups tab and reset modal size
        this.switchAudienceTab('groups');
        
        // Reset modal size to default
        const modalContent = this.createEventModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.maxWidth = '600px';
            modalContent.style.maxHeight = '80vh';
            modalContent.style.overflowY = 'auto';
        }
        
        // Load groups and users if not already loaded
        if (this.allGroups.length === 0 || this.allUsers.length === 0) {
            this.loadGroupsAndUsers();
        } else {
            // Display user's groups immediately
            this.displayUserGroups();
        }
        
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('eventDate').value = today;
        
        this.createEventModal.style.display = 'flex';
    }

    hideCreateEventModal() {
        this.createEventModal.style.display = 'none';
    }

    async handleCreateEvent() {
        try {
            const formData = new FormData(this.createEventForm);
            const eventData = {
                title: formData.get('eventTitle').trim(),
                description: formData.get('eventDescription').trim(),
                date: formData.get('eventDate'),
                time: formData.get('eventTime'),
                location: formData.get('eventLocation').trim(),
                type: formData.get('eventType') || 'event',
                // Include selected groups and users from target audience
                selectedGroups: Array.from(this.selectedGroups),
                invitedUsers: Array.from(this.selectedUsers)
            };

            // Validate event data
            this.eventsService.validateEventData(eventData);

            // Create the event
            await this.eventsService.createEvent(eventData, this.currentUser.uid);

            this.hideCreateEventModal();
            this.showSuccess('Event created successfully');
            
            // Reload events
            await this.loadAllData();
        } catch (error) {
            console.error('Error creating event:', error);
            this.showError(error.message);
        }
    }

    async showEventDetails(eventId) {
        try {
            let event;
            
            // Handle different event types
            if (eventId.startsWith('form-')) {
                // This is a form due date, get details from forms collection
                const formId = eventId.replace('form-', '');
                const formRef = doc(db, 'forms', formId);
                const formDoc = await getDoc(formRef);
                
                if (!formDoc.exists()) {
                    throw new Error('Form not found');
                }
                
                const formData = formDoc.data();
                event = {
                    id: eventId,
                    title: `Form Due: ${formData.title}`,
                    description: formData.description || `Form "${formData.title}" is due`,
                    date: formData.dueDate.toDate(),
                    time: formData.dueTime || '23:59',
                    location: 'Online Form',
                    type: 'form-due',
                    formId: formId,
                    createdBy: formData.createdBy,
                    visibility: formData.type || 'public'
                };
            } else if (eventId.startsWith('announcement-')) {
                // This is a scheduled announcement, get details from announcements collection
                const announcementId = eventId.replace('announcement-', '');
                const announcementRef = doc(db, 'announcements', announcementId);
                const announcementDoc = await getDoc(announcementRef);
                
                if (!announcementDoc.exists()) {
                    throw new Error('Announcement not found');
                }
                
                const announcementData = announcementDoc.data();
                event = {
                    id: eventId,
                    title: announcementData.title,
                    description: announcementData.content,
                    date: announcementData.scheduledDate.toDate(),
                    time: announcementData.scheduledTime || '09:00',
                    location: 'Announcement',
                    type: 'announcement',
                    announcementId: announcementId,
                    createdBy: announcementData.createdBy,
                    visibility: 'public'
                };
            } else {
                // This is a regular event
                event = await this.eventsService.getEventDetails(eventId);
            }
            
            const group = this.userGroups.find(g => g.id === event.groupId);
            const isCreator = event.createdBy === this.currentUser.uid;
            const isFormDue = eventId.startsWith('form-');
            const isAnnouncement = eventId.startsWith('announcement-');
            const isRegularEvent = !isFormDue && !isAnnouncement;
            
            // Determine what actions are available
            let actionsHtml = '';
            if (isRegularEvent && isCreator) {
                actionsHtml = `
                    <div class="event-actions" style="margin-top: 2rem; display: flex; gap: 1rem;">
                        <button class="submit-btn" onclick="eventsManager.editEvent('${event.id}')">Edit Event</button>
                        <button class="cancel-btn" onclick="eventsManager.deleteEvent('${event.id}')">Delete Event</button>
                    </div>
                `;
            } else if (isFormDue) {
                actionsHtml = `
                    <div class="event-notice" style="margin-top: 2rem; padding: 1rem; background: rgba(255, 214, 0, 0.1); border: 1px solid #ffd600; border-radius: 8px;">
                        <p style="margin: 0; color: #ffd600;">
                            <strong>Form Deadline:</strong> This deadline is automatically generated from a form. 
                            To modify or remove it, edit the original form.
                        </p>
                    </div>
                `;
            } else if (isAnnouncement) {
                actionsHtml = `
                    <div class="event-notice" style="margin-top: 2rem; padding: 1rem; background: rgba(100, 150, 255, 0.1); border: 1px solid #6496ff; border-radius: 8px;">
                        <p style="margin: 0; color: #6496ff;">
                            <strong>Scheduled Announcement:</strong> This is a scheduled announcement. 
                            To modify it, edit the original announcement.
                        </p>
                    </div>
                `;
            }
            
            this.eventDetailsContainer.innerHTML = `
                <div class="event-details-header">
                    <h2>${event.title}</h2>
                    <div class="event-details-meta">
                        <span class="event-visibility ${event.visibility}">${event.visibility}</span>
                        ${group ? `<span class="event-group">${group.name}</span>` : ''}
                        ${isCreator ? '<span class="event-creator">Created by you</span>' : ''}
                    </div>
                </div>
                
                <div class="event-details-info">
                    <div class="event-detail-item">
                        <strong>Date:</strong> ${EventsService.formatDate(event.date)}
                    </div>
                    <div class="event-detail-item">
                        <strong>Time:</strong> ${EventsService.formatTime(event.time)}
                    </div>
                    ${event.location ? `
                        <div class="event-detail-item">
                            <strong>Location:</strong> ${event.location}
                        </div>
                    ` : ''}
                    ${event.description ? `
                        <div class="event-detail-item">
                            <strong>Description:</strong>
                            <p style="margin-top: 0.5rem;">${event.description}</p>
                        </div>
                    ` : ''}
                </div>
                
                ${actionsHtml}
            `;
            
            this.eventDetailsModal.style.display = 'flex';
        } catch (error) {
            console.error('Error loading event details:', error);
            this.showError('Failed to load event details');
        }
    }

    hideEventDetailsModal() {
        this.eventDetailsModal.style.display = 'none';
    }

    showSuccess(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 1rem;
            border-radius: 8px;
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showError(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 1rem;
            border-radius: 8px;
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    editEvent(eventId) {
        // Navigate to edit events page with event ID as parameter
        window.location.href = `edit-events.html?eventId=${encodeURIComponent(eventId)}`;
    }

    async deleteEvent(eventId) {
        if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
            return;
        }

        try {
            console.log('Attempting to delete event with ID:', eventId);
            
            const user = await this.authManager.getCurrentUser();
            if (!user) {
                throw new Error('You must be logged in to delete events');
            }

            // Check if this is a form due date or announcement (cannot be deleted)
            if (eventId.startsWith('form-')) {
                this.showError('Form due dates cannot be deleted from the events page. To remove this deadline, edit or delete the original form.');
                return;
            }
            
            if (eventId.startsWith('announcement-')) {
                this.showError('Scheduled announcements cannot be deleted from the events page. Edit the original announcement to remove the schedule.');
                return;
            }

            // Find the event in our local events array to verify it exists
            const eventToDelete = this.events.find(event => event.id === eventId);
            if (!eventToDelete) {
                console.error('Event not found in local events array:', eventId);
                this.showError('This event cannot be found. It may have been deleted by another user or you may not have permission to delete it.');
                return;
            }

            console.log('Found event to delete:', eventToDelete);
            
            // Check if user is the creator
            if (eventToDelete.createdBy !== user.uid) {
                this.showError('You can only delete events that you created');
                return;
            }

            await this.eventsService.deleteEvent(eventId, user.uid);
            this.showSuccess('Event deleted successfully');
            this.hideEventDetailsModal();
            // Refresh the events list
            await this.loadAllData();
        } catch (error) {
            console.error('Error deleting event:', error);
            if (error.message.includes('Event not found')) {
                this.showError('Event no longer exists or you do not have permission to delete it');
            } else {
                this.showError(`Failed to delete event: ${error.message}`);
            }
        }
    }
}

// Initialize the events manager
const eventsManager = new EventsManager();

// Make it globally available for inline event handlers
window.eventsManager = eventsManager;
