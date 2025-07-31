import { CONSTANTS } from '/config/constants.js';

export const UIUtils = {
  showMessage(elementId, message, type = 'pending') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.style.display = 'block';
    element.textContent = message;
    element.style.color = CONSTANTS.UI.COLORS[type.toUpperCase()];
  },

  clearFormFields(fields) {
    fields.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element) element.value = '';
    });
  },

  toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = show ? 'flex' : 'none';
    }
  }
};