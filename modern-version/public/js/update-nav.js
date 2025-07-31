// This script updates the navigation in all HTML files to include login/logout links
// Run this with Node.js

const fs = require('fs');
const path = require('path');

// List of HTML files to update
const htmlFiles = [
  'mun.html',
  'tsa.html',
  'scio.html',
  'contact.html',
  // 'debate.html', // Uncomment if this file exists
  // 'team.html',   // Uncomment if this file exists
];

// The old navigation HTML pattern to find
const oldNavPattern = /<ul>\s*<li><a href="mun\.html">MUN<\/a><\/li>\s*<li><a href="tsa\.html">TSA<\/a><\/li>\s*<li><a href="scio\.html">SCIO<\/a><\/li>\s*<li><a href="debate\.html">DEBATE<\/a><\/li>\s*<li><a>|<\/a><\/li>\s*<li><a href="team\.html">TEAM<\/a><\/li>\s*<li><a href="contact\.html">CONTACT<\/a><\/li>\s*<\/ul>/;

// The new navigation HTML with login/logout links
const newNavHTML = `<ul>
          <li><a href="mun.html">MUN</a></li>
          <li><a href="tsa.html">TSA</a></li>
          <li><a href="scio.html">SCIO</a></li>
          <li><a href="debate.html">DEBATE</a></li>
          <li><a>|</a></li>
          <li><a href="team.html">TEAM</a></li>
          <li><a href="contact.html">CONTACT</a></li>
          <li><a href="login.html" id="login-link">LOGIN</a></li>
          <li><a href="#" id="logout-link" style="display: none;">LOGOUT</a></li>
          <li><a href="profile.html" id="profile-link" style="display: none;">PROFILE</a></li>
        </ul>`;

// The script to add at the end of each file, before </body>
const authScript = `
  <!-- Firebase Authentication -->
  <script type="module">
    import { setupAuth } from './auth.js';
    setupAuth();
  </script>
`;

// Process each HTML file
htmlFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  
  // Read file content
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Update navigation
  content = content.replace(oldNavPattern, newNavHTML);
  
  // Add auth script before </body>
  content = content.replace('</body>', `${authScript}\n</body>`);
  
  // Write updated content back to file
  fs.writeFileSync(filePath, content);
  
  console.log(`Updated: ${file}`);
});

console.log('Navigation update complete!'); 