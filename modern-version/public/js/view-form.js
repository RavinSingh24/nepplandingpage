import { auth, db } from '/config/firebase-config.js';
import { 
  doc, 
  getDoc,
  collection,
  addDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Get form ID from URL
const urlParams = new URLSearchParams(window.location.search);
const formId = urlParams.get('id');

if (!formId) {
    window.location.href = 'forms.html';
}

// Add at the beginning of the file after imports
let currentForm = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
  await loadForm();
});

// Modify the loadForm function
async function loadForm() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;

  try {
    const formDoc = await getDoc(doc(db, 'forms', formId));
    
    if (!formDoc.exists()) {
      window.location.href = '404.html';
      return;
    }

    currentForm = formDoc.data();
    
    if (!currentForm || !currentForm.questions) {
      throw new Error('Invalid form data structure');
    }

    // Check if current user is the author to show edit button
    const isAuthor = auth.currentUser && currentForm.createdBy === auth.currentUser.uid;
    
    // Make sure the container exists before trying to display questions
    const questionsContainer = document.getElementById('questionsContainer');
    if (questionsContainer) {
      displayFormDetails(currentForm, isAuthor);
      displayQuestions(currentForm.questions);
    } else {
      throw new Error('Questions container not found');
    }

  } catch (error) {
    console.error("Error loading form:", error);
    mainContent.innerHTML = `
      <div class="error-container">
        <h2>Error Loading Form</h2>
        <p>There was an error loading the form. Please try again later.</p>
        <p class="error-details">${error.message}</p>
        <button onclick="window.location.href='forms.html'" class="cancel-btn">
          Return to Forms
        </button>
      </div>
    `;
  }
}

// Update displayFormDetails to include edit button for author
function displayFormDetails(form, isAuthor) {
  const header = document.querySelector('.view-form-header');
  if (!header) return;

  header.innerHTML = `
    <div class="header-top">
      <h1 id="formTitle">${form.title}</h1>
      ${isAuthor ? `
        <button onclick="window.location.href='edit-form.html?id=${formId}'" class="edit-btn">
          Edit Form
        </button>
      ` : ''}
    </div>
    <div class="form-meta">
      <span id="formType" class="form-type ${form.type}">${form.type.charAt(0).toUpperCase() + form.type.slice(1)}</span>
      <span id="formDate">Created: ${form.createdAt.toDate().toLocaleDateString()}</span>
      <span id="formDueDate">Due: ${form.dueDate.toDate().toLocaleDateString()}</span>
    </div>
    <p id="formDescription" class="form-description">${form.description || 'No description provided'}</p>
  `;
}

function displayQuestions(questions) {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';

  questions.forEach((question, index) => {
    const questionCard = document.createElement('div');
    questionCard.className = 'question-card';
    questionCard.innerHTML = generateQuestionHTML(question, index);
    container.appendChild(questionCard);
  });
}

// Update generateQuestionHTML for each question type
function generateQuestionHTML(question, index) {
  if (!question || !question.type) {
    console.error('Invalid question format:', question);
    return '<p class="error">Error: Invalid question format</p>';
  }

  const requiredMark = question.required ? '<span class="required-marker">*</span>' : '';
  
  let inputHTML = '';
  switch (question.type.trim()) {
    case 'Short Answer':
      inputHTML = `
        <input type="text" class="question-input" id="q${index}" 
          name="q${index}" ${question.required ? 'required' : ''}>
      `;
      break;

    case 'Long Answer':
      inputHTML = `
        <textarea class="question-input" id="q${index}" 
          name="q${index}" ${question.required ? 'required' : ''}></textarea>
      `;
      break;

    case 'Multiple Choice':
      inputHTML = generateOptionsHTML(question.options || [], index, 'radio', question.required);
      break;

    case 'Checkboxes':
      inputHTML = generateOptionsHTML(question.options || [], index, 'checkbox', question.required);
      break;

    case 'File Upload':
      inputHTML = generateFileUploadHTML(index, question);
      break;

    case 'Linear Scale':
      inputHTML = generateScaleHTML(index, question);
      break;

    default:
      inputHTML = `<p class="error">Unsupported question type: ${question.type}</p>`;
  }

  return `
    <div class="question-card">
      <h3 class="question-title">
        ${index + 1}. ${question.question || 'Untitled Question'}${requiredMark}
      </h3>
      ${inputHTML}
    </div>
  `;
}

