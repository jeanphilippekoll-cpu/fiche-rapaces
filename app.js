import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  enableMultiTabIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

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
const storage = getStorage(firebaseApp);

const statusEl = document.getElementById("status");
const syncBadgeEl = document.getElementById("syncBadge");

const BOITE_POUSSIN_CAPACITE = 225;

const ALIMENTS = [
  "Poussin",
  "Caille",
  "Pigeon",
  "Lapin",
  "Poisson",
  "Souris",
  "Cailleteau 30gr"
];

let rawRapacesData = {};
let editingBirdId = null;
let autosaveTimer = null;
let autosaveEnabled = true;
let isSaving = false;

let appData = {
  oiseaux: [],
  pesees: [],
  documents: [],
  nourrissage: [],
  stock: {
    poussin: 0,
    caille: 0,
    pigeon: 0,
    lapin: 0,
    poisson: 0,
    souris: 0,
    cailleteau30gr: 0,
    boitePoussinsMoyenne225: 0
  }
};

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function safe(v) {
  return (v ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeAttr(v) {
  return safe(v).replaceAll('"', "&quot;");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
}

function setSyncBadge(label, type = "idle") {
  if (!syncBadgeEl) return;

  syncBadgeEl.textContent = label;
  syncBadgeEl.className = "sync-badge";

  if (type === "online") syncBadgeEl.classList.add("sync-online");
  else if (type === "offline") syncBadgeEl.classList.add("sync-offline");
  else if (type === "saving") syncBadgeEl.classList.add("sync-saving");
  else if (type === "saved") syncBadgeEl.classList.add("sync-saved");
  else if (type === "error") syncBadgeEl.classList.add("sync-error");
  else syncBadgeEl.classList.add("sync-saving");
}

function updateConnectivityStatus() {
  if (navigator.onLine) {
    setStatus("En ligne");
    setSyncBadge("En ligne", "online");
  } else {
    setStatus("Hors ligne — modifications gardées localement");
    setSyncBadge("Hors ligne", "offline");
  }
}

function scheduleAutoSave(delay = 1200) {
  if (!autosaveEnabled) return;

  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  setSyncBadge("Synchronisation…", "saving");

  autosaveTimer = setTimeout(async () => {
    await saveData(true);
  }, delay);
}

function formatDisplayDate(value) {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("fr-BE");
  }

  return String(value);
}

function formatDisplayMonth(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-");
    return `${month}/${year}`;
  }
  return value;
}

function normalizeFoodLabel(value) {
  return (value || "").trim().toLowerCase();
}

function foodToStockKey(food) {
  const key = normalizeFoodLabel(food);

  if (key === "poussin") return "poussin";
  if (key === "caille") return "caille";
  if (key === "pigeon") return "pigeon";
  if (key === "lapin") return "lapin";
  if (key === "poisson") return "poisson";
  if (key === "souris") return "souris";
  if (key === "cailleteau 30gr") return "cailleteau30gr";

  return null;
}

function computeBoitesFromPoussins(nbPoussins) {
  const qty = Math.max(0, toNumber(nbPoussins));
  return qty > 0 ? Math.ceil(qty / BOITE_POUSSIN_CAPACITE) : 0;
}

function syncBoitesFromPoussins() {
  appData.stock.boitePoussinsMoyenne225 = computeBoitesFromPoussins(appData.stock.poussin);
}

async function uploadFile(file, path) {
  if (!file) return "";
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}

function normalizeHistoriquePoids(list) {
  return safeArray(list).map((item) => ({
    date: item?.date || "",
    poids: item?.poids ?? ""
  }));
}

function normalizeDocumentsOiseau(list) {
  return safeArray(list).map((docItem) => ({
    name: docItem?.name || docItem?.nom || "Document",
    url: docItem?.url || docItem?.lien || ""
  }));
}

function normalizeNourrissage(list) {
  return safeArray(list).map((item, index) => ({
    id: item?.id || `feed_${index}_${makeId()}`,
    date: item?.date || "",
    oiseau: item?.oiseau || item?.nom || "",
    nourriture: item?.nourriture || "",
    quantite: toNumber(item?.quantite),
    remarques: item?.remarques || ""
  }));
}

