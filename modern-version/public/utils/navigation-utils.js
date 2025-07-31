// Utility function to set the active sidebar item based on current page
export function setActiveSidebarItem() {
  const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  
  sidebarItems.forEach(item => {
    const href = item.getAttribute('href');
    const pageName = href ? href.replace('.html', '') : '';
    
    // Remove active class from all items
    item.classList.remove('active');
    
    // Add active class to current page
    if (pageName === currentPage) {
      item.classList.add('active');
    }
  });
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', setActiveSidebarItem);
