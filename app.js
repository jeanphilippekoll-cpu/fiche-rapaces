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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const statusEl = document.getElementById("status");
const syncBadgeEl = document.getElementById("syncBadge");

let rawRapacesData = {};

let appData = {
  oiseaux: [],
  encodages: [],
  documents: [],
  nourrissage: [],
  stock: {}
};

const ALIMENTS = [
  "Poussin",
  "Caille",
  "Pigeon",
  "Lapin",
  "Poisson",
  "Souris",
  "Cailleteau 30gr"
];

function safe(v) {
  return (v ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeAttr(v) {
  return safe(v).replaceAll('"', "&quot;");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setSyncBadge(text, cls = "sync-saved") {
  if (!syncBadgeEl) return;
  syncBadgeEl.textContent = text;
  syncBadgeEl.className = `sync-badge ${cls}`;
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

  if (statOiseaux) statOiseaux.textContent = appData.oiseaux.length || 0;
  if (statPesees) statPesees.textContent = appData.encodages.length || 0;
  if (statDocuments) statDocuments.textContent = appData.documents.length || 0;
  if (statNourrissages) statNourrissages.textContent = appData.nourrissage.length || 0;
}

function renderOiseaux() {
  const zone = document.getElementById("listeOiseaux");
  if (!zone) return;

  if (!appData.oiseaux.length) {
    zone.innerHTML = "<p>Aucun oiseau.</p>";
    return;
  }

  zone.innerHTML = appData.oiseaux.map((o) => `
    <div class="item">
      <h3>${safe(o.nom || "")}</h3>
      ${o?.photo?.url ? `<p><img src="${safeAttr(o.photo.url)}" alt="${safeAttr(o.nom || "")}" class="bird-photo"></p>` : ""}
      <p><strong>Espèce :</strong> ${safe(o.espece || "")}</p>
      <p><strong>Poids actuel :</strong> ${safe(o.poidsActuel || "")}</p>

      <div class="card-section">
        <h4>Documents</h4>
        ${
          Array.isArray(o.documents) && o.documents.length
            ? o.documents.map((d) => `
                <p>
                  <a class="doc-link" href="${safeAttr(d.url || "")}" target="_blank" rel="noopener noreferrer">
                    ${safe(d.name || "Document")}
                  </a>
                </p>
              `).join("")
            : "<p>Aucun document.</p>"
        }
      </div>

      <div class="card-section">
        <h4>Historique poids</h4>
        ${
          Array.isArray(o.historiquePoids) && o.historiquePoids.length
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
                    ${o.historiquePoids
                      .slice()
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                      .map((h) => `
                        <tr>
                          <td>${safe(formatDate(h.date || ""))}</td>
                          <td>${safe(h.poids || "")}</td>
                        </tr>
                      `).join("")}
                  </tbody>
                </table>
              </div>
            `
            : "<p>Aucun poids.</p>"
        }
      </div>
    </div>
  `).join("");
}

function renderPesees() {
  const zone = document.getElementById("listePesees");
  if (!zone) return;

  if (!appData.encodages.length) {
    zone.innerHTML = "<p>Aucun encodage.</p>";
    return;
  }

  zone.innerHTML = appData.encodages
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((e) => `
      <div class="item">
        <p><strong>Date :</strong> ${safe(formatDate(e.date || ""))}</p>
        <p><strong>Nom :</strong> ${safe(e.nom || "")}</p>
        <p><strong>Poids :</strong> ${safe(e.poids || "")}</p>
        <p><strong>Nourriture :</strong> ${safe(e.nourriture || "")}</p>
      </div>
    `).join("");
}

function renderDocuments() {
  const zone = document.getElementById("listeDocuments");
  if (!zone) return;

  if (!appData.documents.length) {
    zone.innerHTML = "<p>Aucun document.</p>";
    return;
  }

  zone.innerHTML = appData.documents.map((d) => `
    <div class="item">
      <h3>${safe(d.titre || d.nom || "Document")}</h3>
      <p><strong>Type :</strong> ${safe(d.type || "")}</p>
      <p><strong>Description :</strong> ${safe(d.description || "")}</p>
      ${(d.lien || d.url) ? `<p><a class="doc-link" href="${safeAttr(d.lien || d.url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a></p>` : ""}
    </div>
  `).join("");
}

function getFoodOptions(selectedValue = "") {
  const first = `<option value="">Choisir</option>`;
  const others = ALIMENTS.map((food) => `
    <option value="${safeAttr(food)}" ${food === selectedValue ? "selected" : ""}>${safe(food)}</option>
  `).join("");
  return first + others;
}

function renderNourrissageTable() {
  const zone = document.getElementById("feedTableZone");
  if (!zone) return;

  if (!appData.oiseaux.length) {
    zone.innerHTML = "<p>Aucun oiseau.</p>";
    return;
  }

  zone.innerHTML = `
    <div class="feed-table-wrap">
      <table class="feed-table">
        <thead>
          <tr>
            <th>Oiseau</th>
            <th>Espèce</th>
            <th>Nourriture 1</th>
            <th>Qté 1</th>
            <th>Nourriture 2</th>
            <th>Qté 2</th>
          </tr>
        </thead>
        <tbody>
          ${appData.oiseaux.map((o, index) => `
            <tr>
              <td><strong>${safe(o.nom || "")}</strong></td>
              <td>${safe(o.espece || "")}</td>
              <td>
                <select>
                  ${getFoodOptions(index === 0 ? "Poussin" : "")}
                </select>
              </td>
              <td>
                <input type="number" min="0" step="1" placeholder="0">
              </td>
              <td>
                <select>
                  ${getFoodOptions("")}
                </select>
              </td>
              <td>
                <input type="number" min="0" step="1" placeholder="0">
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted-line">Tableau nourrissage oiseau par oiseau ajouté. Version lecture seule pour ne rien casser.</p>
  `;
}

function renderNourrissageHistory() {
  const zone = document.getElementById("listeNourrissage");
  if (!zone) return;

  if (!appData.nourrissage.length) {
    zone.innerHTML = "<p>Aucun nourrissage.</p>";
    return;
  }

  zone.innerHTML = appData.nourrissage
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((n) => `
      <div class="item">
        <p><strong>Date :</strong> ${safe(formatDate(n.date || ""))}</p>
        <p><strong>Oiseau :</strong> ${safe(n.oiseau || n.nom || "")}</p>
        <p><strong>Nourriture :</strong> ${safe(n.nourriture || "")}</p>
        <p><strong>Quantité :</strong> ${safe(n.quantite || "")}</p>
        <p><strong>Remarques :</strong> ${safe(n.remarques || "")}</p>
      </div>
    `).join("");
}

function renderNourrissageSummary() {
  const zone = document.getElementById("feedSummaryZone");
  if (!zone) return;

  zone.innerHTML = `
    <div class="item">
      <p><strong>Mode actuel :</strong> lecture seule</p>
      <p>Le tableau nourrissage par oiseau est affiché sans encore enregistrer, pour éviter de casser l’app.</p>
    </div>
  `;
}

function renderNourrissage() {
  renderNourrissageTable();
  renderNourrissageSummary();
  renderNourrissageHistory();
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
window.saveData = () => alert("Sauvegarde désactivée temporairement.");
window.ajouterOiseau = () => alert("Ajout désactivé temporairement.");
window.modifierOiseau = () => alert("Modification désactivée temporairement.");
window.cancelEditBird = () => {};
window.ajouterPesee = () => alert("Ajout désactivé temporairement.");
window.ajouterDocument = () => alert("Ajout désactivé temporairement.");
window.ajouterNourrissage = () => alert("Enregistrement nourrissage pas encore activé.");
window.appliquerNourritureHabituelle = () => {};
window.viderTableNourrissage = () => {};
window.enregistrerStock = () => alert("Modification désactivée temporairement.");
window.supprimerOiseau = () => alert("Suppression désactivée temporairement.");
window.supprimerDocument = () => alert("Suppression désactivée temporairement.");
window.exportBirdPdf = () => alert("PDF désactivé temporairement.");

document.addEventListener("DOMContentLoaded", async () => {
  showSection("accueil");
  setStatus("Lecture Firestore…");
  setSyncBadge("Lecture…", "sync-saving");

  try {
    const snap = await getDoc(doc(db, "rapaces", "data"));

    if (!snap.exists()) {
      setStatus("Document rapaces/data introuvable");
      setSyncBadge("Introuvable", "sync-error");
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
    setSyncBadge("Lecture seule", "sync-saved");
    console.log("DATA FIRESTORE", rawRapacesData);
  } catch (e) {
    console.error(e);
    setStatus("Erreur lecture Firestore");
    setSyncBadge("Erreur", "sync-error");
  }
});