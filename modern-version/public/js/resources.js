import ResourcesService from '/services/resources-service.js';
import authManager from '/utils/auth-manager.js';
import { db } from '/config/firebase-config.js';
import { 
    collection, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

class ResourcesManager {
    constructor() {
        this.currentUser = null;
        this.files = [];
        this.filteredFiles = [];
        this.uploadQueue = [];
        this.isUploading = false;
        
        this.initializeElements();
        this.bindEvents();
        this.setupAuthListener();
    }

    initializeElements() {
        // Main elements
        this.searchInput = document.getElementById('searchInput');
        this.fileFilter = document.getElementById('fileFilter');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileInput = document.getElementById('fileInput');
        this.dropZone = document.getElementById('dropZone');
        this.filesList = document.getElementById('filesList');
        
        // Modal elements
        this.uploadModal = document.getElementById('uploadModal');
        this.uploadProgress = document.getElementById('uploadProgress');
        this.cancelUploadBtn = document.getElementById('cancelUpload');
        this.shareModal = document.getElementById('shareModal');
        this.shareType = document.getElementById('shareType');
        this.groupSelection = document.getElementById('groupSelection');
        this.groupSelect = document.getElementById('groupSelect');
        this.userSelection = document.getElementById('userSelection');
        this.userSelect = document.getElementById('userSelect');
        this.shareDescription = document.getElementById('shareDescription');
        this.cancelShareBtn = document.getElementById('cancelShare');
        this.confirmShareBtn = document.getElementById('confirmShare');
        this.previewModal = document.getElementById('previewModal');
        this.previewContainer = document.getElementById('previewContainer');
        this.closePreviewBtn = document.getElementById('closePreview');

        // Debug: Check if elements exist
        if (!this.dropZone) {
            console.error('Drop zone element not found');
        }
        if (!this.uploadBtn) {
            console.error('Upload button not found');
        }
        if (!this.fileInput) {
            console.error('File input not found');
        }
    }

    bindEvents() {
        // Search functionality
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.filterFiles(e.target.value);
            });
        }

        // Filter functionality
        if (this.fileFilter) {
            this.fileFilter.addEventListener('change', (e) => {
                this.filterByType(e.target.value);
            });
        }

        // Upload button
        if (this.uploadBtn) {
            this.uploadBtn.addEventListener('click', () => {
                this.fileInput.click();
            });
        }

        // File input
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                this.handleFileSelection(Array.from(e.target.files));
            });
        }

        // Drag and drop
        if (this.dropZone) {
            this.dropZone.addEventListener('click', () => {
                this.fileInput.click();
            });

            this.dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.dropZone.classList.add('drag-over');
            });

            this.dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.dropZone.classList.remove('drag-over');
            });

            this.dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.dropZone.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files);
                this.handleFileSelection(files);
            });
        }

        // Modal events
        this.cancelUploadBtn.addEventListener('click', () => {
            this.cancelUpload();
        });

        this.closePreviewBtn.addEventListener('click', () => {
            this.closePreview();
        });

        // Share modal events
        this.shareType.addEventListener('change', () => {
            this.updateShareOptions();
        });

        this.cancelShareBtn.addEventListener('click', () => {
            this.hideShareModal();
        });

        this.confirmShareBtn.addEventListener('click', () => {
            this.handleShareConfirm();
        });

        // Close modals when clicking outside
        this.uploadModal.addEventListener('click', (e) => {
            if (e.target === this.uploadModal) {
                this.cancelUpload();
            }
        });

        this.previewModal.addEventListener('click', (e) => {
            if (e.target === this.previewModal) {
                this.closePreview();
            }
        });
    }

    setupAuthListener() {
        // Subscribe to global auth state changes
        authManager.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                
                // Load user files
                await this.loadFiles();
                
                // Check for resource parameter in URL (for notifications)
                this.checkForResourceParameter();
            } else {
                this.showAuthAlert();
            }
        });
    }

    checkForResourceParameter() {
        const urlParams = new URLSearchParams(window.location.search);
        const resourceId = urlParams.get('resource');
        const fileId = urlParams.get('file'); // Legacy support
        
        const targetId = resourceId || fileId;
        if (targetId) {
            // Find and highlight the resource after a short delay to ensure everything is loaded
            setTimeout(() => {
                const fileElement = document.querySelector(`[data-file-id="${targetId}"]`);
                if (fileElement) {
                    fileElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight the file briefly
                    fileElement.style.backgroundColor = 'rgba(255, 214, 0, 0.2)';
                    fileElement.style.border = '2px solid #ffd600';
                    setTimeout(() => {
                        fileElement.style.backgroundColor = '';
                        fileElement.style.border = '';
                    }, 3000);
                }
                // Clean up the URL parameter
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            }, 1000);
        }
    }

    showAuthAlert() {
        alert('Please log in to access your resources.');
        window.location.href = 'login.html';
    }

    async loadFiles() {
        try {
            // Get user's groups first
            const { getDocs, query, where, collection } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
            const { db } = await import('/config/firebase-config.js');
            
            const groupsQuery = query(
                collection(db, 'groups'),
                where('members', 'array-contains', this.currentUser.uid)
            );
            
            const groupsSnapshot = await getDocs(groupsQuery);
            const userGroups = groupsSnapshot.docs.map(doc => doc.id);
            
            // Load files including shared ones
            this.files = await ResourcesService.getUserFilesWithShared(this.currentUser.uid, userGroups);
            this.filteredFiles = [...this.files];
            this.renderFiles();
        } catch (error) {
            console.error('Error loading files:', error);
            this.showError('Failed to load files');
        }
    }

    filterFiles(searchTerm) {
        this.filteredFiles = ResourcesService.searchFiles(this.files, searchTerm);
        this.renderFiles();
    }

    filterByType(filterType) {
        const currentUser = this.currentUser;
        if (!currentUser) return;

        switch (filterType) {
            case 'my-files':
                this.filteredFiles = this.files.filter(file => file.userId === currentUser.uid);
                break;
            case 'shared-with-me':
                this.filteredFiles = this.files.filter(file => 
                    file.userId !== currentUser.uid && (
                        file.isShared === true ||
                        (file.sharedWith && file.sharedWith.includes(currentUser.uid)) ||
                        (file.shareType === 'group' && file.groupId) // Would need to check user's groups
                    )
                );
                break;
            case 'shared-by-me':
                this.filteredFiles = this.files.filter(file => 
                    file.userId === currentUser.uid && file.isShared === true
                );
                break;
            case 'all':
            default:
                this.filteredFiles = [...this.files];
                break;
        }
        
        // Apply any existing search filter
        if (this.searchInput && this.searchInput.value.trim()) {
            this.filteredFiles = ResourcesService.searchFiles(this.filteredFiles, this.searchInput.value);
        }
        
        this.renderFiles();
    }

    renderFiles() {
        if (this.filteredFiles.length === 0) {
            this.renderEmptyState();
            return;
        }

        this.filesList.innerHTML = this.filteredFiles.map(file => {
            const category = ResourcesService.getFileTypeCategory(file.type);
            const extension = ResourcesService.getFileExtension(file.name);
            const size = ResourcesService.formatFileSize(file.size);
            const date = ResourcesService.formatDate(file.uploadedAt);

            return `
                <div class="file-item" data-file-id="${file.id}">
                    <div class="file-actions">
                        <button class="file-action-btn" onclick="resourcesManager.previewFile('${file.id}')" title="Preview">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                        </button>
                        <button class="file-action-btn" onclick="resourcesManager.showShareModal('${file.id}')" title="Share">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314a2.25 2.25 0 1 1 .434 2.44L7.217 13.747m0-2.186 9.566 5.314m-9.566-5.314L7.217 13.747M10.5 12a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                            </svg>
                        </button>
                        <button class="file-action-btn" onclick="resourcesManager.downloadFile('${file.id}')" title="Download">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                        </button>
                        <button class="file-action-btn" onclick="resourcesManager.deleteFile('${file.id}', '${file.storagePath}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                    </div>
                    <div class="file-item-header">
                        <div class="file-icon ${category}">
                            ${extension}
                        </div>
                        <div class="file-name" title="${file.name}">
                            ${file.name}
                        </div>
                    </div>
                    <div class="file-info">
                        <span class="file-size">${size}</span>
                        <span class="file-date">${date}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderEmptyState() {
        this.filesList.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026C6.154 9.75 8.25 11.846 8.25 14.5c0 2.654-2.096 4.75-4.656 4.75-.117 0-.232-.009-.344-.026m4.656-4.75L8.25 14.5m-4.656 0c-.117-.017-.232-.026-.344-.026C.846 14.474 0 13.628 0 12.75S.846 11.026 2.094 11.026c.112 0 .227.009.344.026M12 7.5h1.5m-1.5 0a2.25 2.25 0 0 1 2.25 2.25V12m-2.25-4.5a2.25 2.25 0 0 0-2.25 2.25V12m0 0V9.75a2.25 2.25 0 0 1 2.25-2.25m0 0h7.5A2.25 2.25 0 0 1 21 9.75v.75M12 12v2.25a2.25 2.25 0 0 0 2.25 2.25M12 12l-8.25-8.25M12 12l8.25 8.25" />
                </svg>
                <h3>No files found</h3>
                <p>Upload some files to get started or try a different search term.</p>
            </div>
        `;
    }

    async handleFileSelection(files) {
        if (!files || files.length === 0) return;

        // Validate files
        const validFiles = [];
        for (const file of files) {
            try {
                ResourcesService.validateFile(file);
                validFiles.push(file);
            } catch (error) {
                this.showError(`${file.name}: ${error.message}`);
            }
        }

        if (validFiles.length === 0) return;

        try {
            // First upload the files and get their IDs
            const uploadedFileIds = await this.uploadFiles(validFiles);
            
            if (uploadedFileIds && uploadedFileIds.length > 0) {
                // Store the file IDs for sharing
                this.selectedFiles = uploadedFileIds;
                
                // Show sharing options modal
                this.showShareModal();
            }
        } catch (error) {
            console.error('Error uploading files:', error);
            // Don't show share modal if upload failed
        }
    }

    async uploadFiles(files) {
        if (this.isUploading) return [];

        this.isUploading = true;
        this.uploadQueue = [...files];
        this.showUploadModal();

        const uploadedFileIds = [];

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileId = await this.uploadSingleFile(file, i);
                if (fileId) {
                    uploadedFileIds.push(fileId);
                }
            }

            // Reload files list
            await this.loadFiles();
            this.hideUploadModal();
            this.showSuccess(`Successfully uploaded ${files.length} file(s)`);
            
            return uploadedFileIds;
        } catch (error) {
            console.error('Upload error:', error);
            this.showError('Upload failed: ' + error.message);
            throw error;
        } finally {
            this.isUploading = false;
        }
    }

    async uploadSingleFile(file, index) {
        const progressId = `progress-${index}`;
        
        // Add progress item to modal
        const progressItem = document.createElement('div');
        progressItem.className = 'progress-item';
        progressItem.id = progressId;
        progressItem.innerHTML = `
            <div class="progress-info">
                <div class="progress-name">${file.name}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <div class="progress-status">Preparing...</div>
            </div>
        `;
        this.uploadProgress.appendChild(progressItem);

        const progressBar = progressItem.querySelector('.progress-fill');
        const progressStatus = progressItem.querySelector('.progress-status');

        try {
            const result = await ResourcesService.uploadFile(
                file,
                this.currentUser.uid,
                (progress) => {
                    progressBar.style.width = `${progress}%`;
                    progressStatus.textContent = `${progress}%`;
                }
            );

            progressStatus.textContent = 'Complete';
            progressBar.style.width = '100%';
            
            return result.id; // Return the file ID
        } catch (error) {
            progressStatus.textContent = 'Failed';
            progressBar.style.background = '#f44336';
            throw error;
        }
    }

    showUploadModal() {
        this.uploadProgress.innerHTML = '';
        this.uploadModal.style.display = 'flex';
    }

    hideUploadModal() {
        this.uploadModal.style.display = 'none';
        this.uploadProgress.innerHTML = '';
    }

    cancelUpload() {
        // Note: In a real implementation, you'd cancel ongoing uploads here
        this.isUploading = false;
        this.hideUploadModal();
    }

    async previewFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        if (!ResourcesService.canPreview(file.type)) {
            this.showError('This file type cannot be previewed');
            return;
        }

        this.previewContainer.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
        this.previewModal.style.display = 'flex';

        try {
            let previewHTML = '';

            if (file.type.startsWith('image/')) {
                previewHTML = `<img src="${file.downloadURL}" alt="${file.name}" />`;
            } else if (file.type.startsWith('video/')) {
                previewHTML = `<video controls src="${file.downloadURL}">Your browser does not support video playback.</video>`;
            } else if (file.type.startsWith('audio/')) {
                previewHTML = `<audio controls src="${file.downloadURL}">Your browser does not support audio playback.</audio>`;
            } else if (file.type === 'application/pdf') {
                previewHTML = `<iframe src="${file.downloadURL}"></iframe>`;
            } else if (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('javascript')) {
                // Fetch text content for preview
                const response = await fetch(file.downloadURL);
                const text = await response.text();
                previewHTML = `<pre>${this.escapeHtml(text)}</pre>`;
            }

            this.previewContainer.innerHTML = previewHTML;
        } catch (error) {
            console.error('Preview error:', error);
            this.previewContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Failed to load preview</p>';
        }
    }

    closePreview() {
        this.previewModal.style.display = 'none';
        this.previewContainer.innerHTML = '';
    }

    downloadFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        const link = document.createElement('a');
        link.href = file.downloadURL;
        link.download = file.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async deleteFile(fileId, storagePath) {
        if (!confirm('Are you sure you want to delete this file?')) return;

        try {
            await ResourcesService.deleteFile(fileId, storagePath);
            await this.loadFiles();
            this.showSuccess('File deleted successfully');
        } catch (error) {
            console.error('Delete error:', error);
            this.showError('Failed to delete file');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showSuccess(message) {
        // Simple success notification - you can replace with a better notification system
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
        // Simple error notification - you can replace with a better notification system
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

    // Sharing modal functions
    async showShareModal(fileId = null) {
        // Store the file ID if sharing a specific file
        this.shareFileId = fileId;
        
        await this.loadGroups();
        await this.loadUsers();
        this.shareModal.style.display = 'flex';
    }

    hideShareModal() {
        this.shareModal.style.display = 'none';
        this.selectedFiles = [];
        this.shareFileId = null;
        
        // Reset form
        this.shareType.value = 'group';
        this.shareDescription.value = '';
        this.updateShareOptions();
    }

    updateShareOptions() {
        const shareType = this.shareType.value;
        
        this.groupSelection.style.display = shareType === 'group' ? 'block' : 'none';
        this.userSelection.style.display = shareType === 'specific' ? 'block' : 'none';
    }

    async loadGroups() {
        try {
            // Load user's groups
            const { getDocs, query, where, collection } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
            const { db } = await import('/config/firebase-config.js');
            
            const groupsQuery = query(
                collection(db, 'groups'),
                where('members', 'array-contains', this.currentUser.uid)
            );
            
            const groupsSnapshot = await getDocs(groupsQuery);
            
            this.groupSelect.innerHTML = '<option value="">Select a group...</option>';
            groupsSnapshot.forEach(doc => {
                const group = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = group.name;
                this.groupSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    }

    async loadUsers() {
        try {
            const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
            const { db } = await import('/config/firebase-config.js');
            
            // Create a search-based interface for users
            this.userSelection.innerHTML = `
                <label for="userSelect">Search Users:</label>
                <div class="user-search-container">
                    <input type="text" id="userSearchInput" class="user-search-input" placeholder="Type at least 2 characters to search users..." />
                    <div id="userSearchResults" class="user-search-results" style="display: none;"></div>
                    <div id="selectedUsersList" class="selected-users-list"></div>
                </div>
            `;
            
            const userSearchInput = document.getElementById('userSearchInput');
            const userSearchResults = document.getElementById('userSearchResults');
            const selectedUsersList = document.getElementById('selectedUsersList');
            let selectedUsers = new Set();
            let allUsers = [];
            
            // Load all users once
            const usersSnapshot = await getDocs(collection(db, 'users'));
            usersSnapshot.forEach(doc => {
                const user = doc.data();
                if (doc.id !== this.currentUser.uid) {
                    allUsers.push({
                        id: doc.id,
                        name: user.displayName || user.email,
                        email: user.email
                    });
                }
            });
            
            // Search functionality
            userSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.trim();
                
                if (searchTerm.length < 2) {
                    userSearchResults.style.display = 'none';
                    return;
                }
                
                const filteredUsers = allUsers.filter(user => 
                    !selectedUsers.has(user.id) && (
                        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        user.email.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                );
                
                if (filteredUsers.length === 0) {
                    userSearchResults.innerHTML = '<div class="no-results">No users found</div>';
                } else {
                    userSearchResults.innerHTML = filteredUsers.map(user => `
                        <div class="user-search-result" data-user-id="${user.id}">
                            <span class="user-name">${user.name}</span>
                            <span class="user-email">${user.email}</span>
                        </div>
                    `).join('');
                }
                
                userSearchResults.style.display = 'block';
            });
            
            // Handle user selection
            userSearchResults.addEventListener('click', (e) => {
                const userResult = e.target.closest('.user-search-result');
                if (userResult) {
                    const userId = userResult.dataset.userId;
                    const user = allUsers.find(u => u.id === userId);
                    
                    selectedUsers.add(userId);
                    
                    const selectedUserEl = document.createElement('div');
                    selectedUserEl.className = 'selected-user';
                    selectedUserEl.innerHTML = `
                        <span>${user.name}</span>
                        <button type="button" class="remove-user-btn" data-user-id="${userId}">×</button>
                    `;
                    selectedUsersList.appendChild(selectedUserEl);
                    
                    userSearchInput.value = '';
                    userSearchResults.style.display = 'none';
                }
            });
            
            // Handle user removal
            selectedUsersList.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-user-btn')) {
                    const userId = e.target.dataset.userId;
                    selectedUsers.delete(userId);
                    e.target.closest('.selected-user').remove();
                }
            });
            
            // Hide results when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.user-search-container')) {
                    userSearchResults.style.display = 'none';
                }
            });
            
            // Store reference for later access
            this.getSelectedUsers = () => Array.from(selectedUsers);
            
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    async handleShareConfirm() {
        try {
            const shareType = this.shareType.value;
            const description = this.shareDescription.value;
            
            let shareData = {
                type: shareType,
                description: description
            };

            if (shareType === 'group') {
                const selectedGroup = this.groupSelect.value;
                if (!selectedGroup) {
                    this.showError('Please select a group');
                    return;
                }
                shareData.groupId = selectedGroup;
            } else if (shareType === 'specific') {
                const selectedUsers = this.getSelectedUsers ? this.getSelectedUsers() : [];
                
                if (selectedUsers.length === 0) {
                    this.showError('Please select at least one user');
                    return;
                }
                shareData.userIds = selectedUsers;
            }

            // Determine which files to share
            let filesToShare = [];
            if (this.shareFileId) {
                // Sharing a specific file
                filesToShare = [this.shareFileId];
            } else if (this.selectedFiles && this.selectedFiles.length > 0) {
                // Sharing selected files
                filesToShare = this.selectedFiles;
            } else {
                this.showError('No files selected for sharing');
                return;
            }

            // Share the files
            for (const fileId of filesToShare) {
                await ResourcesService.shareFile(fileId, shareData, this.currentUser.uid);
            }

            this.showSuccess(`Successfully shared ${filesToShare.length} file(s)`);
            this.hideShareModal();
            
            // Reload files to show updated sharing status
            await this.loadFiles();
        } catch (error) {
            console.error('Error sharing files:', error);
            this.showError('Failed to share files: ' + error.message);
        }
    }

    async uploadFilesWithSharing(files, shareData) {
        if (this.isUploading) return;

        this.isUploading = true;
        this.uploadQueue = [...files];
        this.showUploadModal();

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                await this.uploadSingleFileWithSharing(file, i, shareData);
            }

            // Reload files list
            await this.loadFiles();
            this.hideUploadModal();
            this.showSuccess(`Successfully uploaded and shared ${files.length} file(s)`);
        } catch (error) {
            console.error('Upload error:', error);
            this.showError('Upload failed: ' + error.message);
        } finally {
            this.isUploading = false;
        }
    }

    async uploadSingleFileWithSharing(file, index, shareData) {
        const progressId = `progress-${index}`;
        
        // Add progress item to modal
        const progressItem = document.createElement('div');
        progressItem.className = 'progress-item';
        progressItem.id = progressId;
        progressItem.innerHTML = `
            <div class="progress-info">
                <div class="progress-name">${file.name}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <div class="progress-status">Preparing...</div>
            </div>
        `;
        this.uploadProgress.appendChild(progressItem);

        const progressBar = progressItem.querySelector('.progress-fill');
        const progressStatus = progressItem.querySelector('.progress-status');

        try {
            await ResourcesService.uploadFileWithSharing(
                file,
                this.currentUser.uid,
                shareData,
                (progress) => {
                    progressBar.style.width = `${progress}%`;
                    progressStatus.textContent = `${Math.round(progress)}%`;
                }
            );

            progressStatus.textContent = 'Complete';
            progressItem.classList.add('complete');
        } catch (error) {
            console.error(`Upload failed for ${file.name}:`, error);
            progressStatus.textContent = 'Failed';
            progressItem.classList.add('error');
            throw error;
        }
    }
}

// Initialize the resources manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const resourcesManager = new ResourcesManager();
    
    // Make it globally available for inline event handlers
    window.resourcesManager = resourcesManager;
});
