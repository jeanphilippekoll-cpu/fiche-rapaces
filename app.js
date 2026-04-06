import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8VfPlBsxN0F8PexqFfOaU4_slFQU3qsA",
  authDomain: "fiche-rapaces.firebaseapp.com",
  projectId: "fiche-rapaces",
  storageBucket: "fiche-rapaces.firebasestorage.app",
  messagingSenderId: "881543403206",
  appId: "1:881543403206:web:17915a78ddbbde9a1929c7"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const statusEl = document.getElementById("status");
const syncBadgeEl = document.getElementById("syncBadge");

let appData = {
  oiseaux: [],
  encodages: [],
  documents: [],
  nourrissage: [],
  stock: {}
};

function safe(v) {
  return (v ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeAttr(v) {
  return safe(v).replaceAll('"', "&quot;");
}

function formatDisplayDate(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("fr-BE");
  return String(value);
}

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function setSyncBadge(label, type = "saved") {
  if (!syncBadgeEl) return;
  syncBadgeEl.textContent = label;
  syncBadgeEl.className = "sync-badge";
  if (type === "online") syncBadgeEl.classList.add("sync-online");
  else if (type === "offline") syncBadgeEl.classList.add("sync-offline");
  else if (type === "saving") syncBadgeEl.classList.add("sync-saving");
  else if (type === "saved") syncBadgeEl.classList.add("sync-saved");
  else if (type === "error") syncBadgeEl.classList.add("sync-error");
}

function showSection(section) {
  document.querySelectorAll(".section").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".nav button").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`section-${section}`)?.classList.remove("hidden");
  document.getElementById(`btn-${section}`)?.classList.add("active");
}

function renderStats() {
  const statOiseaux = document.getElementById("statOiseaux");
  const statPesees = document.getElementById("statPesees");
  const statDocuments = document.getElementById("statDocuments");
  const statNourrissages = document.getElementById("statNourrissages");

  if (statOiseaux) statOiseaux.textContent = appData.oiseaux.length;
  if (statPesees) statPesees.textContent = appData.encodages.length;
  if (statDocuments) statDocuments.textContent = appData.documents.length;
  if (statNourrissages) statNourrissages.textContent = appData.nourrissage.length;
}

