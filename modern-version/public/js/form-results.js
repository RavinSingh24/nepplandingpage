import { auth, db } from '/config/firebase-config.js';
import { 
  doc, 
  getDoc,
  collection,
  query,
  where,
  getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// Get form ID from URL
const urlParams = new URLSearchParams(window.location.search);
const formId = urlParams.get('id');

if (!formId) {
  window.location.href = 'forms.html';
}

let formData = null;
let responses = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await loadFormAndResponses();
    } else {
      // Redirect to login if not authenticated
      window.location.href = 'login.html';
    }
  });
});

async function loadFormAndResponses() {
  try {
    // Load form data
    const formDoc = await getDoc(doc(db, 'forms', formId));
    if (!formDoc.exists()) {
      throw new Error('Form not found');
    }

    formData = formDoc.data();
    
    // Verify user is the form creator
    if (formData.createdBy !== auth.currentUser?.uid) {
      throw new Error('Unauthorized access');
    }

    // Load responses
    const responsesQuery = query(
      collection(db, 'form_responses'),
      where('formId', '==', formId)
    );
    const responsesSnapshot = await getDocs(responsesQuery);
    responses = responsesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      score: calculateScore(doc.data().answers, formData.questions)
    }));

    displayFormDetails();
    displaySummary();
    displayIndividualResponses();

  } catch (error) {
    console.error("Error loading results:", error);
    document.querySelector('.main-content').innerHTML = `
      <div class="error-container">
        <h2>Error Loading Results</h2>
        <p>${error.message}</p>
        <button onclick="window.location.href='forms.html'" class="cancel-btn">
          Return to Forms
        </button>
      </div>
    `;
  }
}

function calculateScore(answers, questions) {
  let correctAnswers = 0;
  let totalQuestions = 0;

  questions.forEach((question, index) => {
    if (question.type === 'Multiple Choice' && question.correctAnswer) {
      totalQuestions++;
      if (answers[`q${index}`] === question.correctAnswer) {
        correctAnswers++;
      }
    }
  });

  return totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : null;
}

function displayFormDetails() {
  document.getElementById('formTitle').textContent = formData.title;
  document.getElementById('formType').textContent = formData.type;
  document.getElementById('responsesCount').textContent = `${responses.length} Responses`;
  
  const scores = responses.map(r => r.score).filter(s => s !== null);
  if (scores.length > 0) {
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    document.getElementById('avgScore').textContent = `Average Score: ${avgScore.toFixed(1)}%`;
  }
}

function displaySummary() {
  const container = document.getElementById('questionsSummary');
  container.innerHTML = '';

  formData.questions.forEach((question, qIndex) => {
    const questionResponses = responses.map(r => r.answers[`q${qIndex}`]);
    const summary = document.createElement('div');
    summary.className = 'question-summary';
    
    let summaryHTML = `
      <div class="question-header">
        <span class="question-text">${question.question}</span>
        <span class="response-rate">${questionResponses.filter(Boolean).length}/${responses.length} responses</span>
      </div>
    `;

    switch (question.type) {
      case 'Multiple Choice':
        summaryHTML += generateMultipleChoiceSummary(question, questionResponses);
        break;
      case 'Checkboxes':
        summaryHTML += generateCheckboxesSummary(question, questionResponses);
        break;
      case 'Short Answer':
      case 'Long Answer':
        summaryHTML += generateTextSummary(questionResponses);
        break;
      case 'Linear Scale':
        summaryHTML += generateScaleSummary(question, questionResponses);
        break;
    }

    summary.innerHTML = summaryHTML;
    container.appendChild(summary);
  });
}