function normalizeData(data) {
  const oiseauxSource = safeArray(data?.oiseaux);
  const peseesSource = safeArray(data?.encodages || data?.pesees);
  const documentsSource = safeArray(data?.documents);
  const documentsGenerauxSource = safeArray(data?.documentsGeneraux);
  const nourrissageSource = safeArray(data?.nourrissage);

  const oiseaux = oiseauxSource.map((o, index) => ({
    id: o.id || `oiseau_${index}_${makeId()}`,
    nom: o.nom || "",
    espece: o.espece || "",
    sexe: o.sexe || "",
    age: o.age || "",
    poidsActuel: o.poidsActuel ?? "",
    notes: o.notes || "",
    photoUrl: o?.photo?.url || o.photoUrl || o.photo || "",
    documents: normalizeDocumentsOiseau(o.documents),
    historiquePoids: normalizeHistoriquePoids(o.historiquePoids),
    nourritureHabituelle: o.nourritureHabituelle || "",
    quantiteHabituelle: toNumber(o.quantiteHabituelle),
    nourritureHabituelle2: o.nourritureHabituelle2 || "",
    quantiteHabituelle2: toNumber(o.quantiteHabituelle2),
    alerteBasse: o.alerteBasse || "",
    alerteHaute: o.alerteHaute || ""
  }));

  const pesees = peseesSource.map((e, index) => ({
    id: e.id || `pes_${index}_${makeId()}`,
    date: e.date || "",
    nom: e.nom || "",
    espece: e.espece || "",
    poids: e.poids ?? "",
    nourriture: e.nourriture || "",
    etat: e.etat || e.exercice || "",
    lieu: e.lieu || "",
    observations: e.observations || e.notes || ""
  }));

  const documents = [
    ...documentsSource.map((d) => ({
      id: d.id || makeId(),
      titre: d.titre || d.nom || "Document",
      type: d.type || "Document",
      description: d.description || "",
      lien: d.lien || d.url || ""
    })),
    ...documentsGenerauxSource.map((d) => ({
      id: d.id || makeId(),
      titre: d.titre || d.nom || "Document général",
      type: d.type || "Document général",
      description: d.description || "",
      lien: d.lien || d.url || ""
    }))
  ];

  const stock = {
    poussin: toNumber(data?.stock?.poussin),
    caille: toNumber(data?.stock?.caille),
    pigeon: toNumber(data?.stock?.pigeon),
    lapin: toNumber(data?.stock?.lapin),
    poisson: toNumber(data?.stock?.poisson),
    souris: toNumber(data?.stock?.souris),
    cailleteau30gr: toNumber(data?.stock?.cailleteau30gr),
    boitePoussinsMoyenne225: toNumber(data?.stock?.boitePoussinsMoyenne225)
  };

  if (stock.boitePoussinsMoyenne225 > 0 && stock.poussin === 0) {
    stock.poussin = stock.boitePoussinsMoyenne225 * BOITE_POUSSIN_CAPACITE;
  } else {
    stock.boitePoussinsMoyenne225 = computeBoitesFromPoussins(stock.poussin);
  }

  return {
    oiseaux,
    pesees,
    documents,
    nourrissage: normalizeNourrissage(nourrissageSource),
    stock
  };
}

function buildFirestorePayload() {
  const oldBirds = safeArray(rawRapacesData?.oiseaux);

  const oiseaux = appData.oiseaux.map((o) => {
    const ancien = oldBirds.find((b) => (b?.id || b?.nom || "") === (o.id || o.nom || ""));
    return {
      ...ancien,
      id: o.id,
      nom: o.nom || "",
      espece: o.espece || "",
      sexe: o.sexe || "",
      age: o.age || "",
      poidsActuel: o.poidsActuel ?? "",
      notes: o.notes || "",
      nourritureHabituelle: o.nourritureHabituelle || "",
      quantiteHabituelle: toNumber(o.quantiteHabituelle),
      nourritureHabituelle2: o.nourritureHabituelle2 || "",
      quantiteHabituelle2: toNumber(o.quantiteHabituelle2),
      photo: {
        ...(ancien?.photo || {}),
        url: o.photoUrl || ""
      },
      documents: safeArray(o.documents).map((d) => ({
        name: d?.name || "Document",
        url: d?.url || ""
      })),
      historiquePoids: safeArray(o.historiquePoids).map((h) => ({
        date: h?.date || "",
        poids: h?.poids ?? ""
      }))
    };
  });

  const encodages = appData.pesees.map((e) => ({
    date: e.date || "",
    nom: e.nom || "",
    poids: e.poids ?? "",
    nourriture: e.nourriture || "",
    espece: e.espece || "",
    etat: e.etat || "",
    lieu: e.lieu || "",
    observations: e.observations || ""
  }));

  const nourrissage = appData.nourrissage.map((n) => ({
    id: n.id || makeId(),
    date: n.date || "",
    oiseau: n.oiseau || "",
    nourriture: n.nourriture || "",
    quantite: toNumber(n.quantite),
    remarques: n.remarques || ""
  }));

  syncBoitesFromPoussins();

  return {
    ...rawRapacesData,
    oiseaux,
    encodages,
    nourrissage,
    stock: {
      poussin: toNumber(appData.stock.poussin),
      caille: toNumber(appData.stock.caille),
      pigeon: toNumber(appData.stock.pigeon),
      lapin: toNumber(appData.stock.lapin),
      poisson: toNumber(appData.stock.poisson),
      souris: toNumber(appData.stock.souris),
      cailleteau30gr: toNumber(appData.stock.cailleteau30gr),
      boitePoussinsMoyenne225: computeBoitesFromPoussins(appData.stock.poussin)
    },
    documents: rawRapacesData.documents || [],
    documentsGeneraux: rawRapacesData.documentsGeneraux || []
  };
}

function renderDocumentsOiseau(documents) {
  if (!documents.length) {
    return `<p class="muted-line">Aucun document lié.</p>`;
  }

  return `
    <div class="stack-list">
      ${documents.map((docItem) => `
        <a class="doc-link" href="${safeAttr(docItem.url)}" target="_blank" rel="noopener noreferrer">
          ${safe(docItem.name)}
        </a>
      `).join("")}
    </div>
  `;
}

function renderHistoriquePoidsTable(historique) {
  if (!historique.length) {
    return `<p class="muted-line">Aucun poids enregistré.</p>`;
  }

  return `
    <div class="feed-table-wrap">
      <table class="feed-table simple-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Poids (g)</th>
          </tr>
        </thead>
        <tbody>
          ${historique
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
  `;
}

