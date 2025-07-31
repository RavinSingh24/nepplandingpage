import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "HIDDEN",
  authDomain: "nepp-82074.firebaseapp.com",
  databaseURL: "https://nepp-82074-default-rtdb.firebaseio.com",
  projectId: "nepp-82074",
  storageBucket: "nepp-82074.firebasestorage.app",
  messagingSenderId: "390060926966",
  appId: "1:390060926966:web:dd7a95fc553a86bdd2c9d7",
  measurementId: "G-QSFQKZDETN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

export { app, auth, db, storage, analytics };