function generateOptionsHTML(options, index, type, required) {
  return `
    <div class="options-list">
      ${options.map((option, optIndex) => `
        <div class="option-item">
          <input type="${type}" id="q${index}_opt${optIndex}" 
            name="q${index}" value="${option}" ${required ? 'required' : ''}>
          <label class="option-label" for="q${index}_opt${optIndex}">${option}</label>
        </div>
      `).join('')}
    </div>
  `;
}

// Also update the generateFileUploadHTML function to handle missing properties
function generateFileUploadHTML(index, question) {
  const fileTypes = question.fileTypes || ['.pdf', '.doc', '.docx']; // Default file types
  
  return `
    <div class="file-upload-container">
      <input type="file" id="q${index}" name="q${index}" 
        accept="${fileTypes.join(',')}" ${question.required ? 'required' : ''}>
      <svg class="upload-icon size-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
      </svg>
      <p class="upload-text">Click or drag file to upload</p>
      <p class="file-types">Allowed types: ${fileTypes.join(', ')}</p>
    </div>
  `;
}

// Update the generateScaleHTML function with default values
function generateScaleHTML(index, question) {
  // Default scale values if not provided
  const scale = question.scale || {
    min: 1,
    max: 5,
    minLabel: 'Low',
    maxLabel: 'High'
  };

  const min = scale.min || 1;
  const max = scale.max || 5;
  const minLabel = scale.minLabel || 'Low';
  const maxLabel = scale.max || 'High';

  let options = '';
  for (let i = min; i <= max; i++) {
    options += `
      <div class="scale-option">
        <input type="radio" class="scale-radio" id="q${index}_${i}" 
          name="q${index}" value="${i}" ${question.required ? 'required' : ''}>
        <label class="scale-value" for="q${index}_${i}">${i}</label>
      </div>
    `;
  }

  return `
    <div class="scale-container">
      <div class="scale-options">${options}</div>
      <div class="scale-labels">
        <span>${minLabel}</span>
        <span>${maxLabel}</span>
      </div>
    </div>
  `;
}

// Add this function before the form submission handler
function validateForm(formData, questions) {
  const answers = {};
  for (const [name, value] of formData.entries()) {
    answers[name] = value;
  }

  const errors = [];
  questions.forEach((question, index) => {
    const answer = answers[`q${index}`];
    
    if (question.required && !answer) {
      errors.push(`Question ${index + 1} is required`);
    }

    if (question.type === 'File Upload' && answer) {
      const file = document.querySelector(`#q${index}`).files[0];
      const fileType = file.name.split('.').pop().toLowerCase();
      const allowedTypes = (question.fileTypes || ['.pdf', '.doc', '.docx'])
        .map(t => t.replace('.', '').toLowerCase());
      
      if (!allowedTypes.includes(fileType)) {
        errors.push(`Question ${index + 1}: Invalid file type`);
      }
    }
  });

  return errors;
}

// Update the form submission handler
document.getElementById('formResponse').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!auth.currentUser) {
    alert('Please sign in to submit a response');
    return;
  }

  try {
    const formData = new FormData(e.target);
    const formDoc = await getDoc(doc(db, 'forms', formId));
    const form = formDoc.data();

    // Validate form
    const errors = validateForm(formData, form.questions);
    if (errors.length > 0) {
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    const response = {
      formId: formId,
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName,
      submittedAt: new Date().toISOString(),
      answers: {}
    };

    // Convert FormData to response object and calculate score
    let correctAnswers = 0;
    let totalQuestions = 0;

    for (const [name, value] of formData.entries()) {
      response.answers[name] = value;
      
      // Calculate score for multiple choice questions
      const questionIndex = parseInt(name.replace('q', ''));
      const question = form.questions[questionIndex];
      
      if (question.type === 'Multiple Choice' && question.correctAnswer) {
        totalQuestions++;
        if (value === question.correctAnswer) {
          correctAnswers++;
        }
      }
    }

    // Add score if there were graded questions
    if (totalQuestions > 0) {
      response.score = (correctAnswers / totalQuestions) * 100;
    }

    await addDoc(collection(db, 'form_responses'), response);
    alert('Response submitted successfully!');
    
    // All users should be redirected to forms page after submission
    window.location.href = 'forms.html';
  } catch (error) {
    console.error('Error submitting response:', error);
    alert('Error submitting response. Please try again.');
  }
});

// Cancel button handler
document.getElementById('cancelBtn').addEventListener('click', () => {
  window.location.href = 'forms.html';
});