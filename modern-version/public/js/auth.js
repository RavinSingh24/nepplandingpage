import { auth, db } from '/config/firebase-config.js';
import { 
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Password validation function
function validatePassword(password) {
  const minLength = 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  
  if (!hasLetter) {
    errors.push('Password must contain at least one letter');
  }
  
  if (!hasSpecialChar) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// Handle navigation UI
const loginLink = document.getElementById('login-link');
const logoutLink = document.getElementById('logout-link');
const profileLink = document.getElementById('profile-link');

if (loginLink && logoutLink && profileLink) {
  onAuthStateChanged(auth, (user) => {
    loginLink.style.display = user ? 'none' : 'block';
    logoutLink.style.display = user ? 'block' : 'none';
    profileLink.style.display = user ? 'block' : 'none';
  });

  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await AuthService.logout();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  });
}

// Login form handling
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const authMessage = document.getElementById('auth-message');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // Clear previous messages
    authMessage.style.display = 'none';
    
    // Basic validation
    if (!email || !password) {
      authMessage.textContent = 'Please enter both email and password';
      authMessage.style.color = '#ff3860';
      authMessage.style.display = 'block';
      return;
    }
    
    try {
      // Show loading state
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Signing In...';
      submitBtn.disabled = true;
      
      await signInWithEmailAndPassword(auth, email, password);
      
      // Show success message
      authMessage.textContent = 'Successfully signed in! Redirecting...';
      authMessage.style.color = '#00d1b2';
      authMessage.style.display = 'block';
      
      // Redirect after a short delay
      setTimeout(() => {
        window.location.href = 'html/dashboard.html';
      }, 1500);
      
    } catch (error) {
      console.error('Login error:', error);
      
      // Reset button
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      
      // Show user-friendly error messages
      let errorMessage = 'Sign in failed';
      
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Invalid email or password';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection';
          break;
        default:
          errorMessage = error.message;
      }
      
      authMessage.textContent = errorMessage;
      authMessage.style.color = '#ff3860';
      authMessage.style.display = 'block';
    }
  });
}

// Update the signup handler with better error logging
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const authMessage = document.getElementById('auth-message');

    // Clear previous messages
    authMessage.style.display = 'none';

    // Validate name
    if (!name) {
      authMessage.textContent = 'Full name is required';
      authMessage.style.color = '#ff3860';
      authMessage.style.display = 'block';
      return;
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      authMessage.innerHTML = 'Password requirements:<br>• ' + passwordValidation.errors.join('<br>• ');
      authMessage.style.color = '#ff3860';
      authMessage.style.display = 'block';
      return;
    }

    // Check password confirmation
    if (password !== confirmPassword) {
      authMessage.textContent = 'Passwords do not match';
      authMessage.style.color = '#ff3860';
      authMessage.style.display = 'block';
      return;
    }

    try {
      // Show loading state
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Creating Account...';
      submitBtn.disabled = true;

      // Create the user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('User created successfully:', userCredential.user.uid);
      
      // Update the user's display name
      await updateProfile(userCredential.user, {
        displayName: name
      });
      console.log('Profile updated successfully');

      // Create the user document in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        displayName: name,
        email: email,
        createdAt: new Date().toISOString()
      });
      console.log('Firestore document created successfully');

      // Show success message
      authMessage.textContent = 'Account created successfully! Redirecting...';
      authMessage.style.color = '#00d1b2';
      authMessage.style.display = 'block';

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = 'html/dashboard.html';
      }, 2000);

    } catch (error) {
      console.error('Signup error:', error);
      
      // Reset button
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      
      // Show user-friendly error messages
      let errorMessage = 'An error occurred during signup';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password is too weak';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection';
          break;
        default:
          errorMessage = error.message;
      }
      
      authMessage.textContent = errorMessage;
      authMessage.style.color = '#ff3860';
      authMessage.style.display = 'block';
    }
  });
}

// Forgot Password functionality
const forgotPasswordLink = document.getElementById('forgot-password');
if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Get email from the login form if available
    const emailInput = document.getElementById('email');
    let email = emailInput ? emailInput.value.trim() : '';
    
    // If no email in form, prompt user for email
    if (!email) {
      email = prompt('Please enter your email address to reset your password:');
    }
    
    if (!email) {
      alert('Email address is required to reset password.');
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    
    try {
      // Change link text to show loading
      const originalText = forgotPasswordLink.textContent;
      forgotPasswordLink.textContent = 'Sending...';
      forgotPasswordLink.style.pointerEvents = 'none';
      
      await sendPasswordResetEmail(auth, email);
      
      // Show success message
      alert(`Password reset email sent to ${email}! Please check your inbox and follow the instructions to reset your password.`);
      
      // Reset link text
      forgotPasswordLink.textContent = originalText;
      forgotPasswordLink.style.pointerEvents = 'auto';
      
    } catch (error) {
      console.error('Password reset error:', error);
      
      // Reset link text
      forgotPasswordLink.textContent = originalText;
      forgotPasswordLink.style.pointerEvents = 'auto';
      
      // Show user-friendly error messages
      let errorMessage = 'Failed to send password reset email';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email address';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many password reset attempts. Please try again later';
          break;
        default:
          errorMessage = error.message;
      }
      
      alert(errorMessage);
    }
  });
}

// Add user settings interface
const createUserSettings = async (userId) => {
  await setDoc(doc(db, 'userSettings', userId), {
    theme: 'dark',
    notifications: true,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  });
};

// Enhanced user registration
const registerUser = async (email, password, displayName) => {
  try {
    // Create auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update profile
    await updateProfile(user, { displayName });

    // Create user document
    await setDoc(doc(db, 'users', user.uid), {
      displayName,
      email,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    });

    // Create user settings
    await createUserSettings(user.uid);

    return user;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

// Google Sign-in
const googleProvider = new GoogleAuthProvider();
const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user document exists
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    if (!userDoc.exists()) {
      // Create user document for new Google users
      await setDoc(doc(db, 'users', user.uid), {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });
      await createUserSettings(user.uid);
    }

    return user;
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
};

// Profile page logic (change password etc.)
const changePasswordBtn = document.getElementById('change-password-btn');
if (changePasswordBtn) {
  changePasswordBtn.addEventListener('click', function() {
    const user = auth.currentUser;
    if (user) {
      sendPasswordResetEmail(auth, user.email).then(function() {
        alert('Password reset email sent! Check your inbox to reset your password.');
      }).catch(function(error) {
        alert('Error: ' + error.message);
      });
    }
  });
}

const updateProfileBtn = document.getElementById('update-profile-btn');
if (updateProfileBtn) {
  updateProfileBtn.addEventListener('click', function() {
    alert('Profile update functionality coming soon!');
  });
}

// Logout handling
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  });
}

// Google Sign In
const googleSignInButton = document.getElementById('googleSignIn');
if (googleSignInButton) {
  googleSignInButton.addEventListener('click', async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user document exists
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        // Create new user document in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          username: user.displayName,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        });
      }

      // Redirect to dashboard
      window.location.href = '/html/dashboard.html';
    } catch (error) {
      console.error('Error signing in with Google:', error);
      const authMessage = document.getElementById('auth-message');
      if (authMessage) {
        authMessage.style.display = 'block';
        authMessage.style.backgroundColor = '#ff3860';
        authMessage.style.color = 'white';
        authMessage.textContent = error.message;
      }
    }
  });
}