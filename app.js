import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "TON_API_KEY",
  authDomain: "TON_PROJET.firebaseapp.com",
  projectId: "TON_PROJECT_ID",
  storageBucket: "TON_PROJET.appspot.com",
  messagingSenderId: "TON_MESSAGING_SENDER_ID",
  appId: "TON_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log("Firebase initialisé OK");

const statusEl = document.getElementById("status");
const syncBadge = document.getElementById("syncBadge");

const state = {
  oiseaux: [],
  stock: {
    poussin: 0,
    caille: 0,
    pigeon: 0,
    lapin: 0
  }
};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setBadge(text, type = "sync-saving") {
  if (!syncBadge) return;
  syncBadge.className = `sync-badge ${type}`;
  syncBadge.textContent = text;
}

window.showSection = function (sectionName) {
  const sections = ["accueil", "oiseaux", "stock"];
  sections.forEach((name) => {
    document.getElementById(`section-${name}`).classList.toggle("hidden", name !== sectionName);
    document.getElementById(`btn-${name}`).classList.toggle("active", name === sectionName);
  });
};

function renderAccueil() {
  document.getElementById("statOiseaux").textContent = state.oiseaux.length;
  document.getElementById("statStock").textContent = Object.keys(state.stock).length;
}

function renderOiseaux() {
  const zone = document.getElementById("listeOiseaux");

  if (!state.oiseaux.length) {
    zone.innerHTML = `<div class="item"><p>Aucun oiseau enregistré.</p></div>`;
    return;
  }

  zone.innerHTML = state.oiseaux.map((oiseau) => `
    <div class="item">
      <p><strong>Nom :</strong> ${escapeHtml(oiseau.nom)}</p>
      <p><strong>Espèce :</strong> ${escapeHtml(oiseau.espece)}</p>
      <p><strong>Poids :</strong> ${oiseau.poids} g</p>
      <button class="btn" onclick="deleteBird('${oiseau.id}')">Supprimer</button>
    </div>
  `).join("");
}

function renderStock() {
  const zone = document.getElementById("stockResume");
  zone.innerHTML = `
    <div class="item"><strong>Poussins :</strong> ${state.stock.poussin}</div>
    <div class="item"><strong>Cailles :</strong> ${state.stock.caille}</div>
    <div class="item"><strong>Pigeons :</strong> ${state.stock.pigeon}</div>
    <div class="item"><strong>Lapins :</strong> ${state.stock.lapin}</div>
  `;

  document.getElementById("stockPoussin").value = state.stock.poussin;
  document.getElementById("stockCaille").value = state.stock.caille;
  document.getElementById("stockPigeon").value = state.stock.pigeon;
  document.getElementById("stockLapin").value = state.stock.lapin;
}

function renderAll() {
  renderAccueil();
  renderOiseaux();
  renderStock();
}

async function chargerStock() {
  const ref = doc(db, "appData", "stock");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    state.stock = {
      poussin: Number(snap.data().poussin || 0),
      caille: Number(snap.data().caille || 0),
      pigeon: Number(snap.data().pigeon || 0),
      lapin: Number(snap.data().lapin || 0)
    };
  }

  console.log("Stock chargé :", state.stock);
}

async function chargerOiseaux() {
  const snap = await getDocs(collection(db, "oiseaux"));
  state.oiseaux = snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));

  console.log("Oiseaux chargés :", state.oiseaux);
}

window.addBird = async function () {
  const nom = document.getElementById("birdName").value.trim();
  const espece = document.getElementById("birdSpecies").value.trim();
  const poids = Number(document.getElementById("birdWeight").value);

  if (!nom || !espece || !poids) {
    alert("Merci de remplir nom, espèce et poids.");
    return;
  }

  try {
    setBadge("Sauvegarde…", "sync-saving");

    const docRef = await addDoc(collection(db, "oiseaux"), {
      nom,
      espece,
      poids,
      createdAt: new Date().toISOString()
    });

    state.oiseaux.push({
      id: docRef.id,
      nom,
      espece,
      poids
    });

    document.getElementById("birdName").value = "";
    document.getElementById("birdSpecies").value = "";
    document.getElementById("birdWeight").value = "";

    renderAll();
    setBadge("Sauvegardé", "sync-saved");
    setStatus("Oiseau ajouté avec succès.");
  } catch (error) {
    console.error("Erreur ajout oiseau :", error);
    setBadge("Erreur", "sync-error");
    setStatus("Erreur lors de l'ajout de l'oiseau.");
  }
};

window.deleteBird = async function (id) {
  try {
    setBadge("Suppression…", "sync-saving");

    await deleteDoc(doc(db, "oiseaux", id));
    state.oiseaux = state.oiseaux.filter((o) => o.id !== id);

    renderAll();
    setBadge("Sauvegardé", "sync-saved");
    setStatus("Oiseau supprimé.");
  } catch (error) {
    console.error("Erreur suppression oiseau :", error);
    setBadge("Erreur", "sync-error");
    setStatus("Erreur lors de la suppression.");
  }
};

window.enregistrerStock = async function () {
  const stock = {
    poussin: Number(document.getElementById("stockPoussin").value || 0),
    caille: Number(document.getElementById("stockCaille").value || 0),
    pigeon: Number(document.getElementById("stockPigeon").value || 0),
    lapin: Number(document.getElementById("stockLapin").value || 0)
  };

  try {
    setBadge("Sauvegarde…", "sync-saving");

    await setDoc(doc(db, "appData", "stock"), stock);
    state.stock = stock;

    renderAll();
    setBadge("Sauvegardé", "sync-saved");
    setStatus("Stock enregistré avec succès.");
  } catch (error) {
    console.error("Erreur enregistrement stock :", error);
    setBadge("Erreur", "sync-error");
    setStatus("Erreur lors de l'enregistrement du stock.");
  }
};

window.saveData = async function () {
  try {
    setBadge("Sauvegarde…", "sync-saving");
    await setDoc(doc(db, "appData", "stock"), state.stock);
    setBadge("Sauvegardé", "sync-saved");
    setStatus("Sauvegarde manuelle OK.");
  } catch (error) {
    console.error("Erreur saveData :", error);
    setBadge("Erreur", "sync-error");
    setStatus("Erreur lors de la sauvegarde manuelle.");
  }
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initApp() {
  try {
    setStatus("Connexion à Firebase…");
    setBadge("Lecture…", "sync-online");

    await chargerStock();
    await chargerOiseaux();

    renderAll();

    setStatus("Application chargée.");
    setBadge("Connecté", "sync-online");
  } catch (error) {
    console.error("Erreur initApp :", error);
    setStatus("Erreur de chargement Firebase.");
    setBadge("Erreur", "sync-error");
  }
}

initApp();