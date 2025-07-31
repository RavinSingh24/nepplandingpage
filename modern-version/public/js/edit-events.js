import EventsService from '/services/events-service.js';
import GroupsService from '/services/groups-service.js';
import authManager from '/utils/auth-manager.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { db } from '/config/firebase-config.js';

class EditEventManager {
    constructor() {
        this.currentUser = null;
        this.currentEvent = null;
        this.userGroups = [];
        this.eventId = null;
        
        // Get event ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.eventId = urlParams.get('id');
        
        if (!this.eventId) {
            this.showError('No event ID provided');
            window.location.href = 'events.html';
            return;
        }
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupAuthListener();
    }
    
    initializeElements() {
        this.editForm = document.getElementById('editEventForm');
        this.cancelBtn = document.getElementById('cancelEdit');
        this.deleteBtn = document.getElementById('deleteEvent');
        this.eventPreview = document.getElementById('eventPreview');
        
        // Form elements
        this.eventTypeField = document.getElementById('editEventType');
        this.titleField = document.getElementById('editEventTitle');
        this.descriptionField = document.getElementById('editEventDescription');
        this.dateField = document.getElementById('editEventDate');
        this.timeField = document.getElementById('editEventTime');
        this.locationField = document.getElementById('editEventLocation');
        this.groupField = document.getElementById('editEventGroup');
        this.visibilityField = document.getElementById('editEventVisibility');
    }
    
    setupEventListeners() {
        this.editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUpdateEvent();
        });
        
        this.cancelBtn.addEventListener('click', () => {
            window.location.href = 'events.html';
        });
        
        this.deleteBtn.addEventListener('click', () => {
            this.handleDeleteEvent();
        });
        
        // Update preview when form changes
        this.editForm.addEventListener('input', () => {
            this.updatePreview();
        });
        
        this.editForm.addEventListener('change', () => {
            this.updatePreview();
        });
    }
    
    setupAuthListener() {
        authManager.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadUserGroups();
                await this.loadEventData();
            } else {
                window.location.href = 'login.html';
            }
        });
    }
    
    async loadUserGroups() {
        try {
            this.userGroups = await GroupsService.getUserGroups(this.currentUser.uid);
            this.populateGroupOptions();
        } catch (error) {
            console.error('Error loading user groups:', error);
        }
    }
    
    populateGroupOptions() {
        // Clear existing options except the first one
        this.groupField.innerHTML = '<option value="">Personal Event</option>';
        
        this.userGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            this.groupField.appendChild(option);
        });
    }
    
    async loadEventData() {
        try {
            let event;
            
            // Handle different event types similar to showEventDetails
            if (this.eventId.startsWith('form-')) {
                this.showError('Form due dates cannot be edited here');
                window.location.href = 'events.html';
                return;
            } else if (this.eventId.startsWith('announcement-')) {
                this.showError('Scheduled announcements cannot be edited here');
                window.location.href = 'events.html';
                return;
            } else {
                // Regular event
                event = await EventsService.getEventDetails(this.eventId);
            }
            
            // Check if user is the creator
            if (event.createdBy !== this.currentUser.uid) {
                this.showError('You can only edit events you created');
                window.location.href = 'events.html';
                return;
            }
            
            this.currentEvent = event;
            this.populateForm();
            this.updatePreview();
            
        } catch (error) {
            console.error('Error loading event:', error);
            this.showError('Failed to load event details');
            window.location.href = 'events.html';
        }
    }
    
    populateForm() {
        this.eventTypeField.value = this.currentEvent.type || 'event';
        this.titleField.value = this.currentEvent.title || '';
        this.descriptionField.value = this.currentEvent.description || '';
        
        // Format date for input field
        if (this.currentEvent.date) {
            const date = new Date(this.currentEvent.date);
            this.dateField.value = date.toISOString().split('T')[0];
        }
        
        this.timeField.value = this.currentEvent.time || '';
        this.locationField.value = this.currentEvent.location || '';
        this.groupField.value = this.currentEvent.groupId || '';
        this.visibilityField.value = this.currentEvent.visibility || 'public';
    }
    
    updatePreview() {
        const formData = new FormData(this.editForm);
        const title = formData.get('eventTitle') || 'Event Title';
        const description = formData.get('eventDescription') || 'No description';
        const date = formData.get('eventDate');
        const time = formData.get('eventTime');
        const location = formData.get('eventLocation');
        const eventType = formData.get('eventType');
        
        let typeLabel = 'Event';
        if (eventType === 'announcement') {
            typeLabel = 'Announcement';
        }
        
        this.eventPreview.innerHTML = `
            <div class="preview-event-card">
                <div class="preview-category ${eventType}">${typeLabel}</div>
                <h4 class="preview-title">${title}</h4>
                ${date && time ? `
                    <div class="preview-datetime">
                        ${this.formatDate(date)} at ${this.formatTime(time)}
                    </div>
                ` : ''}
                ${description !== 'No description' ? `
                    <p class="preview-description">${description}</p>
                ` : ''}
                ${location ? `
                    <div class="preview-location">📍 ${location}</div>
                ` : ''}
            </div>
        `;
    }
    
    async handleUpdateEvent() {
        try {
            const formData = new FormData(this.editForm);
            const eventData = {
                title: formData.get('eventTitle').trim(),
                description: formData.get('eventDescription').trim(),
                date: formData.get('eventDate'),
                time: formData.get('eventTime'),
                location: formData.get('eventLocation').trim(),
                groupId: formData.get('eventGroup') || null,
                visibility: formData.get('eventVisibility'),
                type: formData.get('eventType') || 'event'
            };

            // Validate event data
            EventsService.validateEventData(eventData);

            // Update the event
            await EventsService.updateEvent(this.eventId, eventData, this.currentUser.uid);

            this.showSuccess('Event updated successfully');
            
            // Redirect back to events page after a delay
            setTimeout(() => {
                window.location.href = 'events.html';
            }, 1500);
            
        } catch (error) {
            console.error('Error updating event:', error);
            this.showError(error.message);
        }
    }
    
    async handleDeleteEvent() {
        if (confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
            try {
                await EventsService.deleteEvent(this.eventId, this.currentUser.uid);
                this.showSuccess('Event deleted successfully');
                
                // Redirect back to events page after a delay
                setTimeout(() => {
                    window.location.href = 'events.html';
                }, 1500);
                
            } catch (error) {
                console.error('Error deleting event:', error);
                this.showError(error.message);
            }
        }
    }
    
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    formatTime(timeString) {
        if (!timeString) return '';
        const [hours, minutes] = timeString.split(':');
        const hour12 = hours % 12 || 12;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        return `${hour12}:${minutes} ${ampm}`;
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
}

// Initialize the edit event manager
const editEventManager = new EditEventManager();

// Make it globally available for inline event handlers
window.editEventManager = editEventManager;
