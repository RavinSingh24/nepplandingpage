// Background notification scheduler
// This service runs periodic checks for notifications that need to be sent

import NotificationService from '/services/notification-service.js';

class NotificationScheduler {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.checkInterval = 60 * 60 * 1000; // Check every hour
    }

    // Start the scheduler
    start() {
        if (this.isRunning) {
            console.warn('Notification scheduler is already running');
            return;
        }

        this.isRunning = true;
        console.log('Starting notification scheduler...');

        // Run initial check
        this.runChecks();

        // Set up periodic checks
        this.intervalId = setInterval(() => {
            this.runChecks();
        }, this.checkInterval);
    }

    // Stop the scheduler
    stop() {
        if (!this.isRunning) {
            console.warn('Notification scheduler is not running');
            return;
        }

        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        console.log('Notification scheduler stopped');
    }

    // Run all notification checks
    async runChecks() {
        try {
            console.log('Running notification checks...');

            // Check for form due dates
            const formNotifications = await NotificationService.checkFormDueDates();
            
            if (formNotifications.length > 0) {
                console.log(`Created ${formNotifications.length} form due notifications`);
            }

            // Add more checks here as needed
            // - Event reminders
            // - Meeting notifications
            // - Deadline warnings
            // etc.

        } catch (error) {
            console.error('Error running notification checks:', error);
        }
    }

    // Manually trigger a check (useful for testing)
    async manualCheck() {
        console.log('Running manual notification check...');
        await this.runChecks();
    }
}

// Create a singleton instance
const notificationScheduler = new NotificationScheduler();

// Auto-start the scheduler when the module is loaded
// You might want to only start this on certain pages or conditions
if (typeof window !== 'undefined') {
    // Start scheduler after a short delay to allow other services to initialize
    setTimeout(() => {
        notificationScheduler.start();
    }, 5000);

    // Stop scheduler when the page is unloaded
    window.addEventListener('beforeunload', () => {
        notificationScheduler.stop();
    });
}

export default notificationScheduler;
