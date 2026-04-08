import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
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

const mainRef = doc(db, "rapaces", "data");
const userRef = doc(db, "users", "dQPT9eD5g2c7FkjCb86pJnqh4qF3");

const statusEl = document.getElementById("status");

const APP_PIN = "0212";
let appUnlocked = false;

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
let rawUserData = {};
let editingBirdId = null;
let autoSaveTimer = null;

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

function getSafeUrl(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.url === "string") return value.url;
  if (value.url && typeof value.url.url === "string") return value.url.url;
  if (typeof value.lien === "string") return value.lien;
  return "";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateFR(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

function setPoussinsFromBoxes(boxes) {
  const nbBoxes = Math.max(0, toNumber(boxes));
  appData.stock.boitePoussinsMoyenne225 = nbBoxes;
  appData.stock.poussin = nbBoxes * BOITE_POUSSIN_CAPACITE;
}

function getLatestFeedDate() {
  if (!appData.nourrissage.length) return todayStr();
  const dates = appData.nourrissage.map((n) => n.date || "").filter(Boolean).sort((a, b) => b.localeCompare(a));
  return dates[0] || todayStr();
}

function triggerAutoSave(delay = 600) {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await saveData();
  }, delay);
}

function unlockApp() {
  appUnlocked = true;
  const overlay = document.getElementById("pinOverlay");
  if (overlay) overlay.classList.add("hidden");
  document.body.classList.remove("locked");
}

