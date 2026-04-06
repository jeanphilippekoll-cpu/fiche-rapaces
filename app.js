import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  enableMultiTabIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8VfPlBsxN0F8PexqFfOaU4_slFQU3qsA",
  authDomain: "fiche-rapaces.firebaseapp.com",
  projectId: "fiche-rapaces",
  storageBucket: "fiche-rapaces.firebasestorage.app",
  messagingSenderId: "881543403206",
  appId: "1:881543403206:web:17915a78ddbbde9a1929c7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let appData = {
  oiseaux: [],
  encodages: [],
  nourrissage: [],
  stock: {}
};

let isLoaded = false; // 🔥 protection anti écrasement

// =========================
// 🔄 SYNCHRO TEMPS RÉEL SAFE
// =========================

function startRealtimeSync() {
  const refDoc = doc(db, "rapaces", "data");

  onSnapshot(refDoc, (snap) => {
    if (!snap.exists()) {
      console.log("Aucune donnée Firestore");
      return;
    }

    const data = snap.data();

    // 🔥 NE JAMAIS écraser si vide
    if (!data || Object.keys(data).length === 0) {
      console.warn("Données vides ignorées");
      return;
    }

    appData = data;
    isLoaded = true;

    console.log("✅ Données chargées :", appData);

    renderAll();
  });
}

// =========================
// 💾 SAUVEGARDE SAFE
// =========================

window.saveData = async function () {
  if (!isLoaded) {
    alert("⚠️ Données non chargées, sauvegarde bloquée !");
    return;
  }

  if (!appData.oiseaux || appData.oiseaux.length === 0) {
    alert("⚠️ Aucun oiseau → sauvegarde bloquée !");
    return;
  }

  try {
    await setDoc(doc(db, "rapaces", "data"), appData);
    alert("✅ Sauvegardé !");
  } catch (e) {
    console.error(e);
    alert("❌ Erreur sauvegarde");
  }
};

// =========================
// 📊 RENDER MINIMAL
// =========================

function renderAll() {
  const zone = document.getElementById("listeOiseaux");
  if (!zone) return;

  if (!appData.oiseaux || appData.oiseaux.length === 0) {
    zone.innerHTML = "<p>Aucun oiseau</p>";
    return;
  }

  zone.innerHTML = appData.oiseaux.map(o => `
    <div style="padding:10px;margin:10px;border:1px solid #ccc;border-radius:10px;">
      <strong>${o.nom}</strong><br>
      ${o.espece || ""}
    </div>
  `).join("");
}

// =========================
// 🚀 INIT
// =========================

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await enableMultiTabIndexedDbPersistence(db);
  } catch (e) {
    console.warn("Offline non activé");
  }

  // 🔥 IMPORTANT : attendre avant synchro
  setTimeout(() => {
    startRealtimeSync();
  }, 800);
});