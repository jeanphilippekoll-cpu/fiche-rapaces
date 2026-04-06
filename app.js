import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "TON_API_KEY",
  authDomain: "TON_PROJET.firebaseapp.com",
  projectId: "TON_PROJECT_ID",
  storageBucket: "TON_PROJET.firebasestorage.app",
  messagingSenderId: "TON_MESSAGING_SENDER_ID",
  appId: "TON_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1) document principal
const mainRef = doc(db, "rapaces", "data");

// 2) document user
const userRef = doc(db, "users", "dQPT9eD5g2c7FkjCb86pJnqh4qF3");

console.log("Firebase initialisé OK");
console.log("URL actuelle :", window.location.href);
console.log("En ligne :", navigator.onLine);

const statusEl = document.getElementById("status");
const syncBadge = document.getElementById("syncBadge");
const offlineMessage = document.getElementById("offlineMessage");

const state = {
  documents: [],
  documentsGeneraux: [],
  encodages: [],
  nourrissage: [],
  oiseaux: [],
  stock: {
    boitePoussinsMoyenne225: 0,
    caille: 0,
    cailleteau30gr: 0,
    lapin: 0,
    pigeon: 0,
    poisson: 0,
    poussin: 0,
    souris: 0
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

function showOfflineMessage(show) {
  if (!offlineMessage) return;
  offlineMessage.classList.toggle("hidden", !show);
}

window.showSection = function (sectionName) {
  const sections = ["accueil", "oiseaux", "pesee", "documents", "nourrissage", "stock"];
  sections.forEach((name) => {
    const section = document.getElementById(`section-${name}`);
    const button = document.getElementById(`btn-${name}`);
    if (section) section.classList.toggle("hidden", name !== sectionName);
    if (button) button.classList.toggle("active", name === sectionName);
  });
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePhotoUrl(photo) {
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  if (typeof photo.url === "string") return photo.url;
  if (photo.url && typeof photo.url.url === "string") return photo.url.url;
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compareDateDesc(a, b) {
  return String(b?.date || "").localeCompare(String(a?.date || ""));
}

function renderAccueil() {
  document.getElementById("statOiseaux").textContent = state.oiseaux.length;
  document.getElementById("statPesees").textContent = state.encodages.length;
  document.getElementById("statDocuments").textContent = state.documents.length;
  document.getElementById("statNourrissages").textContent = state.nourrissage.length;
}

function renderDocuments() {
  const zone = document.getElementById("listeDocuments");
  if (!zone) return;

  if (!state.documents.length) {
    zone.innerHTML = `<div class="item"><p>Aucun document général.</p></div>`;
    return;
  }

  zone.innerHTML = state.documents.map((docItem) => `
    <div class="item">
      <p><strong>${escapeHtml(docItem.nom || "Document")}</strong></p>
      <a class="doc-link" href="${escapeHtml(docItem.lien || "#")}" target="_blank" rel="noopener noreferrer">Ouvrir le document</a>
    </div>
  `).join("");
}

function renderPesees() {
  const zone = document.getElementById("listePesees");
  if (!zone) return;

  const items = [...state.encodages].sort(compareDateDesc);

  if (!items.length) {
    zone.innerHTML = `<div class="item"><p>Aucune pesée enregistrée.</p></div>`;
    return;
  }

  zone.innerHTML = items.map((p) => `
    <div class="item">
      <p><strong>${escapeHtml(p.nom || "Sans nom")}</strong></p>
      <p><strong>Date :</strong> ${escapeHtml(p.date || "")}</p>
      <p><strong>Poids :</strong> ${escapeHtml(p.poids || "")} g</p>
      <p><strong>Espèce :</strong> ${escapeHtml(p.espece || "")}</p>
      <p><strong>État :</strong> ${escapeHtml(p.etat || "")}</p>
      <p><strong>Lieu :</strong> ${escapeHtml(p.lieu || "")}</p>
      <p><strong>Nourriture :</strong> ${escapeHtml(p.nourriture || "")}</p>
      <p><strong>Observations :</strong> ${escapeHtml(p.observations || "")}</p>
    </div>
  `).join("");
}

function renderNourrissage() {
  const zone = document.getElementById("listeNourrissage");
  const summaryZone = document.getElementById("feedSummaryZone");
  if (!zone || !summaryZone) return;

  const items = [...state.nourrissage].sort(compareDateDesc);

  if (!items.length) {
    zone.innerHTML = `<div class="item"><p>Aucun nourrissage enregistré.</p></div>`;
    summaryZone.innerHTML = `<div class="item"><p>Aucun résumé disponible.</p></div>`;
    return;
  }

  zone.innerHTML = items.map((n) => `
    <div class="item">
      <p><strong>${escapeHtml(n.oiseau || "Sans nom")}</strong></p>
      <p><strong>Date :</strong> ${escapeHtml(n.date || "")}</p>
      <p><strong>Nourriture :</strong> ${escapeHtml(n.nourriture || "")}</p>
      <p><strong>Quantité :</strong> ${Number(n.quantite || 0)}</p>
      <p><strong>Remarques :</strong> ${escapeHtml(n.remarques || "")}</p>
    </div>
  `).join("");

  const grouped = {};
  items.forEach((n) => {
    const date = n.date || "Sans date";
    if (!grouped[date]) grouped[date] = { total: 0, lignes: 0 };
    grouped[date].total += Number(n.quantite || 0);
    grouped[date].lignes += 1;
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  summaryZone.innerHTML = `
    <div class="summary-grid">
      ${sortedDates.map((date) => `
        <div class="summary-card">
          <div>${escapeHtml(date)}</div>
          <div class="summary-total">${grouped[date].total}</div>
          <div class="muted-line">${grouped[date].lignes} lignes de nourrissage</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOiseaux() {
  const zone = document.getElementById("listeOiseaux");
  if (!zone) return;

  console.log("state.oiseaux =", state.oiseaux);

  if (!Array.isArray(state.oiseaux) || !state.oiseaux.length) {
    zone.innerHTML = `<div class="item"><p>Aucun oiseau enregistré.</p></div>`;
    return;
  }

  zone.innerHTML = `
    <div class="bird-grid">
      ${state.oiseaux.map((oiseau, index) => {
        const photoUrl = normalizePhotoUrl(oiseau?.photo);
        const docs = Array.isArray(oiseau?.documents) ? oiseau.documents : [];
        const historique = Array.isArray(oiseau?.historiquePoids) ? oiseau.historiquePoids : [];

        return `
          <div class="bird-card">
            <h3>${escapeHtml(oiseau?.nom || `Oiseau ${index + 1}`)}</h3>

            ${photoUrl
              ? `<img class="bird-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(oiseau?.nom || "Oiseau")}">`
              : `<div class="bird-photo-placeholder">Pas de photo</div>`
            }

            <div class="bird-meta">
              <div><span>Espèce</span>${escapeHtml(oiseau?.espece || "")}</div>
              <div><span>Sexe</span>${escapeHtml(oiseau?.sexe || "")}</div>
              <div><span>Âge</span>${escapeHtml(oiseau?.age || "")}</div>
              <div><span>Poids actuel</span>${escapeHtml(oiseau?.poidsActuel || "")}</div>
              <div><span>Nourriture 1</span>${escapeHtml(oiseau?.nourritureHabituelle || "")}</div>
              <div><span>Quantité 1</span>${Number(oiseau?.quantiteHabituelle || 0)}</div>
              <div><span>Nourriture 2</span>${escapeHtml(oiseau?.nourritureHabituelle2 || "")}</div>
              <div><span>Quantité 2</span>${Number(oiseau?.quantiteHabituelle2 || 0)}</div>
            </div>

            <div class="item">
              <p><strong>Notes :</strong> ${escapeHtml(oiseau?.notes || "")}</p>
            </div>

            <div class="item">
              <p><strong>Documents :</strong></p>
              ${docs.length
                ? docs.map((d) => `
                    <a class="doc-link" href="${escapeHtml(d?.url || "#")}" target="_blank" rel="noopener noreferrer">
                      ${escapeHtml(d?.name || d?.nom || "Document")}
                    </a>
                  `).join("")
                : `<p class="muted-line">Aucun document</p>`
              }
            </div>

            <div class="item">
              <p><strong>Historique poids :</strong></p>
              ${historique.length
                ? historique.map((h) => `
                    <p>${escapeHtml(h?.date || "")} — ${escapeHtml(h?.poids || "")} g</p>
                  `).join("")
                : `<p class="muted-line">Aucun historique</p>`
              }
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderStock() {
  const zone = document.getElementById("stockResume");
  if (!zone) return;

  const s = state.stock;

  zone.innerHTML = `
    <div class="item"><strong>Boîtes poussins (225) :</strong> ${Number(s.boitePoussinsMoyenne225 || 0)}</div>
    <div class="item"><strong>Poussins :</strong> ${Number(s.poussin || 0)}</div>
    <div class="item"><strong>Cailles :</strong> ${Number(s.caille || 0)}</div>
    <div class="item"><strong>Pigeons :</strong> ${Number(s.pigeon || 0)}</div>
    <div class="item"><strong>Lapins :</strong> ${Number(s.lapin || 0)}</div>
    <div class="item"><strong>Poissons :</strong> ${Number(s.poisson || 0)}</div>
    <div class="item"><strong>Souris :</strong> ${Number(s.souris || 0)}</div>
    <div class="item"><strong>Cailleteau 30gr :</strong> ${Number(s.cailleteau30gr || 0)}</div>
  `;

  document.getElementById("stockBoitePoussinsMoyenne225").value = Number(s.boitePoussinsMoyenne225 || 0);
  document.getElementById("stockPoussin").value = Number(s.poussin || 0);
  document.getElementById("stockCaille").value = Number(s.caille || 0);
  document.getElementById("stockPigeon").value = Number(s.pigeon || 0);
  document.getElementById("stockLapin").value = Number(s.lapin || 0);
  document.getElementById("stockPoisson").value = Number(s.poisson || 0);
  document.getElementById("stockSouris").value = Number(s.souris || 0);
  document.getElementById("stockCailleteau30gr").value = Number(s.cailleteau30gr || 0);
}

function renderAll() {
  renderAccueil();
  renderDocuments();
  renderPesees();
  renderNourrissage();
  renderOiseaux();
  renderStock();
}

async function chargerData() {
  const [mainSnap, userSnap] = await Promise.all([
    getDoc(mainRef),
    getDoc(userRef)
  ]);

  if (!mainSnap.exists()) {
    throw new Error("Document principal rapaces/data introuvable");
  }

  const mainData = mainSnap.data();
  const userData = userSnap.exists() ? userSnap.data() : {};

  console.log("mainData =", mainData);
  console.log("userData =", userData);

  // oiseaux, stock et docs généraux depuis rapaces/data
  state.oiseaux = safeArray(mainData.oiseaux);
  state.documents = safeArray(mainData.documents);
  state.documentsGeneraux = safeArray(mainData.documentsGeneraux);
  state.stock = {
    boitePoussinsMoyenne225: Number(mainData.stock?.boitePoussinsMoyenne225 || 0),
    caille: Number(mainData.stock?.caille || 0),
    cailleteau30gr: Number(mainData.stock?.cailleteau30gr || 0),
    lapin: Number(mainData.stock?.lapin || 0),
    pigeon: Number(mainData.stock?.pigeon || 0),
    poisson: Number(mainData.stock?.poisson || 0),
    poussin: Number(mainData.stock?.poussin || 0),
    souris: Number(mainData.stock?.souris || 0)
  };

  // encodages et nourrissage depuis users/...
  state.encodages = safeArray(userData.encodages);
  state.nourrissage = safeArray(userData.nourrissage);

  console.log("Oiseaux chargés :", state.oiseaux.length);
  console.log("Encodages chargés :", state.encodages.length);
  console.log("Nourrissages chargés :", state.nourrissage.length);
}

window.enregistrerStock = async function () {
  state.stock = {
    boitePoussinsMoyenne225: Number(document.getElementById("stockBoitePoussinsMoyenne225").value || 0),
    caille: Number(document.getElementById("stockCaille").value || 0),
    cailleteau30gr: Number(document.getElementById("stockCailleteau30gr").value || 0),
    lapin: Number(document.getElementById("stockLapin").value || 0),
    pigeon: Number(document.getElementById("stockPigeon").value || 0),
    poisson: Number(document.getElementById("stockPoisson").value || 0),
    poussin: Number(document.getElementById("stockPoussin").value || 0),
    souris: Number(document.getElementById("stockSouris").value || 0)
  };

  try {
    setBadge("Sauvegarde…", "sync-saving");
    await saveData();
    renderStock();
    setStatus("Stock enregistré.");
    setBadge("Sauvegardé", "sync-saved");
  } catch (error) {
    console.error("Erreur enregistrement stock :", error);
    setStatus("Erreur lors de l'enregistrement du stock.");
    setBadge("Erreur", "sync-error");
  }
};

window.saveData = async function () {
  // On sauve seulement rapaces/data ici
  const payload = {
    documents: state.documents,
    documentsGeneraux: state.documentsGeneraux,
    oiseaux: state.oiseaux,
    stock: state.stock
  };

  await setDoc(mainRef, payload, { merge: true });
};

async function initApp() {
  try {
    setStatus("Connexion à Firebase…");
    setBadge("Lecture…", "sync-online");
    showOfflineMessage(false);

    await chargerData();
    renderAll();

    setStatus("Application chargée.");
    setBadge("Connecté", "sync-online");
  } catch (error) {
    console.error("Erreur initApp :", error);
    const message = String(error?.message || "");

    if (message.includes("client is offline")) {
      setStatus("Firestore hors ligne. Ouvre le vrai site GitHub Pages et vide le cache.");
      setBadge("Hors ligne", "sync-error");
      showOfflineMessage(true);
      return;
    }

    setStatus("Erreur de chargement Firebase.");
    setBadge("Erreur", "sync-error");
  }
}

window.addEventListener("online", () => {
  setStatus("Connexion revenue.");
  setBadge("Connecté", "sync-online");
  showOfflineMessage(false);
});

window.addEventListener("offline", () => {
  setStatus("Navigateur hors ligne.");
  setBadge("Hors ligne", "sync-error");
  showOfflineMessage(true);
});

initApp();