function renderOiseaux() {
  const zone = document.getElementById("listeOiseaux");
  if (!zone) return;

  if (!appData.oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="bird-grid">
      ${appData.oiseaux.map((oiseau) => `
        <article class="bird-card">
          <div class="bird-card-head">
            <div>
              <h3>${safe(oiseau.nom)}</h3>
              <p class="bird-species">${safe(oiseau.espece || "Espèce non renseignée")}</p>
            </div>
            <div class="weight-pill">${safe(oiseau.poidsActuel || "-")} g</div>
          </div>

          ${oiseau.photoUrl ? `
            <img src="${safeAttr(oiseau.photoUrl)}" alt="${safeAttr(oiseau.nom)}" class="bird-photo">
          ` : `
            <div class="bird-photo-placeholder">Pas de photo</div>
          `}

          <div class="bird-meta">
            <div><span>Sexe</span><strong>${safe(oiseau.sexe || "-")}</strong></div>
            <div><span>Âge</span><strong>${safe(oiseau.age || "-")}</strong></div>
          </div>

          <div class="card-section">
            <h4>Notes</h4>
            <p>${safe(oiseau.notes || "Aucune note")}</p>
          </div>

          <div class="card-section">
            <h4>Nourriture habituelle</h4>
            <p>${safe(oiseau.nourritureHabituelle || "Non définie")} — ${safe(oiseau.quantiteHabituelle || 0)} pièce(s)</p>
            <p>${safe(oiseau.nourritureHabituelle2 || "Aucune")} ${oiseau.nourritureHabituelle2 ? "— " + safe(oiseau.quantiteHabituelle2 || 0) + " pièce(s)" : ""}</p>
          </div>

          <div class="card-section">
            <h4>Documents liés</h4>
            ${renderDocumentsOiseau(oiseau.documents)}
          </div>

          <div class="card-section">
            <h4>Poids enregistrés</h4>
            ${renderHistoriquePoidsTable([...oiseau.historiquePoids])}
          </div>

          <div class="small-actions">
            <button class="btn secondary-btn" onclick="modifierOiseau('${oiseau.id}')">Modifier</button>
            <button class="btn secondary-btn" onclick="exportBirdPdf('${oiseau.id}')">PDF</button>
            <button class="btn btn-danger" onclick="supprimerOiseau('${oiseau.id}')">Supprimer</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPesees() {
  const zone = document.getElementById("listePesees");
  if (!zone) return;
  zone.innerHTML = `<p class="muted-line">Les poids sont enregistrés directement dans la fiche de chaque oiseau.</p>`;
}

function renderDocuments() {
  const zone = document.getElementById("listeDocuments");
  if (!zone) return;

  if (!appData.documents.length) {
    zone.innerHTML = `<p class="muted-line">Aucun document général.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="list-grid">
      ${appData.documents.map((docItem) => `
        <div class="item">
          <h3>${safe(docItem.titre)}</h3>
          <p><strong>Type :</strong> ${safe(docItem.type)}</p>
          <p><strong>Description :</strong> ${safe(docItem.description)}</p>
          ${docItem.lien ? `<p><a class="doc-link" href="${safeAttr(docItem.lien)}" target="_blank" rel="noopener noreferrer">Ouvrir le document</a></p>` : ""}
          <div class="small-actions">
            <button class="btn btn-danger" onclick="supprimerDocument('${docItem.id}')">Supprimer</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function getFoodOptionsHtml(selected = "") {
  return `
    ${ALIMENTS.map((food) => `
      <option value="${safeAttr(food)}" ${food === selected ? "selected" : ""}>${safe(food)}</option>
    `).join("")}
  `;
}

function applyDefaultFoodForBird(birdId) {
  const food1 = document.getElementById(`feedFood1_${birdId}`);
  const qty1 = document.getElementById(`feedQty1_${birdId}`);

  if (!food1 || !qty1) return;

  const qtyValue = toNumber(qty1.value || 0);
  if (qtyValue > 0 && !food1.value) {
    food1.value = "Poussin";
  }
}

function ensureDefaultFoodSelections() {
  appData.oiseaux.forEach((oiseau) => {
    const food1 = document.getElementById(`feedFood1_${oiseau.id}`);
    if (food1 && !food1.value) {
      food1.value = "Poussin";
    }
  });
}

function attachFeedDefaultHandlers() {
  appData.oiseaux.forEach((oiseau) => {
    const qty1 = document.getElementById(`feedQty1_${oiseau.id}`);
    const food1 = document.getElementById(`feedFood1_${oiseau.id}`);

    if (qty1) {
      qty1.addEventListener("blur", () => applyDefaultFoodForBird(oiseau.id));
      qty1.addEventListener("change", () => applyDefaultFoodForBird(oiseau.id));
      qty1.addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
          applyDefaultFoodForBird(oiseau.id);
        }
      });
    }

    if (food1) {
      food1.addEventListener("blur", () => {
        if (!food1.value) food1.value = "Poussin";
      });
    }
  });
}

function renderNourrissageTable() {
  const zone = document.getElementById("feedTableZone");
  if (!zone) return;

  if (!appData.oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau disponible.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="feed-toolbar">
      <button class="btn secondary-btn" onclick="appliquerNourritureHabituelle()">Remplir avec nourriture habituelle</button>
      <button class="btn secondary-btn" onclick="viderTableNourrissage()">Vider le tableau</button>
    </div>

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
          ${appData.oiseaux.map((oiseau) => `
            <tr>
              <td>${safe(oiseau.nom)}</td>
              <td>${safe(oiseau.espece)}</td>
              <td>
                <select id="feedFood1_${safeAttr(oiseau.id)}">
                  ${getFoodOptionsHtml(oiseau.nourritureHabituelle || "Poussin")}
                </select>
              </td>
              <td>
                <input
                  id="feedQty1_${safeAttr(oiseau.id)}"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value="${oiseau.quantiteHabituelle > 0 ? safeAttr(oiseau.quantiteHabituelle) : ""}"
                >
              </td>
              <td>
                <select id="feedFood2_${safeAttr(oiseau.id)}">
                  ${getFoodOptionsHtml(oiseau.nourritureHabituelle2 || "")}
                </select>
              </td>
              <td>
                <input
                  id="feedQty2_${safeAttr(oiseau.id)}"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value="${oiseau.quantiteHabituelle2 > 0 ? safeAttr(oiseau.quantiteHabituelle2) : ""}"
                >
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  ensureDefaultFoodSelections();
  attachFeedDefaultHandlers();
}

function sameDay(dateA, dateB) {
  return dateA === dateB;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";

  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getMonthKey(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  return dateStr.slice(0, 7);
}

function aggregateFeeds(items) {
  const byFood = {};
  let total = 0;

  items.forEach((item) => {
    const food = item.nourriture || "Inconnu";
    const qty = toNumber(item.quantite);
    byFood[food] = (byFood[food] || 0) + qty;
    total += qty;
  });

  return { byFood, total };
}

function renderAggregateBlock(title, items) {
  const agg = aggregateFeeds(items);
  const foods = Object.entries(agg.byFood);

  return `
    <div class="summary-card">
      <h3>${safe(title)}</h3>
      <p class="summary-total">${agg.total} pièce(s)</p>
      ${foods.length ? foods.map(([food, qty]) => `<p>${safe(food)} : ${safe(qty)}</p>`).join("") : `<p>Aucun nourrissage.</p>`}
    </div>
  `;
}

function renderNourrissageSummary() {
  const zone = document.getElementById("feedSummaryZone");
  if (!zone) return;

  const dateRef = document.getElementById("feedDate")?.value || todayStr();
  const weekRef = getWeekKey(dateRef);
  const monthRef = getMonthKey(dateRef);

  const todayItems = appData.nourrissage.filter((n) => sameDay(n.date, dateRef));
  const weekItems = appData.nourrissage.filter((n) => getWeekKey(n.date) === weekRef);
  const monthItems = appData.nourrissage.filter((n) => getMonthKey(n.date) === monthRef);

  zone.innerHTML = `
    <div class="summary-grid">
      ${renderAggregateBlock(`Jour (${formatDisplayDate(dateRef)})`, todayItems)}
      ${renderAggregateBlock(`Semaine (${weekRef})`, weekItems)}
      ${renderAggregateBlock(`Mois (${formatDisplayMonth(monthRef)})`, monthItems)}
    </div>
  `;
}

function renderDernierNourrissage() {
  const zone = document.getElementById("listeNourrissage");
  if (!zone) return;

  if (!appData.nourrissage.length) {
    zone.innerHTML = `<div class="card"><p class="muted-line">Aucun nourrissage.</p></div>`;
    return;
  }

  const sorted = [...appData.nourrissage].sort((a, b) => {
    if ((b.date || "") !== (a.date || "")) {
      return (b.date || "").localeCompare(a.date || "");
    }
    return 0;
  });

  const last = sorted[0];

  zone.innerHTML = `
    <div class="card">
      <h2>Dernier nourrissage</h2>
      <p><strong>Date :</strong> ${safe(formatDisplayDate(last.date))}</p>
      <p><strong>Rapace :</strong> ${safe(last.oiseau)}</p>
      <p><strong>Nourriture :</strong> ${safe(last.nourriture)}</p>
      <p><strong>Quantité :</strong> ${safe(last.quantite)}</p>
      <p><strong>Remarques :</strong> ${safe(last.remarques || "-")}</p>
    </div>

    <div class="card">
      <h2>Historique nourrissage</h2>
      <div id="tableauNourrissage"></div>
    </div>
  `;

  renderTableauHistorique();
}

function renderTableauHistorique() {
  const zone = document.getElementById("tableauNourrissage");
  if (!zone) return;

  if (!appData.nourrissage.length) {
    zone.innerHTML = `<p class="muted-line">Aucun nourrissage.</p>`;
    return;
  }

  const oiseaux = appData.oiseaux.map((o) => o.nom);
  const grouped = {};

  appData.nourrissage.forEach((n) => {
    if (!grouped[n.date]) grouped[n.date] = {};
    if (!grouped[n.date][n.oiseau]) grouped[n.date][n.oiseau] = [];
    grouped[n.date][n.oiseau].push(`${safe(n.quantite)} ${safe(n.nourriture)}`);
  });

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  zone.innerHTML = `
    <div class="feed-table-wrap">
      <table class="feed-table">
        <thead>
          <tr>
            <th>Date</th>
            ${oiseaux.map((o) => `<th>${safe(o)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${dates.map((date) => `
            <tr>
              <td>${safe(formatDisplayDate(date))}</td>
              ${oiseaux.map((o) => `
                <td>${(grouped[date][o] || []).join("<br>")}</td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderNourrissage() {
  renderNourrissageTable();
  renderNourrissageSummary();
  renderDernierNourrissage();
}

function fillStockForm() {
  syncBoitesFromPoussins();

  const stockBoxes = document.getElementById("stockBoitePoussinsMoyenne225");
  const stockAddBoxes = document.getElementById("stockAjouterBoitesPoussins");
  const stockPoussin = document.getElementById("stockPoussin");
  const stockCaille = document.getElementById("stockCaille");
  const stockPigeon = document.getElementById("stockPigeon");
  const stockLapin = document.getElementById("stockLapin");
  const stockPoisson = document.getElementById("stockPoisson");
  const stockSouris = document.getElementById("stockSouris");
  const stockCailleteau30gr = document.getElementById("stockCailleteau30gr");

  if (stockBoxes) stockBoxes.value = appData.stock.boitePoussinsMoyenne225 ?? 0;
  if (stockAddBoxes) stockAddBoxes.value = "";
  if (stockPoussin) stockPoussin.value = appData.stock.poussin ?? 0;
  if (stockCaille) stockCaille.value = appData.stock.caille ?? 0;
  if (stockPigeon) stockPigeon.value = appData.stock.pigeon ?? 0;
  if (stockLapin) stockLapin.value = appData.stock.lapin ?? 0;
  if (stockPoisson) stockPoisson.value = appData.stock.poisson ?? 0;
  if (stockSouris) stockSouris.value = appData.stock.souris ?? 0;
  if (stockCailleteau30gr) stockCailleteau30gr.value = appData.stock.cailleteau30gr ?? 0;
}

function renderAll() {
  syncBoitesFromPoussins();
  refreshStats();
  refreshBirdSelects();
  renderOiseaux();
  renderPesees();
  renderDocuments();
  renderNourrissage();
  fillStockForm();
}

async function saveData(isAuto = false) {
  try {
    if (isSaving) return;
    isSaving = true;

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    if (navigator.onLine) {
      setStatus(isAuto ? "Synchronisation…" : "Sauvegarde…");
      setSyncBadge(isAuto ? "Synchronisation…" : "Sauvegarde…", "saving");
    } else {
      setStatus("Hors ligne — sauvegarde locale en attente");
      setSyncBadge("Hors ligne", "offline");
    }

    const payload = buildFirestorePayload();
    await setDoc(doc(db, "rapaces", "data"), payload);
    rawRapacesData = payload;

    if (navigator.onLine) {
      setStatus(isAuto ? "Synchronisé" : "Sauvegardé");
      setSyncBadge("Sauvegardé", "saved");
    } else {
      setStatus("Sauvegardé localement — synchronisation en attente");
      setSyncBadge("Hors ligne", "offline");
    }
  } catch (e) {
    console.error(e);
    setStatus("Erreur sauvegarde");
    setSyncBadge("Erreur", "error");
  } finally {
    isSaving = false;
  }
}

function startRealtimeSync() {
  try {
    const refDoc = doc(db, "rapaces", "data");

    onSnapshot(
      refDoc,
      (snap) => {
        if (snap.exists()) {
          rawRapacesData = snap.data();
          appData = normalizeData(rawRapacesData);
        } else {
          rawRapacesData = {};
          appData = normalizeData({});
        }

        renderAll();
        updateConnectivityStatus();
      },
      (error) => {
        console.error(error);
        setStatus("Erreur lecture Firestore");
        setSyncBadge("Erreur", "error");
      }
    );
  } catch (e) {
    console.error(e);
    setStatus("Erreur initialisation synchro");
    setSyncBadge("Erreur", "error");
  }
}

function resetBirdForm() {
  editingBirdId = null;

  [
    "oiseauNom",
    "oiseauEspece",
    "oiseauSexe",
    "oiseauAge",
    "oiseauPoids",
    "oiseauNotes",
    "oiseauHabitudeQty",
    "oiseauHabitudeQty2"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const food1 = document.getElementById("oiseauHabitudeFood");
  const food2 = document.getElementById("oiseauHabitudeFood2");
  const photoInput = document.getElementById("oiseauPhotoFile");
  const docInput = document.getElementById("oiseauDocFile");
  const hiddenId = document.getElementById("oiseauEditId");
  const title = document.getElementById("oiseauFormTitle");
  const btn = document.getElementById("oiseauSubmitBtn");
  const cancelBtn = document.getElementById("cancelEditBirdBtn");

  if (food1) food1.value = "";
  if (food2) food2.value = "";
  if (photoInput) photoInput.value = "";
  if (docInput) docInput.value = "";
  if (hiddenId) hiddenId.value = "";
  if (title) title.textContent = "Ajouter un oiseau";
  if (btn) btn.textContent = "Ajouter l’oiseau";
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

async function ajouterOiseau() {
  const nom = document.getElementById("oiseauNom")?.value.trim() || "";
  if (!nom) return;

  const espece = document.getElementById("oiseauEspece")?.value.trim() || "";
  const sexe = document.getElementById("oiseauSexe")?.value.trim() || "";
  const age = document.getElementById("oiseauAge")?.value.trim() || "";
  const poidsActuel = document.getElementById("oiseauPoids")?.value.trim() || "";
  const notes = document.getElementById("oiseauNotes")?.value.trim() || "";
  const nourritureHabituelle = document.getElementById("oiseauHabitudeFood")?.value || "";
  const quantiteHabituelle = toNumber(document.getElementById("oiseauHabitudeQty")?.value || 0);
  const nourritureHabituelle2 = document.getElementById("oiseauHabitudeFood2")?.value || "";
  const quantiteHabituelle2 = toNumber(document.getElementById("oiseauHabitudeQty2")?.value || 0);

  const photoFile = document.getElementById("oiseauPhotoFile")?.files?.[0] || null;
  const docFile = document.getElementById("oiseauDocFile")?.files?.[0] || null;

  let photoUrl = "";
  let documents = [];

  try {
    const existingBird = editingBirdId
      ? appData.oiseaux.find((o) => o.id === editingBirdId)
      : null;

    photoUrl = existingBird?.photoUrl || "";
    documents = safeArray(existingBird?.documents);

    if (photoFile) {
      if (!navigator.onLine) {
        alert("L’upload photo nécessite une connexion internet.");
      } else {
        setStatus("Upload photo…");
        setSyncBadge("Synchronisation…", "saving");
        photoUrl = await uploadFile(
          photoFile,
          `oiseaux/photos/${nom}_${Date.now()}_${photoFile.name}`
        );
      }
    }

    if (docFile) {
      if (!navigator.onLine) {
        alert("L’upload document nécessite une connexion internet.");
      } else {
        setStatus("Upload document…");
        setSyncBadge("Synchronisation…", "saving");
        const docUrl = await uploadFile(
          docFile,
          `oiseaux/documents/${nom}_${Date.now()}_${docFile.name}`
        );

        documents = [
          ...documents,
          {
            name: docFile.name,
            url: docUrl
          }
        ];
      }
    }

    if (editingBirdId && existingBird) {
      existingBird.nom = nom;
      existingBird.espece = espece;
      existingBird.sexe = sexe;
      existingBird.age = age;
      existingBird.poidsActuel = poidsActuel;
      existingBird.notes = notes;
      existingBird.nourritureHabituelle = nourritureHabituelle;
      existingBird.quantiteHabituelle = quantiteHabituelle;
      existingBird.nourritureHabituelle2 = nourritureHabituelle2;
      existingBird.quantiteHabituelle2 = quantiteHabituelle2;
      existingBird.photoUrl = photoUrl;
      existingBird.documents = documents;
      setStatus("Oiseau modifié");
    } else {
      appData.oiseaux.unshift({
        id: makeId(),
        nom,
        espece,
        sexe,
        age,
        poidsActuel,
        notes,
        nourritureHabituelle,
        quantiteHabituelle,
        nourritureHabituelle2,
        quantiteHabituelle2,
        photoUrl,
        documents,
        historiquePoids: []
      });
      setStatus("Oiseau ajouté");
    }

    resetBirdForm();
    renderAll();
    scheduleAutoSave();
  } catch (e) {
    console.error("Erreur upload :", e);
    setStatus("Erreur upload");
    setSyncBadge("Erreur", "error");
    alert("Erreur pendant l'upload de la photo ou du document.");
  }
}

function modifierOiseau(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  editingBirdId = id;

  const set = (idEl, value) => {
    const el = document.getElementById(idEl);
    if (el) el.value = value ?? "";
  };

  set("oiseauNom", bird.nom);
  set("oiseauEspece", bird.espece);
  set("oiseauSexe", bird.sexe);
  set("oiseauAge", bird.age);
  set("oiseauPoids", bird.poidsActuel);
  set("oiseauNotes", bird.notes);
  set("oiseauHabitudeFood", bird.nourritureHabituelle);
  set("oiseauHabitudeQty", bird.quantiteHabituelle);
  set("oiseauHabitudeFood2", bird.nourritureHabituelle2);
  set("oiseauHabitudeQty2", bird.quantiteHabituelle2);
  set("oiseauEditId", bird.id);

  const title = document.getElementById("oiseauFormTitle");
  const btn = document.getElementById("oiseauSubmitBtn");
  const cancelBtn = document.getElementById("cancelEditBirdBtn");

  if (title) title.textContent = `Modifier l’oiseau : ${bird.nom}`;
  if (btn) btn.textContent = "Enregistrer les modifications";
  if (cancelBtn) cancelBtn.classList.remove("hidden");

  showSection("oiseaux");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEditBird() {
  resetBirdForm();
  setStatus("Modification annulée");
}

function ajouterPesee() {
  const nom = document.getElementById("pesNom")?.value || "";
  if (!nom) return;

  const date = document.getElementById("pesDate")?.value || "";
  const poids = document.getElementById("pesPoids")?.value.trim() || "";

  appData.pesees.unshift({
    id: makeId(),
    date,
    nom,
    espece: document.getElementById("pesEspece")?.value.trim() || "",
    poids,
    nourriture: document.getElementById("pesNourriture")?.value.trim() || "",
    etat: document.getElementById("pesEtat")?.value.trim() || "",
    lieu: document.getElementById("pesLieu")?.value.trim() || "",
    observations: document.getElementById("pesObs")?.value.trim() || ""
  });

  const oiseau = appData.oiseaux.find(
    (o) => (o.nom || "").trim().toLowerCase() === nom.trim().toLowerCase()
  );

  if (oiseau && poids) {
    oiseau.poidsActuel = poids;
    oiseau.historiquePoids.unshift({
      date,
      poids
    });
  }

  const pesDateEl = document.getElementById("pesDate");
  if (pesDateEl) pesDateEl.value = todayStr();

  ["pesNom", "pesEspece", "pesPoids", "pesNourriture", "pesEtat", "pesLieu", "pesObs"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderAll();
  setStatus("Pesée ajoutée");
  scheduleAutoSave();
}

function ajouterDocument() {
  const titre = document.getElementById("docTitre")?.value.trim() || "";
  if (!titre) return;

  appData.documents.unshift({
    id: makeId(),
    titre,
    type: document.getElementById("docType")?.value.trim() || "",
    description: document.getElementById("docDescription")?.value.trim() || "",
    lien: ""
  });

  ["docTitre", "docType", "docDescription"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderAll();
  scheduleAutoSave();
}

function decrementStock(food, qty) {
  const stockKey = foodToStockKey(food);
  if (!stockKey) return;

  const current = toNumber(appData.stock[stockKey]);
  appData.stock[stockKey] = Math.max(0, current - toNumber(qty));

  if (stockKey === "poussin") {
    syncBoitesFromPoussins();
  }
}

function ajouterNourrissage() {
  const date = document.getElementById("feedDate")?.value || todayStr();
  const remarques = document.getElementById("feedNote")?.value.trim() || "";

  if (!appData.oiseaux.length) return;

  const lignes = [];

  appData.oiseaux.forEach((oiseau) => {
    let f1 = document.getElementById(`feedFood1_${oiseau.id}`)?.value || "";
    const q1 = toNumber(document.getElementById(`feedQty1_${oiseau.id}`)?.value || 0);
    const f2 = document.getElementById(`feedFood2_${oiseau.id}`)?.value || "";
    const q2 = toNumber(document.getElementById(`feedQty2_${oiseau.id}`)?.value || 0);

    if (!f1) f1 = "Poussin";

    if (q1 > 0) {
      lignes.push({
        id: makeId(),
        date,
        oiseau: oiseau.nom || "",
        nourriture: f1,
        quantite: q1,
        remarques
      });
    }

    if (f2 && q2 > 0) {
      lignes.push({
        id: makeId(),
        date,
        oiseau: oiseau.nom || "",
        nourriture: f2,
        quantite: q2,
        remarques
      });
    }
  });

  if (!lignes.length) {
    alert("Choisis au moins une quantité pour un oiseau.");
    return;
  }

  lignes.forEach((ligne) => {
    decrementStock(ligne.nourriture, ligne.quantite);
    appData.nourrissage.unshift(ligne);
  });

  viderTableNourrissage(false);

  const noteEl = document.getElementById("feedNote");
  if (noteEl) noteEl.value = "";

  renderAll();
  setStatus(`${lignes.length} nourrissage(s) ajouté(s)`);
  scheduleAutoSave();
}

function appliquerNourritureHabituelle() {
  appData.oiseaux.forEach((oiseau) => {
    const food1 = document.getElementById(`feedFood1_${oiseau.id}`);
    const qty1 = document.getElementById(`feedQty1_${oiseau.id}`);
    const food2 = document.getElementById(`feedFood2_${oiseau.id}`);
    const qty2 = document.getElementById(`feedQty2_${oiseau.id}`);

    if (food1) {
      food1.value = oiseau.nourritureHabituelle || "Poussin";
    }

    if (qty1 && !qty1.value) {
      qty1.value = oiseau.quantiteHabituelle > 0 ? oiseau.quantiteHabituelle : "";
    }

    if (food2) {
      food2.value = oiseau.nourritureHabituelle2 || "";
    }

    if (qty2 && !qty2.value) {
      qty2.value = oiseau.quantiteHabituelle2 > 0 ? oiseau.quantiteHabituelle2 : "";
    }
  });

  setStatus("Nourriture remplie automatiquement");
}

function viderTableNourrissage(showMessage = true) {
  appData.oiseaux.forEach((oiseau) => {
    ["feedFood1_", "feedFood2_"].forEach((prefix) => {
      const el = document.getElementById(`${prefix}${oiseau.id}`);
      if (el) {
        el.value = prefix === "feedFood1_" ? "Poussin" : "";
      }
    });

    ["feedQty1_", "feedQty2_"].forEach((prefix) => {
      const el = document.getElementById(`${prefix}${oiseau.id}`);
      if (el) el.value = "";
    });
  });

  if (showMessage) setStatus("Tableau vidé");
}

function enregistrerStock() {
  const boxesToAdd = Math.max(
    0,
    toNumber(document.getElementById("stockAjouterBoitesPoussins")?.value || 0)
  );

  if (boxesToAdd > 0) {
    appData.stock.poussin += boxesToAdd * BOITE_POUSSIN_CAPACITE;
  }

  appData.stock.caille = Math.max(0, toNumber(document.getElementById("stockCaille")?.value || 0));
  appData.stock.pigeon = Math.max(0, toNumber(document.getElementById("stockPigeon")?.value || 0));
  appData.stock.lapin = Math.max(0, toNumber(document.getElementById("stockLapin")?.value || 0));
  appData.stock.poisson = Math.max(0, toNumber(document.getElementById("stockPoisson")?.value || 0));
  appData.stock.souris = Math.max(0, toNumber(document.getElementById("stockSouris")?.value || 0));
  appData.stock.cailleteau30gr = Math.max(0, toNumber(document.getElementById("stockCailleteau30gr")?.value || 0));

  syncBoitesFromPoussins();
  renderAll();
  setStatus("Stock mis à jour");
  scheduleAutoSave();
}

function supprimerOiseau(id) {
  appData.oiseaux = appData.oiseaux.filter((o) => o.id !== id);
  renderAll();
  scheduleAutoSave();
}

function supprimerDocument(id) {
  appData.documents = appData.documents.filter((d) => d.id !== id);
  renderAll();
  scheduleAutoSave();
}

function exportBirdPdf(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  const poidsRows = safeArray(bird.historiquePoids)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((item) => `
      <tr>
        <td>${safe(formatDisplayDate(item.date))}</td>
        <td>${safe(item.poids)}</td>
      </tr>
    `).join("");

  const docsRows = safeArray(bird.documents)
    .map((doc) => `<li><a href="${safeAttr(doc.url)}">${safe(doc.name)}</a></li>`)
    .join("");

  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre PDF.");
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Fiche ${safe(bird.nom)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#222;padding:24px;background:#fffaf0}
        h1,h2{margin-bottom:8px}
        .top{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
        img{max-width:280px;border-radius:12px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        .box{margin-top:18px;padding:14px;border:1px solid #ddd;border-radius:10px;background:#fff}
        ul{margin:8px 0 0 20px}
        @media print{button{display:none}}
      </style>
    </head>
    <body>
      <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>
      <h1>Fiche oiseau : ${safe(bird.nom)}</h1>
      <div class="top">
        <div>
          ${bird.photoUrl ? `<img src="${safeAttr(bird.photoUrl)}" alt="${safeAttr(bird.nom)}">` : `<p>Pas de photo</p>`}
        </div>
        <div>
          <p><strong>Espèce :</strong> ${safe(bird.espece)}</p>
          <p><strong>Sexe :</strong> ${safe(bird.sexe)}</p>
          <p><strong>Âge :</strong> ${safe(bird.age)}</p>
          <p><strong>Poids actuel :</strong> ${safe(bird.poidsActuel)} g</p>
          <p><strong>Nourriture habituelle 1 :</strong> ${safe(bird.nourritureHabituelle)} (${safe(bird.quantiteHabituelle)} pièce(s))</p>
          <p><strong>Nourriture habituelle 2 :</strong> ${safe(bird.nourritureHabituelle2)} ${bird.nourritureHabituelle2 ? `(${safe(bird.quantiteHabituelle2)} pièce(s))` : ""}</p>
        </div>
      </div>

      <div class="box">
        <h2>Notes</h2>
        <p>${safe(bird.notes || "Aucune note")}</p>
      </div>

      <div class="box">
        <h2>Documents liés</h2>
        ${docsRows ? `<ul>${docsRows}</ul>` : `<p>Aucun document.</p>`}
      </div>

      <div class="box">
        <h2>Historique des poids</h2>
        ${poidsRows ? `<table><thead><tr><th>Date</th><th>Poids (g)</th></tr></thead><tbody>${poidsRows}</tbody></table>` : `<p>Aucun poids enregistré.</p>`}
      </div>
    </body>
    </html>
  `);

  win.document.close();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.error("SW registration error:", e);
  }
}

async function initOfflineFirestore() {
  try {
    await enableMultiTabIndexedDbPersistence(db);
  } catch (e) {
    console.warn("Persistance hors ligne non activée :", e);
  }
}

const pesDateEl = document.getElementById("pesDate");
if (pesDateEl) pesDateEl.value = todayStr();

const feedDateEl = document.getElementById("feedDate");
if (feedDateEl) feedDateEl.value = todayStr();

window.showSection = showSection;
window.saveData = saveData;
window.ajouterOiseau = ajouterOiseau;
window.modifierOiseau = modifierOiseau;
window.cancelEditBird = cancelEditBird;
window.ajouterPesee = ajouterPesee;
window.ajouterDocument = ajouterDocument;
window.ajouterNourrissage = ajouterNourrissage;
window.appliquerNourritureHabituelle = appliquerNourritureHabituelle;
window.viderTableNourrissage = viderTableNourrissage;
window.enregistrerStock = enregistrerStock;
window.supprimerOiseau = supprimerOiseau;
window.supprimerDocument = supprimerDocument;
window.exportBirdPdf = exportBirdPdf;

document.addEventListener("DOMContentLoaded", async () => {
  await registerServiceWorker();
  await initOfflineFirestore();

  window.addEventListener("online", updateConnectivityStatus);
  window.addEventListener("offline", updateConnectivityStatus);

  const feedDate = document.getElementById("feedDate");
  if (feedDate) {
    feedDate.addEventListener("change", () => {
      renderNourrissageSummary();
    });
  }

  resetBirdForm();
  startRealtimeSync();
  showSection("accueil");
  updateConnectivityStatus();
});