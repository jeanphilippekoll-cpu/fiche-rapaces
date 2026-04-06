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

const statusEl = document.getElementById("status");

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
    alerteBasse: o.alerteBasse || "",
    alerteHaute: o.alerteHaute || "",
    documentNom: o.documentNom || "",
    documentUrl: o.documentUrl || ""
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
    observations: e.observations || e.notes || "",
    nombre: e.nombre || "",
    poidsNourriture: e.poidsNourriture || "",
    variation: e.variation || ""
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

  stock.boitePoussinsMoyenne225 = computeBoitesFromPoussins(stock.poussin);

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
    const ancien = oldBirds.find((b) => (b?.nom || "") === (o.nom || ""));

    return {
      ...ancien,
      nom: o.nom || "",
      espece: o.espece || "",
      sexe: o.sexe || "",
      age: o.age || "",
      poidsActuel: o.poidsActuel ?? "",
      notes: o.notes || "",
      nourritureHabituelle: o.nourritureHabituelle || "",
      quantiteHabituelle: toNumber(o.quantiteHabituelle),
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
    observations: e.observations || "",
    nombre: e.nombre || "",
    poidsNourriture: e.poidsNourriture || "",
    variation: e.variation || ""
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

function getPeseesLies(oiseauNom) {
  return appData.pesees.filter(
    (e) => (e.nom || "").trim().toLowerCase() === (oiseauNom || "").trim().toLowerCase()
  );
}

function renderHistoriquePoids(historique) {
  if (!historique.length) {
    return `<p class="muted-line">Aucun historique de poids.</p>`;
  }

  return `
    <div class="stack-list">
      ${historique.map((h) => `
        <div class="mini-row">
          <span>${safe(h.date)}</span>
          <strong>${safe(h.poids)} g</strong>
        </div>
      `).join("")}
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

function renderPeseesLies(pesees) {
  if (!pesees.length) {
    return `<p class="muted-line">Aucune pesée liée.</p>`;
  }

  return `
    <div class="stack-list">
      ${pesees.map((item) => `
        <div class="sub-item">
          <p><strong>Date :</strong> ${safe(item.date)}</p>
          <p><strong>Poids :</strong> ${safe(item.poids)}</p>
          <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
          ${item.observations ? `<p><strong>Observations :</strong> ${safe(item.observations)}</p>` : ""}
        </div>
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
      ${appData.oiseaux.map((oiseau) => {
        const peseesLies = getPeseesLies(oiseau.nom);

        return `
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
              <p>${safe(oiseau.nourritureHabituelle || "Non définie")}</p>
              <p>Quantité : ${safe(oiseau.quantiteHabituelle || 0)} pièce(s)</p>
            </div>

            <div class="card-section">
              <h4>Documents liés</h4>
              ${renderDocumentsOiseau(oiseau.documents)}
            </div>

            <div class="card-section">
              <h4>Historique du poids</h4>
              ${renderHistoriquePoids(oiseau.historiquePoids)}
            </div>

            <div class="card-section">
              <h4>Pesées liées</h4>
              ${renderPeseesLies(peseesLies)}
            </div>

            <div class="small-actions">
              <button class="btn btn-danger" onclick="supprimerOiseau('${oiseau.id}')">Supprimer</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderPesees() {
  const zone = document.getElementById("listePesees");
  if (!zone) return;

  if (!appData.pesees.length) {
    zone.innerHTML = `<p class="muted-line">Aucune pesée.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="list-grid">
      ${appData.pesees.map((item) => `
        <div class="item">
          <p><strong>Date :</strong> ${safe(item.date)}</p>
          <p><strong>Nom :</strong> ${safe(item.nom)}</p>
          <p><strong>Espèce :</strong> ${safe(item.espece)}</p>
          <p><strong>Poids :</strong> ${safe(item.poids)}</p>
          <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
          <p><strong>État :</strong> ${safe(item.etat)}</p>
          <p><strong>Observations :</strong> ${safe(item.observations)}</p>
          <div class="small-actions">
            <button class="btn btn-danger" onclick="supprimerPesee('${item.id}')">Supprimer</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
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
    <option value="">Choisir</option>
    ${ALIMENTS.map((food) => `
      <option value="${safeAttr(food)}" ${food === selected ? "selected" : ""}>
        ${safe(food)}
      </option>
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
      <button class="btn secondary-btn" onclick="appliquerNourritureHabituelle()">
        Remplir avec nourriture habituelle
      </button>
      <button class="btn secondary-btn" onclick="viderTableNourrissage()">
        Vider le tableau
      </button>
    </div>

    <div class="feed-table-wrap">
      <table class="feed-table">
        <thead>
          <tr>
            <th>Oiseau</th>
            <th>Espèce</th>
            <th>Nourriture</th>
            <th>Quantité (pièces)</th>
          </tr>
        </thead>
        <tbody>
          ${appData.oiseaux.map((oiseau) => `
            <tr>
              <td>${safe(oiseau.nom)}</td>
              <td>${safe(oiseau.espece)}</td>
              <td>
                <select id="feedFood_${safeAttr(oiseau.id)}">
                  ${getFoodOptionsHtml()}
                </select>
              </td>
              <td>
                <input
                  id="feedQty_${safeAttr(oiseau.id)}"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                >
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
      ${
        foods.length
          ? foods.map(([food, qty]) => `<p>${safe(food)} : ${safe(qty)}</p>`).join("")
          : `<p>Aucun nourrissage.</p>`
      }
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
      ${renderAggregateBlock(`Jour (${dateRef})`, todayItems)}
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

  const sorted = [...appData.nourrissage].sort((a, b) => {
    return (b.date || "").localeCompare(a.date || "");
  });

  zone.innerHTML = `
    <div class="list-grid">
      ${sorted.map((item) => `
        <div class="item">
          <p><strong>Date :</strong> ${safe(item.date)}</p>
          <p><strong>Oiseau :</strong> ${safe(item.oiseau)}</p>
          <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
          <p><strong>Quantité :</strong> ${safe(item.quantite)}</p>
          <p><strong>Remarques :</strong> ${safe(item.remarques)}</p>
          <div class="small-actions">
            <button class="btn btn-danger" onclick="supprimerNourrissage('${item.id}')">Supprimer</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderNourrissage() {
  renderNourrissageTable();
  renderNourrissageSummary();
  renderNourrissageHistory();
}

function fillStockForm() {
  syncBoitesFromPoussins();

  const ids = {
    poussin: "stockPoussin",
    caille: "stockCaille",
    pigeon: "stockPigeon",
    lapin: "stockLapin",
    poisson: "stockPoisson",
    souris: "stockSouris",
    cailleteau30gr: "stockCailleteau30gr",
    boitePoussinsMoyenne225: "stockBoitePoussinsMoyenne225"
  };

  Object.entries(ids).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = appData.stock[key] ?? 0;
  });
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
    const payload = buildFirestorePayload();
    await setDoc(doc(db, "rapaces", "data"), payload);
    rawRapacesData = payload;
    if (statusEl) statusEl.textContent = "Sauvegardé";
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Erreur sauvegarde";
  }
}

async function loadData() {
  try {
    if (statusEl) statusEl.textContent = "Chargement…";

    const refDoc = doc(db, "rapaces", "data");
    const snap = await getDoc(refDoc);

    if (snap.exists()) {
      rawRapacesData = snap.data();
      appData = normalizeData(rawRapacesData);
    } else {
      rawRapacesData = {};
      appData = normalizeData({});
    }

    renderAll();
    if (statusEl) statusEl.textContent = "Données chargées";
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Erreur chargement";
  }
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

  const photoFile = document.getElementById("oiseauPhotoFile")?.files?.[0] || null;
  const docFile = document.getElementById("oiseauDocFile")?.files?.[0] || null;

  let photoUrl = "";
  let documents = [];

  try {
    if (statusEl) statusEl.textContent = "Upload des fichiers...";

    if (photoFile) {
      photoUrl = await uploadFile(
        photoFile,
        `oiseaux/photos/${nom}_${Date.now()}_${photoFile.name}`
      );
    }

    if (docFile) {
      const docUrl = await uploadFile(
        docFile,
        `oiseaux/documents/${nom}_${Date.now()}_${docFile.name}`
      );

      documents.push({
        name: docFile.name,
        url: docUrl
      });
    }

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
      photoUrl,
      documents,
      historiquePoids: []
    });

    [
      "oiseauNom",
      "oiseauEspece",
      "oiseauSexe",
      "oiseauAge",
      "oiseauPoids",
      "oiseauNotes",
      "oiseauHabitudeQty"
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const habFoodEl = document.getElementById("oiseauHabitudeFood");
    if (habFoodEl) habFoodEl.value = "";

    const photoInput = document.getElementById("oiseauPhotoFile");
    const docInput = document.getElementById("oiseauDocFile");
    if (photoInput) photoInput.value = "";
    if (docInput) docInput.value = "";

    renderAll();

    if (statusEl) statusEl.textContent = "Oiseau ajouté";
  } catch (e) {
    console.error("Erreur upload :", e);
    if (statusEl) statusEl.textContent = "Erreur upload";
    alert("Erreur pendant l'upload de la photo ou du document.");
  }
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

  ["pesNom","pesEspece","pesPoids","pesNourriture","pesEtat","pesLieu","pesObs"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderAll();
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

  ["docTitre","docType","docDescription"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderAll();
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
    const foodEl = document.getElementById(`feedFood_${oiseau.id}`);
    const qtyEl = document.getElementById(`feedQty_${oiseau.id}`);

    const nourriture = foodEl?.value || "";
    const quantite = toNumber(qtyEl?.value || 0);

    if (!nourriture || quantite <= 0) return;

    lignes.push({
      id: makeId(),
      date,
      oiseau: oiseau.nom || "",
      nourriture,
      quantite,
      remarques
    });
  });

  if (!lignes.length) {
    alert("Choisis au moins une nourriture et une quantité pour un oiseau.");
    return;
  }

  lignes.forEach((ligne) => {
    decrementStock(ligne.nourriture, ligne.quantite);
    appData.nourrissage.unshift(ligne);
  });

  appData.oiseaux.forEach((oiseau) => {
    const foodEl = document.getElementById(`feedFood_${oiseau.id}`);
    const qtyEl = document.getElementById(`feedQty_${oiseau.id}`);

    if (foodEl) foodEl.value = "";
    if (qtyEl) qtyEl.value = "";
  });

  const noteEl = document.getElementById("feedNote");
  if (noteEl) noteEl.value = "";

  renderAll();

  if (statusEl) statusEl.textContent = `${lignes.length} nourrissage(s) ajouté(s)`;
}

function appliquerNourritureHabituelle() {
  appData.oiseaux.forEach((oiseau) => {
    const foodEl = document.getElementById(`feedFood_${oiseau.id}`);
    const qtyEl = document.getElementById(`feedQty_${oiseau.id}`);

    if (foodEl && oiseau.nourritureHabituelle) {
      foodEl.value = oiseau.nourritureHabituelle;
    }

    if (qtyEl && toNumber(oiseau.quantiteHabituelle) > 0) {
      qtyEl.value = toNumber(oiseau.quantiteHabituelle);
    }
  });

  if (statusEl) statusEl.textContent = "Nourriture habituelle appliquée";
}

function viderTableNourrissage() {
  appData.oiseaux.forEach((oiseau) => {
    const foodEl = document.getElementById(`feedFood_${oiseau.id}`);
    const qtyEl = document.getElementById(`feedQty_${oiseau.id}`);

    if (foodEl) foodEl.value = "";
    if (qtyEl) qtyEl.value = "";
  });

  if (statusEl) statusEl.textContent = "Tableau vidé";
}

function enregistrerStock() {
  appData.stock = {
    poussin: Math.max(0, toNumber(document.getElementById("stockPoussin")?.value || 0)),
    caille: Math.max(0, toNumber(document.getElementById("stockCaille")?.value || 0)),
    pigeon: Math.max(0, toNumber(document.getElementById("stockPigeon")?.value || 0)),
    lapin: Math.max(0, toNumber(document.getElementById("stockLapin")?.value || 0)),
    poisson: Math.max(0, toNumber(document.getElementById("stockPoisson")?.value || 0)),
    souris: Math.max(0, toNumber(document.getElementById("stockSouris")?.value || 0)),
    cailleteau30gr: Math.max(0, toNumber(document.getElementById("stockCailleteau30gr")?.value || 0)),
    boitePoussinsMoyenne225: 0
  };

  syncBoitesFromPoussins();
  renderAll();

  if (statusEl) statusEl.textContent = "Stock mis à jour";
}

function supprimerOiseau(id) {
  appData.oiseaux = appData.oiseaux.filter((o) => o.id !== id);
  renderAll();
}

function supprimerPesee(id) {
  appData.pesees = appData.pesees.filter((e) => e.id !== id);
  renderAll();
}

function supprimerDocument(id) {
  appData.documents = appData.documents.filter((d) => d.id !== id);
  renderAll();
}

function restoreStockFromDeletedFeed(item) {
  const stockKey = foodToStockKey(item?.nourriture);
  if (!stockKey) return;

  appData.stock[stockKey] = toNumber(appData.stock[stockKey]) + toNumber(item?.quantite);

  if (stockKey === "poussin") {
    syncBoitesFromPoussins();
  }
}

function supprimerNourrissage(id) {
  const found = appData.nourrissage.find((n) => n.id === id);
  if (found) {
    restoreStockFromDeletedFeed(found);
  }

  appData.nourrissage = appData.nourrissage.filter((n) => n.id !== id);
  renderAll();
}

const pesDateEl = document.getElementById("pesDate");
if (pesDateEl) pesDateEl.value = todayStr();

const feedDateEl = document.getElementById("feedDate");
if (feedDateEl) feedDateEl.value = todayStr();

window.showSection = showSection;
window.saveData = saveData;
window.ajouterOiseau = ajouterOiseau;
window.ajouterPesee = ajouterPesee;
window.ajouterDocument = ajouterDocument;
window.ajouterNourrissage = ajouterNourrissage;
window.appliquerNourritureHabituelle = appliquerNourritureHabituelle;
window.viderTableNourrissage = viderTableNourrissage;
window.enregistrerStock = enregistrerStock;
window.supprimerOiseau = supprimerOiseau;
window.supprimerPesee = supprimerPesee;
window.supprimerDocument = supprimerDocument;
window.supprimerNourrissage = supprimerNourrissage;

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  const feedDate = document.getElementById("feedDate");
  if (feedDate) {
    feedDate.addEventListener("change", () => {
      renderNourrissageSummary();
    });
  }
  showSection("accueil");
});