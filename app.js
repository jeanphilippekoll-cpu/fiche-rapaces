import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// CONFIG FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyD8vFP1BsxN0F8PexqFf0au4_slFQU3qSA",
  authDomain: "fiche-rapaces.firebaseapp.com",
  projectId: "fiche-rapaces",
  storageBucket: "fiche-rapaces.firebasestorage.app",
  messagingSenderId: "881543403206",
  appId: "1:881543403206:web:17915a78ddbbde9a1929c7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM
const loginScreen = document.getElementById("authOverlay");
const appScreen = document.getElementById("appContent");
const userInfo = document.getElementById("userInfo");
const statusEl = document.getElementById("status");

let currentUser = null;
let appData = {
  oiseaux: [],
  stock: {}
};

// DATE
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// LOGIN
async function loginFirebaseOverlay() {
  const email = document.getElementById("loginEmailOverlay").value.trim();
  const password = document.getElementById("loginPasswordOverlay").value;
  const authError = document.getElementById("authError");

  alert("clic détecté");

  if (authError) authError.textContent = "";

  if (!email || !password) {
    if (authError) authError.textContent = "Entre email et mot de passe.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    if (authError) authError.textContent = "Connexion OK";
  } catch (e) {
    if (authError) authError.textContent = "Erreur connexion : " + (e.message || "");
  }
}

// REGISTER
async function registerFirebaseOverlay() {
  const email = document.getElementById("loginEmailOverlay").value.trim();
  const password = document.getElementById("loginPasswordOverlay").value;
  const authError = document.getElementById("authError");

  if (authError) authError.innerText = "";

  if (!email || !password) {
    if (authError) authError.innerText = "Entre email et mot de passe.";
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    if (authError) authError.innerText = "Erreur : " + e.message;
  }
}

// LOGOUT
async function logoutFirebase() {
  await signOut(auth);
}

// SAVE DATA
async function saveData() {
  if (!currentUser) return;
  await setDoc(doc(db, "users", currentUser.uid), appData);
}

// LOAD DATA
async function loadData() {
  if (!currentUser) return;

  const ref = doc(db, "users", currentUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    appData = snap.data();
  }

  renderAll();
}

// RENDER
function renderAll() {
  renderOiseaux();
}

// AFFICHAGE OISEAUX
function renderOiseaux() {
  const zone = document.getElementById("appContent");
  if (!zone) return;

  let html = "<h2>Oiseaux</h2>";

  appData.oiseaux.forEach(o => {
    html += `
      <div style="margin-bottom:20px;padding:10px;border:1px solid #ccc">
        <strong>${o.nom || ""}</strong><br>
        ${o.espece || ""}<br>
        ${o.photo ? `<img src="${o.photo}" style="max-width:200px">` : ""}
      </div>
    `;
  });

  zone.innerHTML = html;
}

// AUTH STATE
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");

    await loadData();
  } else {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
});

// BOUTONS
document.getElementById("btnLoginOverlay").onclick = loginFirebaseOverlay;
document.getElementById("btnRegisterOverlay").onclick = registerFirebaseOverlay;

// INIT
const encDateEl = document.getElementById("encDate");
if (encDateEl) encDateEl.value = todayStr();

const feedDateEl = document.getElementById("feedDate");
if (feedDateEl) feedDateEl.value = todayStr();
window.loginFirebaseOverlay = loginFirebaseOverlay;
window.registerFirebaseOverlay = registerFirebaseOverlay;
window.logoutFirebase = logoutFirebase;
window.loginFirebaseOverlay = loginFirebaseOverlay;
window.registerFirebaseOverlay = registerFirebaseOverlay;
window.logoutFirebase = logoutFirebase;

window.showSection = showSection;
window.saveData = saveData;
window.ajouterOiseau = ajouterOiseau;
window.ajouterEncodage = ajouterEncodage;
window.ajouterDocument = ajouterDocument;
window.ajouterNourrissage = ajouterNourrissage;
window.enregistrerStock = enregistrerStock;
document.getElementById("btnLogin")?.addEventListener("click", loginFirebaseOverlay);
document.getElementById("btnRegister")?.addEventListener("click", registerFirebaseOverlay);