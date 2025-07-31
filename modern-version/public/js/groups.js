import GroupsService from '/services/groups-service.js';
import authManager from '/utils/auth-manager.js';

class GroupsManager {
    constructor() {
        this.currentUser = null;
        this.myGroups = [];
        this.availableGroups = [];
        this.filteredMyGroups = [];
        this.filteredAvailableGroups = [];
        this.currentTab = 'my-groups';
        this.editingGroupId = null;
        
        this.initializeElements();
        this.bindEvents();
        this.checkAuthentication();
    }

    initializeElements() {
        // Tab elements
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');
        
        // Search elements
        this.myGroupsSearch = document.getElementById('myGroupsSearch');
        this.availableGroupsSearch = document.getElementById('availableGroupsSearch');
        
        // List elements
        this.myGroupsList = document.getElementById('myGroupsList');
        this.availableGroupsList = document.getElementById('availableGroupsList');
        
        // Button elements
        this.createGroupBtn = document.getElementById('createGroupBtn');
        this.joinByCodeBtn = document.getElementById('joinByCodeBtn');

        // Modal elements
        this.createGroupModal = document.getElementById('createGroupModal');
        this.createGroupForm = document.getElementById('createGroupForm');
        this.cancelCreateGroupBtn = document.getElementById('cancelCreateGroup');

        this.joinByCodeModal = document.getElementById('joinByCodeModal');
        this.joinByCodeForm = document.getElementById('joinByCodeForm');
        this.cancelJoinByCodeBtn = document.getElementById('cancelJoinByCode');
        
        this.groupDetailsModal = document.getElementById('groupDetailsModal');
        this.groupDetailsContainer = document.getElementById('groupDetailsContainer');
        this.closeGroupDetailsBtn = document.getElementById('closeGroupDetails');
        
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmTitle = document.getElementById('confirmTitle');
        this.confirmMessage = document.getElementById('confirmMessage');
        this.confirmCancelBtn = document.getElementById('confirmCancel');
        this.confirmActionBtn = document.getElementById('confirmAction');
        
        // Member management elements
        this.memberManagementGroup = document.getElementById('memberManagementGroup');
        this.memberSelectionRadios = document.querySelectorAll('input[name="memberSelectionType"]');
        this.individualUserSelection = document.getElementById('individualUserSelection');
        this.groupMemberSelection = document.getElementById('groupMemberSelection');
        this.userSelector = document.getElementById('userSelector');
        this.groupSelector = document.getElementById('groupSelector');
        this.currentMembersList = document.getElementById('currentMembersList');
        this.coOwnerSelector = document.getElementById('coOwnerSelector');
        this.currentCoOwners = document.getElementById('currentCoOwners');
        
        // Initialize member selection toggle
        this.initializeMemberSelectionToggle();
    }