function checkPin() {
  const input = document.getElementById("pinInput");
  const error = document.getElementById("pinError");
  const value = input?.value || "";

  if (value === APP_PIN) {
    if (error) error.textContent = "";
    unlockApp();
    return;
  }

  if (error) error.textContent = "Code incorrect.";
  if (input) {
    input.value = "";
    input.focus();
  }
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
    url: getSafeUrl(docItem)
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

function normalizeData(rapacesData, userData) {
  const oiseauxSource = safeArray(rapacesData?.oiseaux);
  const peseesSource = safeArray(userData?.encodages || rapacesData?.encodages || rapacesData?.pesees);
  const documentsSource = safeArray(rapacesData?.documents);
  const documentsGenerauxSource = safeArray(rapacesData?.documentsGeneraux);
  const nourrissageSource = safeArray(userData?.nourrissage || rapacesData?.nourrissage);

  const oiseaux = oiseauxSource.map((o, index) => ({
    id: o.id || `oiseau_${index}_${makeId()}`,
    nom: o.nom || "",
    espece: o.espece || "",
    sexe: o.sexe || "",
    age: o.age || "",
    poidsActuel: o.poidsActuel ?? "",
    notes: o.notes || "",
    photoUrl: getSafeUrl(o?.photo) || getSafeUrl(o?.photoUrl) || getSafeUrl(o?.photo),
    documents: normalizeDocumentsOiseau(o.documents),
    historiquePoids: normalizeHistoriquePoids(o.historiquePoids),
    nourritureHabituelle: o.nourritureHabituelle || "",
    quantiteHabituelle: toNumber(o.quantiteHabituelle),
    nourritureHabituelle2: o.nourritureHabituelle2 || "",
    quantiteHabituelle2: toNumber(o.quantiteHabituelle2)
  }));

  const pesees = peseesSource.map((e, index) => ({
    id: e.id || `pes_${index}_${makeId()}`,
    date: e.date || "",
    nom: e.nom || "",
    espece: e.espece || "",
    poids: e.poids ?? "",
    nourriture: e.nourriture || "",
    etat: e.etat || "",
    lieu: e.lieu || "",
    observations: e.observations || ""
  }));

  const documents = [
    ...documentsSource.map((d) => ({
      id: d.id || makeId(),
      titre: d.titre || d.nom || "Document",
      type: d.type || "Document",
      description: d.description || "",
      lien: getSafeUrl(d)
    })),
    ...documentsGenerauxSource.map((d) => ({
      id: d.id || makeId(),
      titre: d.titre || d.nom || "Document général",
      type: d.type || "Document général",
      description: d.description || "",
      lien: getSafeUrl(d)
    }))
  ];

  const stock = {
    poussin: toNumber(rapacesData?.stock?.poussin),
    caille: toNumber(rapacesData?.stock?.caille),
    pigeon: toNumber(rapacesData?.stock?.pigeon),
    lapin: toNumber(rapacesData?.stock?.lapin),
    poisson: toNumber(rapacesData?.stock?.poisson),
    souris: toNumber(rapacesData?.stock?.souris),
    cailleteau30gr: toNumber(rapacesData?.stock?.cailleteau30gr),
    boitePoussinsMoyenne225: toNumber(rapacesData?.stock?.boitePoussinsMoyenne225)
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

function buildRapacesPayload() {
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

  syncBoitesFromPoussins();

  return {
    ...rawRapacesData,
    oiseaux,
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

function buildUserPayload() {
  return {
    ...rawUserData,
    encodages: appData.pesees.map((e) => ({
      id: e.id || makeId(),
      date: e.date || "",
      nom: e.nom || "",
      poids: e.poids ?? "",
      nourriture: e.nourriture || "",
      espece: e.espece || "",
      etat: e.etat || "",
      lieu: e.lieu || "",
      observations: e.observations || ""
    })),
    nourrissage: appData.nourrissage.map((n) => ({
      id: n.id || makeId(),
      date: n.date || "",
      oiseau: n.oiseau || "",
      nourriture: n.nourriture || "",
      quantite: toNumber(n.quantite),
      remarques: n.remarques || ""
    }))
  };
}

function showSection(section) {
  document.querySelectorAll(".section").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".nav button").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`section-${section}`)?.classList.remove("hidden");
  document.getElementById(`btn-${section}`)?.classList.add("active");
}

function refreshStats() {
  const statOiseaux = document.getElementById("statOiseaux");
  const statPesees = document.getElementById("statPesees");
  const statDocuments = document.getElementById("statDocuments");
  const statNourrissages = document.getElementById("statNourrissages");

  if (statOiseaux) statOiseaux.textContent = appData.oiseaux.length;
  if (statPesees) statPesees.textContent = appData.pesees.length;
  if (statDocuments) statDocuments.textContent = appData.documents.length;
  if (statNourrissages) statNourrissages.textContent = appData.nourrissage.length;
}

function refreshBirdSelects() {
  const birds = appData.oiseaux
    .map((o) => `<option value="${safeAttr(o.nom)}">${safe(o.nom)}</option>`)
    .join("");

  const pesNom = document.getElementById("pesNom");
  if (pesNom) pesNom.innerHTML = `<option value="">Choisir un oiseau</option>${birds}`;
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
          ${historique.map((h) => `
            <tr>
              <td>${safe(formatDateFR(h.date))}</td>
              <td>${safe(h.poids)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
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
            <p>${safe(oiseau.nourritureHabituelle2 || "Aucune")}${oiseau.nourritureHabituelle2 ? " — " + safe(oiseau.quantiteHabituelle2 || 0) + " pièce(s)" : ""}</p>
          </div>

          <div class="card-section">
            <h4>Documents liés</h4>
            ${renderDocumentsOiseau(oiseau.documents)}
          </div>

          <div class="card-section">
            <h4>Poids enregistrés</h4>
            ${renderHistoriquePoidsTable(oiseau.historiquePoids)}
          </div>

         <div class="small-actions">
  <button class="btn secondary-btn" onclick="modifierOiseau('${oiseau.id}')">Modifier</button>
  <button class="btn secondary-btn" onclick="exportBirdPdf('${oiseau.id}')">PDF</button>
  <button class="btn secondary-btn" onclick="partagerFicheOiseau('${oiseau.id}')">Partager</button>
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

function getFoodOptionsHtml(selected = "", includeEmpty = true) {
  const emptyOption = includeEmpty
    ? `<option value="" ${selected === "" ? "selected" : ""}>Choisir</option>`
    : "";

  return `
    ${emptyOption}
    ${ALIMENTS.map((food) => `
      <option value="${safeAttr(food)}" ${food === selected ? "selected" : ""}>${safe(food)}</option>
    `).join("")}
  `;
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
                <select id="feedFood1_${safeAttr(oiseau.id)}">${getFoodOptionsHtml("Poussin", false)}</select>
              </td>
              <td>
                <input id="feedQty1_${safeAttr(oiseau.id)}" type="number" min="0" step="1" placeholder="0">
              </td>
              <td>
                <select id="feedFood2_${safeAttr(oiseau.id)}">${getFoodOptionsHtml("", true)}</select>
              </td>
              <td>
                <input id="feedQty2_${safeAttr(oiseau.id)}" type="number" min="0" step="1" placeholder="0">
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
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

  const feedDateInput = document.getElementById("feedDate");
  let dateRef = feedDateInput?.value || "";

  if (!dateRef) {
    dateRef = getLatestFeedDate();
    if (feedDateInput) feedDateInput.value = dateRef;
  }

  const weekRef = getWeekKey(dateRef);
  const monthRef = getMonthKey(dateRef);

  const todayItems = appData.nourrissage.filter((n) => sameDay(n.date, dateRef));
  const weekItems = appData.nourrissage.filter((n) => getWeekKey(n.date) === weekRef);
  const monthItems = appData.nourrissage.filter((n) => getMonthKey(n.date) === monthRef);

  zone.innerHTML = `
    <div class="summary-grid">
      ${renderAggregateBlock(`Jour (${formatDateFR(dateRef)})`, todayItems)}
      ${renderAggregateBlock(`Semaine (${weekRef})`, weekItems)}
      ${renderAggregateBlock(`Mois (${monthRef})`, monthItems)}
    </div>
  `;
}

function renderNourrissageHistory() {
  const zone = document.getElementById("listeNourrissage");
  if (!zone) return;

  if (!appData.nourrissage.length) {
    zone.innerHTML = `<p class="muted-line">Aucun nourrissage.</p>`;
    return;
  }

  const groupedByDate = {};

  appData.nourrissage.forEach((item) => {
    const date = item.date || "Sans date";
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(item);
  });

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  zone.innerHTML = sortedDates.map((date) => {
    const rows = groupedByDate[date]
      .sort((a, b) => (a.oiseau || "").localeCompare(b.oiseau || ""))
      .map((item) => `
        <tr>
          <td>${safe(item.oiseau)}</td>
          <td>${safe(item.nourriture)}</td>
          <td>${safe(item.quantite)}</td>
          <td>${safe(item.remarques || "")}</td>
          <td>
            <button class="btn btn-danger" onclick="supprimerNourrissage('${item.id}')">Supprimer</button>
          </td>
        </tr>
      `).join("");

    return `
      <div class="card-section">
        <h4>${safe(formatDateFR(date))}</h4>
        <div class="feed-table-wrap">
          <table class="feed-table">
            <thead>
              <tr>
                <th>Oiseau</th>
                <th>Nourriture</th>
                <th>Quantité</th>
                <th>Remarques</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");
}

function decrementStock(food, qty) {
  const stockKey = foodToStockKey(food);
  if (!stockKey) return;

  const current = toNumber(appData.stock[stockKey]);
  appData.stock[stockKey] = Math.max(0, current - toNumber(qty));

  if (stockKey === "poussin") syncBoitesFromPoussins();
}

function restoreStockFromDeletedFeed(item) {
  const stockKey = foodToStockKey(item?.nourriture);
  if (!stockKey) return;

  appData.stock[stockKey] = toNumber(appData.stock[stockKey]) + toNumber(item?.quantite);

  if (stockKey === "poussin") syncBoitesFromPoussins();
}

function addQuickFeed(food, qty, bird, note = "Mode terrain") {
  if (!bird || !food || qty <= 0) return;

  const date = document.getElementById("feedDate")?.value || getLatestFeedDate() || todayStr();

  const line = {
    id: makeId(),
    date,
    oiseau: bird.nom || "",
    nourriture: food,
    quantite: qty,
    remarques: note
  };

  decrementStock(line.nourriture, line.quantite);
  appData.nourrissage.unshift(line);
  renderAll();
  triggerAutoSave(200);

  if (statusEl) statusEl.textContent = `${bird.nom} : ${qty} ${food}`;
}

function renderTerrain() {
  const zone = document.getElementById("terrainZone");
  if (!zone) return;

  if (!appData.oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau disponible.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="bird-grid">
      ${appData.oiseaux.map((oiseau) => `
        <article class="bird-card terrain-card">
          <h3>${safe(oiseau.nom)}</h3>
          <p class="bird-species">${safe(oiseau.espece || "")}</p>

          ${oiseau.photoUrl ? `
            <img src="${safeAttr(oiseau.photoUrl)}" alt="${safeAttr(oiseau.nom)}" class="bird-photo">
          ` : `
            <div class="bird-photo-placeholder">Pas de photo</div>
          `}

          <div class="actions">
            <button class="btn terrain-poussin" onclick="quickFeed('${oiseau.id}','Poussin',1)">+1 Poussin</button>
            <button class="btn terrain-souris" onclick="quickFeed('${oiseau.id}','Souris',1)">+1 Souris</button>
            <button class="btn terrain-cailleteau" onclick="quickFeed('${oiseau.id}','Cailleteau 30gr',1)">+1 Cailleteau</button>
            <button class="btn terrain-ration" onclick="rationHabituelleTerrain('${oiseau.id}')">Ration habituelle</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderNourrissage() {
  renderNourrissageTable();
  renderNourrissageSummary();
  renderNourrissageHistory();
  renderTerrain();
}

function fillStockForm() {
  syncBoitesFromPoussins();

  const stockBoxes = document.getElementById("stockBoitePoussinsMoyenne225");
  const stockPoussin = document.getElementById("stockPoussin");
  const stockCaille = document.getElementById("stockCaille");
  const stockPigeon = document.getElementById("stockPigeon");
  const stockLapin = document.getElementById("stockLapin");
  const stockPoisson = document.getElementById("stockPoisson");
  const stockSouris = document.getElementById("stockSouris");
  const stockCailleteau30gr = document.getElementById("stockCailleteau30gr");

  if (stockBoxes) stockBoxes.value = appData.stock.boitePoussinsMoyenne225 ?? 0;
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

async function saveData() {
  try {
    if (statusEl) statusEl.textContent = "Sauvegarde…";

    const rapacesPayload = buildRapacesPayload();
    const userPayload = buildUserPayload();

    await Promise.all([
      setDoc(mainRef, rapacesPayload),
      setDoc(userRef, userPayload, { merge: true })
    ]);

    rawRapacesData = rapacesPayload;
    rawUserData = userPayload;

    if (statusEl) statusEl.textContent = "Sauvegardé";
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Erreur sauvegarde";
  }
}

async function loadData() {
  try {
    if (statusEl) statusEl.textContent = "Chargement…";

    const [mainSnap, userSnap] = await Promise.all([
      getDoc(mainRef),
      getDoc(userRef)
    ]);

    rawRapacesData = mainSnap.exists() ? mainSnap.data() : {};
    rawUserData = userSnap.exists() ? userSnap.data() : {};

    appData = normalizeData(rawRapacesData, rawUserData);

    const feedDateEl = document.getElementById("feedDate");
    if (feedDateEl) {
      feedDateEl.value = getLatestFeedDate();
    }

    renderAll();

    if (statusEl) statusEl.textContent = "Données chargées";
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Erreur chargement";
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

  if (food1) food1.value = "Poussin";
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
  const nourritureHabituelle = document.getElementById("oiseauHabitudeFood")?.value || "Poussin";
  const quantiteHabituelle = toNumber(document.getElementById("oiseauHabitudeQty")?.value || 0);
  const nourritureHabituelle2 = document.getElementById("oiseauHabitudeFood2")?.value || "";
  const quantiteHabituelle2 = toNumber(document.getElementById("oiseauHabitudeQty2")?.value || 0);

  const photoFile = document.getElementById("oiseauPhotoFile")?.files?.[0] || null;
  const docFile = document.getElementById("oiseauDocFile")?.files?.[0] || null;

  let photoUrl = "";
  let documents = [];

  try {
    if (statusEl) statusEl.textContent = "Upload des fichiers…";

    const existingBird = editingBirdId
      ? appData.oiseaux.find((o) => o.id === editingBirdId)
      : null;

    photoUrl = existingBird?.photoUrl || "";
    documents = safeArray(existingBird?.documents);

    if (photoFile) {
      photoUrl = await uploadFile(photoFile, `oiseaux/photos/${nom}_${Date.now()}_${photoFile.name}`);
    }

    if (docFile) {
      const docUrl = await uploadFile(docFile, `oiseaux/documents/${nom}_${Date.now()}_${docFile.name}`);
      documents = [...documents, { name: docFile.name, url: docUrl }];
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
      if (statusEl) statusEl.textContent = "Oiseau modifié";
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
      if (statusEl) statusEl.textContent = "Oiseau ajouté";
    }

    resetBirdForm();
    renderAll();
    triggerAutoSave();
  } catch (e) {
    console.error("Erreur upload :", e);
    if (statusEl) statusEl.textContent = "Erreur upload";
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
  set("oiseauHabitudeFood", bird.nourritureHabituelle || "Poussin");
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
  if (statusEl) statusEl.textContent = "Modification annulée";
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
    oiseau.historiquePoids.unshift({ date, poids });
  }

  const pesDateEl = document.getElementById("pesDate");
  if (pesDateEl) pesDateEl.value = todayStr();

  ["pesNom", "pesEspece", "pesPoids", "pesNourriture", "pesEtat", "pesLieu", "pesObs"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderAll();
  triggerAutoSave();
  if (statusEl) statusEl.textContent = "Pesée ajoutée";
}

async function ajouterDocument() {
  const titre = document.getElementById("docTitre")?.value.trim() || "";
  if (!titre) return;

  const type = document.getElementById("docType")?.value.trim() || "";
  const description = document.getElementById("docDescription")?.value.trim() || "";
  const file = document.getElementById("docFile")?.files?.[0] || null;

  try {
    if (statusEl) statusEl.textContent = "Upload document…";

    let lien = "";
    if (file) {
      lien = await uploadFile(file, `documents/${Date.now()}_${file.name}`);
    }

    appData.documents.unshift({
      id: makeId(),
      titre,
      type,
      description,
      lien
    });

    ["docTitre", "docType", "docDescription", "docFile"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    renderAll();
    triggerAutoSave();

    if (statusEl) statusEl.textContent = "Document ajouté";
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Erreur document";
  }
}

function ajouterNourrissage() {
  const date = document.getElementById("feedDate")?.value || todayStr();
  const remarques = document.getElementById("feedNote")?.value.trim() || "";

  if (!appData.oiseaux.length) return;

  const lignes = [];

  appData.oiseaux.forEach((oiseau) => {
    const f1 = document.getElementById(`feedFood1_${oiseau.id}`)?.value || "Poussin";
    const q1 = toNumber(document.getElementById(`feedQty1_${oiseau.id}`)?.value || 0);
    const f2 = document.getElementById(`feedFood2_${oiseau.id}`)?.value || "";
    const q2 = toNumber(document.getElementById(`feedQty2_${oiseau.id}`)?.value || 0);

    if (f1 && q1 > 0) {
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
    alert("Choisis au moins une nourriture et une quantité pour un oiseau.");
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
  triggerAutoSave();
  if (statusEl) statusEl.textContent = `${lignes.length} nourrissage(s) ajouté(s)`;
}

function appliquerNourritureHabituelle() {
  appData.oiseaux.forEach((oiseau) => {
    const food1 = document.getElementById(`feedFood1_${oiseau.id}`);
    const qty1 = document.getElementById(`feedQty1_${oiseau.id}`);
    const food2 = document.getElementById(`feedFood2_${oiseau.id}`);
    const qty2 = document.getElementById(`feedQty2_${oiseau.id}`);

    if (food1) food1.value = oiseau.nourritureHabituelle || "Poussin";
    if (qty1) qty1.value = toNumber(oiseau.quantiteHabituelle) > 0 ? oiseau.quantiteHabituelle : "";
    if (food2) food2.value = oiseau.nourritureHabituelle2 || "";
    if (qty2) qty2.value = toNumber(oiseau.quantiteHabituelle2) > 0 ? oiseau.quantiteHabituelle2 : "";
  });

  if (statusEl) statusEl.textContent = "Nourriture habituelle appliquée";
}

function viderTableNourrissage(showMessage = true) {
  appData.oiseaux.forEach((oiseau) => {
    const f1 = document.getElementById(`feedFood1_${oiseau.id}`);
    const f2 = document.getElementById(`feedFood2_${oiseau.id}`);
    const q1 = document.getElementById(`feedQty1_${oiseau.id}`);
    const q2 = document.getElementById(`feedQty2_${oiseau.id}`);

    if (f1) f1.value = "Poussin";
    if (f2) f2.value = "";
    if (q1) q1.value = "";
    if (q2) q2.value = "";
  });

  if (showMessage && statusEl) statusEl.textContent = "Tableau vidé";
}

function enregistrerStock() {
  const boxes = Math.max(0, toNumber(document.getElementById("stockBoitePoussinsMoyenne225")?.value || 0));

  setPoussinsFromBoxes(boxes);
  appData.stock.caille = Math.max(0, toNumber(document.getElementById("stockCaille")?.value || 0));
  appData.stock.pigeon = Math.max(0, toNumber(document.getElementById("stockPigeon")?.value || 0));
  appData.stock.lapin = Math.max(0, toNumber(document.getElementById("stockLapin")?.value || 0));
  appData.stock.poisson = Math.max(0, toNumber(document.getElementById("stockPoisson")?.value || 0));
  appData.stock.souris = Math.max(0, toNumber(document.getElementById("stockSouris")?.value || 0));
  appData.stock.cailleteau30gr = Math.max(0, toNumber(document.getElementById("stockCailleteau30gr")?.value || 0));

  renderAll();
  triggerAutoSave();
  if (statusEl) statusEl.textContent = "Stock mis à jour";
}

function supprimerOiseau(id) {
  appData.oiseaux = appData.oiseaux.filter((o) => o.id !== id);
  renderAll();
  triggerAutoSave();
}

function supprimerDocument(id) {
  appData.documents = appData.documents.filter((d) => d.id !== id);
  renderAll();
  triggerAutoSave();
}

function supprimerNourrissage(id) {
  const found = appData.nourrissage.find((n) => n.id === id);
  if (found) restoreStockFromDeletedFeed(found);
  appData.nourrissage = appData.nourrissage.filter((n) => n.id !== id);
  renderAll();
  triggerAutoSave();
}

function quickFeed(id, food, qty) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;
  addQuickFeed(food, qty, bird);
}

function rationHabituelleTerrain(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  if (bird.nourritureHabituelle && toNumber(bird.quantiteHabituelle) > 0) {
    addQuickFeed(
      bird.nourritureHabituelle,
      toNumber(bird.quantiteHabituelle),
      bird,
      "Ration habituelle terrain"
    );
  }

  if (bird.nourritureHabituelle2 && toNumber(bird.quantiteHabituelle2) > 0) {
    addQuickFeed(
      bird.nourritureHabituelle2,
      toNumber(bird.quantiteHabituelle2),
      bird,
      "Ration habituelle terrain"
    );
  }
}

function getFeedsForBird(birdName) {
  return safeArray(appData.nourrissage)
    .filter((n) => (n.oiseau || "").trim().toLowerCase() === (birdName || "").trim().toLowerCase())
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function exportBirdPdf(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  const birdFeeds = getFeedsForBird(bird.nom);

  const poidsRows = safeArray(bird.historiquePoids)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((item) => `
      <tr>
        <td>${safe(formatDateFR(item.date))}</td>
        <td>${safe(item.poids)}</td>
      </tr>
    `).join("");

  const feedRows = birdFeeds
    .map((item) => `
      <tr>
        <td>${safe(formatDateFR(item.date))}</td>
        <td>${safe(item.nourriture)}</td>
        <td>${safe(item.quantite)}</td>
        <td>${safe(item.remarques || "")}</td>
      </tr>
    `).join("");

  const docsRows = safeArray(bird.documents)
    .map((docItem) => `<li><a href="${safeAttr(docItem.url)}" target="_blank">${safe(docItem.name)}</a></li>`)
    .join("");

  const totalFeeds = birdFeeds.reduce((sum, item) => sum + toNumber(item.quantite), 0);

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
      <title>Fiche complète ${safe(bird.nom)}</title>
      <style>
        body{
          font-family:Arial,Helvetica,sans-serif;
          color:#111;
          padding:24px;
          line-height:1.45;
        }
        h1,h2,h3{margin-bottom:8px}
        .top{
          display:flex;
          gap:24px;
          align-items:flex-start;
          margin-bottom:18px;
        }
        img{max-width:280px;border-radius:12px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{
          border:1px solid #ccc;
          padding:8px;
          text-align:left;
          vertical-align:top;
        }
        th{background:#f2f2f2}
        .box{
          margin-top:18px;
          padding:14px;
          border:1px solid #ddd;
          border-radius:10px;
        }
        ul{margin:8px 0 0 20px}
        .muted{color:#666}
        .resume{
          display:grid;
          grid-template-columns:repeat(2, minmax(220px, 1fr));
          gap:10px;
          margin-top:10px;
        }
        .resume div{
          border:1px solid #ddd;
          border-radius:8px;
          padding:10px;
          background:#fafafa;
        }
        @media print{
          button{display:none}
          body{padding:10px}
        }
      </style>
    </head>
    <body>
      <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>

      <h1>Fiche complète oiseau : ${safe(bird.nom)}</h1>

      <div class="top">
        <div>
          ${bird.photoUrl ? `<img src="${safeAttr(bird.photoUrl)}" alt="${safeAttr(bird.nom)}">` : `<p>Pas de photo</p>`}
        </div>
        <div style="flex:1">
          <p><strong>Espèce :</strong> ${safe(bird.espece || "-")}</p>
          <p><strong>Sexe :</strong> ${safe(bird.sexe || "-")}</p>
          <p><strong>Âge :</strong> ${safe(bird.age || "-")}</p>
          <p><strong>Poids actuel :</strong> ${safe(bird.poidsActuel || "-")} g</p>
          <p><strong>Nourriture habituelle 1 :</strong> ${safe(bird.nourritureHabituelle || "-")} (${safe(bird.quantiteHabituelle || 0)} pièce(s))</p>
          <p><strong>Nourriture habituelle 2 :</strong> ${safe(bird.nourritureHabituelle2 || "-")} ${bird.nourritureHabituelle2 ? `(${safe(bird.quantiteHabituelle2 || 0)} pièce(s))` : ""}</p>
        </div>
      </div>

      <div class="box">
        <h2>Notes</h2>
        <p>${safe(bird.notes || "Aucune note")}</p>
      </div>

      <div class="box">
        <h2>Résumé</h2>
        <div class="resume">
          <div><strong>Nombre de pesées :</strong><br>${safeArray(bird.historiquePoids).length}</div>
          <div><strong>Nombre de nourrissages :</strong><br>${birdFeeds.length}</div>
          <div><strong>Total pièces nourries :</strong><br>${totalFeeds}</div>
          <div><strong>Documents liés :</strong><br>${safeArray(bird.documents).length}</div>
        </div>
      </div>

      <div class="box">
        <h2>Documents liés</h2>
        ${docsRows ? `<ul>${docsRows}</ul>` : `<p>Aucun document.</p>`}
        <p class="muted">Les liens restent cliquables dans le PDF exporté selon le navigateur.</p>
      </div>

      <div class="box">
        <h2>Historique des poids</h2>
        ${
          poidsRows
            ? `<table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Poids (g)</th>
                  </tr>
                </thead>
                <tbody>${poidsRows}</tbody>
              </table>`
            : `<p>Aucun poids enregistré.</p>`
        }
      </div>

      <div class="box">
        <h2>Historique des nourrissages</h2>
        ${
          feedRows
            ? `<table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Nourriture</th>
                    <th>Quantité</th>
                    <th>Remarques</th>
                  </tr>
                </thead>
                <tbody>${feedRows}</tbody>
              </table>`
            : `<p>Aucun nourrissage enregistré pour cet oiseau.</p>`
        }
      </div>
    </body>
    </html>
  `);

  win.document.close();
}

  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Fiche complète ${safe(bird.nom)}</title>
      <style>
        body{
          font-family:Arial,Helvetica,sans-serif;
          color:#111;
          padding:24px;
          line-height:1.45;
        }
        h1,h2,h3{
          margin-bottom:8px;
        }
        .top{
          display:flex;
          gap:24px;
          align-items:flex-start;
          margin-bottom:18px;
        }
        img{
          max-width:280px;
          border-radius:12px;
        }
        table{
          width:100%;
          border-collapse:collapse;
          margin-top:12px;
        }
        th,td{
          border:1px solid #ccc;
          padding:8px;
          text-align:left;
          vertical-align:top;
        }
        th{
          background:#f2f2f2;
        }
        .box{
          margin-top:18px;
          padding:14px;
          border:1px solid #ddd;
          border-radius:10px;
        }
        ul{
          margin:8px 0 0 20px;
        }
        .muted{
          color:#666;
        }
        .resume{
          display:grid;
          grid-template-columns:repeat(2, minmax(220px, 1fr));
          gap:10px;
          margin-top:10px;
        }
        .resume div{
          border:1px solid #ddd;
          border-radius:8px;
          padding:10px;
          background:#fafafa;
        }
        @media print{
          button{display:none}
          body{padding:10px}
        }
      </style>
    </head>
    <body>
      <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>

      <h1>Fiche complète oiseau : ${safe(bird.nom)}</h1>

      <div class="top">
        <div>
          ${bird.photoUrl ? `<img src="${safeAttr(bird.photoUrl)}" alt="${safeAttr(bird.nom)}">` : `<p>Pas de photo</p>`}
        </div>
        <div style="flex:1">
          <p><strong>Espèce :</strong> ${safe(bird.espece || "-")}</p>
          <p><strong>Sexe :</strong> ${safe(bird.sexe || "-")}</p>
          <p><strong>Âge :</strong> ${safe(bird.age || "-")}</p>
          <p><strong>Poids actuel :</strong> ${safe(bird.poidsActuel || "-")} g</p>
          <p><strong>Nourriture habituelle 1 :</strong> ${safe(bird.nourritureHabituelle || "-")} (${safe(bird.quantiteHabituelle || 0)} pièce(s))</p>
          <p><strong>Nourriture habituelle 2 :</strong> ${safe(bird.nourritureHabituelle2 || "-")} ${bird.nourritureHabituelle2 ? `(${safe(bird.quantiteHabituelle2 || 0)} pièce(s))` : ""}</p>
        </div>
      </div>

      <div class="box">
        <h2>Notes</h2>
        <p>${safe(bird.notes || "Aucune note")}</p>
      </div>

      <div class="box">
        <h2>Résumé</h2>
        <div class="resume">
          <div><strong>Nombre de pesées :</strong><br>${safeArray(bird.historiquePoids).length}</div>
          <div><strong>Nombre de nourrissages :</strong><br>${birdFeeds.length}</div>
          <div><strong>Total pièces nourries :</strong><br>${totalFeeds}</div>
          <div><strong>Documents liés :</strong><br>${safeArray(bird.documents).length}</div>
        </div>
      </div>

      <div class="box">
        <h2>Documents liés</h2>
        ${docsRows ? `<ul>${docsRows}</ul>` : `<p>Aucun document.</p>`}
        <p class="muted">Les liens restent cliquables dans le PDF exporté selon le navigateur.</p>
      </div>

      <div class="box">
        <h2>Historique des poids</h2>
        ${
          poidsRows
            ? `<table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Poids (g)</th>
                  </tr>
                </thead>
                <tbody>${poidsRows}</tbody>
              </table>`
            : `<p>Aucun poids enregistré.</p>`
        }
      </div>

      <div class="box">
        <h2>Historique des nourrissages</h2>
        ${
          feedRows
            ? `<table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Nourriture</th>
                    <th>Quantité</th>
                    <th>Remarques</th>
                  </tr>
                </thead>
                <tbody>${feedRows}</tbody>
              </table>`
            : `<p>Aucun nourrissage enregistré pour cet oiseau.</p>`
        }
      </div>
    </body>
    </html>
  `);

  win.document.close();
  

function partagerFicheOiseau(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  const text = `Fiche oiseau : ${bird.nom}`;

  // On ouvre le PDF d'abord
  const url = window.location.href;

  if (navigator.share) {
    navigator.share({
      title: text,
      text: text,
      url: url
    }).catch((err) => console.log("Erreur partage", err));
  } else {
    navigator.clipboard.writeText(url);
    alert("Lien copié ! Tu peux maintenant le coller pour partager.");
  }
}

  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Fiche ${safe(bird.nom)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:24px}
        h1,h2{margin-bottom:8px}
        .top{display:flex;gap:24px;align-items:flex-start}
        img{max-width:280px;border-radius:12px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ccc;padding:8px;text-align:left}
        .box{margin-top:18px;padding:14px;border:1px solid #ddd;border-radius:10px}
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
        ${
          poidsRows
            ? `<table><thead><tr><th>Date</th><th>Poids (g)</th></tr></thead><tbody>${poidsRows}</tbody></table>`
            : `<p>Aucun poids enregistré.</p>`
        }
      </div>
    </body>
    </html>
  `);

  win.document.close();
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
window.supprimerNourrissage = supprimerNourrissage;
window.exportBirdPdf = exportBirdPdf;
window.quickFeed = quickFeed;
window.rationHabituelleTerrain = rationHabituelleTerrain;
window.checkPin = checkPin;
window.partagerFicheOiseau = partagerFicheOiseau;

document.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("locked");

  await loadData();

  const pinInput = document.getElementById("pinInput");
  if (pinInput) {
    pinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") checkPin();
    });
    pinInput.focus();
  }

  const feedDate = document.getElementById("feedDate");
  if (feedDate) {
    feedDate.addEventListener("change", () => {
      renderNourrissageSummary();
    });
  }

  const stockBoxes = document.getElementById("stockBoitePoussinsMoyenne225");
  if (stockBoxes) {
    stockBoxes.addEventListener("input", () => {
      const previewPieces = document.getElementById("stockPoussin");
      if (previewPieces) {
        previewPieces.value = Math.max(0, toNumber(stockBoxes.value || 0)) * BOITE_POUSSIN_CAPACITE;
      }
    });
  }

  resetBirdForm();
  showSection("accueil");
});