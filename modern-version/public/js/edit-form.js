
import { auth, db } from '/config/firebase-config.js';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  Timestamp,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

let currentFormType = 'public';
let questions = [];
let formId = null;
let isInitialized = false;

// Get form ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
formId = urlParams.get('id');

if (!formId) {
  alert('No form ID provided');
  window.location.href = 'forms.html';
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (user && !isInitialized) {
      console.log('User authenticated:', user.email);
      isInitialized = true;
      await loadFormData();
      await loadGroups();
      initializePage();
    } else if (!user) {
      console.log('User not authenticated');
      showAuthAlert();
    }
  });
});

function initializePage() {
  // Set up event listeners
  initializeEventListeners();
  
  // Complete the form data loading and display
  completeFormDataLoad();
}

function initializeEventListeners() {
  // Initialize form submission
  const form = document.getElementById('editFormForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  // Initialize other components
  initializeFormTypeButtons();
  initializeQuestionTypeButtons();
  initializeCancelButton();
  initializeFormSubmission();
}

function displayQuestions() {
  const questionsContainer = document.getElementById('questionsContainer');
  if (questionsContainer) {
    questionsContainer.innerHTML = '';
    
    questions.forEach((questionData, index) => {
      addQuestionToDOM(questionData.type, questionData, index);
    });
  }
}

function updateFormTypeUI() {
  const groupSelector = document.getElementById('groupSelector');
  const groupSelect = document.getElementById('group');
  
  if (currentFormType === 'private') {
    const privateBtn = document.querySelector('.form-type-btn[data-type="private"]');
    if (privateBtn) {
      document.querySelectorAll('.form-type-btn').forEach(btn => btn.classList.remove('active'));
      privateBtn.classList.add('active');
    }
    if (groupSelector) {
      groupSelector.style.display = 'block';
    }
    if (groupSelect) {
      groupSelect.setAttribute('required', 'required');
    }
  } else {
    const publicBtn = document.querySelector('.form-type-btn[data-type="public"]');
    if (publicBtn) {
      document.querySelectorAll('.form-type-btn').forEach(btn => btn.classList.remove('active'));
      publicBtn.classList.add('active');
    }
    if (groupSelector) {
      groupSelector.style.display = 'none';
    }
    if (groupSelect) {
      groupSelect.removeAttribute('required');
      groupSelect.value = '';
    }
  }
}

async function loadFormData() {
  try {
    const formRef = doc(db, 'forms', formId);
    const formSnap = await getDoc(formRef);
    
    if (!formSnap.exists()) {
      alert('Form not found');
      window.location.href = 'forms.html';
      return;
    }

    const formData = formSnap.data();
    
    // Check if user owns this form
    if (formData.createdBy !== auth.currentUser.uid) {
      alert('You do not have permission to edit this form');
      window.location.href = 'forms.html';
      return;
    }

    console.log('Loading form data:', formData);

    // Populate form fields
    document.getElementById('formTitle').value = formData.title || '';
    document.getElementById('formDescription').value = formData.description || '';
    
    // Handle due date
    if (formData.dueDate) {
      let dueDateValue;
      if (typeof formData.dueDate.toDate === 'function') {
        // It's a Firestore Timestamp
        dueDateValue = formData.dueDate.toDate().toISOString().slice(0, 16);
      } else if (formData.dueDate instanceof Date) {
        // It's already a Date object
        dueDateValue = formData.dueDate.toISOString().slice(0, 16);
      } else if (typeof formData.dueDate === 'string') {
        // It's a string, try to parse it
        dueDateValue = new Date(formData.dueDate).toISOString().slice(0, 16);
      }
      if (dueDateValue) {
        document.getElementById('dueDate').value = dueDateValue;
      }
    }
    
    // Set form type
    currentFormType = formData.type || 'public';
    
    // Load questions
    questions = formData.questions || [];
    
    // Store group selection for later
    if (currentFormType === 'private' && formData.group) {
      window.selectedGroupId = formData.group;
    }

  } catch (error) {
    console.error('Error loading form data:', error);
    alert('Error loading form: ' + error.message);
    window.location.href = 'forms.html';
  }
}

async function loadGroups() {
  try {
    const groupsQuery = query(
      collection(db, 'groups'),
      where('members', 'array-contains', auth.currentUser.uid)
    );
    const groupsSnapshot = await getDocs(groupsQuery);
    
    const groupSelect = document.getElementById('group');
    if (groupSelect) {
      groupSelect.innerHTML = '<option value="">Select a group...</option>';
      
      groupsSnapshot.forEach(doc => {
        const groupData = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = groupData.name;
        groupSelect.appendChild(option);
      });
      
      // Set the selected group if we stored one
      if (window.selectedGroupId) {
        groupSelect.value = window.selectedGroupId;
        delete window.selectedGroupId; // Clean up
      }
    }
  } catch (error) {
    console.error('Error loading groups:', error);
  }
}

function showAuthAlert() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  
  const dialog = document.createElement('div');
  dialog.className = 'auth-alert-dialog';
  dialog.innerHTML = `
    <h2>Sign In Required</h2>
    <p>You need to be signed in to edit forms. Would you like to sign in now?</p>
    <div class="auth-alert-actions">
      <button class="sign-in-btn">Sign In</button>
      <button class="cancel-auth-btn">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  dialog.querySelector('.sign-in-btn').addEventListener('click', () => {
    window.location.href = 'login.html';
  });

  dialog.querySelector('.cancel-auth-btn').addEventListener('click', () => {
    overlay.remove();
    dialog.remove();
    window.location.href = 'forms.html';
  });
}

    // Load questions
async function completeFormDataLoad() {
  try {
    console.log('Loading questions...');
    
    // Display the loaded questions
    displayQuestions();
    
    // Set the form type UI
    updateFormTypeUI();
    
    console.log('Form data loaded successfully with', questions.length, 'questions');
    
  } catch (error) {
    console.error('Error completing form data load:', error);
    alert('Error loading form: ' + error.message);
  }
}

// Add the same helper functions as in create-form.js
function initializeFormTypeButtons() {
  const formTypeButtons = document.querySelectorAll('.form-type-btn');
  const groupSelector = document.getElementById('groupSelector');
  const groupSelect = document.getElementById('group');
  
  formTypeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      formTypeButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentFormType = button.getAttribute('data-type');
      
      if (groupSelector && groupSelect) {
        if (currentFormType === 'private') {
          groupSelector.style.display = 'block';
          groupSelect.setAttribute('required', 'required');
        } else {
          groupSelector.style.display = 'none';
          groupSelect.removeAttribute('required');
          groupSelect.value = ''; // Clear selection
        }
      }
    });
  });
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
      if (confirm('Are you sure you want to cancel? All changes will be lost.')) {
        window.location.href = 'forms.html';
      }
    });
  }
}

function initializeFormSubmission() {
  const form = document.getElementById('editFormForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
}

function updateQuestions() {
  questions = [];
  document.querySelectorAll('.question-container').forEach(container => {
    const question = {
      type: container.querySelector('.question-title-input').closest('.question-container').dataset.type,
      question: container.querySelector('.question-title-input').value,
      required: container.querySelector('.required-toggle input').checked,
      options: [],
      scale: null
    };

    // Get options for multiple choice and checkboxes
    if (question.type === 'Multiple Choice' || question.type === 'Checkboxes') {
      const optionInputs = container.querySelectorAll('.option-input');
      question.options = Array.from(optionInputs).map(input => input.value).filter(val => val.trim());
    }

    // Get scale settings for linear scale
    if (question.type === 'Linear Scale') {
      const scaleMin = container.querySelector('.scale-min');
      const scaleMax = container.querySelector('.scale-max');
      const scaleMinLabel = container.querySelector('.scale-min-label');
      const scaleMaxLabel = container.querySelector('.scale-max-label');
      
      if (scaleMin && scaleMax && scaleMinLabel && scaleMaxLabel) {
        question.scale = {
          min: parseInt(scaleMin.value),
          max: parseInt(scaleMax.value),
          minLabel: scaleMinLabel.value,
          maxLabel: scaleMaxLabel.value
        };
      }
    }

    questions.push(question);
  });
}

// Modify the form submission handler for updating instead of creating
async function handleFormSubmit(e) {
  e.preventDefault();
  
  if (!auth.currentUser) {
    showAuthAlert();
    return;
  }

  // Show loading state
  const submitBtn = e.target.querySelector('.submit-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Updating...';
  submitBtn.disabled = true;

  try {
    updateQuestions();

    const formData = {
      title: document.getElementById('formTitle').value,
      description: document.getElementById('formDescription').value,
      dueDate: Timestamp.fromDate(new Date(document.getElementById('dueDate').value)),
      type: currentFormType,
      group: currentFormType === 'private' ? document.getElementById('group').value : null,
      questions: questions,
      lastModified: Timestamp.now()
    };

    const formRef = doc(db, 'forms', formId);
    await updateDoc(formRef, formData);
    
    // Show success message
    alert('Form updated successfully!');
    window.location.href = 'forms.html';
    
  } catch (error) {
    console.error('Error updating form:', error);
    alert('Error updating form: ' + error.message);
    
    // Reset button
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function addQuestion(type, existingQuestion = null) {
  // Add to questions array
  const questionData = existingQuestion || {
    type: type,
    question: '',
    required: false,
    options: type === 'Multiple Choice' || type === 'Checkboxes' ? ['Option 1'] : [],
    scale: type === 'Linear Scale' ? { min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' } : null
  };
  
  if (!existingQuestion) {
    questions.push(questionData);
  }
  
  // Add to DOM
  addQuestionToDOM(type, questionData, questions.length - 1);
}

function addQuestionToDOM(type, questionData, index) {
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question-container';
  questionDiv.dataset.type = type;
  questionDiv.dataset.index = index;

  questionDiv.innerHTML = `
    <div class="question-header">
      <input type="text" class="question-title-input" placeholder="Question" 
        value="${(questionData.question || '').replace(/"/g, '&quot;')}" required>
      <div class="question-controls">
        <label class="required-toggle">
          <input type="checkbox" ${questionData.required ? 'checked' : ''}>
          Required
        </label>
        <button type="button" class="delete-question-btn">Delete</button>
      </div>
    </div>
    ${generateQuestionInputs(type, questionData)}
  `;

  // Add event listeners for the question
  const deleteBtn = questionDiv.querySelector('.delete-question-btn');
  deleteBtn.addEventListener('click', () => {
    const questionIndex = parseInt(questionDiv.dataset.index);
    questions.splice(questionIndex, 1);
    questionDiv.remove();
    updateQuestionIndices();
  });

  const titleInput = questionDiv.querySelector('.question-title-input');
  titleInput.addEventListener('input', () => {
    const questionIndex = parseInt(questionDiv.dataset.index);
    questions[questionIndex].question = titleInput.value;
  });

  const requiredToggle = questionDiv.querySelector('.required-toggle input');
  requiredToggle.addEventListener('change', () => {
    const questionIndex = parseInt(questionDiv.dataset.index);
    questions[questionIndex].required = requiredToggle.checked;
  });

  // Add options management for multiple choice and checkboxes
  if (type === 'Multiple Choice' || type === 'Checkboxes') {
    setupOptionManagement(questionDiv);
  }

  document.getElementById('questionsContainer').appendChild(questionDiv);
}

function updateQuestionIndices() {
  const questionContainers = document.querySelectorAll('.question-container');
  questionContainers.forEach((container, index) => {
    container.dataset.index = index;
  });
}

function generateQuestionInputs(type, data) {
  switch (type) {
    case 'Multiple Choice':
    case 'Checkboxes':
      return `
        <div class="options-container">
          ${(data.options || ['Option 1']).map(option => `
            <div class="option-row">
              <input type="text" class="option-input" value="${option.replace(/"/g, '&quot;')}">
              <button type="button" class="delete-option-btn">Delete</button>
            </div>
          `).join('')}
          <button type="button" class="add-option-btn">Add Option</button>
        </div>
      `;
    case 'Linear Scale':
      const scale = data.scale || { min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' };
      return `
        <div class="scale-settings">
          <div class="scale-inputs">
            <label>Min: <input type="number" class="scale-min" value="${scale.min}"></label>
            <label>Max: <input type="number" class="scale-max" value="${scale.max}"></label>
          </div>
          <div class="scale-labels">
            <label>Min Label: <input type="text" class="scale-min-label" value="${(scale.minLabel || '').replace(/"/g, '&quot;')}"></label>
            <label>Max Label: <input type="text" class="scale-max-label" value="${(scale.maxLabel || '').replace(/"/g, '&quot;')}"></label>
          </div>
        </div>
      `;
    default:
      return '';
  }
}

function setupOptionManagement(questionDiv) {
  const optionsContainer = questionDiv.querySelector('.options-container');
  
  // Add new option
  optionsContainer.querySelector('.add-option-btn').addEventListener('click', () => {
    const optionRow = document.createElement('div');
    optionRow.className = 'option-row';
    optionRow.innerHTML = `
      <input type="text" class="option-input" value="New Option">
      <button type="button" class="delete-option-btn">Delete</button>
    `;
    optionsContainer.insertBefore(optionRow, optionsContainer.lastElementChild);
    updateQuestions();
  });

  // Delete option
  optionsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-option-btn')) {
      e.target.parentElement.remove();
      updateQuestions();
    }
  });
}