function generateMultipleChoiceSummary(question, responses) {
  const optionCounts = {};
  question.options.forEach(opt => optionCounts[opt] = 0);
  responses.forEach(r => r && optionCounts[r]++);

  const totalResponses = responses.filter(Boolean).length;
  const correctAnswers = responses.filter(r => r === question.correctAnswer).length;
  
  let html = `
    <div class="correct-rate">Correct Answers: ${correctAnswers}/${totalResponses} (${((correctAnswers/totalResponses || 0) * 100).toFixed(1)}%)</div>
    <div class="chart-container">
      <div class="bar-chart">
  `;

  question.options.forEach(option => {
    const count = optionCounts[option];
    const percentage = totalResponses ? (count / totalResponses * 100) : 0;
    const isCorrect = option === question.correctAnswer;
    
    html += `
      <div class="bar" style="height: ${percentage}%; background: ${isCorrect ? '#2ecc71' : '#FFD600'}">
        <span class="bar-value">${count}</span>
        <span class="bar-label">${option}</span>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

function generateCheckboxesSummary(question, responses) {
  const optionCounts = {};
  question.options.forEach(opt => optionCounts[opt] = 0);
  
  // Count checkbox selections (responses can be arrays)
  responses.forEach(response => {
    if (response) {
      const selections = Array.isArray(response) ? response : [response];
      selections.forEach(selection => {
        if (optionCounts.hasOwnProperty(selection)) {
          optionCounts[selection]++;
        }
      });
    }
  });

  const totalResponses = responses.filter(Boolean).length;
  
  let html = `
    <div class="chart-container">
      <div class="bar-chart">
  `;

  question.options.forEach(option => {
    const count = optionCounts[option];
    const percentage = totalResponses ? (count / totalResponses * 100) : 0;
    
    html += `
      <div class="bar" style="height: ${percentage}%; background: #3498db">
        <span class="bar-value">${count}</span>
        <span class="bar-label">${option}</span>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

function generateTextSummary(responses) {
  const validResponses = responses.filter(r => r && r.trim());
  
  let html = `
    <div class="text-responses">
      <div class="response-count">Total Responses: ${validResponses.length}</div>
  `;

  if (validResponses.length > 0) {
    html += '<div class="text-response-list">';
    validResponses.slice(0, 10).forEach((response, index) => {
      html += `
        <div class="text-response-item">
          <span class="response-number">${index + 1}.</span>
          <span class="response-text">${response}</span>
        </div>
      `;
    });
    
    if (validResponses.length > 10) {
      html += `<div class="more-responses">... and ${validResponses.length - 10} more responses</div>`;
    }
    
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function generateScaleSummary(question, responses) {
  const validResponses = responses.filter(r => r !== null && r !== undefined && r !== '');
  const scale = question.scale || { min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' };
  
  if (validResponses.length === 0) {
    return '<div class="no-responses">No responses yet</div>';
  }

  // Calculate statistics
  const values = validResponses.map(r => parseFloat(r)).filter(v => !isNaN(v));
  const sum = values.reduce((a, b) => a + b, 0);
  const average = values.length > 0 ? sum / values.length : 0;
  
  // Count responses for each scale value
  const counts = {};
  for (let i = scale.min; i <= scale.max; i++) {
    counts[i] = 0;
  }
  values.forEach(val => {
    if (counts.hasOwnProperty(val)) {
      counts[val]++;
    }
  });

  let html = `
    <div class="scale-summary">
      <div class="scale-stats">
        <div class="stat">
          <span class="stat-label">Average:</span>
          <span class="stat-value">${average.toFixed(2)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Responses:</span>
          <span class="stat-value">${values.length}</span>
        </div>
      </div>
      <div class="scale-chart">
        <div class="scale-labels">
          <span class="scale-min-label">${scale.minLabel}</span>
          <span class="scale-max-label">${scale.maxLabel}</span>
        </div>
        <div class="scale-bars">
  `;

  const maxCount = Math.max(...Object.values(counts));
  for (let i = scale.min; i <= scale.max; i++) {
    const count = counts[i];
    const percentage = maxCount > 0 ? (count / maxCount * 100) : 0;
    
    html += `
      <div class="scale-bar-container">
        <div class="scale-bar" style="height: ${percentage}%">
          <span class="scale-count">${count}</span>
        </div>
        <span class="scale-number">${i}</span>
      </div>
    `;
  }

  html += `
        </div>
      </div>
    </div>
  `;

  return html;
}

// Add other summary generation functions here...

function displayIndividualResponses() {
  const container = document.getElementById('responsesList');
  container.innerHTML = '';

  responses.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .forEach(response => {
      const card = document.createElement('div');
      card.className = 'response-card';
      
      let answersHTML = '';
      formData.questions.forEach((question, qIndex) => {
        const answer = response.answers[`q${qIndex}`];
        const isCorrect = question.type === 'Multiple Choice' && 
          question.correctAnswer === answer;
        
        answersHTML += `
          <div class="answer-item">
            <span class="answer-question">${question.question}</span>
            <span class="answer-value ${isCorrect ? 'answer-correct' : question.correctAnswer ? 'answer-incorrect' : ''}">${answer || 'No answer'}</span>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="response-header">
          <span>Submitted by ${response.userName} on ${new Date(response.submittedAt).toLocaleString()}</span>
          ${response.score !== null ? `<span class="response-score">Score: ${response.score.toFixed(1)}%</span>` : ''}
        </div>
        <div class="answer-list">
          ${answersHTML}
        </div>
      `;

      container.appendChild(card);
    });
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    button.classList.add('active');
    document.getElementById(`${button.dataset.tab}Tab`).classList.add('active');
  });
});

// Export results
document.getElementById('exportBtn').addEventListener('click', () => {
  const csv = generateCSV();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${formData.title}_results.csv`;
  a.click();
});

function generateCSV() {
  // Generate CSV data here...
}