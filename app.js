import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// CONFIG FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyD8VfPlBsxN0F8PexqFfOaU4_slFQU3qsA",
  authDomain: "fiche-rapaces.firebaseapp.com",
  projectId: "fiche-rapaces",
  storageBucket: "fiche-rapaces.firebasestorage.app",
  messagingSenderId: "881543403206",
  appId: "1:881543403206:web:17915a78ddbbde9a1929c7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ELEMENTS
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const status = document.getElementById("status");

// LOGIN
document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    status.textContent = "✅ Connecté";
  } catch (e) {
    status.textContent = "❌ " + e.message;
  }
});

// REGISTER
document.getElementById("btnRegister").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    status.textContent = "✅ Compte créé";
  } catch (e) {
    status.textContent = "❌ " + e.message;
  }
});

// STATE
onAuthStateChanged(auth, (user) => {
  if (user) {
    status.textContent = "Connecté : " + user.email;
  }
});