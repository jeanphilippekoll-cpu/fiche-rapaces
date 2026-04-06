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
  encodages: [],
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
  const encodagesSource = safeArray(data?.encodages);
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
    alerteBasse: o.alerteBasse || "",
    alerteHaute: o.alerteHaute || "",
    documentNom: o.documentNom || "",
    documentUrl: o.documentUrl || ""
  }));

  const encodages = encodagesSource.map((e, index) => ({
    id: e.id || `enc_${index}_${makeId()}`,
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
    encodages,
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

  const encodages = appData.encodages.map((e) => ({
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
  const statEncodages = document.getElementById("statEncodages");
  const statDocuments = document.getElementById("statDocuments");
  const statNourrissages = document.getElementById("statNourrissages");

  if (statOiseaux) statOiseaux.textContent = appData.oiseaux.length;
  if (statEncodages) statEncodages.textContent = appData.encodages.length;
  if (statDocuments) statDocuments.textContent = appData.documents.length;
  if (statNourrissages) statNourrissages.textContent = appData.nourrissage.length;
}

function refreshBirdSelects() {
  const birds = appData.oiseaux
    .map((o) => `<option value="${safeAttr(o.nom)}">${safe(o.nom)}</option>`)
    .join("");

  const encNom = document.getElementById("encNom");
  if (encNom) encNom.innerHTML = `<option value="">Choisir un oiseau</option>${birds}`;
}

function getEncodagesLies(oiseauNom) {
  return appData.encodages.filter(
    (e) => (e.nom || "").trim().toLowerCase() === (oiseauNom || "").trim().toLowerCase()
  );
}

function renderHistoriquePoids(historique) {
  if (!historique.length) {
    return `<p>Aucun historique de poids.</p>`;
  }

  return `
    <div>
      ${historique.map((h) => `
        <p>• ${safe(h.date)} : ${safe(h.poids)} g</p>
      `).join("")}
    </div>
  `;
}

function renderDocumentsOiseau(documents) {
  if (!documents.length) {
    return `<p>Aucun document lié.</p>`;
  }

  return `
    <div>
      ${documents.map((docItem) => `
        <p>
          <a href="${safeAttr(docItem.url)}" target="_blank" rel="noopener noreferrer">
            ${safe(docItem.name)}
          </a>
        </p>
      `).join("")}
    </div>
  `;
}

function renderEncodagesLies(encodages) {
  if (!encodages.length) {
    return `<p>Aucun encodage lié.</p>`;
  }

  return `
    <div>
      ${encodages.map((item) => `
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
    zone.innerHTML = `<p>Aucun oiseau.</p>`;
    return;
  }

  zone.innerHTML = appData.oiseaux.map((oiseau) => {
    const encodagesLies = getEncodagesLies(oiseau.nom);

    return `
      <div class="item">
        <h3>${safe(oiseau.nom)}</h3>

        ${oiseau.photoUrl ? `
          <p>
            <img src="${safeAttr(oiseau.photoUrl)}" alt="${safeAttr(oiseau.nom)}" class="bird-photo">
          </p>
        ` : ""}

        <p><strong>Espèce :</strong> ${safe(oiseau.espece)}</p>
        <p><strong>Sexe :</strong> ${safe(oiseau.sexe)}</p>
        <p><strong>Âge :</strong> ${safe(oiseau.age)}</p>
        <p><strong>Poids actuel :</strong> ${safe(oiseau.poidsActuel)}</p>
        <p><strong>Notes :</strong> ${safe(oiseau.notes)}</p>

        <hr class="sep">

        <h4>Documents liés</h4>
        ${renderDocumentsOiseau(oiseau.documents)}

        <hr class="sep">

        <h4>Historique du poids</h4>
        ${renderHistoriquePoids(oiseau.historiquePoids)}

        <hr class="sep">

        <h4>Encodages liés</h4>
        ${renderEncodagesLies(encodagesLies)}

        <div class="small-actions">
          <button class="btn btn-danger" onclick="supprimerOiseau('${oiseau.id}')">Supprimer</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderEncodages() {
  const zone = document.getElementById("listeEncodages");
  if (!zone) return;

  if (!appData.encodages.length) {
    zone.innerHTML = `<p>Aucun encodage.</p>`;
    return;
  }

  zone.innerHTML = appData.encodages.map((item) => `
    <div class="item">
      <p><strong>Date :</strong> ${safe(item.date)}</p>
      <p><strong>Nom :</strong> ${safe(item.nom)}</p>
      <p><strong>Espèce :</strong> ${safe(item.espece)}</p>
      <p><strong>Poids :</strong> ${safe(item.poids)}</p>
      <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
      <p><strong>État :</strong> ${safe(item.etat)}</p>
      <p><strong>Observations :</strong> ${safe(item.observations)}</p>
      <div class="small-actions">
        <button class="btn btn-danger" onclick="supprimerEncodage('${item.id}')">Supprimer</button>
      </div>
    </div>
  `).join("");
}

function renderDocuments() {
  const zone = document.getElementById("listeDocuments");
  if (!zone) return;

  if (!appData.documents.length) {
    zone.innerHTML = `<p>Aucun document général.</p>`;
    return;
  }

  zone.innerHTML = appData.documents.map((docItem) => `
    <div class="item">
      <h3>${safe(docItem.titre)}</h3>
      <p><strong>Type :</strong> ${safe(docItem.type)}</p>
      <p><strong>Description :</strong> ${safe(docItem.description)}</p>
      ${docItem.lien ? `<p><a href="${safeAttr(docItem.lien)}" target="_blank" rel="noopener noreferrer">Ouvrir le document</a></p>` : ""}
      <div class="small-actions">
        <button class="btn btn-danger" onclick="supprimerDocument('${docItem.id}')">Supprimer</button>
      </div>
    </div>
  `).join("");
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
    zone.innerHTML = `<p>Aucun oiseau disponible.</p>`;
    return;
  }

  zone.innerHTML = `
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
    zone.innerHTML = `<p>Aucun nourrissage.</p>`;
    return;
  }

  const sorted = [...appData.nourrissage].sort((a, b) => {
    return (b.date || "").localeCompare(a.date || "");
  });

  zone.innerHTML = sorted.map((item) => `
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
  `).join("");
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
  renderEncodages();
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
      "oiseauNotes"
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

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

function ajouterEncodage() {
  const nom = document.getElementById("encNom")?.value || "";
  if (!nom) return;

  const date = document.getElementById("encDate")?.value || "";
  const poids = document.getElementById("encPoids")?.value.trim() || "";

  appData.encodages.unshift({
    id: makeId(),
    date,
    nom,
    espece: document.getElementById("encEspece")?.value.trim() || "",
    poids,
    nourriture: document.getElementById("encNourriture")?.value.trim() || "",
    etat: document.getElementById("encEtat")?.value.trim() || "",
    lieu: document.getElementById("encLieu")?.value.trim() || "",
    observations: document.getElementById("encObs")?.value.trim() || ""
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

  const encDateEl = document.getElementById("encDate");
  if (encDateEl) encDateEl.value = todayStr();

  ["encNom","encEspece","encPoids","encNourriture","encEtat","encLieu","encObs"].forEach((id) => {
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

function supprimerEncodage(id) {
  appData.encodages = appData.encodages.filter((e) => e.id !== id);
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

const encDateEl = document.getElementById("encDate");
if (encDateEl) encDateEl.value = todayStr();

const feedDateEl = document.getElementById("feedDate");
if (feedDateEl) feedDateEl.value = todayStr();

window.showSection = showSection;
window.saveData = saveData;
window.ajouterOiseau = ajouterOiseau;
window.ajouterEncodage = ajouterEncodage;
window.ajouterDocument = ajouterDocument;
window.ajouterNourrissage = ajouterNourrissage;
window.enregistrerStock = enregistrerStock;
window.supprimerOiseau = supprimerOiseau;
window.supprimerEncodage = supprimerEncodage;
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