    bindEvents() {
        // Tab switching
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.switchTab(button.dataset.tab);
            });
        });

        // Search functionality
        this.myGroupsSearch.addEventListener('input', (e) => {
            this.filterMyGroups(e.target.value);
        });

        this.availableGroupsSearch.addEventListener('input', (e) => {
            this.filterAvailableGroups(e.target.value);
        });

        // Create group button
        this.createGroupBtn.addEventListener('click', () => {
            this.showCreateGroupModal();
        });

        // Join by code button
        this.joinByCodeBtn.addEventListener('click', () => {
            this.showJoinByCodeModal();
        });

        // Create group form
        this.createGroupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateGroup();
        });

        this.cancelCreateGroupBtn.addEventListener('click', () => {
            this.hideCreateGroupModal();
        });

        // Join by code form
        this.joinByCodeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleJoinByCode();
        });

        this.cancelJoinByCodeBtn.addEventListener('click', () => {
            this.hideJoinByCodeModal();
        });

        // Group details modal
        this.closeGroupDetailsBtn.addEventListener('click', () => {
            this.hideGroupDetailsModal();
        });

        // Confirm modal
        this.confirmCancelBtn.addEventListener('click', () => {
            this.hideConfirmModal();
        });
        
        // Member selection toggle
        this.initializeMemberSelectionToggle();

        // Close modals when clicking outside
        this.createGroupModal.addEventListener('click', (e) => {
            if (e.target === this.createGroupModal) {
                this.hideCreateGroupModal();
            }
        });

        this.joinByCodeModal.addEventListener('click', (e) => {
            if (e.target === this.joinByCodeModal) {
                this.hideJoinByCodeModal();
            }
        });

        this.groupDetailsModal.addEventListener('click', (e) => {
            if (e.target === this.groupDetailsModal) {
                this.hideGroupDetailsModal();
            }
        });

        this.confirmModal.addEventListener('click', (e) => {
            if (e.target === this.confirmModal) {
                this.hideConfirmModal();
            }
        });
    }

    async checkAuthentication() {
        // Subscribe to global auth state changes
        authManager.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                
                // Load groups
                await this.loadGroups();
                
                // Check for group parameter in URL (for notifications)
                this.checkForGroupParameter();
            } else {
                this.showAuthAlert();
            }
        });
    }

    checkForGroupParameter() {
        const urlParams = new URLSearchParams(window.location.search);
        const groupId = urlParams.get('group');
        
        if (groupId) {
            // Show the group details modal after a short delay to ensure everything is loaded
            setTimeout(() => {
                this.showGroupDetails(groupId);
                // Clean up the URL parameter
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            }, 500);
        }
    }

    showAuthAlert() {
        alert('Please log in to access groups.');
        window.location.href = 'login.html';
    }
    
    initializeMemberSelectionToggle() {
        this.memberSelectionRadios?.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'individual') {
                    this.individualUserSelection.style.display = 'block';
                    this.groupMemberSelection.style.display = 'none';
                } else {
                    this.individualUserSelection.style.display = 'none';
                    this.groupMemberSelection.style.display = 'block';
                }
            });
        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        this.tabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabName);
        });
        
        // Update tab content
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
    }

    async loadGroups() {
        try {
            // Load both my groups and available groups
            const [myGroups, availableGroups] = await Promise.all([
                GroupsService.getUserGroups(this.currentUser.uid),
                GroupsService.getAvailableGroups(this.currentUser.uid)
            ]);

            this.myGroups = myGroups;
            this.availableGroups = availableGroups;
            this.filteredMyGroups = [...myGroups];
            this.filteredAvailableGroups = [...availableGroups];

            this.renderMyGroups();
            this.renderAvailableGroups();
        } catch (error) {
            console.error('Error loading groups:', error);
            this.showError('Failed to load groups');
        }
    }

    filterMyGroups(searchTerm) {
        this.filteredMyGroups = GroupsService.searchGroups(this.myGroups, searchTerm);
        this.renderMyGroups();
    }

    filterAvailableGroups(searchTerm) {
        this.filteredAvailableGroups = GroupsService.searchGroups(this.availableGroups, searchTerm);
        this.renderAvailableGroups();
    }

    renderMyGroups() {
        if (this.filteredMyGroups.length === 0) {
            this.renderEmptyState(this.myGroupsList, 'No groups found', 'Create a group or join an existing one to get started.');
            return;
        }

        this.myGroupsList.innerHTML = this.filteredMyGroups.map(group => {
            const role = GroupsService.getUserRole(group, this.currentUser.uid);
            const memberCount = GroupsService.getMemberCountText(group.members.length, group.maxMembers);
            const createdDate = GroupsService.formatDate(group.createdAt);

            return `
                <div class="group-card" onclick="groupsManager.showGroupDetails('${group.id}')">
                    <div class="group-role ${role}">${role}</div>
                    <div class="group-header">
                        <div>
                            <h3 class="group-name">${group.name}</h3>
                        </div>
                        <div class="group-type ${group.type}">${group.type}</div>
                    </div>
                    <p class="group-description">${group.description || 'No description provided.'}</p>
                    ${(role === 'owner' || role === 'admin') && group.joinCode ? `
                        <div class="join-code-section">
                            <div class="join-code-display">
                                <div class="join-code">${group.joinCode}</div>
                                <button class="copy-btn" onclick="event.stopPropagation(); groupsManager.copyJoinCode('${group.joinCode}')">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                                    </svg>
                                    Copy
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    <div class="group-meta">
                        <div class="group-members">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                            </svg>
                            ${memberCount}
                        </div>
                        <div class="group-created">Created ${createdDate}</div>
                    </div>
                    <div class="group-actions" onclick="event.stopPropagation()">
                        ${role === 'owner' ? `
                            <button class="group-action-btn" onclick="groupsManager.editGroup('${group.id}')">Edit</button>
                            <button class="group-action-btn danger" onclick="groupsManager.confirmDeleteGroup('${group.id}')">Delete</button>
                        ` : `
                            <button class="group-action-btn" onclick="groupsManager.confirmLeaveGroup('${group.id}')">Leave</button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderAvailableGroups() {
        if (this.filteredAvailableGroups.length === 0) {
            this.renderEmptyState(this.availableGroupsList, 'No available groups', 'All public groups are either full or you\'re already a member.');
            return;
        }

        this.availableGroupsList.innerHTML = this.filteredAvailableGroups.map(group => {
            const memberCount = GroupsService.getMemberCountText(group.members.length, group.maxMembers);
            const createdDate = GroupsService.formatDate(group.createdAt);
            const isFull = group.maxMembers && group.members.length >= group.maxMembers;

            return `
                <div class="group-card" onclick="groupsManager.showGroupDetails('${group.id}')">
                    <div class="group-header">
                        <div>
                            <h3 class="group-name">${group.name}</h3>
                        </div>
                        <div class="group-type ${group.type}">${group.type}</div>
                    </div>
                    <p class="group-description">${group.description || 'No description provided.'}</p>
                    <div class="group-meta">
                        <div class="group-members">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                            </svg>
                            ${memberCount}
                        </div>
                        <div class="group-created">Created ${createdDate}</div>
                    </div>
                    <div class="group-actions" onclick="event.stopPropagation()">
                        <button class="group-action-btn primary" 
                                ${isFull ? 'disabled' : ''} 
                                onclick="groupsManager.joinGroup('${group.id}')">
                            ${isFull ? 'Full' : 'Join'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderEmptyState(container, title, message) {
        container.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
                <h3>${title}</h3>
                <p>${message}</p>
            </div>
        `;
    }

    showCreateGroupModal() {
        this.createGroupForm.reset();
        this.createGroupModal.style.display = 'flex';
    }

    hideCreateGroupModal() {
        this.createGroupModal.style.display = 'none';
        
        // Reset form
        this.createGroupForm.reset();
        
        // Hide member management section
        this.memberManagementGroup.style.display = 'none';
        
        // Clear member management selections
        this.userSelector.innerHTML = '';
        this.groupSelector.innerHTML = '';
        this.currentMembersList.innerHTML = '';
        this.currentCoOwners.innerHTML = '';
        this.coOwnerSelector.innerHTML = '<option value="">Select a co-owner (optional)</option>';
        
        // Reset member selection type
        const individualRadio = document.querySelector('input[name="memberSelectionType"][value="individual"]');
        if (individualRadio) individualRadio.checked = true;
        this.individualUserSelection.style.display = 'block';
        this.groupMemberSelection.style.display = 'none';
        
        // Reset modal title and button text for next use
        this.createGroupModal.querySelector('h2').textContent = 'Create New Group';
        const submitBtn = this.createGroupForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Create Group';
        
        // Clear editing state
        this.editingGroupId = null;
    }

    showJoinByCodeModal() {
        this.joinByCodeForm.reset();
        this.joinByCodeModal.style.display = 'flex';
    }

    hideJoinByCodeModal() {
        this.joinByCodeModal.style.display = 'none';
    }

    async handleCreateGroup() {
        try {
            const formData = new FormData(this.createGroupForm);
            const groupData = {
                name: formData.get('groupName').trim(),
                description: formData.get('groupDescription').trim(),
                type: formData.get('groupType'),
                maxMembers: formData.get('maxMembers') ? parseInt(formData.get('maxMembers')) : null
            };

            // Validate group data
            GroupsService.validateGroupData(groupData);

            if (this.editingGroupId) {
                // Update existing group
                await GroupsService.updateGroup(this.editingGroupId, groupData, this.currentUser.uid);
                
                // Handle member additions during edit
                await this.handleMemberAdditions();
                
                // Handle co-owner selection
                await this.handleCoOwnerSelection();
                
                this.showSuccess('Group updated successfully');
            } else {
                // Create new group
                await GroupsService.createGroup(groupData, this.currentUser.uid);
                this.showSuccess('Group created successfully');
            }

            this.hideCreateGroupModal();
            
            // Reload groups
            await this.loadGroups();
        } catch (error) {
            console.error('Error saving group:', error);
            this.showError(error.message);
        }
    }
    
    async handleMemberAdditions() {
        try {
            const selectedType = document.querySelector('input[name="memberSelectionType"]:checked').value;
            
            if (selectedType === 'individual') {
                // Add selected individual users
                const selectedUsers = Array.from(this.userSelector.selectedOptions).map(option => option.value);
                if (selectedUsers.length > 0) {
                    await GroupsService.addMembersToGroup(this.editingGroupId, selectedUsers);
                }
            } else if (selectedType === 'group') {
                // Add members from selected groups
                const selectedGroups = Array.from(this.groupSelector.selectedOptions).map(option => option.value);
                for (const groupId of selectedGroups) {
                    const group = await GroupsService.getGroupDetails(groupId);
                    await GroupsService.addMembersToGroup(this.editingGroupId, group.members);
                }
            }
        } catch (error) {
            console.error('Error adding members:', error);
            throw error;
        }
    }
    
    async handleCoOwnerSelection() {
        try {
            const selectedCoOwner = this.coOwnerSelector.value;
            if (selectedCoOwner) {
                // Get group and user details for notification
                const group = await GroupsService.getGroupDetails(this.editingGroupId);
                const coOwnerUser = await GroupsService.getUserById(selectedCoOwner);
                const currentUserDoc = await GroupsService.getUserById(this.currentUser.uid);
                
                // Send notification instead of directly adding co-owner
                const NotificationService = (await import('/services/notification-service.js')).default;
                await NotificationService.createCoOwnerInvite(
                    this.editingGroupId,
                    group.name,
                    this.currentUser.uid,
                    currentUserDoc.displayName || currentUserDoc.email,
                    selectedCoOwner
                );
                
                this.showSuccess(`Co-owner invitation sent to ${coOwnerUser.displayName || coOwnerUser.email}`);
            }
        } catch (error) {
            console.error('Error sending co-owner invitation:', error);
            throw error;
        }
    }

    async handleJoinByCode() {
        try {
            const formData = new FormData(this.joinByCodeForm);
            const joinCode = formData.get('joinCode').trim().toUpperCase();

            if (!joinCode || joinCode.length !== 6) {
                this.showError('Please enter a valid 6-character join code');
                return;
            }

            // Join the group by code
            const result = await GroupsService.joinGroupByCode(joinCode, this.currentUser.uid);

            this.hideJoinByCodeModal();
            this.showSuccess(`Successfully joined "${result.groupName}"`);
            
            // Reload groups
            await this.loadGroups();
        } catch (error) {
            console.error('Error joining group by code:', error);
            this.showError(error.message);
        }
    }

    async joinGroup(groupId) {
        try {
            await GroupsService.joinGroup(groupId, this.currentUser.uid);
            this.showSuccess('Successfully joined the group');
            
            // Reload groups
            await this.loadGroups();
        } catch (error) {
            console.error('Error joining group:', error);
            this.showError(error.message);
        }
    }

    confirmLeaveGroup(groupId) {
        const group = this.myGroups.find(g => g.id === groupId);
        if (!group) return;

        this.showConfirmModal(
            'Leave Group',
            `Are you sure you want to leave "${group.name}"?`,
            () => this.leaveGroup(groupId)
        );
    }

    async leaveGroup(groupId) {
        try {
            await GroupsService.leaveGroup(groupId, this.currentUser.uid);
            this.showSuccess('Successfully left the group');
            
            // Reload groups
            await this.loadGroups();
        } catch (error) {
            console.error('Error leaving group:', error);
            this.showError(error.message);
        }
    }

    confirmDeleteGroup(groupId) {
        const group = this.myGroups.find(g => g.id === groupId);
        if (!group) return;

        this.showConfirmModal(
            'Delete Group',
            `Are you sure you want to delete "${group.name}"? This action cannot be undone.`,
            () => this.deleteGroup(groupId)
        );
    }

    async deleteGroup(groupId) {
        try {
            await GroupsService.deleteGroup(groupId, this.currentUser.uid);
            this.showSuccess('Group deleted successfully');
            
            // Reload groups
            await this.loadGroups();
        } catch (error) {
            console.error('Error deleting group:', error);
            this.showError(error.message);
        }
    }

    async editGroup(groupId) {
        try {
            const group = await GroupsService.getGroupDetails(groupId);
            
            // Check if user is owner or co-owner
            const isOwner = group.ownerId === this.currentUser.uid;
            const isCoOwner = group.coOwners && group.coOwners.includes(this.currentUser.uid);
            
            if (!isOwner && !isCoOwner) {
                this.showError('Only the group owner or co-owners can edit the group');
                return;
            }

            // Populate the form with current values
            document.getElementById('groupName').value = group.name;
            document.getElementById('groupDescription').value = group.description || '';
            document.getElementById('groupType').value = group.type;
            document.getElementById('maxMembers').value = group.maxMembers || '';

            // Show member management section
            this.memberManagementGroup.style.display = 'block';
            
            // Load users and groups for selection
            await this.loadUsersAndGroupsForMemberManagement();
            
            // Display current members
            await this.displayCurrentMembers(group);
            
            // Display current co-owners
            this.displayCurrentCoOwners(group);
            
            // Populate co-owner selector with current members
            this.populateCoOwnerSelector(group);

            // Change modal title and button text
            this.createGroupModal.querySelector('h2').textContent = 'Edit Group';
            const submitBtn = this.createGroupForm.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Update Group';

            // Store the group ID for updating
            this.editingGroupId = groupId;

            // Show the modal
            this.createGroupModal.style.display = 'flex';
        } catch (error) {
            console.error('Error loading group for editing:', error);
            this.showError('Failed to load group details');
        }
    }

    async showGroupDetails(groupId) {
        try {
            const group = await GroupsService.getGroupDetails(groupId);
            const userRole = GroupsService.getUserRole(group, this.currentUser.uid);
            
            this.groupDetailsContainer.innerHTML = `
                <div class="group-details-header">
                    <div>
                        <h2 class="group-details-title">${group.name}</h2>
                        <div class="group-details-meta">
                            <span class="group-type ${group.type}">${group.type}</span>
                            ${userRole ? `<span class="group-role ${userRole}">${userRole}</span>` : ''}
                            <span>${GroupsService.getMemberCountText(group.members.length, group.maxMembers)}</span>
                            <span>Created ${GroupsService.formatDate(group.createdAt)}</span>
                        </div>
                    </div>
                </div>
                <div class="group-details-description">
                    ${group.description || 'No description provided.'}
                </div>
                ${(userRole === 'owner' || userRole === 'admin') && group.joinCode ? `
                    <div class="join-code-section">
                        <h3 class="section-title">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1.25rem; height: 1.25rem;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" />
                            </svg>
                            Join Code
                        </h3>
                        <div class="join-code-display">
                            <div class="join-code">${group.joinCode}</div>
                            <button class="copy-btn" onclick="groupsManager.copyJoinCode('${group.joinCode}')">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                                </svg>
                                Copy
                            </button>
                        </div>
                    </div>
                ` : ''}
                <div class="group-members-section">
                    <h3 class="section-title">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1.25rem; height: 1.25rem;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                        </svg>
                        Members (${group.members.length})
                    </h3>
                    <div class="member-list">
                        ${group.members.map(memberId => {
                            const memberRole = GroupsService.getUserRole(group, memberId);
                            const isCurrentUser = memberId === this.currentUser.uid;
                            // Co-owners and owners can manage admins and members, admins can only manage members
                            const canManage = (userRole === 'owner' || userRole === 'co-owner') || 
                                            (userRole === 'admin' && memberRole === 'member');
                            
                            return `
                                <div class="member-item">
                                    <div class="member-info">
                                        <div class="member-avatar">${memberId.charAt(0).toUpperCase()}</div>
                                        <div class="member-details">
                                            <div class="member-name">${isCurrentUser ? 'You' : memberId}</div>
                                            <div class="member-role-text ${memberRole}">${memberRole}</div>
                                        </div>
                                    </div>
                                    ${canManage && !isCurrentUser ? `
                                        <div class="member-actions">
                                            ${memberRole === 'member' && (userRole === 'owner' || userRole === 'co-owner') ? `
                                                <button class="member-action-btn" onclick="groupsManager.promoteToAdmin('${groupId}', '${memberId}')">
                                                    Make Admin
                                                </button>
                                            ` : ''}
                                            ${memberRole === 'admin' && (userRole === 'owner' || userRole === 'co-owner') ? `
                                                <button class="member-action-btn" onclick="groupsManager.removeAdmin('${groupId}', '${memberId}')">
                                                    Remove Admin
                                                </button>
                                            ` : ''}
                                            <button class="member-action-btn danger" onclick="groupsManager.confirmRemoveMember('${groupId}', '${memberId}')">
                                                Remove
                                            </button>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${(userRole === 'owner' || userRole === 'co-owner' || userRole === 'admin') ? `
                        <div class="add-member-section">
                            <h4 class="section-title">Add New Members</h4>
                            <div class="user-search-container">
                                <input type="text" id="memberSearch" placeholder="Search users by name or email..." class="search-input">
                                <div id="userSearchResults" class="search-results" style="display: none;"></div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            
            this.groupDetailsModal.style.display = 'flex';
            
            // Initialize member search functionality if the section exists
            const memberSearch = document.getElementById('memberSearch');
            if (memberSearch) {
                this.initializeMemberSearch(groupId);
            }
        } catch (error) {
            console.error('Error loading group details:', error);
            this.showError('Failed to load group details');
        }
    }

    async initializeMemberSearch(groupId) {
        const memberSearch = document.getElementById('memberSearch');
        const searchResults = document.getElementById('userSearchResults');
        let allUsers = [];
        
        try {
            // Load all users
            allUsers = await GroupsService.getAllUsers();
        } catch (error) {
            console.error('Error loading users:', error);
            allUsers = []; // Fallback to empty array
        }
        
        memberSearch.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                searchResults.style.display = 'none';
                return;
            }
            
            const filteredUsers = allUsers.filter(user => {
                const matchesQuery = user.name?.toLowerCase().includes(query.toLowerCase()) ||
                                   user.email?.toLowerCase().includes(query.toLowerCase());
                return matchesQuery && user.id !== this.currentUser.uid;
            });
            
            this.displayUserSearchResults(filteredUsers, groupId, searchResults);
        });
        
        // Hide results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-search-container')) {
                searchResults.style.display = 'none';
            }
        });
    }
    
    displayUserSearchResults(users, groupId, resultsContainer) {
        if (users.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No users found</div>';
        } else {
            resultsContainer.innerHTML = users.map(user => `
                <div class="user-search-result" onclick="groupsManager.addMemberToGroup('${groupId}', '${user.id}', '${user.name || user.email}')">
                    <div class="user-result-info">
                        <div class="user-result-name">${user.name || user.email}</div>
                        <div class="user-result-email">${user.email}</div>
                    </div>
                    <button class="add-member-btn">Add</button>
                </div>
            `).join('');
        }
        resultsContainer.style.display = 'block';
    }
    
    async addMemberToGroup(groupId, userId, userName) {
        try {
            await GroupsService.addMemberToGroup(groupId, userId, this.currentUser.uid);
            this.showSuccess(`${userName} has been added to the group`);
            
            // Hide search results and clear input
            const memberSearch = document.getElementById('memberSearch');
            const searchResults = document.getElementById('userSearchResults');
            if (memberSearch) memberSearch.value = '';
            if (searchResults) searchResults.style.display = 'none';
            
            // Refresh group details
            await this.showGroupDetails(groupId);
            await this.loadGroups();
        } catch (error) {
            console.error('Error adding member:', error);
            this.showError('Failed to add member to group');
        }
    }
    
    confirmRemoveMember(groupId, memberId) {
        this.showConfirmModal(
            'Remove Member',
            'Are you sure you want to remove this member from the group?',
            () => this.removeMemberFromGroup(groupId, memberId)
        );
    }
    
    async removeMemberFromGroup(groupId, memberId) {
        try {
            await GroupsService.removeMember(groupId, memberId, this.currentUser.uid);
            this.showSuccess('Member removed from group');
            
            // Refresh group details
            await this.showGroupDetails(groupId);
            await this.loadGroups();
        } catch (error) {
            console.error('Error removing member:', error);
            this.showError('Failed to remove member from group');
        }
    }
    
    async promoteToAdmin(groupId, memberId) {
        try {
            await GroupsService.addAdmin(groupId, memberId, this.currentUser.uid);
            this.showSuccess('Member promoted to admin');
            
            // Refresh group details
            await this.showGroupDetails(groupId);
        } catch (error) {
            console.error('Error promoting member:', error);
            this.showError('Failed to promote member to admin');
        }
    }
    
    async removeAdmin(groupId, memberId) {
        try {
            await GroupsService.removeAdmin(groupId, memberId, this.currentUser.uid);
            this.showSuccess('Admin privileges removed');
            
            // Refresh group details
            await this.showGroupDetails(groupId);
        } catch (error) {
            console.error('Error removing admin privileges:', error);
            this.showError('Failed to remove admin privileges');
        }
    }

    hideGroupDetailsModal() {
        this.groupDetailsModal.style.display = 'none';
    }

    copyJoinCode(joinCode) {
        navigator.clipboard.writeText(joinCode).then(() => {
            this.showSuccess('Join code copied to clipboard!');
        }).catch(() => {
            this.showError('Failed to copy join code');
        });
    }

    showConfirmModal(title, message, onConfirm) {
        this.confirmTitle.textContent = title;
        this.confirmMessage.textContent = message;
        
        // Remove existing listeners
        const newConfirmBtn = this.confirmActionBtn.cloneNode(true);
        this.confirmActionBtn.parentNode.replaceChild(newConfirmBtn, this.confirmActionBtn);
        this.confirmActionBtn = newConfirmBtn;
        
        // Add new listener
        this.confirmActionBtn.addEventListener('click', () => {
            this.hideConfirmModal();
            onConfirm();
        });
        
        this.confirmModal.style.display = 'flex';
    }

    hideConfirmModal() {
        this.confirmModal.style.display = 'none';
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
    
    async loadUsersAndGroupsForMemberManagement() {
        try {
            // Load all users
            const usersQuery = await GroupsService.getAllUsers();
            this.userSelector.innerHTML = '';
            usersQuery.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.displayName || user.email} (${user.email})`;
                this.userSelector.appendChild(option);
            });
            
            // Load user's groups
            const userGroups = await GroupsService.getUserGroups(this.currentUser.uid);
            this.groupSelector.innerHTML = '';
            userGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = `${group.name} (${group.members.length} members)`;
                this.groupSelector.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading users and groups:', error);
        }
    }
    
    async displayCurrentMembers(group) {
        try {
            this.currentMembersList.innerHTML = '';
            
            for (const memberId of group.members) {
                const user = await GroupsService.getUserById(memberId);
                const isOwner = group.ownerId === memberId;
                const isCoOwner = group.coOwners && group.coOwners.includes(memberId);
                
                const memberItem = document.createElement('div');
                memberItem.className = 'member-item';
                memberItem.innerHTML = `
                    <div class="member-info">
                        <div class="member-avatar">${(user.displayName || user.email)[0].toUpperCase()}</div>
                        <span>${user.displayName || user.email}</span>
                        ${isOwner ? '<span class="co-owner-badge">Owner</span>' : ''}
                        ${isCoOwner ? '<span class="co-owner-badge">Co-Owner</span>' : ''}
                    </div>
                    ${!isOwner ? `<button class="remove-member-btn" onclick="groupsManager.removeMember('${group.id}', '${memberId}')">Remove</button>` : ''}
                `;
                this.currentMembersList.appendChild(memberItem);
            }
        } catch (error) {
            console.error('Error displaying members:', error);
        }
    }
    
    displayCurrentCoOwners(group) {
        this.currentCoOwners.innerHTML = '';
        
        if (group.coOwners && group.coOwners.length > 0) {
            group.coOwners.forEach(async (coOwnerId) => {
                try {
                    const user = await GroupsService.getUserById(coOwnerId);
                    const coOwnerItem = document.createElement('div');
                    coOwnerItem.className = 'member-item';
                    coOwnerItem.innerHTML = `
                        <div class="member-info">
                            <div class="member-avatar">${(user.displayName || user.email)[0].toUpperCase()}</div>
                            <span>${user.displayName || user.email}</span>
                            <span class="co-owner-badge">Co-Owner</span>
                        </div>
                        <button class="remove-member-btn" onclick="groupsManager.removeCoOwner('${group.id}', '${coOwnerId}')">Remove Co-Owner</button>
                    `;
                    this.currentCoOwners.appendChild(coOwnerItem);
                } catch (error) {
                    console.error('Error displaying co-owner:', error);
                }
            });
        }
    }
    
    async populateCoOwnerSelector(group) {
        this.coOwnerSelector.innerHTML = '<option value="">Select a co-owner (optional)</option>';
        
        for (const memberId of group.members) {
            if (memberId !== group.ownerId && (!group.coOwners || !group.coOwners.includes(memberId))) {
                try {
                    const user = await GroupsService.getUserById(memberId);
                    const option = document.createElement('option');
                    option.value = memberId;
                    option.textContent = user.displayName || user.email;
                    this.coOwnerSelector.appendChild(option);
                } catch (error) {
                    console.error('Error loading user for co-owner selector:', error);
                }
            }
        }
    }
    
    async removeMember(groupId, memberId) {
        try {
            await GroupsService.removeMemberFromGroup(groupId, memberId);
            this.showSuccess('Member removed successfully');
            
            // Refresh the group details
            const group = await GroupsService.getGroupDetails(groupId);
            await this.displayCurrentMembers(group);
            this.populateCoOwnerSelector(group);
        } catch (error) {
            console.error('Error removing member:', error);
            this.showError('Failed to remove member');
        }
    }
    
    async removeCoOwner(groupId, coOwnerId) {
        try {
            await GroupsService.removeCoOwner(groupId, coOwnerId);
            this.showSuccess('Co-owner removed successfully');
            
            // Refresh the group details
            const group = await GroupsService.getGroupDetails(groupId);
            this.displayCurrentCoOwners(group);
            this.populateCoOwnerSelector(group);
        } catch (error) {
            console.error('Error removing co-owner:', error);
            this.showError('Failed to remove co-owner');
        }
    }
}

// Initialize the groups manager
const groupsManager = new GroupsManager();

// Make it globally available for inline event handlers
window.groupsManager = groupsManager;