function renderOiseaux() {
  const zone = document.getElementById("listeOiseaux");
  if (!zone) return;

  if (!appData.oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau.</p>`;
    return;
  }

  zone.innerHTML = appData.oiseaux.map((oiseau) => `
    <div class="item">
      <h3>${safe(oiseau.nom)}</h3>
      ${oiseau?.photo?.url ? `<img src="${safeAttr(oiseau.photo.url)}" alt="${safeAttr(oiseau.nom)}" class="bird-photo">` : ""}
      <p><strong>Espèce :</strong> ${safe(oiseau.espece || "-")}</p>
      <p><strong>Poids actuel :</strong> ${safe(oiseau.poidsActuel || "-")}</p>

      <div class="card-section">
        <h4>Documents liés</h4>
        ${
          Array.isArray(oiseau.documents) && oiseau.documents.length
            ? oiseau.documents.map((d) => `
              <p>
                <a class="doc-link" href="${safeAttr(d.url || "")}" target="_blank" rel="noopener noreferrer">
                  ${safe(d.name || "Document")}
                </a>
              </p>
            `).join("")
            : `<p class="muted-line">Aucun document</p>`
        }
      </div>

      <div class="card-section">
        <h4>Historique poids</h4>
        ${
          Array.isArray(oiseau.historiquePoids) && oiseau.historiquePoids.length
            ? `
              <div class="feed-table-wrap">
                <table class="feed-table simple-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Poids</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${oiseau.historiquePoids
                      .slice()
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                      .map((h) => `
                        <tr>
                          <td>${safe(formatDisplayDate(h.date))}</td>
                          <td>${safe(h.poids)}</td>
                        </tr>
                      `).join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<p class="muted-line">Aucun poids</p>`
        }
      </div>
    </div>
  `).join("");
}

function renderPesees() {
  const zone = document.getElementById("listePesees");
  if (!zone) return;

  zone.innerHTML = appData.encodages.length
    ? appData.encodages
        .slice()
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .map((item) => `
          <div class="item">
            <p><strong>Date :</strong> ${safe(formatDisplayDate(item.date))}</p>
            <p><strong>Nom :</strong> ${safe(item.nom)}</p>
            <p><strong>Poids :</strong> ${safe(item.poids)}</p>
            <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
          </div>
        `).join("")
    : `<p class="muted-line">Aucun encodage.</p>`;
}

function renderDocuments() {
  const zone = document.getElementById("listeDocuments");
  if (!zone) return;

  if (!appData.documents.length) {
    zone.innerHTML = `<p class="muted-line">Aucun document général.</p>`;
    return;
  }

  zone.innerHTML = appData.documents.map((docItem) => `
    <div class="item">
      <h3>${safe(docItem.titre || docItem.nom || "Document")}</h3>
      <p><strong>Type :</strong> ${safe(docItem.type || "-")}</p>
      <p><strong>Description :</strong> ${safe(docItem.description || "-")}</p>
      ${
        docItem.lien || docItem.url
          ? `<p><a class="doc-link" href="${safeAttr(docItem.lien || docItem.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le document</a></p>`
          : ""
      }
    </div>
  `).join("");
}

function renderNourrissage() {
  const zone = document.getElementById("listeNourrissage");
  const summaryZone = document.getElementById("feedSummaryZone");
  const tableZone = document.getElementById("feedTableZone");

  if (tableZone) {
    tableZone.innerHTML = `<p class="muted-line">Lecture seule temporaire.</p>`;
  }

  if (summaryZone) {
    summaryZone.innerHTML = `<p class="muted-line">Lecture seule temporaire.</p>`;
  }

  if (!zone) return;

  if (!appData.nourrissage.length) {
    zone.innerHTML = `<div class="card"><p class="muted-line">Aucun nourrissage.</p></div>`;
    return;
  }

  zone.innerHTML = appData.nourrissage
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((item) => `
      <div class="card">
        <p><strong>Date :</strong> ${safe(formatDisplayDate(item.date))}</p>
        <p><strong>Oiseau :</strong> ${safe(item.oiseau || item.nom)}</p>
        <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
        <p><strong>Quantité :</strong> ${safe(item.quantite)}</p>
        <p><strong>Remarques :</strong> ${safe(item.remarques || "-")}</p>
      </div>
    `).join("");
}

function renderStock() {
  const map = {
    boitePoussinsMoyenne225: "stockBoitePoussinsMoyenne225",
    poussin: "stockPoussin",
    caille: "stockCaille",
    pigeon: "stockPigeon",
    lapin: "stockLapin",
    poisson: "stockPoisson",
    souris: "stockSouris",
    cailleteau30gr: "stockCailleteau30gr"
  };

  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.value = appData.stock?.[key] ?? 0;
  });

  const stockAjouterBoitesPoussins = document.getElementById("stockAjouterBoitesPoussins");
  if (stockAjouterBoitesPoussins) stockAjouterBoitesPoussins.value = "";
}

function renderAll() {
  renderStats();
  renderOiseaux();
  renderPesees();
  renderDocuments();
  renderNourrissage();
  renderStock();
}

window.showSection = showSection;
window.saveData = () => {
  alert("Sauvegarde désactivée temporairement.");
};
window.ajouterOiseau = () => alert("Ajout désactivé temporairement.");
window.modifierOiseau = () => alert("Modification désactivée temporairement.");
window.cancelEditBird = () => {};
window.ajouterPesee = () => alert("Ajout désactivé temporairement.");
window.ajouterDocument = () => alert("Ajout désactivé temporairement.");
window.ajouterNourrissage = () => alert("Ajout désactivé temporairement.");
window.appliquerNourritureHabituelle = () => {};
window.viderTableNourrissage = () => {};
window.enregistrerStock = () => alert("Modification désactivée temporairement.");
window.supprimerOiseau = () => alert("Suppression désactivée temporairement.");
window.supprimerDocument = () => alert("Suppression désactivée temporairement.");
window.exportBirdPdf = () => alert("PDF désactivé temporairement.");

document.addEventListener("DOMContentLoaded", async () => {
  showSection("accueil");
  setStatus("Lecture Firestore…");
  setSyncBadge("Lecture…", "saving");

  try {
    const snap = await getDoc(doc(db, "rapaces", "data"));

    if (!snap.exists()) {
      setStatus("Document rapaces/data introuvable");
      setSyncBadge("Introuvable", "error");
      return;
    }

    rawRapacesData = snap.data();

    appData = {
      oiseaux: Array.isArray(rawRapacesData.oiseaux) ? rawRapacesData.oiseaux : [],
      encodages: Array.isArray(rawRapacesData.encodages) ? rawRapacesData.encodages : [],
      documents: Array.isArray(rawRapacesData.documents) ? rawRapacesData.documents : [],
      nourrissage: Array.isArray(rawRapacesData.nourrissage) ? rawRapacesData.nourrissage : [],
      stock: rawRapacesData.stock || {}
    };

    renderAll();
    setStatus("Données chargées");
    setSyncBadge("Lecture seule", "saved");
    console.log("DATA FIRESTORE", rawRapacesData);
  } catch (e) {
    console.error(e);
    setStatus("Erreur lecture Firestore");
    setSyncBadge("Erreur", "error");
  }
});