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
const BOITE_POUSSIN_CAPACITE = 225;

const ALIMENTS = [
  "Poussin",
  "Caille",
  "Pigeon",
  "Lapin",
  "Poisson",
  "Souris",
  "Rat",
  "Cailleteau 30gr"
];

let rawRapacesData = {};
let rawUserData = {};
let editingBirdId = null;
let autoSaveTimer = null;
let editingFeedId = null;

let appData = {
  oiseaux: [],
  nourrissage: [],
  stock: {},
  veterinaire: [],
  entretien: [],

  prixNourriture: {
    "Poussin": 0,
    "Caille": 0,
    "Pigeon": 0,
    "Lapin": 0,
    "Poisson": 0,
    "Souris": 0,
    "Rat": 0,
    "Cailleteau 30gr": 0
  },
  coutOiseauxMasques: [],
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

function sameDay(d1, d2) {
  return (d1 || "") === (d2 || "");
}

function isBirdArchived(oiseau) {
  return (
    (oiseau?.registreSortie || "").trim() !== "" ||
    (oiseau?.dateSortie || "").trim() !== ""
  );
}

function getActiveBirds() {
  return safeArray(appData.oiseaux).filter((o) => !isBirdArchived(o));
}

function getArchivedBirds() {
  return safeArray(appData.oiseaux).filter((o) => isBirdArchived(o));
}

function getSortedBirds(list) {
  return safeArray(list)
    .slice()
    .sort((a, b) => {
      const ordreA = toNumber(a?.ordre) || 9999;
      const ordreB = toNumber(b?.ordre) || 9999;
      if (ordreA !== ordreB) return ordreA - ordreB;
      return (a?.nom || "").localeCompare(b?.nom || "");
    });
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
  if (key === "rat") return "rat";
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
  return todayStr();
}

function triggerAutoSave(delay = 600) {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await saveData();
  }, delay);
}

function unlockApp() {
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

async function uploadMultipleFiles(files, basePath) {
  const list = Array.from(files || []);
  const results = [];
  for (const file of list) {
    const url = await uploadFile(file, `${basePath}/${Date.now()}_${file.name}`);
    results.push({
      name: file.name,
      url
    });
  }
  return results;
}

function normalizeHistoriquePoids(list) {
  return safeArray(list).map((item) => ({
    date: item?.date || "",
    poids: item?.poids ?? ""
  }));
}

function normalizeDocuments(list) {
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

function normalizeVeterinaire(list) {
  return safeArray(list).map((item, index) => ({
    id: item?.id || `vet_${index}_${makeId()}`,
    oiseau: item?.oiseau || "",
    date: item?.date || "",
    veterinaire: item?.veterinaire || "",
    motif: item?.motif || "",
    diagnostic: item?.diagnostic || "",
    traitement: item?.traitement || "",
    protocole: item?.protocole || "",
    observations: item?.observations || "",
    fichiers: normalizeDocuments(item?.fichiers)
  }));
}

function normalizeData(rapacesData, userData) {
  const oiseauxSource = safeArray(rapacesData?.oiseaux);
  const peseesSource = safeArray(userData?.encodages || rapacesData?.encodages || []);
  const documentsSource = safeArray(rapacesData?.documents);
  const documentsGenerauxSource = safeArray(rapacesData?.documentsGeneraux);
  const nourrissageSource = safeArray(userData?.nourrissage || rapacesData?.nourrissage || []);
  const veterinaireSource = safeArray(userData?.veterinaire || rapacesData?.veterinaire || []);

  const oiseaux = oiseauxSource.map((o, index) => ({
  id: o.id || `oiseau_${index}_${makeId()}`,
  nom: o.nom || "",
  ordre: toNumber(o.ordre),
  bague: o.bague || "",
  cites: o.cites || "",
  carteVerte: o.carteVerte || "",
  espece: o.espece || "",
  sexe: o.sexe || "",
  age: o.age || "",
  annexe: o.annexe || "",
  dateEntree: o.dateEntree || "",
  registreEntree: o.registreEntree || "",
  statut: o.statut || "En place",
  dateSortie: o.dateSortie || "",
  registreSortie: o.registreSortie || "",
  motifSortie: o.motifSortie || "",
  poidsActuel: o.poidsActuel ?? "",
  poidsVol: toNumber(o.poidsVol),
  toleranceVol: toNumber(o.toleranceVol),
  notes: o.notes || "",
  photoUrl: getSafeUrl(o?.photo) || getSafeUrl(o?.photoUrl) || "",
  documents: normalizeDocuments(o.documents),
  historiquePoids: normalizeHistoriquePoids(o.historiquePoids),
  nourritureHabituelle: o.nourritureHabituelle || "Poussin",
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
    rat: toNumber(rapacesData?.stock?.rat),
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
    veterinaire: normalizeVeterinaire(veterinaireSource),
   entretien: safeArray(userData?.entretien || rapacesData?.entretien),
   stock,
   prixNourriture: {
    "Poussin": toNumber(rapacesData?.prixNourriture?.["Poussin"]),
    "Caille": toNumber(rapacesData?.prixNourriture?.["Caille"]),
    "Pigeon": toNumber(rapacesData?.prixNourriture?.["Pigeon"]),
    "Lapin": toNumber(rapacesData?.prixNourriture?.["Lapin"]),
    "Poisson": toNumber(rapacesData?.prixNourriture?.["Poisson"]),
    "Souris": toNumber(rapacesData?.prixNourriture?.["Souris"]),
    "Rat": toNumber(rapacesData?.prixNourriture?.["Rat"]),
    "Cailleteau 30gr": toNumber(rapacesData?.prixNourriture?.["Cailleteau 30gr"])
},
coutOiseauxMasques: safeArray(rapacesData?.coutOiseauxMasques)
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
      ordre: toNumber(o.ordre),
      bague: o.bague || "",
      cites: o.cites || "",
      carteVerte: o.carteVerte || "",
      espece: o.espece || "",
      sexe: o.sexe || "",
      age: o.age || "",
      annexe: o.annexe || "",
      dateEntree: o.dateEntree || "",
      registreEntree: o.registreEntree || "",
      statut: o.statut || "En place",
      dateSortie: o.dateSortie || "",
      registreSortie: o.registreSortie || "",
      motifSortie: o.motifSortie || "",
      poidsActuel: o.poidsActuel ?? "",
      poidsVol: toNumber(o.poidsVol),
      toleranceVol: toNumber(o.toleranceVol),
      notes: o.notes || "",
      nourritureHabituelle: o.nourritureHabituelle || "Poussin",
      quantiteHabituelle: toNumber(o.quantiteHabituelle),
      nourritureHabituelle2: o.nourritureHabituelle2 || "",
      quantiteHabituelle2: toNumber(o.quantiteHabituelle2),
      photo: {
        ...(ancien?.photo || {}),
        url: o.photoUrl || ""
      },
      documents: normalizeDocuments(o.documents),
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
      rat: toNumber(appData.stock.rat),
      cailleteau30gr: toNumber(appData.stock.cailleteau30gr),
      boitePoussinsMoyenne225: computeBoitesFromPoussins(appData.stock.poussin)
    },
    documents: appData.documents
      .filter((d) => (d.type || "") !== "Document général")
      .map((d) => ({
        id: d.id || makeId(),
        titre: d.titre || "Document",
        type: d.type || "Document",
        description: d.description || "",
        lien: d.lien || ""
      })),
    documentsGeneraux: appData.documents
      .filter((d) => (d.type || "") === "Document général")
      .map((d) => ({
        id: d.id || makeId(),
        titre: d.titre || "Document général",
        type: d.type || "Document général",
        description: d.description || "",
        lien: d.lien || ""
      })),
      prixNourriture: appData.prixNourriture || {},
      coutOiseauxMasques: safeArray(appData.coutOiseauxMasques)
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
    })),
    veterinaire: appData.veterinaire.map((v) => ({
      id: v.id || makeId(),
      oiseau: v.oiseau || "",
      date: v.date || "",
      veterinaire: v.veterinaire || "",
      motif: v.motif || "",
      diagnostic: v.diagnostic || "",
      traitement: v.traitement || "",
      protocole: v.protocole || "",
      observations: v.observations || "",
      fichiers: normalizeDocuments(v.fichiers)
    })),
    entretien: safeArray(appData.entretien)
  };
}

function showSection(section) {
  document.querySelectorAll(".section").forEach((el) => el.classList.add("hidden"));

  document.querySelectorAll(".nav button, .sidebar button").forEach((btn) => {
    btn.classList.remove("active");
  });

  document.getElementById(`section-${section}`)?.classList.remove("hidden");
  document.getElementById(`btn-${section}`)?.classList.add("active");

  if (section === "vacances") renderVacances();
}

function refreshStats() {
  const setCounter = (ids, value) => {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  };

  setCounter(["statOiseaux", "statoiseaux", "stat-oiseaux"], getActiveBirds().length);
  setCounter(["statPesees", "statpesees", "stat-pesees"], appData.pesees.length);
  setCounter(["statDocuments", "statdocuments", "stat-documents"], appData.documents.length);
  setCounter(["statNourrissages", "statnourrissages", "stat-nourrissages"], appData.nourrissage.length);
}


function dashboardRow(title, detail, badge, type = "info", birdName = "") {
  const clickAttr = birdName
    ? ` onclick="openBirdFromDashboard('${safeAttr(birdName)}')"`
    : "";

  return `
    <div class="dashboard-row"${clickAttr}>
      <div>
        <strong>${safe(title)}</strong>
        <small>${safe(detail)}</small>
      </div>
      <span class="dashboard-badge ${safeAttr(type)}">${safe(badge)}</span>
    </div>
  `;
}

function getLatestBirdWeight(bird) {
  const historique = safeArray(bird.historiquePoids)
    .filter((p) => p.date && p.poids)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (historique.length) return toNumber(historique[0].poids);
  return toNumber(bird.poidsActuel);
}

function getComplementDoseMl(bird) {
  const poids = getLatestBirdWeight(bird) || toNumber(bird.poidsActuel);
  if (!poids) return "dose à définir";
  if (poids < 200) return "0,5 ml";
  if (poids < 500) return "1 ml";
  if (poids < 900) return "1,5 ml";
  return "2 ml";
}

function getDashboardComplementPlan(dayIndex, bird) {
  const notes = `${bird.notes || ""} ${bird.age || ""}`.toLowerCase();

  if (notes.includes("jeune")) {
    if ([2, 4].includes(dayIndex)) return "Feather Energy";
    return "";
  }

  if (dayIndex === 1) return "Aminovital";
  if (dayIndex === 3) return "Feather Energy";
  if (dayIndex === 5) return "Aminovital + Condi Plus";

  return "";
}

function getBandageCarePlan(bird) {
  const notes = `${bird.notes || ""} ${bird.statut || ""}`.toLowerCase();

  const hasCare =
    notes.includes("bandage") ||
    notes.includes("pansement") ||
    notes.includes("convalescence") ||
    notes.includes("bless") ||
    notes.includes("soin");

  if (!hasCare) return "";

  const startDate = bird.dateEntree || todayStr();
  const today = new Date(todayStr());
  const start = new Date(startDate);
  const days = Math.floor((today - start) / 86400000);

  if (!Number.isFinite(days)) return "";

  if (days % 4 === 0) {
    return "Bandage / pansement à faire";
  }

  return "";
}

function renderDashboardIntelligent() {
  const dateEl = document.getElementById("dashboardDate");
  const toWeighEl = document.getElementById("dashboardToWeigh");
  const toFlyEl = document.getElementById("dashboardToFly");
  const complementsEl = document.getElementById("dashboardComplements");
  const surveillanceEl = document.getElementById("dashboardSurveillance");
  const tasksEl = document.getElementById("dashboardTasks");
  const alertsEl = document.getElementById("dashboardAlerts");

  const today = todayStr();
  const now = new Date();
  const birds = getSortedBirds(getActiveBirds());

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("fr-BE", {
      weekday: "long",
      day: "2-digit",
      month: "long"
    });
  }

  const latestWeightDate = (bird) => {
    const hist = safeArray(bird.historiquePoids)
      .filter(p => p.date)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return hist[0]?.date || "";
  };

  const daysSince = (dateStr) => {
    if (!dateStr) return 999;
    const d1 = new Date(dateStr);
    const d2 = new Date(today);
    return Math.floor((d2 - d1) / 86400000);
  };

  const weighedToday = new Set(
    safeArray(appData.pesees)
      .filter(p => p.date === today)
      .map(p => (p.nom || "").trim().toLowerCase())
  );

  const fedToday = new Set(
    safeArray(appData.nourrissage)
      .filter(n => n.date === today)
      .map(n => (n.oiseau || "").trim().toLowerCase())
  );

  const toWeigh = birds.filter(b => {
    const name = (b.nom || "").trim().toLowerCase();
    return !weighedToday.has(name) && daysSince(latestWeightDate(b)) >= 2;
  });

  const toFly = birds.filter(b => {
    const poids = getLatestBirdWeight(b);
    const poidsVol = toNumber(b.poidsVol);
    const tolerance = toNumber(b.toleranceVol) || 20;
    return poidsVol > 0 && poids > 0 && Math.abs(poids - poidsVol) <= tolerance;
  });

  const complements = birds
    .map(b => {
      const plan = getDashboardComplementPlan(now.getDay(), b);
      if (!plan) return null;
      return { bird: b, plan };
    })
    .filter(Boolean);

  const soins = birds
  .map(b => {
    const care = getBandageCarePlan(b);
    return care ? { bird: b, care } : null;
  })
  .filter(Boolean);

  const alerts = [];

  birds.forEach(b => {
    const poids = getLatestBirdWeight(b);
    const poidsVol = toNumber(b.poidsVol);

    if (poidsVol > 0 && poids > 0 && poids > poidsVol + 40) {
      alerts.push(
        dashboardRow(
          b.nom,
          `${poids} g / point de vol ${poidsVol} g`,
          "Trop haut",
          "danger",
          b.nom
        )
      );
    }

    const name = (b.nom || "").trim().toLowerCase();

    if (!fedToday.has(name)) {
      alerts.push(
        dashboardRow(
          b.nom,
          "Aucun nourrissage enregistré aujourd’hui",
          "Nourrir",
          "warn",
          b.nom
        )
      );
    }
  });

  const stock = appData.stock || {};

  if (toNumber(stock.poussin) > 0 && toNumber(stock.poussin) < 30) {
    alerts.push(dashboardRow("Stock poussins", `${stock.poussin} restants`, "Faible", "warn"));
  }

  if (toNumber(stock.caille) > 0 && toNumber(stock.caille) < 10) {
    alerts.push(dashboardRow("Stock cailles", `${stock.caille} restantes`, "Faible", "warn"));
  }

  if (toWeighEl) {
    toWeighEl.innerHTML = toWeigh.length
      ? toWeigh.map(b =>
          dashboardRow(
            b.nom,
            `Dernière pesée : ${formatDateFR(latestWeightDate(b)) || "inconnue"}`,
            "À peser",
            "warn",
            b.nom
          )
        ).join("")
      : `<p class="muted-line">Aucun oiseau à peser aujourd’hui.</p>`;
  }

  if (toFlyEl) {
    toFlyEl.innerHTML = toFly.length
      ? toFly.map(b =>
          dashboardRow(
            b.nom,
            `${getLatestBirdWeight(b)} g / point de vol ${toNumber(b.poidsVol)} g`,
            "Prêt",
            "ok",
            b.nom
          )
        ).join("")
      : `<p class="muted-line">Aucun oiseau dans sa plage de vol.</p>`;
  }

  if (complementsEl) {
    complementsEl.innerHTML = complements.length
      ? complements.map(x =>
          dashboardRow(
            x.bird.nom,
            `${x.plan} - ${getComplementDoseMl(x.bird)}`,
            "Aujourd’hui",
            "info",
            x.bird.nom
          )
        ).join("")
      : `<p class="muted-line">Aucun complément prévu aujourd’hui.</p>`;
  }

if (surveillanceEl) {
  surveillanceEl.innerHTML = soins.length
    ? soins.map(x =>
        dashboardRow(
          x.bird.nom,
          x.care,
          "Bandage",
          "danger",
          x.bird.nom
        )
      ).join("")
    : `<p class="muted-line">Aucun bandage / soin prévu aujourd’hui.</p>`;
}

  if (tasksEl) {
    tasksEl.innerHTML = `
      ${dashboardRow("Contrôle général", "Eau, fientes, appétit, comportement", "Chaque jour", "ok")}
      ${dashboardRow("Nourrissage", `${fedToday.size} oiseaux nourris aujourd’hui`, "Suivi", "info")}
      ${dashboardRow("Stock", "Vérifier poussins, cailles, pigeons et cailleteaux", "Stock", "warn")}
    `;
  }

  if (alertsEl) {
    alertsEl.innerHTML = alerts.length
      ? alerts.join("")
      : `<p class="muted-line">Aucune alerte active.</p>`;
  }
}

function refreshBirdSelects() {
  const birds = getSortedBirds(getActiveBirds())
    .map((o) => `<option value="${safeAttr(o.nom)}">${safe(o.nom)}</option>`)
    .join("");

  const pesNom = document.getElementById("pesNom");
  const vetBird = document.getElementById("vetBird");
  const vetFilterBird = document.getElementById("vetFilterBird");

  if (pesNom) pesNom.innerHTML = `<option value="">Choisir un oiseau</option>${birds}`;
  if (vetBird) vetBird.innerHTML = `<option value="">Choisir un oiseau</option>${birds}`;
  if (vetFilterBird) vetFilterBird.innerHTML = `<option value="">Tous les oiseaux</option>${birds}`;
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

function renderDocumentsList(documents) {
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

function getFeedsForBird(birdName) {
  return safeArray(appData.nourrissage)
    .filter((n) => (n.oiseau || "").trim().toLowerCase() === (birdName || "").trim().toLowerCase())
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function getBirdFeedStats(birdName) {
  const feeds = getFeedsForBird(birdName);

  const totalParJour = {};
  const totalParAliment = {};
  let totalGeneral = 0;

  feeds.forEach((item) => {
    const date = item.date || "";
    const food = item.nourriture || "Inconnu";
    const qty = toNumber(item.quantite);

    totalParJour[date] = (totalParJour[date] || 0) + qty;
    totalParAliment[food] = (totalParAliment[food] || 0) + qty;
    totalGeneral += qty;
  });

  const jours = Object.entries(totalParJour)
    .sort((a, b) => b[0].localeCompare(a[0]));

  const aliments = Object.entries(totalParAliment)
    .sort((a, b) => b[1] - a[1]);

  return {
    totalGeneral,
    jours,
    aliments
  };
}

function refreshBirdPremiumTabs(bird) {
  if (!bird) return;

    const latestWeightDate = () => {
    const hist = safeArray(bird.historiquePoids)
      .filter(p => p.date)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return hist[0]?.date || "";
  };

  setTimeout(() => {
    const current = document.getElementById("birdPremiumCurrentWeight");
    const flight = document.getElementById("birdPremiumFlightWeight");
    const last = document.getElementById("birdPremiumLastWeightDate");

    if (current) current.textContent = `${getLatestBirdWeight(bird) || "-"} g`;
    if (flight) flight.textContent = bird.poidsVol ? `${bird.poidsVol} g` : "-";
    if (last) last.textContent = latestWeightDate() ? formatDateFR(latestWeightDate()) : "-";
  }, 0);

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "-";
  };

  setText("birdFoodHabit", bird.nourritureHabituelle || "-");
  setText("birdFoodQty", bird.quantiteHabituelle ? `${bird.quantiteHabituelle}` : "-");

  const feeds = getFeedsForBird(bird.nom);
  const lastFeed = feeds[0];

  setText(
    "birdLastFeed",
    lastFeed ? `${formatDateFR(lastFeed.date)} - ${lastFeed.nourriture} x${lastFeed.quantite}` : "-"
  );

  const complement = getDashboardComplementPlan(new Date().getDay(), bird);
  setText("birdComplementToday", complement || "Aucun");

  const historyEl = document.getElementById("birdFeedHistory");
  if (historyEl) {
    historyEl.innerHTML = feeds.length
      ? feeds.slice(0, 10).map(f => `
          <div class="dashboard-row">
            <div>
              <strong>${safe(formatDateFR(f.date))}</strong>
              <small>${safe(f.nourriture)} x${safe(f.quantite)} ${f.remarques ? "- " + safe(f.remarques) : ""}</small>
            </div>
          </div>
        `).join("")
      : `<p class="muted-line">Aucun historique nourrissage.</p>`;
  }
}

function partagerFicheOiseau(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  const birdFeeds = getFeedsForBird(bird.nom);
  const feedRowsByBird = birdFeeds
  .slice()
  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  .map((item) => `
    <tr>
      <td>${safe(formatDateFR(item.date || ""))}</td>
      <td>${safe(item.nourriture || "")}</td>
      <td>${safe(item.quantite || 0)}</td>
      <td>${safe(item.remarques || "")}</td>
    </tr>
  `).join("");
  const birdVet = getVetForBird(bird.nom);

  let texte = `Fiche oiseau : ${bird.nom}\n`;
  texte += `Espèce : ${bird.espece || "-"}\n`;
  texte += `Sexe : ${bird.sexe || "-"}\n`;
  texte += `Âge : ${bird.age || "-"}\n`;
  texte += `N° bague : ${bird.bague || "-"}\n`;
  texte += `N° CITES : ${bird.cites || "-"}\n`;
  texte += `Annexe : ${bird.annexe || "-"}\n`;
  texte += `Date d'entrée : ${formatDateFR(bird.dateEntree || "") || "-"}\n`;
  texte += `N° registre d'entrée : ${bird.registreEntree || "-"}\n`;
  texte += `Statut : ${bird.statut || "-"}\n`;
  texte += `Date de sortie : ${formatDateFR(bird.dateSortie || "") || "-"}\n`;
  texte += `N° registre de sortie : ${bird.registreSortie || "-"}\n`;
  texte += `Motif / remarque sortie : ${bird.motifSortie || "-"}\n`;
  texte += `Poids actuel : ${bird.poidsActuel || "-"} g\n`;
  texte += `Nourriture 1 : ${bird.nourritureHabituelle || "-"} (${bird.quantiteHabituelle || 0})\n`;

  if (bird.nourritureHabituelle2) {
    texte += `Nourriture 2 : ${bird.nourritureHabituelle2} (${bird.quantiteHabituelle2 || 0})\n`;
  }

  texte += `\nNotes : ${bird.notes || "Aucune note"}\n`;

  if (safeArray(bird.documents).length) {
    texte += `\nDocuments liés :\n`;
    safeArray(bird.documents).forEach((doc) => {
      texte += `- ${doc.name}\n${doc.url}\n`;
    });
  }

  if (birdFeeds.length) {
    texte += `\nHistorique nourrissage :\n`;
    birdFeeds.slice(0, 10).forEach((item) => {
      texte += `- ${formatDateFR(item.date)} : ${item.nourriture} x${item.quantite}`;
      if (item.remarques) texte += ` (${item.remarques})`;
      texte += `\n`;
    });
  }

  if (birdVet.length) {
    texte += `\nSuivi vétérinaire :\n`;
    birdVet.forEach((v) => {
      texte += `- ${formatDateFR(v.date)} | ${v.veterinaire || "-"} | ${v.motif || "-"} | ${v.diagnostic || "-"}\n`;
      safeArray(v.fichiers).forEach((f) => {
        texte += `  * ${f.name}\n  ${f.url}\n`;
      });
    });
  }

  if (navigator.share) {
    navigator.share({
      title: `Fiche ${bird.nom}`,
      text: texte
    }).catch((err) => {
      console.log("Partage annulé ou impossible :", err);
    });
    return;
  }

  navigator.clipboard.writeText(texte)
    .then(() => alert("Fiche copiée dans le presse-papiers."))
    .catch(() => alert("Impossible de partager automatiquement sur cet appareil."));
}

function renderPoidsChart(historique) {
  const data = safeArray(historique)
    .filter((h) => h.date && h.poids)
    .map((h) => ({
      date: h.date,
      poids: toNumber(h.poids)
    }))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  if (data.length < 2) {
    return `<p class="small">Pas assez de données pour afficher une courbe.</p>`;
  }

  const width = 700;
  const height = 260;
  const padding = 40;

  const poidsValues = data.map((d) => d.poids);
  const min = Math.min(...poidsValues);
  const max = Math.max(...poidsValues);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = padding + (i * (width - padding * 2)) / (data.length - 1);
    const y = height - padding - ((d.poids - min) / range) * (height - padding * 2);
    return { ...d, x, y };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return `
    <svg width="100%" viewBox="0 0 ${width} ${height}" style="border:1px solid #ccc;border-radius:10px;background:#fff;">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#999"/>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#999"/>

      <polyline points="${polyline}" fill="none" stroke="#2f4f2f" stroke-width="3"/>

      ${points.map((p) => `
        <circle cx="${p.x}" cy="${p.y}" r="5" fill="#2f4f2f"/>
        <text x="${p.x}" y="${p.y - 10}" font-size="12" text-anchor="middle">${p.poids}g</text>
      `).join("")}

      <text x="${padding}" y="${height - 10}" font-size="12">${safe(formatDateFR(data[0].date))}</text>
      <text x="${width - padding}" y="${height - 10}" font-size="12" text-anchor="end">${safe(formatDateFR(data[data.length - 1].date))}</text>

      <text x="${padding}" y="${padding - 12}" font-size="12">${max}g</text>
      <text x="${padding}" y="${height - padding + 18}" font-size="12">${min}g</text>
    </svg>
  `;
}

function getBirdFoodCostSummary(birdName) {
  const prix = appData.prixNourriture || {};
  const today = todayStr();
  const week = getWeekStart(today);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  const result = {
    jour: 0,
    semaine: 0,
    mois: 0,
    annee: 0
  };

  safeArray(appData.nourrissage).forEach((n) => {
    const sameBird =
      (n.oiseau || "").trim().toLowerCase() ===
      (birdName || "").trim().toLowerCase();

    if (!sameBird) return;

    const food = n.nourriture || "";
    const qty = toNumber(n.quantite);
    const price = toNumber(prix[food]);
    const cost = qty * price;
    const date = n.date || "";

    if (date === today) result.jour += cost;
    if (getWeekStart(date) === week) result.semaine += cost;
    if (date.slice(0, 7) === month) result.mois += cost;
    if (date.slice(0, 4) === year) result.annee += cost;
  });

  return result;
}

function openBirdSheetInline(id) {
  modifierOiseau(id);
}

function openBirdSheet(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  const birdFeeds = getFeedsForBird(bird.nom);
  const birdVet = getVetForBird(bird.nom);
  const birdCost = getBirdFoodCostSummary(bird.nom);
  const birdStats = getBirdFeedStats(bird.nom);

  const poidsRows = safeArray(bird.historiquePoids)
  .slice()
  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  .map((item) => `
    <tr>
      <td>${safe(formatDateFR(item.date || ""))}</td>
      <td>${safe(item.poids || "")} g</td>
    </tr>
  `).join("");

 const feedRows = birdFeeds
  .slice()
  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  .slice(0, 10)
  .map((item) => `
    <tr>
      <td>${safe(formatDateFR(item.date || ""))}</td>
      <td>${safe(item.nourriture || "")}</td>
      <td>${safe(item.quantite || 0)}</td>
      <td>${safe(item.remarques || "")}</td>
    </tr>
  `)
  .join("");

  const vetRows = birdVet
    .map((v) => `
      <tr>
        <td>${safe(formatDateFR(v.date || ""))}</td>
        <td>${safe(v.veterinaire || "-")}</td>
        <td>${safe(v.motif || "-")}</td>
        <td>${safe(v.diagnostic || "-")}</td>
        <td>${safe(v.traitement || "-")}</td>
      </tr>
    `).join("");

  const docsRows = safeArray(bird.documents)
    .map((doc) => `
      <tr>
        <td>${safe(doc.name || "")}</td>
        <td>${safe(doc.url || "")}</td>
      </tr>
    `).join("");

  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre fiche.");
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Fiche officielle - ${safe(bird.nom)}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body{
          font-family: Arial, Helvetica, sans-serif;
          color:#111;
          background:#fff;
          padding:20px;
          line-height:1.4;
        }
        .top-actions{
          margin-bottom:18px;
        }
        .btn{
          display:inline-block;
          padding:10px 14px;
          border:none;
          border-radius:8px;
          background:#333;
          color:#fff;
          font-weight:700;
          cursor:pointer;
        }
        .header-doc{
          border-bottom:2px solid #444;
          padding-bottom:10px;
          margin-bottom:15px;
        }
        .header-doc h2{
          margin:0;
          font-size:18px;
          color:#2f4f2f;
        }
        .header-doc p{
          margin:2px 0;
          font-size:13px;
          color:#444;
        }
        h1{
          margin:0 0 6px 0;
          font-size:28px;
          color:#2f4f2f;
          border-bottom:2px solid #ccc;
          padding-bottom:5px;
        }
        h2{
          margin:24px 0 10px 0;
          font-size:18px;
          border-bottom:2px solid #222;
          padding-bottom:4px;
        }
        .subtitle{
          margin:0 0 18px 0;
          color:#444;
          font-size:14px;
        }
        .header-grid{
          display:grid;
          grid-template-columns: 260px 1fr;
          gap:20px;
          align-items:start;
        }
        .photo-box{
          border:1px solid #999;
          padding:8px;
          min-height:220px;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .photo-box img{
          max-width:100%;
          max-height:300px;
          object-fit:contain;
        }
        .identity-table,
        .data-table{
          width:100%;
          border-collapse:collapse;
          margin-top:8px;
        }
        .identity-table th,
        .identity-table td,
        .data-table th,
        .data-table td{
          border:1px solid #999;
          padding:8px;
          text-align:left;
          vertical-align:top;
        }
        .identity-table th,
        .data-table th{
          background:#e8f0e8;
          color:#2f4f2f;
        }
        tbody tr:nth-child(even) td{
          background:#f7f7f7;
        }
        .notes-box{
          border:1px solid #999;
          min-height:80px;
          padding:10px;
          white-space:pre-wrap;
        }
        .small{
          font-size:12px;
          color:#555;
        }
        @media print{
          .top-actions{display:none}
          body{padding:8px}
          h2, table, .notes-box, .photo-box{break-inside:avoid}
          .header-doc h2, h1, h2{color:#000}
        }
      </style>
    </head>
    <body>
      <div class="top-actions">
        <button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
      </div>

      <div class="header-doc">
        <h2>Koll Jean-Philippe</h2>
        <p>Rue du Canal 82, 4800 Ensival</p>
        <p>+32 473 47 03 87</p>
        <p>jeanphilippekoll@gmail.com</p>
      </div>

      <h1>FICHE OISEAU</h1>
      <p class="subtitle">Document de suivi individuel</p>

      <div class="header-grid">
        <div class="photo-box">
          ${
            bird.photoUrl
              ? `<img src="${safeAttr(bird.photoUrl)}" alt="${safeAttr(bird.nom)}">`
              : `<span class="small">Pas de photo</span>`
          }
        </div>

        <div>
       <table class="identity-table">
  <tr>
    <th>Nom</th>
    <td>${safe(bird.nom || "-")}</td>
    <th>Espèce</th>
    <td>${safe(bird.espece || "-")}</td>
  </tr>
  <tr>
  <tr>
    <th>Date de naissance / Âge</th>
    <td>${safe(bird.age || "-")}</td>
    <th>Sexe</th>
    <td>${safe(bird.sexe || "-")}</td>
  </tr>
  <tr>
    <th>N° bague</th>
    <td>${safe(bird.bague || "-")}</td>
    <th>N° CITES</th>
    <td>${safe(bird.cites || "-")}</td>
  </tr>
  <tr>
  <th>Carte verte</th>
  <td>${safe(bird.carteVerte || "-")}</td>

  <th></th>
  <td></td>
</tr>
  <tr>
    <th>Annexe</th>
    <td>${safe(bird.annexe || "-")}</td>
    <th>Poids actuel</th>
    <td>${safe(bird.poidsActuel || "-")} g</td>
  </tr>
  <tr>
    <th>N° entrée</th>
    <td>${safe(bird.registreEntree || "-")}</td>
    <th>Date entrée</th>
    <td>${safe(formatDateFR(bird.dateEntree || "") || "-")}</td>
  </tr>
  <tr>
    <th>Date sortie</th>
    <td>${safe(formatDateFR(bird.dateSortie || "") || "-")}</td>
    <th>N° sortie</th>
    <td>${safe(bird.registreSortie || "-")}</td>
  </tr>
  <tr>
    <th>Motif sortie</th>
    <td colspan="3">${safe(bird.motifSortie || "-")}</td>
  </tr>
  <tr>
    <th>Nourriture 1</th>
    <td>${safe(bird.nourritureHabituelle || "-")} (${safe(bird.quantiteHabituelle || 0)})</td>
    <th>Nourriture 2</th>
    <td>${safe(bird.nourritureHabituelle2 || "-")} ${bird.nourritureHabituelle2 ? `(${safe(bird.quantiteHabituelle2 || 0)})` : ""}</td>
  </tr>
</table>   
        </div>
      </div>

      <h2>Résumé alimentation</h2>
<table class="data-table">
  <thead>
    <tr>
      <th>Poids actuel</th>
      <th>Nourriture habituelle</th>
      <th>Coût jour</th>
      <th>Coût semaine</th>
      <th>Coût mois</th>
      <th>Coût année</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${safe(bird.poidsActuel || "-")} g</td>
      <td>
        ${safe(bird.nourritureHabituelle || "-")} x${safe(bird.quantiteHabituelle || 0)}
        ${
          bird.nourritureHabituelle2
            ? `<br>${safe(bird.nourritureHabituelle2)} x${safe(bird.quantiteHabituelle2 || 0)}`
            : ""
        }
      </td>
      <td>${birdCost.jour.toFixed(2)} €</td>
      <td>${birdCost.semaine.toFixed(2)} €</td>
      <td>${birdCost.mois.toFixed(2)} €</td>
      <td>${birdCost.annee.toFixed(2)} €</td>
    </tr>
  </tbody>
</table>

      <h2>Notes</h2>
      <div class="notes-box">${safe(bird.notes || "Aucune note")}</div>

      <h2>Documents liés</h2>
      ${
        docsRows
          ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Lien</th>
                </tr>
              </thead>
              <tbody>
                ${docsRows}
              </tbody>
            </table>
          `
          : `<p class="small">Aucun document lié.</p>`
      }

      <h2>Courbe d'évolution du poids</h2>
       ${renderPoidsChart(bird.historiquePoids)}

      <h2>Historique des poids</h2>
      ${
        poidsRows
          ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Poids (g)</th>
                </tr>
              </thead>
              <tbody>
                ${poidsRows}
              </tbody>
            </table>
          `
          : `<p class="small">Aucun poids enregistré.</p>`
      }

      <h2>Statistiques nourrissage</h2>
${
  birdStats.totalGeneral > 0
    ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>Total distribué</th>
            <th>Nb jours encodés</th>
            <th>Aliment principal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${safe(birdStats.totalGeneral)}</td>
            <td>${safe(birdStats.jours.length)}</td>
            <td>${safe(birdStats.aliments[0]?.[0] || "-")}</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin-top:16px;">Total par aliment</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Aliment</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${birdStats.aliments.map(([food, total]) => `
            <tr>
              <td>${safe(food)}</td>
              <td>${safe(total)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<p class="small">Aucune statistique nourrissage disponible.</p>`
}

      <h2>Historique nourrissage — 10 derniers</h2>
      ${
        feedRows
          ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Nourriture</th>
                  <th>Quantité</th>
                  <th>Remarque</th>
                </tr>
              </thead>
              <tbody>
                ${feedRows}
              </tbody>
            </table>
          `
          : `<p class="small">Aucun nourrissage enregistré.</p>`
      }

      <h2>Suivi vétérinaire</h2>
      ${
        vetRows
          ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vétérinaire</th>
                  <th>Motif</th>
                  <th>Diagnostic</th>
                  <th>Traitement</th>
                </tr>
              </thead>
              <tbody>
                ${vetRows}
              </tbody>
            </table>
          `
          : `<p class="small">Aucun suivi vétérinaire.</p>`
      }
    </body>
    </html>
  `);

  win.document.close();
}

function getVetForBird(birdName) {
  return safeArray(appData.veterinaire || [])
    .filter((v) => (v.oiseau || "").trim().toLowerCase() === (birdName || "").trim().toLowerCase())
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function renderVetForBird(birdName) {
  const items = getVetForBird(birdName);

  if (!items.length) {
    return `<p class="muted-line">Aucun suivi vétérinaire.</p>`;
  }

  return items.map((item) => `
    <div class="item">
      <p><strong>Date :</strong> ${safe(formatDateFR(item.date || ""))}</p>
      <p><strong>Vétérinaire :</strong> ${safe(item.veterinaire || "")}</p>
      <p><strong>Motif :</strong> ${safe(item.motif || "")}</p>
      <p><strong>Diagnostic :</strong> ${safe(item.diagnostic || "")}</p>
      <p><strong>Traitement :</strong> ${safe(item.traitement || "")}</p>
      <p><strong>Protocole :</strong> ${safe(item.protocole || "")}</p>
      <p><strong>Observations :</strong> ${safe(item.observations || "")}</p>
      ${
        safeArray(item.fichiers).length
          ? `
            <div class="stack-list">
              ${safeArray(item.fichiers).map((f) => `
                <a class="doc-link" href="${safeAttr(f.url)}" target="_blank" rel="noopener noreferrer">
                  ${safe(f.name)}
                </a>
              `).join("")}
            </div>
          `
          : `<p class="muted-line">Aucun fichier.</p>`
      }
    </div>
  `).join("");
}

function renderOiseaux() {
  const zone = document.getElementById("listeOiseaux");
  if (!zone) return;

  const search = document.getElementById("searchOiseaux")?.value.toLowerCase().trim() || "";

  let oiseaux = getSortedBirds(getActiveBirds());

  if (search) {
    oiseaux = oiseaux.filter((oiseau) =>
      (oiseau.nom || "").toLowerCase().includes(search) ||
      (oiseau.espece || "").toLowerCase().includes(search) ||
      (oiseau.bague || "").toLowerCase().includes(search) ||
      (oiseau.cites || "").toLowerCase().includes(search) ||
      (oiseau.carteVerte || "").toLowerCase().includes(search)
    );
  }

  if (!oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau trouvé.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="bird-grid">
      ${oiseaux.map((oiseau) => `
        <article class="bird-card clickable-bird-card" onclick="openBirdSheetInline('${oiseau.id}')">
          <div class="bird-card-head">
            <div>
              <h3>${safe(oiseau.nom)}</h3>
              <p class="bird-species">${safe(oiseau.espece || "")}</p>
            </div>
          </div>

          ${oiseau.photoUrl ? `
            <img src="${safeAttr(oiseau.photoUrl)}" alt="${safeAttr(oiseau.nom)}" class="bird-photo">
          ` : `
            <div class="bird-photo-placeholder">Pas de photo</div>
          `}

          <div class="bird-meta">
            <div><span>Nom</span><strong>${safe(oiseau.nom || "-")}</strong></div>
            <div><span>Espèce</span><strong>${safe(oiseau.espece || "-")}</strong></div>
            <div><span>Bague</span><strong>${safe(oiseau.bague || "-")}</strong></div>
          </div>
    
         <div class="bird-badges">
  <button class="bird-badge-btn" onclick="event.stopPropagation(); openBirdDocuments('${oiseau.id}')">
  📎 Docs (${safeArray(oiseau.documents).length})
</button>

<button class="bird-badge-btn" onclick="event.stopPropagation(); openBirdVet('${oiseau.id}')">
  🏥 Véto (${getVetForBird(oiseau.nom).length})
</button>

<button class="bird-badge-btn" onclick="event.stopPropagation(); openBirdFeed('${oiseau.id}')">
  🍗 Nourr. (${getFeedsForBird(oiseau.nom).length})
</button>

<button class="bird-badge-btn" onclick="event.stopPropagation(); openBirdWeights('${oiseau.id}')">
  ⚖️ Poids (${safeArray(oiseau.historiquePoids).length})
</button>
</div> 


          <div class="small-actions">
         <button class="btn secondary-btn" onclick="event.stopPropagation(); monterOiseau('${oiseau.id}')">Monter</button>
<button class="btn secondary-btn" onclick="event.stopPropagation(); descendreOiseau('${oiseau.id}')">Descendre</button>
<button class="btn secondary-btn" onclick="event.stopPropagation(); modifierOiseau('${oiseau.id}')">Modifier</button>
<button class="btn info-btn" onclick="event.stopPropagation(); openBirdSheetInline('${oiseau.id}')">Ouvrir fiche</button>
<button class="btn warn-btn" onclick="event.stopPropagation(); partagerFicheOiseau('${oiseau.id}')">Partager</button>
<button class="btn btn-danger" onclick="event.stopPropagation(); supprimerOiseau('${oiseau.id}')">Supprimer</button>   
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderArchivesOiseaux() {
  const zone = document.getElementById("listeArchivesOiseaux");
  if (!zone) return;

  const search = document.getElementById("searchArchives")?.value.toLowerCase().trim() || "";

  let oiseaux = getArchivedBirds()
    .slice()
    .sort((a, b) => {
      const dateA = a.dateSortie || "";
      const dateB = b.dateSortie || "";
      const d = dateB.localeCompare(dateA);
      if (d !== 0) return d;
      return (a.nom || "").localeCompare(b.nom || "");
    });

  if (search) {
    oiseaux = oiseaux.filter((o) =>
      (o.nom || "").toLowerCase().includes(search) ||
      (o.espece || "").toLowerCase().includes(search) ||
      (o.bague || "").toLowerCase().includes(search) ||
      (o.cites || "").toLowerCase().includes(search)
    );
  }

  if (!oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau archivé.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="bird-grid">
      ${oiseaux.map((o) => `
        <article class="bird-card">
          <div class="bird-card-head">
            <div>
              <h3>${safe(o.nom)}</h3>
              <p class="bird-species">${safe(o.espece || "-")}</p>
            </div>
            <div class="weight-pill">${safe(o.statut || "-")}</div>
          </div>

          ${o.photoUrl ? `
            <img src="${safeAttr(o.photoUrl)}" alt="${safeAttr(o.nom)}" class="bird-photo">
          ` : `
            <div class="bird-photo-placeholder">Pas de photo</div>
          `}

          <div class="bird-meta">
            <div><span>N° bague</span><strong>${safe(o.bague || "-")}</strong></div>
            <div><span>N° CITES</span><strong>${safe(o.cites || "-")}</strong></div>
            <div><span>Date sortie</span><strong>${safe(formatDateFR(o.dateSortie || "") || "-")}</strong></div>
            <div><span>N° sortie</span><strong>${safe(o.registreSortie || "-")}</strong></div>
            <div><span>Motif sortie</span><strong>${safe(o.motifSortie || "-")}</strong></div>
          </div>

          <div class="small-actions">
            <button class="btn info-btn" onclick="openBirdSheet('${o.id}')">Ouvrir fiche</button>
            <button class="btn warn-btn" onclick="partagerFicheOiseau('${o.id}')">Partager</button>
            <button class="btn secondary-btn" onclick="modifierOiseau('${o.id}')">Modifier</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPesees() {
  const zone = document.getElementById("listePesees");
  if (!zone) return;
  zone.innerHTML = `
  <p class="muted-line">Les poids sont enregistrés directement dans la fiche de chaque oiseau.</p>
  <div id="tableauPoidsGlobal"></div>
`;

renderTableauPoidsGlobal();
}

function renderTableauPoidsGlobal() {
  const zone = document.getElementById("tableauPoidsGlobal");
  if (!zone) return;

  const rows = getSortedBirds(getActiveBirds()).map((bird) => {
    const poids = safeArray(bird.historiquePoids)
      .slice()
      .filter((p) => p.date && p.poids)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const dernier = poids[0];

    const poidsActuel = dernier ? toNumber(dernier.poids) : toNumber(bird.poidsActuel);
    const poidsVol = toNumber(bird.poidsVol);
    const tolerance = toNumber(bird.toleranceVol);

    const ecart = poidsVol > 0 ? poidsActuel - poidsVol : 0;

    let classe = "";
    let statut = "-";

    if (!poidsVol || !poidsActuel) {
      classe = "";
      statut = "⚪ À compléter";
    } else if (poidsActuel > poidsVol + tolerance) {
      classe = "warn-weight";
      statut = "🟠 Trop lourd";
    } else if (poidsActuel < poidsVol - tolerance) {
      classe = "alert-weight";
      statut = "🔴 Trop léger";
    } else {
      classe = "ok-weight";
      statut = "🟢 Prêt à voler";
    }

    return `
      <tr class="${classe}">
        <td>${safe(bird.nom || "-")}</td>
        <td>${safe(bird.espece || "-")}</td>
        <td>${poidsActuel ? `${safe(poidsActuel)} g` : "-"}</td>
        <td>${dernier ? safe(formatDateFR(dernier.date || "")) : "-"}</td>
        <td>${poidsVol ? `${safe(poidsVol)} g` : "-"}</td>
        <td>${tolerance ? `${safe(tolerance)} g` : "-"}</td>
        <td>${poidsVol && poidsActuel ? `${ecart > 0 ? "+" : ""}${safe(ecart)} g` : "-"}</td>
        <td>${safe(statut)}</td>
      </tr>
    `;
  }).join("");

  zone.innerHTML = `
    <div class="feed-table-wrap">
      <table class="feed-table simple-table">
        <thead>
          <tr>
            <th>Oiseau</th>
            <th>Espèce</th>
            <th>Poids actuel</th>
            <th>Date pesée</th>
            <th>Poids de vol</th>
            <th>Tolérance</th>
            <th>Écart</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
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

function makeFeedGroupKey(date, oiseau) {
  return `${date || ""}__${(oiseau || "").trim().toLowerCase()}`;
}

function imprimerFicheNourrissage() {
  const date = document.getElementById("feedDate")?.value || todayStr();
  const remarques = document.getElementById("feedNote")?.value.trim() || "";

  const oiseauxTries = appData.oiseaux
    .slice()
    .sort((a, b) => {
      const ordreA = toNumber(a.ordre) || 9999;
      const ordreB = toNumber(b.ordre) || 9999;
      if (ordreA !== ordreB) return ordreA - ordreB;
      return (a.nom || "").localeCompare(b.nom || "");
    });

  const rows = oiseauxTries.map((oiseau) => {
    const f1 = document.getElementById(`feedFood1_${oiseau.id}`)?.value || "";
    const q1 = toNumber(document.getElementById(`feedQty1_${oiseau.id}`)?.value || 0);
    const f2 = document.getElementById(`feedFood2_${oiseau.id}`)?.value || "";
    const q2 = toNumber(document.getElementById(`feedQty2_${oiseau.id}`)?.value || 0);

    const nourriture = [
      f1 && q1 > 0 ? `${safe(f1)} x${safe(q1)}` : "",
      f2 && q2 > 0 ? `${safe(f2)} x${safe(q2)}` : ""
    ].filter(Boolean).join(" | ");

    return `
      <tr>
        <td>${safe(oiseau.nom || "")}</td>
        <td>${nourriture || "-"}</td>
        <td>${safe((q1 || 0) + (q2 || 0))}</td>
      </tr>
    `;
  }).join("");

  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre d'impression.");
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fiche nourrissage</title>
      <style>
        body{font-family:Arial;padding:20px;background:#fff;color:#111;}
        .top-actions{margin-bottom:15px;}
        .btn{padding:10px;border:none;background:#333;color:#fff;border-radius:6px;}
        .header-doc{border-bottom:2px solid #333;margin-bottom:15px;padding-bottom:10px;}
        table{width:100%;border-collapse:collapse;margin-top:10px;}
        th,td{border:1px solid #ccc;padding:8px;}
        th{background:#eee;}
        @media print{.top-actions{display:none}}
      </style>
    </head>
    <body>

      <div class="top-actions">
        <button class="btn" onclick="window.print()">Imprimer / PDF</button>
      </div>

      <div class="header-doc">
        <strong>Koll Jean-Philippe</strong><br>
        Rue du Canal 82, 4800 Ensival<br>
        +32 473 47 03 87<br>
        jeanphilippekoll@gmail.com
      </div>

      <h2>Fiche nourrissage</h2>
      <p><strong>Date :</strong> ${safe(formatDateFR(date) || "-")}</p>

      <table>
        <thead>
          <tr>
            <th>Oiseau</th>
            <th>Nourriture</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <p><strong>Remarques :</strong><br>${safe(remarques || "-")}</p>

    </body>
    </html>
  `);

  win.document.close();
}

function renderNourrissageHistory() {
  const zone = document.getElementById("listeNourrissage");
  if (!zone) return;

  if (!appData.nourrissage.length) {
    zone.innerHTML = `<p class="muted-line">Aucun nourrissage.</p>`;
    return;
  }

  const groupesParDate = {};

  appData.nourrissage.forEach((item) => {
    const date = item.date || "";
    if (!groupesParDate[date]) groupesParDate[date] = [];
    groupesParDate[date].push(item);
  });

  const datesTriees = Object.keys(groupesParDate).sort((a, b) => b.localeCompare(a));

  zone.innerHTML = `
    <div class="card-section">
      <h3>Historique des nourrissages</h3>

      <div class="list-grid">
        ${datesTriees.map((date) => {
          const items = groupesParDate[date];
          const total = items.reduce((sum, item) => sum + toNumber(item.quantite), 0);

          return `
            <div class="item">
              <h3>${safe(formatDateFR(date || ""))}</h3>

              <button class="btn secondary-btn" onclick="toggleNourrissageDate('${date}')">
                Voir détail
              </button>

              <button class="btn info-btn" onclick="imprimerNourrissageDate('${date}')">
               Imprimer ce jour
              </button>

              <div id="detailNourrissage_${safeAttr(date)}" class="hidden" style="margin-top:12px;">
                <div class="feed-table-wrap">
                  <table class="feed-table">
                    <thead>
                      <tr>
                        <th>Oiseau</th>
                        <th>Nourriture</th>
                        <th>Quantité</th>
                        <th>Remarque</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${items
                        .slice()
                        .sort((a, b) => (a.oiseau || "").localeCompare(b.oiseau || ""))
                        .map((item) => `
                          <tr>
                            <td>${safe(item.oiseau || "")}</td>
                            <td>${safe(item.nourriture || "")}</td>
                            <td>${safe(item.quantite || 0)}</td>
                            <td>${safe(item.remarques || "")}</td>
                          </tr>
                        `).join("")}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function toggleNourrissageDate(date) {
  const el = document.getElementById(`detailNourrissage_${date}`);
  if (!el) return;

  el.classList.toggle("hidden");
}

function imprimerNourrissageDate(date) {
  const items = safeArray(appData.nourrissage)
    .filter((n) => (n.date || "") === date)
    .sort((a, b) => (a.oiseau || "").localeCompare(b.oiseau || ""));

  if (!items.length) {
    alert("Aucun nourrissage pour cette date.");
    return;
  }

  const total = items.reduce((sum, item) => sum + toNumber(item.quantite), 0);

  const rows = items.map((item) => `
    <tr>
      <td>${safe(item.oiseau || "")}</td>
      <td>${safe(item.nourriture || "")}</td>
      <td>${safe(item.quantite || 0)}</td>
      <td>${safe(item.remarques || "")}</td>
    </tr>
  `).join("");

  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre d'impression.");
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Nourrissage ${safe(formatDateFR(date))}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:20px;}
        .top-actions{margin-bottom:15px;}
        .btn{padding:10px 14px;border:none;border-radius:8px;background:#333;color:#fff;font-weight:700;cursor:pointer;}
        .header-doc{border-bottom:2px solid #444;padding-bottom:10px;margin-bottom:15px;}
        h1{color:#2f4f2f;border-bottom:2px solid #ccc;padding-bottom:5px;}
        table{width:100%;border-collapse:collapse;margin-top:12px;}
        th,td{border:1px solid #ccc;padding:8px;text-align:left;}
        th{background:#e8f0e8;color:#2f4f2f;}
        @media print{.top-actions{display:none}}
      </style>
    </head>
    <body>
      <div class="top-actions">
        <button class="btn" onclick="window.print()">Imprimer / PDF</button>
      </div>

      <div class="header-doc">
        <strong>Koll Jean-Philippe</strong><br>
        Rue du Canal 82, 4800 Ensival<br>
        +32 473 47 03 87<br>
        jeanphilippekoll@gmail.com
      </div>

      <h1>Nourrissage du ${safe(formatDateFR(date))}</h1>
      <p><strong>Total :</strong> ${safe(total)} pièce(s)</p>

      <table>
        <thead>
          <tr>
            <th>Oiseau</th>
            <th>Nourriture</th>
            <th>Quantité</th>
            <th>Remarque</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
    </html>
  `);

  win.document.close();
}

function getFoodConsumptionByMonth() {
  const result = {};

  safeArray(appData.nourrissage).forEach((n) => {
    const month = (n.date || "").slice(0, 7);
    const food = n.nourriture || "Inconnu";
    const qty = toNumber(n.quantite || 0);

    if (!month) return;

    if (!result[month]) result[month] = {};
    if (!result[month][food]) result[month][food] = 0;

    result[month][food] += qty;
  });

  return result;
}

function renderFoodConsumptionHistory() {
  const zone = document.getElementById("foodConsumptionHistoryZone");
  if (!zone) return;

  const data = getFoodConsumptionByMonth();
  const months = Object.entries(data).sort((a, b) => b[0].localeCompare(a[0]));

  if (!months.length) {
    zone.innerHTML = `
      <section class="card-section">
        <h2>Consommation nourriture par mois</h2>
        <p class="muted-line">Aucun historique de consommation.</p>
      </section>
    `;
    return;
  }

  zone.innerHTML = `
    <section class="card-section">
      <h2>Consommation nourriture par mois</h2>

      <div class="summary-grid">
        ${months.map(([month, foods]) => {
          const total = ALIMENTS.reduce((sum, food) => sum + toNumber(foods[food] || 0), 0);

          return `
            <div class="summary-card">
              <h3>${safe(month)}</h3>
              <p class="summary-total">${safe(total)} pièce(s)</p>
              ${ALIMENTS.map((food) => {
                const qty = toNumber(foods[food] || 0);
                if (qty <= 0) return "";
                return `<p>${safe(food)} : ${safe(qty)}</p>`;
              }).join("")}
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function corrigerDateNourrissage(groupKey) {
  const items = appData.nourrissage.filter(
    (n) => makeFeedGroupKey(n.date, n.oiseau) === groupKey
  );

  if (!items.length) return;

  const ancienneDate = items[0].date || "";
  const nouvelleDate = prompt("Nouvelle date (AAAA-MM-JJ) :", ancienneDate);

  if (!nouvelleDate || !/^\d{4}-\d{2}-\d{2}$/.test(nouvelleDate)) {
    alert("Date invalide. Format attendu : AAAA-MM-JJ");
    return;
  }

  items.forEach((item) => {
    item.date = nouvelleDate;
  });

  renderAll();
  triggerAutoSave();

  if (statusEl) statusEl.textContent = "Date du nourrissage corrigée";
}

function supprimerGroupeNourrissage(groupKey) {
  const items = appData.nourrissage.filter(
    (n) => makeFeedGroupKey(n.date, n.oiseau) === groupKey
  );

  if (!items.length) return;

  const ok = confirm("Supprimer tout le nourrissage de cet oiseau pour cette date ?");
  if (!ok) return;

  items.forEach((item) => {
    restoreStockFromDeletedFeed(item);
  });

  appData.nourrissage = appData.nourrissage.filter(
    (n) => makeFeedGroupKey(n.date, n.oiseau) !== groupKey
  );

  renderAll();
  triggerAutoSave();

  if (statusEl) statusEl.textContent = "Nourrissage supprimé";
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

 const date = todayStr();

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

  const search = document.getElementById("terrainSearch")?.value.toLowerCase().trim() || "";

  let oiseaux = getSortedBirds(getActiveBirds());

  if (search) {
    oiseaux = oiseaux.filter((o) =>
      (o.nom || "").toLowerCase().includes(search)
    );
  }

  if (!oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau trouvé.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="bird-grid">
      ${oiseaux.map((oiseau) => `
        <article class="bird-card terrain-card">

          <h3>${safe(oiseau.nom)}</h3>
          <p class="bird-species">${safe(oiseau.espece || "")}</p>

          ${oiseau.photoUrl ? `
            <img src="${safeAttr(oiseau.photoUrl)}" class="bird-photo">
          ` : `<div class="bird-photo-placeholder">Pas de photo</div>`}

          <div class="actions">

            <button class="btn terrain-poussin" onclick="quickFeed('${oiseau.id}','Poussin',1)">+1 Poussin</button>

            <button class="btn terrain-souris" onclick="quickFeed('${oiseau.id}','Souris',1)">+1 Souris</button>

            <button class="btn terrain-cailleteau" onclick="quickFeed('${oiseau.id}','Cailleteau 30gr',1)">+1 Cailleteau</button>

            <button class="btn terrain-ration" onclick="rationHabituelleTerrain('${oiseau.id}')">Ration</button>

            <button class="btn secondary-btn" onclick="ouvrirFicheOiseau('${oiseau.id}')">Fiche</button>

            <button class="btn info-btn" onclick="ouvrirVetoOiseau('${oiseau.nom}')">Véto</button>

          </div>

        </article>
      `).join("")}
    </div>
  `;
}

function renderInventaire() {
  const zone = document.getElementById("inventaireZone");
  if (!zone) return;

  const oiseauxActifs = getSortedBirds(getActiveBirds());

  if (!oiseauxActifs.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau.</p>`;
    return;
  }

  const rows = oiseauxActifs
    .map((oiseau) => `
      <tr>
        <td>${safe(oiseau.nom || "")}</td>
        <td>${safe(oiseau.espece || "")}</td>
        <td>${safe(oiseau.bague || "-")}</td>
        <td>${safe(oiseau.cites || "-")}</td>
        <td>${safe(oiseau.carteVerte || "-")}</td>
        <td>${safe(oiseau.age || "")}</td>
        <td>${safe(oiseau.sexe || "")}</td>
        <td>${safe(oiseau.annexe || "-")}</td>
        <td>${safe(oiseau.poidsActuel || "")}</td>
        <td>${safe(oiseau.statut || "-")}</td>
        <td>${safe(formatDateFR(oiseau.dateEntree || "") || "-")}</td>
        <td>${safe(oiseau.registreEntree || "-")}</td>
        <td>${safe(formatDateFR(oiseau.dateSortie || "") || "-")}</td>
        <td>${safe(oiseau.registreSortie || "-")}</td>
        <td>
          ${
            safeArray(oiseau.documents).length
              ? safeArray(oiseau.documents).map((doc) => `
                  <a class="doc-link" href="${safeAttr(doc.url)}" target="_blank" rel="noopener noreferrer">
                    ${safe(doc.name)}
                  </a>
                `).join("")
              : `<span class="muted-line">Aucun</span>`
          }
        </td>
      </tr>
    `).join("");

  zone.innerHTML = `
    <div class="feed-table-wrap">
      <table class="feed-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Espèce</th>
            <th>N° bague</th>
            <th>N° CITES</th>
            <th>Carte verte</th>
            <th>Âge</th>
            <th>Sexe</th>
            <th>Annexe</th>
            <th>Poids</th>
            <th>Statut</th>
            <th>Date entrée</th>
            <th>Registre entrée</th>
            <th>Date sortie</th>
            <th>Registre sortie</th>
            <th>Documents</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderNourrissage() {
  renderNourrissageTable();
  renderNourrissageSummary();
  renderNourrissageHistory();
  renderFoodConsumptionHistory();
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
  const stockRat = document.getElementById("stockRat");
  const stockCailleteau30gr = document.getElementById("stockCailleteau30gr");

  if (stockBoxes) stockBoxes.value = appData.stock.boitePoussinsMoyenne225 ?? 0;
  if (stockPoussin) stockPoussin.value = appData.stock.poussin ?? 0;
  if (stockCaille) stockCaille.value = appData.stock.caille ?? 0;
  if (stockPigeon) stockPigeon.value = appData.stock.pigeon ?? 0;
  if (stockLapin) stockLapin.value = appData.stock.lapin ?? 0;
  if (stockPoisson) stockPoisson.value = appData.stock.poisson ?? 0;
  if (stockSouris) stockSouris.value = appData.stock.souris ?? 0;
  if (stockRat) stockRat.value = appData.stock.rat ?? 0;
  if (stockCailleteau30gr) stockCailleteau30gr.value = appData.stock.cailleteau30gr ?? 0;
}

function fillPrixNourritureForm() {
  const prix = appData.prixNourriture || {};

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  };

  set("prixPoussin", prix["Poussin"]);
  set("prixCaille", prix["Caille"]);
  set("prixPigeon", prix["Pigeon"]);
  set("prixLapin", prix["Lapin"]);
  set("prixPoisson", prix["Poisson"]);
  set("prixSouris", prix["Souris"]);
  set("prixRat", prix["Rat"]);
  set("prixCailleteau", prix["Cailleteau 30gr"]);
}

function normalizeBirdKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getBirdCanonicalName(rawName) {
  const key = normalizeBirdKey(rawName);

  const bird = safeArray(appData.oiseaux).find((o) =>
    normalizeBirdKey(o.nom) === key
  );

  return bird ? bird.nom : `Ancien/Inconnu : ${String(rawName || "Sans nom").trim()}`;
}

function renderCoutParOiseau() {
  const zone = document.getElementById("coutParOiseauZone");
  if (!zone) return;

  const prix = appData.prixNourriture || {};
  const today = todayStr();
  const week = getWeekStart(today);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  const result = {};

  safeArray(appData.nourrissage).forEach((n) => {
    const rawName = n.oiseau || n.nom || "Sans nom";
    const canonicalName = getBirdCanonicalName(rawName);
    const key = normalizeBirdKey(canonicalName);

    const food = n.nourriture || "Inconnu";
    const qty = toNumber(n.quantite);
    const price = toNumber(prix[food]);
    const cost = qty * price;
    const date = n.date || "";

    if (!result[key]) {
      result[key] = {
        nom: canonicalName,
        total: 0,
        jour: 0,
        semaine: 0,
        mois: 0,
        annee: 0,
        aliments: {}
      };
    }

    if (!result[key].aliments[food]) {
      result[key].aliments[food] = { qty: 0, cost: 0 };
    }

    result[key].total += cost;
    result[key].aliments[food].qty += qty;
    result[key].aliments[food].cost += cost;

    if (date === today) result[key].jour += cost;
    if (getWeekStart(date) === week) result[key].semaine += cost;
    if (date.slice(0, 7) === month) result[key].mois += cost;
    if (date.slice(0, 4) === year) result[key].annee += cost;
  });

const masques = appData.coutOiseauxMasques || [];

const rows = Object.entries(result)
  .filter(([key]) => !masques.includes(key))
  .map(([key, data]) => ({ key, ...data }))
  .sort((a, b) => b.total - a.total);

  zone.innerHTML = `
    <section class="card-section">
      <h2>Coût nourriture par oiseau</h2>

      <div class="summary-grid">
        ${
          rows.length
            ? rows.map((data) => `
              <div class="summary-card">
                <h3>${safe(data.nom)}</h3>
                <p class="summary-total">${data.total.toFixed(2)} €</p>

                <button class="btn btn-danger" onclick="masquerOiseauCout('${data.key}')">Masquer</button>

                <p>Jour : ${data.jour.toFixed(2)} €</p>
                <p>Semaine : ${data.semaine.toFixed(2)} €</p>
                <p>Mois : ${data.mois.toFixed(2)} €</p>
                <p>Année : ${data.annee.toFixed(2)} €</p>

                <hr>

                ${Object.entries(data.aliments)
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([food, item]) => `
                    <p>${safe(food)} : ${safe(item.qty)} pièce(s) = ${item.cost.toFixed(2)} €</p>
                  `).join("")}
              </div>
            `).join("")
            : `<p class="muted-line">Aucune donnée de coût par oiseau.</p>`
        }
      </div>
    </section>
  `;
}

function masquerOiseauCout(key) {
  if (!Array.isArray(appData.coutOiseauxMasques)) {
    appData.coutOiseauxMasques = [];
  }

  if (!appData.coutOiseauxMasques.includes(key)) {
    appData.coutOiseauxMasques.push(key);
  }

  renderCoutParOiseau();
  triggerAutoSave();

  if (statusEl) statusEl.textContent = "Oiseau masqué du coût nourriture";
}

function renderCoutNourriture() {
  const zone = document.getElementById("coutNourritureZone");
  if (!zone) return;

  const prix = appData.prixNourriture || {};
  const today = todayStr();
  const week = getWeekStart(today);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  const periods = [
    ["Jour", (n) => (n.date || "") === today],
    ["Semaine", (n) => getWeekStart(n.date || "") === week],
    ["Mois", (n) => (n.date || "").slice(0, 7) === month],
    ["Année", (n) => (n.date || "").slice(0, 4) === year]
  ];

  const calc = (filterFn) => {
    let total = 0;
    const details = {};

    safeArray(appData.nourrissage)
      .filter(filterFn)
      .forEach((n) => {
        const food = n.nourriture || "Inconnu";
        const qty = toNumber(n.quantite);
        const price = toNumber(prix[food]);
        const cost = qty * price;

        total += cost;

        if (!details[food]) details[food] = { qty: 0, cost: 0 };
        details[food].qty += qty;
        details[food].cost += cost;
      });

    return { total, details };
  };

  zone.innerHTML = `
    <section class="card-section">
      <h2>Coût total nourriture</h2>

      <div class="summary-grid">
        ${periods.map(([label, filterFn]) => {
          const data = calc(filterFn);

          return `
            <div class="summary-card">
              <h3>${safe(label)}</h3>
              <p class="summary-total">${data.total.toFixed(2)} €</p>

              ${
                Object.entries(data.details).length
                  ? Object.entries(data.details).map(([food, item]) => `
                      <p>${safe(food)} : ${safe(item.qty)} pièce(s) = ${item.cost.toFixed(2)} €</p>
                    `).join("")
                  : `<p class="muted-line">Aucune consommation.</p>`
              }
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderHistoriqueCoutMensuel() {
  const zone = document.getElementById("historiqueCoutMensuelZone");
  if (!zone) return;

  const prix = appData.prixNourriture || {};
  const result = {};

  safeArray(appData.nourrissage).forEach((n) => {
    const month = (n.date || "").slice(0, 7);
    if (!month) return;

    const food = n.nourriture || "Inconnu";
    const qty = toNumber(n.quantite);
    const price = toNumber(prix[food]);
    const cost = qty * price;

    if (!result[month]) result[month] = { total: 0, aliments: {} };
    if (!result[month].aliments[food]) result[month].aliments[food] = { qty: 0, cost: 0 };

    result[month].total += cost;
    result[month].aliments[food].qty += qty;
    result[month].aliments[food].cost += cost;
  });

  const months = Object.entries(result).sort((a, b) => b[0].localeCompare(a[0]));

  zone.innerHTML = `
    <section class="card-section">
      <h2>Historique coût mensuel</h2>

      ${
        months.length
          ? `
            <div class="summary-grid">
              ${months.map(([month, data]) => `
                <div class="summary-card">
                  <h3>${safe(month)}</h3>
                  <p class="summary-total">${data.total.toFixed(2)} €</p>

                  ${Object.entries(data.aliments)
                    .sort((a, b) => b[1].cost - a[1].cost)
                    .map(([food, item]) => `
                      <p>${safe(food)} : ${safe(item.qty)} pièce(s) = ${item.cost.toFixed(2)} €</p>
                    `).join("")}
                </div>
              `).join("")}
            </div>
          `
          : `<p class="muted-line">Aucun historique mensuel.</p>`
      }
    </section>
  `;
}

function renderHistoriqueCoutMensuelParOiseau() {
  const zone = document.getElementById("historiqueCoutMensuelParOiseauZone");
  if (!zone) return;

  const prix = appData.prixNourriture || {};
  const result = {};

  safeArray(appData.nourrissage).forEach((n) => {
    const month = (n.date || "").slice(0, 7);
    if (!month) return;

    const rawName = n.oiseau || n.nom || "Sans nom";
    const bird = typeof getBirdCanonicalName === "function"
      ? getBirdCanonicalName(rawName)
      : rawName;

    const food = n.nourriture || "Inconnu";
    const qty = toNumber(n.quantite);
    const price = toNumber(prix[food]);
    const cost = qty * price;

    if (!result[month]) result[month] = {};
    if (!result[month][bird]) result[month][bird] = { total: 0, aliments: {} };
    if (!result[month][bird].aliments[food]) {
      result[month][bird].aliments[food] = { qty: 0, cost: 0 };
    }

    result[month][bird].total += cost;
    result[month][bird].aliments[food].qty += qty;
    result[month][bird].aliments[food].cost += cost;
  });

  const months = Object.entries(result).sort((a, b) => b[0].localeCompare(a[0]));

  zone.innerHTML = `
    <section class="card-section">
      <h2>Historique coût mensuel par oiseau</h2>

      ${
        months.length
          ? months.map(([month, birds]) => `
            <div class="card-section">
              <h3>${safe(month)}</h3>

              <div class="summary-grid">
                ${Object.entries(birds)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([bird, data]) => `
                    <div class="summary-card">
                      <h3>${safe(bird)}</h3>
                      <p class="summary-total">${data.total.toFixed(2)} €</p>

                      ${Object.entries(data.aliments)
                        .sort((a, b) => b[1].cost - a[1].cost)
                        .map(([food, item]) => `
                          <p>${safe(food)} : ${safe(item.qty)} pièce(s) = ${item.cost.toFixed(2)} €</p>
                        `).join("")}
                    </div>
                  `).join("")}
              </div>
            </div>
          `).join("")
          : `<p class="muted-line">Aucun historique par oiseau.</p>`
      }
    </section>
  `;
}

function ouvrirInventaire() {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre inventaire.");
    return;
  }

  win.document.write(getInventaireHtml());
  win.document.close();
}

function getInventaireHtml() {
  const rows = getSortedBirds(getActiveBirds())
    .map((oiseau) => `
      <tr>
        <td>${safe(oiseau.nom || "")}</td>
        <td>${safe(oiseau.espece || "")}</td>
        <td>${safe(oiseau.bague || "-")}</td>
        <td>${safe(oiseau.cites || "-")}</td>
        <td>${safe(oiseau.carteVerte || "-")}</td>
        <td>${safe(oiseau.age || "")}</td>
        <td>${safe(oiseau.sexe || "")}</td>
        <td>${safe(oiseau.annexe || "-")}</td>
        <td>${safe(oiseau.poidsActuel || "")}</td>
        <td>${safe(oiseau.statut || "-")}</td>
        <td>${safe(formatDateFR(oiseau.dateEntree || "") || "-")}</td>
        <td>${safe(oiseau.registreEntree || "-")}</td>
        <td>${safe(formatDateFR(oiseau.dateSortie || "") || "-")}</td>
        <td>${safe(oiseau.registreSortie || "-")}</td>
      </tr>
    `).join("");

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Inventaire oiseaux</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body{
          font-family:Arial,Helvetica,sans-serif;
          color:#111;
          background:#fff;
          padding:20px;
        }
        .header-doc{
          border-bottom:2px solid #444;
          padding-bottom:10px;
          margin-bottom:15px;
        }
        .header-doc h2{
          margin:0;
          font-size:18px;
          color:#2f4f2f;
        }
        .header-doc p{
          margin:2px 0;
          font-size:13px;
          color:#444;
        }
        h1{
          color:#2f4f2f;
          border-bottom:2px solid #ccc;
          padding-bottom:5px;
        }
        table{
          width:100%;
          border-collapse:collapse;
        }
        th, td{
          border:1px solid #ccc;
          padding:8px;
          text-align:left;
          vertical-align:top;
        }
        th{
          background:#e8f0e8;
          color:#2f4f2f;
        }
        tbody tr:nth-child(even) td{
          background:#f7f7f7;
        }
        .btn{
          display:inline-block;
          padding:10px 14px;
          border:none;
          border-radius:8px;
          background:#333;
          color:#fff;
          font-weight:700;
          cursor:pointer;
          margin-bottom:14px;
        }
        @media print{
          button{display:none}
          .header-doc h2, h1{color:#000}
        }
      </style>
    </head>
    <body>
      <button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>

      <div class="header-doc">
        <h2>Koll Jean-Philippe</h2>
        <p>Rue du Canal 82, 4800 Ensival</p>
        <p>+32 473 47 03 87</p>
        <p>jeanphilippekoll@gmail.com</p>
      </div>

      <h1>Inventaire oiseaux présents sur site</h1>
      <p>Date : ${safe(formatDateFR(todayStr()))}</p>

      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Espèce</th>
            <th>Bague</th>
            <th>CITES</th>
            <th>Carte verte</th>
            <th>Âge</th>
            <th>Sexe</th>
            <th>Annexe</th>
            <th>Poids</th>
            <th>Statut</th>
            <th>Date entrée</th>
            <th>Registre entrée</th>
            <th>Date sortie</th>
            <th>Registre sortie</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

function imprimerInventaire() {
  ouvrirInventaire();
}

function partagerInventaire() {
  let texte = `Inventaire oiseaux présents sur site\n`;
  texte += `Date : ${formatDateFR(todayStr())}\n\n`;

  getSortedBirds(getActiveBirds()).forEach((oiseau) => {
    texte += `- ${oiseau.nom || ""}\n`;
    texte += `  Espèce : ${oiseau.espece || "-"}\n`;
    texte += `  Âge : ${oiseau.age || "-"}\n`;
    texte += `  Sexe : ${oiseau.sexe || "-"}\n`;
    texte += `  Annexe : ${oiseau.annexe || "-"}\n`;
    texte += `  Poids : ${oiseau.poidsActuel || "-"} g\n`;

    if (safeArray(oiseau.documents).length) {
      texte += `  Documents :\n`;
      safeArray(oiseau.documents).forEach((doc) => {
        texte += `    * ${doc.name}\n`;
        texte += `      ${doc.url}\n`;
      });
    }
    texte += `\n`;
  });

  if (navigator.share) {
    navigator.share({
      title: "Inventaire oiseaux",
      text: texte
    }).catch((err) => {
      console.log("Partage annulé ou impossible :", err);
    });
    return;
  }

  navigator.clipboard.writeText(texte)
    .then(() => alert("Inventaire copié dans le presse-papiers."))
    .catch(() => alert("Impossible de partager automatiquement sur cet appareil."));
}

function renderVacances() {
  const zone = document.getElementById("tableVacances");
  if (!zone) return;

  const oiseauxActifs = getSortedBirds(getActiveBirds());

  if (!oiseauxActifs.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="feed-table-wrap">
      <table class="feed-table">
        <thead>
          <tr>
            <th>Oiseau</th>
            <th>Nourriture 1</th>
            <th>Qté</th>
            <th>Nourriture 2</th>
            <th>Qté</th>
            <th>Remarques</th>
          </tr>
        </thead>
        <tbody>
          ${oiseauxActifs.map((o) => `
            <tr>
              <td><strong>${safe(o.nom)}</strong></td>
              <td><input value="${safeAttr(o.nourritureHabituelle || "")}"></td>
              <td><input type="number" value="${safeAttr(o.quantiteHabituelle || 0)}"></td>
              <td><input value="${safeAttr(o.nourritureHabituelle2 || "")}"></td>
              <td><input type="number" value="${safeAttr(o.quantiteHabituelle2 || 0)}"></td>
              <td><input placeholder="Remarque"></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function imprimerVacances() {
  const zone = document.getElementById("tableVacances");
  if (!zone) return;

  const contenuTable = zone.innerHTML || "<p>Aucun contenu vacances.</p>";

  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre d'impression.");
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Nourrissage vacances</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body{
          font-family:Arial,Helvetica,sans-serif;
          color:#111;
          background:#fff;
          padding:20px;
        }
        .top-actions{
          margin-bottom:18px;
        }
        .btn{
          display:inline-block;
          padding:10px 14px;
          border:none;
          border-radius:8px;
          background:#333;
          color:#fff;
          font-weight:700;
          cursor:pointer;
        }
        .header-doc{
          border-bottom:2px solid #444;
          padding-bottom:10px;
          margin-bottom:15px;
        }
        .header-doc h2{
          margin:0;
          font-size:18px;
          color:#2f4f2f;
        }
        .header-doc p{
          margin:2px 0;
          font-size:13px;
          color:#444;
        }
        h1{
          margin:0 0 10px 0;
          font-size:26px;
          color:#2f4f2f;
          border-bottom:2px solid #ccc;
          padding-bottom:5px;
        }
        table{
          width:100%;
          border-collapse:collapse;
          margin-top:12px;
        }
        th, td{
          border:1px solid #ccc;
          padding:8px;
          text-align:left;
          vertical-align:top;
        }
        th{
          background:#e8f0e8;
          color:#2f4f2f;
        }
        tbody tr:nth-child(even) td{
          background:#f7f7f7;
        }
        input, textarea{
          width:100%;
          border:none;
          background:transparent;
          font:inherit;
          color:#111;
          padding:0;
        }
        @media print{
          .top-actions{display:none}
          body{padding:8px}
          .header-doc h2, h1{color:#000}
        }
      </style>
    </head>
    <body>
      <div class="top-actions">
        <button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
      </div>

      <div class="header-doc">
        <h2>Koll Jean-Philippe</h2>
        <p>Rue du Canal 82, 4800 Ensival</p>
        <p>+32 473 47 03 87</p>
        <p>jeanphilippekoll@gmail.com</p>
      </div>

      <h1>Nourrissage vacances</h1>

      ${contenuTable}
    </body>
    </html>
  `);

  win.document.close();
}

function remplirVacances() {
  renderVacances();
}

// ===== STATS NOURRISSAGE =====

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function getTotalFoodByWeek() {
  const result = {};

  (appData.nourrissage || []).forEach(n => {
    const week = getWeekStart(n.date);
    const qty = toNumber(n.quantite || 0);

    if (!result[week]) result[week] = 0;
    result[week] += qty;
  });

  return result;
}

function getTotalFoodByMonth() {
  const result = {};

  (appData.nourrissage || []).forEach(n => {
    const month = (n.date || "").slice(0, 7);
    const qty = toNumber(n.quantite || 0);

    if (!result[month]) result[month] = 0;
    result[month] += qty;
  });

  return result;
}

function getFoodByBird() {
  const result = {};

  (appData.nourrissage || []).forEach(n => {
    const bird = n.oiseau || "Inconnu";
    const qty = toNumber(n.quantite || 0);

    if (!result[bird]) result[bird] = 0;
    result[bird] += qty;
  });

  return result;
}

function renderFeedStatsHistory() {
  const zone = document.getElementById("feedStatsHistoryZone");
  if (!zone) return;

  const byWeek = getTotalFoodByWeek();
  const byMonth = getTotalFoodByMonth();

  const weeks = Object.entries(byWeek).sort((a, b) => b[0].localeCompare(a[0]));
  const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));

  zone.innerHTML = `
    <div class="card-section">
      <h3>Historique nourriture par semaine</h3>
      ${
        weeks.length
          ? `
            <div class="feed-table-wrap">
              <table class="feed-table">
                <thead>
                  <tr>
                    <th>Semaine du lundi</th>
                    <th>Total nourriture</th>
                  </tr>
                </thead>
                <tbody>
                  ${weeks.map(([week, total]) => `
                    <tr>
                      <td>${safe(formatDateFR(week))}</td>
                      <td>${safe(total)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `<p class="muted-line">Aucune donnée.</p>`
      }
    </div>

    <div class="card-section">
      <h3>Historique nourriture par mois</h3>
      ${
        months.length
          ? `
            <div class="feed-table-wrap">
              <table class="feed-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Total nourriture</th>
                  </tr>
                </thead>
                <tbody>
                  ${months.map(([month, total]) => `
                    <tr>
                      <td>${safe(month)}</td>
                      <td>${safe(total)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `<p class="muted-line">Aucune donnée.</p>`
      }
    </div>
  `;
}

function renderAll() {
  syncBoitesFromPoussins();
  refreshStats();
  renderDashboardIntelligent();
  refreshBirdSelects();
  renderOiseaux();
  renderArchivesOiseaux();
  renderPesees();
  renderDocuments();
  renderNourrissage();
  renderVeterinaire();
  renderInventaire();
  renderEntretien();
  fillStockForm();
  fillPrixNourritureForm();
  renderCoutNourriture();
  renderCoutParOiseau();
  renderHistoriqueCoutMensuel();
  renderHistoriqueCoutMensuelParOiseau();
}

function saveLocalBackup() {
  try {
    localStorage.setItem("rapaces_backup", JSON.stringify(appData));
    console.log("Backup local OK");
  } catch (e) {
    console.warn("Erreur backup local", e);
  }
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

    // 💾 Sauvegarde locale anti-perte
    saveLocalBackup();

    if (statusEl) statusEl.textContent = "Sauvegardé";
  } catch (e) {
    console.error(e);

    // 💾 même en cas d'erreur → backup local
    saveLocalBackup();

    if (statusEl) statusEl.textContent = "Erreur sauvegarde (backup local OK)";
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
    const vetDateEl = document.getElementById("vetDate");
    const pesDateEl = document.getElementById("pesDate");

    if (feedDateEl) feedDateEl.value = getLatestFeedDate();
    if (vetDateEl) vetDateEl.value = todayStr();
    if (pesDateEl) pesDateEl.value = todayStr();

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
  "oiseauOrdre",
  "oiseauBague",
  "oiseauCites",
  "oiseauCarteVerte",
  "oiseauEspece",
  "oiseauAnnexe",
  "oiseauSexe",
  "oiseauAge",
  "oiseauPoids",
  "oiseauNotes",
  "oiseauHabitudeQty",
  "oiseauHabitudeQty2",
  "oiseauDateEntree",
  "oiseauRegistreEntree",
  "oiseauDateSortie",
  "oiseauRegistreSortie",
  "oiseauMotifSortie",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
    const statutEl = document.getElementById("oiseauStatut");
    if (statutEl) statutEl.value = "En place";
  });

  const food1 = document.getElementById("oiseauHabitudeFood");
  const food2 = document.getElementById("oiseauHabitudeFood2");
  const photoInput = document.getElementById("oiseauPhotoFile");
  const docsInput = document.getElementById("oiseauDocFiles");
  const hiddenId = document.getElementById("oiseauEditId");
  const title = document.getElementById("oiseauFormTitle");
  const btn = document.getElementById("oiseauSubmitBtn");
  const cancelBtn = document.getElementById("cancelEditBirdBtn");

  if (food1) food1.value = "Poussin";
  if (food2) food2.value = "";
  if (photoInput) photoInput.value = "";
  if (docsInput) docsInput.value = "";
  if (hiddenId) hiddenId.value = "";
  if (title) title.textContent = "Ajouter un oiseau";
  if (btn) btn.textContent = "Ajouter l’oiseau";
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

async function ajouterOiseau() {
  const nom = document.getElementById("oiseauNom")?.value.trim() || "";
  if (!nom) return;

  const ordre = toNumber(document.getElementById("oiseauOrdre")?.value || 0);
  const bague = document.getElementById("oiseauBague")?.value.trim() || "";
  const cites = document.getElementById("oiseauCites")?.value.trim() || "";
  const carteVerte = document.getElementById("oiseauCarteVerte")?.value.trim() || "";
  const espece = document.getElementById("oiseauEspece")?.value.trim() || "";
  const sexe = document.getElementById("oiseauSexe")?.value.trim() || "";
  const age = document.getElementById("oiseauAge")?.value.trim() || "";
  const poidsActuel = document.getElementById("oiseauPoids")?.value.trim() || "";
  const poidsVol = toNumber(document.getElementById("oiseauPoidsVol")?.value || 0);
  const toleranceVol = toNumber(document.getElementById("oiseauTolerance")?.value || 0);
  const notes = document.getElementById("oiseauNotes")?.value.trim() || "";
  const nourritureHabituelle = document.getElementById("oiseauHabitudeFood")?.value || "Poussin";
  const quantiteHabituelle = toNumber(document.getElementById("oiseauHabitudeQty")?.value || 0);
  const nourritureHabituelle2 = document.getElementById("oiseauHabitudeFood2")?.value || "";
  const quantiteHabituelle2 = toNumber(document.getElementById("oiseauHabitudeQty2")?.value || 0);
  const annexe = document.getElementById("oiseauAnnexe")?.value || "";
  const dateEntree = document.getElementById("oiseauDateEntree")?.value || "";
  const registreEntree = document.getElementById("oiseauRegistreEntree")?.value.trim() || "";
  const statut = document.getElementById("oiseauStatut")?.value || "En place";
  const dateSortie = document.getElementById("oiseauDateSortie")?.value || "";
  const registreSortie = document.getElementById("oiseauRegistreSortie")?.value.trim() || "";
  const motifSortie = document.getElementById("oiseauMotifSortie")?.value.trim() || "";

  const photoFile = document.getElementById("oiseauPhotoFile")?.files?.[0] || null;
  const docFiles = document.getElementById("oiseauDocFiles")?.files || null;

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
      photoUrl = await uploadFile(
        photoFile,
        `oiseaux/photos/${nom}_${Date.now()}_${photoFile.name}`
      );
    }

    if (docFiles && docFiles.length) {
      for (const file of Array.from(docFiles)) {
        const url = await uploadFile(
          file,
          `oiseaux/documents/${nom}_${Date.now()}_${file.name}`
        );

        documents.push({
          name: file.name,
          url
        });
      }
    }

    if (editingBirdId && existingBird) {
      existingBird.nom = nom;
      existingBird.ordre = ordre;
      existingBird.bague = bague;
      existingBird.cites = cites;
      existingBird.carteVerte = carteVerte;
      existingBird.espece = espece;
      existingBird.sexe = sexe;
      existingBird.age = age;
      existingBird.annexe = annexe;
      existingBird.poidsActuel = poidsActuel;
      existingBird.poidsVol = poidsVol;
      existingBird.toleranceVol = toleranceVol;
      existingBird.notes = notes;
      existingBird.nourritureHabituelle = nourritureHabituelle;
      existingBird.quantiteHabituelle = quantiteHabituelle;
      existingBird.nourritureHabituelle2 = nourritureHabituelle2;
      existingBird.quantiteHabituelle2 = quantiteHabituelle2;
      existingBird.photoUrl = photoUrl;
      existingBird.documents = documents;
      existingBird.dateEntree = dateEntree;
      existingBird.registreEntree = registreEntree;
      existingBird.statut = statut;
      existingBird.dateSortie = dateSortie;
      existingBird.registreSortie = registreSortie;
      existingBird.motifSortie = motifSortie;

      if (statusEl) statusEl.textContent = "Oiseau modifié";
    } else {
      appData.oiseaux.unshift({
        id: makeId(),
        nom,
        ordre,
        bague,
        cites,
        carteVerte,
        espece,
        sexe,
        age,
        annexe,
        dateEntree,
        registreEntree,
        statut,
        dateSortie,
        registreSortie,
        motifSortie,
        poidsActuel,
        poidsVol,
        toleranceVol,
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
    alert("Erreur pendant l'upload de la photo ou des documents.");
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
  set("oiseauOrdre", bird.ordre);
  set("oiseauBague", bird.bague);
  set("oiseauCites", bird.cites);
  set("oiseauCarteVerte", bird.carteVerte);
  set("oiseauAnnexe", bird.annexe);
  set("oiseauEspece", bird.espece);
  set("oiseauSexe", bird.sexe);
  set("oiseauAge", bird.age);
  set("oiseauPoids", bird.poidsActuel);
  set("oiseauPoidsVol", bird.poidsVol);
  set("oiseauTolerance", bird.toleranceVol);
  set("oiseauNotes", bird.notes);
  set("oiseauHabitudeFood", bird.nourritureHabituelle || "Poussin");
  set("oiseauHabitudeQty", bird.quantiteHabituelle);
  set("oiseauHabitudeFood2", bird.nourritureHabituelle2);
  set("oiseauHabitudeQty2", bird.quantiteHabituelle2);
  set("oiseauEditId", bird.id);
  set("oiseauDateEntree", bird.dateEntree);
  set("oiseauRegistreEntree", bird.registreEntree);
  set("oiseauStatut", bird.statut || "En place");
  set("oiseauDateSortie", bird.dateSortie);
  set("oiseauRegistreSortie", bird.registreSortie);
  set("oiseauMotifSortie", bird.motifSortie);

  const title = document.getElementById("oiseauFormTitle");
  const btn = document.getElementById("oiseauSubmitBtn");
  const cancelBtn = document.getElementById("cancelEditBirdBtn");

  if (title) title.textContent = `Modifier l’oiseau : ${bird.nom}`;
  if (btn) btn.textContent = "Enregistrer les modifications";
  if (cancelBtn) cancelBtn.classList.remove("hidden");

  refreshBirdPremiumTabs(bird);

  showSection("oiseaux");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openBirdFromDashboard(nom) {
  const bird = getActiveBirds().find(
    o => (o.nom || "").toLowerCase() === (nom || "").toLowerCase()
  );

  if (!bird) return;

  openBirdSheetInline(bird.id);
}

window.openBirdFromDashboard = openBirdFromDashboard;

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

  const pesDateInput = document.getElementById("pesDate");
  if (pesDateInput) pesDateInput.value = todayStr();

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

function dupliquerNourrissageJourPrecedent() {
  const dateCible = document.getElementById("feedDate")?.value || todayStr();

  const datesDisponibles = [...new Set(
    safeArray(appData.nourrissage)
      .map((n) => n.date || "")
      .filter((d) => d && d < dateCible)
  )].sort((a, b) => b.localeCompare(a));

  const dateSource = datesDisponibles[0];

  if (!dateSource) {
    alert("Aucun jour précédent à dupliquer.");
    return;
  }

  const oiseauxActifs = getSortedBirds(getActiveBirds());

  if (!oiseauxActifs.length) {
    alert("Aucun oiseau actif.");
    return;
  }

  viderTableNourrissage(false);

  oiseauxActifs.forEach((oiseau) => {
    const lignesSource = safeArray(appData.nourrissage)
      .filter((n) =>
        (n.date || "") === dateSource &&
        (n.oiseau || "").trim().toLowerCase() === (oiseau.nom || "").trim().toLowerCase()
      )
      .slice(0, 2);

    const l1 = lignesSource[0];
    const l2 = lignesSource[1];

    const food1 = document.getElementById(`feedFood1_${oiseau.id}`);
    const qty1 = document.getElementById(`feedQty1_${oiseau.id}`);
    const food2 = document.getElementById(`feedFood2_${oiseau.id}`);
    const qty2 = document.getElementById(`feedQty2_${oiseau.id}`);

    if (l1) {
      if (food1) food1.value = l1.nourriture || "Poussin";
      if (qty1) qty1.value = toNumber(l1.quantite) || "";
    }

    if (l2) {
      if (food2) food2.value = l2.nourriture || "";
      if (qty2) qty2.value = toNumber(l2.quantite) || "";
    }
  });

  if (statusEl) {
    statusEl.textContent = `Table nourrissage remplie depuis le ${formatDateFR(dateSource)}`;
  }
}

function ajouterNourrissage() {
  const date = document.getElementById("feedDate")?.value || todayStr();
  const remarques = document.getElementById("feedNote")?.value.trim() || "";

  const oiseauxActifs = getSortedBirds(getActiveBirds());

  if (!oiseauxActifs.length) return;

  const lignes = [];

  oiseauxActifs.forEach((oiseau) => {
    const f1 = document.getElementById(`feedFood1_${oiseau.id}`)?.value || "Poussin";
    const q1 = toNumber(document.getElementById(`feedQty1_${oiseau.id}`)?.value || 0);
    const f2 = document.getElementById(`feedFood2_${oiseau.id}`)?.value || "";
    const q2 = toNumber(document.getElementById(`feedQty2_${oiseau.id}`)?.value || 0);

    if (f1 && q1 > 0) {
      lignes.push({
        id: editingFeedId || makeId(),
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

  if (editingFeedId) {
    const ancien = appData.nourrissage.find((n) => n.id === editingFeedId);
    if (ancien) restoreStockFromDeletedFeed(ancien);

    appData.nourrissage = appData.nourrissage.filter((n) => n.id !== editingFeedId);
    editingFeedId = null;
  }

  lignes.forEach((ligne) => {
    decrementStock(ligne.nourriture, ligne.quantite);
    appData.nourrissage.unshift(ligne);
  });

  viderTableNourrissage(false);

 const noteEl = document.getElementById("feedNote");
if (noteEl) noteEl.value = "";

const feedDateEl = document.getElementById("feedDate");
if (feedDateEl) feedDateEl.value = todayStr();

renderAll();

const feedDateElAfterRender = document.getElementById("feedDate");
if (feedDateElAfterRender) feedDateElAfterRender.value = todayStr();

triggerAutoSave();
if (statusEl) statusEl.textContent = `${lignes.length} nourrissage(s) enregistré(s)`;
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

  const oiseauxActifs = getSortedBirds(getActiveBirds());

  if (!oiseauxActifs.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau disponible.</p>`;
    return;
  }

  zone.innerHTML = `
    <div class="feed-toolbar">
  <button class="btn secondary-btn" onclick="appliquerNourritureHabituelle()">Remplir avec nourriture habituelle</button>
  <button class="btn secondary-btn" onclick="dupliquerNourrissageJourPrecedent()">Dupliquer le jour précédent</button>
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
          ${oiseauxActifs.map((oiseau) => `
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

function appliquerNourritureHabituelle() {
  getActiveBirds().forEach((oiseau) => {
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
  getActiveBirds().forEach((oiseau) => {
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
  appData.stock.rat = Math.max(0, toNumber(document.getElementById("stockRat")?.value || 0));
  appData.stock.cailleteau30gr = Math.max(0, toNumber(document.getElementById("stockCailleteau30gr")?.value || 0));

  renderAll();
  triggerAutoSave();
  if (statusEl) statusEl.textContent = "Stock mis à jour";
}

async function ajouterSuiviVeterinaire() {
  const oiseau = document.getElementById("vetBird")?.value || "";
  if (!oiseau) return;

  const date = document.getElementById("vetDate")?.value || todayStr();
  const veterinaire = document.getElementById("vetNom")?.value.trim() || "";
  const motif = document.getElementById("vetMotif")?.value.trim() || "";
  const diagnostic = document.getElementById("vetDiagnostic")?.value.trim() || "";
  const traitement = document.getElementById("vetTraitement")?.value.trim() || "";
  const protocole = document.getElementById("vetProtocole")?.value.trim() || "";
  const observations = document.getElementById("vetObservations")?.value.trim() || "";
  const files = document.getElementById("vetFiles")?.files || null;

  try {
    if (statusEl) statusEl.textContent = "Upload fichiers vétérinaires…";

    const fichiers = files && files.length
      ? await uploadMultipleFiles(files, `veterinaire/${oiseau}`)
      : [];

    appData.veterinaire.unshift({
      id: makeId(),
      oiseau,
      date,
      veterinaire,
      motif,
      diagnostic,
      traitement,
      protocole,
      observations,
      fichiers
    });

    ["vetBird", "vetDate", "vetNom", "vetMotif", "vetDiagnostic", "vetTraitement", "vetProtocole", "vetObservations", "vetFiles"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === "vetDate") {
        el.value = todayStr();
      } else {
        el.value = "";
      }
    });

    renderAll();
    triggerAutoSave();
    if (statusEl) statusEl.textContent = "Suivi vétérinaire ajouté";
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Erreur suivi vétérinaire";
  }
}

function monterOiseau(id) {
  const oiseauxTries = appData.oiseaux
    .slice()
    .sort((a, b) => {
      const ordreA = toNumber(a.ordre) || 9999;
      const ordreB = toNumber(b.ordre) || 9999;
      if (ordreA !== ordreB) return ordreA - ordreB;
      return (a.nom || "").localeCompare(b.nom || "");
    });

  const index = oiseauxTries.findIndex((o) => o.id === id);
  if (index <= 0) return;

  const current = oiseauxTries[index];
  const previous = oiseauxTries[index - 1];

  const ordreCurrent = toNumber(current.ordre) || index + 1;
  const ordrePrevious = toNumber(previous.ordre) || index;

  current.ordre = ordrePrevious;
  previous.ordre = ordreCurrent;

  renderAll();
  triggerAutoSave();

  if (statusEl) statusEl.textContent = `${current.nom} déplacé vers le haut`;
}

function descendreOiseau(id) {
  const oiseauxTries = appData.oiseaux
    .slice()
    .sort((a, b) => {
      const ordreA = toNumber(a.ordre) || 9999;
      const ordreB = toNumber(b.ordre) || 9999;
      if (ordreA !== ordreB) return ordreA - ordreB;
      return (a.nom || "").localeCompare(b.nom || "");
    });

  const index = oiseauxTries.findIndex((o) => o.id === id);
  if (index === -1 || index >= oiseauxTries.length - 1) return;

  const current = oiseauxTries[index];
  const next = oiseauxTries[index + 1];

  const ordreCurrent = toNumber(current.ordre) || index + 1;
  const ordreNext = toNumber(next.ordre) || index + 2;

  current.ordre = ordreNext;
  next.ordre = ordreCurrent;

  renderAll();
  triggerAutoSave();

  if (statusEl) statusEl.textContent = `${current.nom} déplacé vers le bas`;
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

function modifierNourrissage(id) {
  const item = appData.nourrissage.find((n) => n.id === id);
  if (!item) return;

  editingFeedId = id;

  const feedDate = document.getElementById("feedDate");
  const feedNote = document.getElementById("feedNote");

  if (feedDate) feedDate.value = item.date || "";
  if (feedNote) feedNote.value = item.remarques || "";

  const oiseau = appData.oiseaux.find(
    (o) => (o.nom || "").trim().toLowerCase() === (item.oiseau || "").trim().toLowerCase()
  );

  if (oiseau) {
    viderTableNourrissage(false);

    const food1 = document.getElementById(`feedFood1_${oiseau.id}`);
    const qty1 = document.getElementById(`feedQty1_${oiseau.id}`);

    if (food1) food1.value = item.nourriture || "Poussin";
    if (qty1) qty1.value = item.quantite || 0;
  }

  showSection("nourrissage");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (statusEl) statusEl.textContent = `Modification du nourrissage de ${item.oiseau}`;
}

function supprimerNourrissage(id) {
  const found = appData.nourrissage.find((n) => n.id === id);
  if (found) restoreStockFromDeletedFeed(found);
  appData.nourrissage = appData.nourrissage.filter((n) => n.id !== id);
  renderAll();
  triggerAutoSave();
}

function supprimerSuiviVeterinaire(id) {
  appData.veterinaire = appData.veterinaire.filter((v) => v.id !== id);
  renderAll();
  triggerAutoSave();
}

function quickFeed(id, food, qty) {
  const bird = getActiveBirds().find((o) => o.id === id);
  if (!bird) return;
  addQuickFeed(food, qty, bird);
}

function rationHabituelleTerrain(id) {
  const bird = getActiveBirds().find((o) => o.id === id);
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

function ajouterEntretien() {
  const date = document.getElementById("entretienDate")?.value || todayStr();
  const type = document.getElementById("entretienType")?.value || "";
  const zone = document.getElementById("entretienZone")?.value.trim() || "";
  const details = document.getElementById("entretienDetails")?.value.trim() || "";

  if (!type) {
    alert("Choisis un type d'entretien.");
    return;
  }

  appData.entretien.unshift({
    id: makeId(),
    date,
    type,
    zone,
    details
  });

  const entretienDate = document.getElementById("entretienDate");
  const entretienType = document.getElementById("entretienType");
  const entretienZone = document.getElementById("entretienZone");
  const entretienDetails = document.getElementById("entretienDetails");

  if (entretienDate) entretienDate.value = todayStr();
  if (entretienType) entretienType.value = "";
  if (entretienZone) entretienZone.value = "";
  if (entretienDetails) entretienDetails.value = "";

  renderEntretien();
  triggerAutoSave();

  if (statusEl) statusEl.textContent = "Entretien ajouté";
}

function supprimerEntretien(id) {
  appData.entretien = safeArray(appData.entretien).filter((e) => e.id !== id);
  renderEntretien();
  triggerAutoSave();

  if (statusEl) statusEl.textContent = "Entretien supprimé";
}

function renderEntretien() {
  const zone = document.getElementById("listeEntretien");
  if (!zone) return;

  if (!safeArray(appData.entretien).length) {
    zone.innerHTML = `<p class="muted-line">Aucun entretien enregistré.</p>`;
    return;
  }

  const sorted = safeArray(appData.entretien)
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  zone.innerHTML = `
    <div class="list-grid">
      ${sorted.map((item) => `
        <div class="item">
          <p><strong>Date :</strong> ${safe(formatDateFR(item.date || ""))}</p>
          <p><strong>Type :</strong> ${safe(item.type || "")}</p>
          <p><strong>Zone :</strong> ${safe(item.zone || "-")}</p>
          <p><strong>Détails :</strong> ${safe(item.details || "-")}</p>

          <div class="small-actions">
            <button class="btn btn-danger" onclick="supprimerEntretien('${item.id}')">Supprimer</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderVeterinaire() {
  const zone = document.getElementById("listeVeterinaire");
  if (!zone) return;

  const liste = Array.isArray(appData.veterinaire) ? appData.veterinaire : [];

  if (!liste.length) {
    zone.innerHTML = `<p class="muted-line">Aucun suivi vétérinaire.</p>`;
    return;
  }

  zone.innerHTML = liste
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((item) => `
      <div class="item">
        <p><strong>${safe(item.oiseau || "")}</strong> - ${safe(item.date || "")}</p>
        <p>${safe(item.motif || "")}</p>
        <button onclick="supprimerSuiviVeterinaire('${item.id}')">Supprimer</button>
      </div>
    `).join("");
}

function ouvrirFicheOiseau(id) {
  openBirdSheet(id);
}

function ouvrirVetoOiseau(nom) {
  showSection("veterinaire");

  setTimeout(() => {
    const select = document.getElementById("vetFilterBird");
    if (select) {
      select.value = nom;
      renderVeterinaire();
    }
  }, 300);
}

// 👇 COLLE TA FONCTION ICI 👇

async function enregistrerPrixNourriture() {
  appData.prixNourriture = {
    "Poussin": toNumber(document.getElementById("prixPoussin")?.value),
    "Caille": toNumber(document.getElementById("prixCaille")?.value),
    "Pigeon": toNumber(document.getElementById("prixPigeon")?.value),
    "Lapin": toNumber(document.getElementById("prixLapin")?.value),
    "Poisson": toNumber(document.getElementById("prixPoisson")?.value),
    "Souris": toNumber(document.getElementById("prixSouris")?.value),
    "Rat": toNumber(document.getElementById("prixRat")?.value),
    "Cailleteau 30gr": toNumber(document.getElementById("prixCailleteau")?.value)
  };

  await saveData();
  fillPrixNourritureForm();
  renderCoutNourriture();

  if (statusEl) statusEl.textContent = "Prix nourriture enregistrés";
  alert("Prix enregistrés");
}

function exportControle() {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre d'export.");
    return;
  }

  const contenu = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Export contrôle élevage</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; background:#faf7f2; color:#222; }
        h1 { margin-bottom: 6px; }
        h2 { margin-top: 28px; margin-bottom: 10px; }
        h3 { margin-top: 18px; margin-bottom: 8px; }
        .top-actions { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px; }
        .btn {
          display:inline-block;
          padding:12px 16px;
          border:none;
          border-radius:10px;
          background:#8aa36b;
          color:#fff;
          text-decoration:none;
          font-weight:700;
          cursor:pointer;
        }
        .btn.secondary { background:#7aa7a6; }
        .card {
          border:1px solid #ccc;
          border-radius:12px;
          padding:14px;
          margin-bottom:16px;
          background:#fff;
        }
        .doc-box {
          border:1px solid #ddd;
          border-radius:10px;
          padding:10px;
          margin-bottom:10px;
          background:#fcfcfc;
        }
        .small {
          font-size:12px;
          word-break:break-all;
          color:#666;
          margin-top:6px;
        }
        .doc-link-btn {
          display:inline-block;
          padding:10px 14px;
          border-radius:8px;
          background:#5f88b3;
          color:#fff;
          text-decoration:none;
          font-weight:700;
          margin-top:6px;
        }
        @media print {
          .top-actions { display:none; }
          body { background:#fff; padding:10px; }
        }
      </style>
    </head>
    <body>

      <div class="top-actions">
        <button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
        <button class="btn secondary" onclick="shareExport()">Partager</button>
      </div>

      <div class="header-doc">
       <h2>Koll Jean-Philippe</h2>
       <p>Rue du Canal 82, 4800 Ensival</p>
       <p>+32 473 47 03 87</p>
       <p>jeanphilippekoll@gmail.com</p>
      </div>

      <h1>Export contrôle élevage</h1>
      <p>Date : ${safe(formatDateFR(todayStr()))}</p>

      ${appData.oiseaux.map(o => `
        <div class="card">
          <h2>${safe(o.nom)}</h2>

          <p><strong>Espèce :</strong> ${safe(o.espece || "-")}</p>
          <p><strong>Âge / date de naissance :</strong> ${safe(o.age || "-")}</p>
          <p><strong>Sexe :</strong> ${safe(o.sexe || "-")}</p>
          <p><strong>N° bague :</strong> ${safe(o.bague || "-")}</p>
          <p><strong>N° CITES :</strong> ${safe(o.cites || "-")}</p>
          <p><strong>Annexe :</strong> ${safe(o.annexe || "-")}</p>
          <p><strong>N° entrée :</strong> ${safe(o.registreEntree || "-")}</p>
          <p><strong>Date d'entrée :</strong> ${safe(formatDateFR(o.dateEntree || "") || "-")}</p>
          <p><strong>Statut :</strong> ${safe(o.statut || "-")}</p>
          <p><strong>Poids :</strong> ${safe(o.poidsActuel || "-")} g</p>

          <h3>Documents</h3>
          ${
            safeArray(o.documents).length
              ? safeArray(o.documents).map(d => `
                  <div class="doc-box">
                    <div><strong>${safe(d.name)}</strong></div>
                    <a class="doc-link-btn" href="${safeAttr(d.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le document</a>
                    <div class="small">${safe(d.url)}</div>
                  </div>
                `).join("")
              : "<p>Aucun document</p>"
          }

          <h3>Suivi vétérinaire</h3>
          ${
            safeArray(appData.veterinaire)
              .filter(v => (v.oiseau || "").trim().toLowerCase() === (o.nom || "").trim().toLowerCase())
              .map(v => `
                <div class="card">
                  <p><strong>Date :</strong> ${safe(formatDateFR(v.date || ""))}</p>
                  <p><strong>Vétérinaire :</strong> ${safe(v.veterinaire || "-")}</p>
                  <p><strong>Motif :</strong> ${safe(v.motif || "-")}</p>
                  <p><strong>Diagnostic :</strong> ${safe(v.diagnostic || "-")}</p>
                  <p><strong>Traitement :</strong> ${safe(v.traitement || "-")}</p>
                  <p><strong>Protocole :</strong> ${safe(v.protocole || "-")}</p>
                  <p><strong>Observations :</strong> ${safe(v.observations || "-")}</p>

                  ${
                    safeArray(v.fichiers).length
                      ? safeArray(v.fichiers).map(f => `
                          <div class="doc-box">
                            <div><strong>${safe(f.name)}</strong></div>
                            <a class="doc-link-btn" href="${safeAttr(f.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le fichier</a>
                            <div class="small">${safe(f.url)}</div>
                          </div>
                        `).join("")
                      : "<p>Aucun fichier vétérinaire</p>"
                  }
                </div>
              `).join("") || "<p>Aucun suivi</p>"
          }
        </div>
      `).join("")}

      <script>
        function shareExport() {
          const text = document.body.innerText;

          if (navigator.share) {
            navigator.share({
              title: "Export contrôle élevage",
              text
            }).catch(() => {});
            return;
          }

          navigator.clipboard.writeText(text)
            .then(() => alert("Export copié dans le presse-papiers."))
            .catch(() => alert("Impossible de partager automatiquement."));
        }
      </script>

    </body>
    </html>
  `;

  win.document.write(contenu);
  win.document.close();
}

function showBirdTab(tabName, button) {

    document.querySelectorAll(".bird-tab-content").forEach(tab => {
        tab.classList.add("hidden");
    });

    const active = document.getElementById("birdTab-" + tabName);
    if (active) {
        active.classList.remove("hidden");
    }

    document.querySelectorAll(".bird-tab").forEach(btn => {
        btn.classList.remove("active");
    });

    if (button) {
        button.classList.add("active");
    }

    console.log("Onglet fiche oiseau :", tabName);
}


window.showSection = showSection;
window.showBirdTab = showBirdTab;
window.saveData = saveData;
window.ajouterOiseau = ajouterOiseau;
window.modifierOiseau = modifierOiseau;
window.toggleNourrissageDate = toggleNourrissageDate;
window.imprimerNourrissageDate = imprimerNourrissageDate;
window.cancelEditBird = cancelEditBird;
window.ajouterPesee = ajouterPesee;
window.ajouterDocument = ajouterDocument;
window.ajouterNourrissage = ajouterNourrissage;
window.appliquerNourritureHabituelle = appliquerNourritureHabituelle;
window.viderTableNourrissage = viderTableNourrissage;
window.enregistrerStock = enregistrerStock;
window.ajouterSuiviVeterinaire = ajouterSuiviVeterinaire;
window.supprimerOiseau = supprimerOiseau;
window.supprimerDocument = supprimerDocument;
window.supprimerNourrissage = supprimerNourrissage;
window.modifierNourrissage = modifierNourrissage;
window.corrigerDateNourrissage = corrigerDateNourrissage;
window.supprimerGroupeNourrissage = supprimerGroupeNourrissage;
window.supprimerSuiviVeterinaire = supprimerSuiviVeterinaire;
window.quickFeed = quickFeed;
window.rationHabituelleTerrain = rationHabituelleTerrain;
window.openBirdSheet = openBirdSheet;
window.checkPin = checkPin;
window.partagerFicheOiseau = partagerFicheOiseau;
window.ajouterEntretien = ajouterEntretien;
window.supprimerEntretien = supprimerEntretien;
window.imprimerInventaire = imprimerInventaire;
window.partagerInventaire = partagerInventaire;
window.renderVeterinaire = renderVeterinaire;
window.remplirVacances = remplirVacances;
window.renderOiseaux = renderOiseaux;
window.monterOiseau = monterOiseau;
window.descendreOiseau = descendreOiseau;
window.imprimerFicheNourrissage = imprimerFicheNourrissage;
window.imprimerVacances = imprimerVacances;
window.renderArchivesOiseaux = renderArchivesOiseaux;
window.ouvrirInventaire = ouvrirInventaire;
window.ouvrirFicheOiseau = ouvrirFicheOiseau;
window.ouvrirVetoOiseau = ouvrirVetoOiseau;
window.exportControle = exportControle;
window.dupliquerNourrissageJourPrecedent = dupliquerNourrissageJourPrecedent;
window.enregistrerPrixNourriture = enregistrerPrixNourriture;
window.masquerOiseauCout = masquerOiseauCout;
window.renderDashboardIntelligent = renderDashboardIntelligent;
window.openBirdDocuments = openBirdDocuments;
window.openBirdVet = openBirdVet;
window.openBirdFeed = openBirdFeed;
window.openBirdWeights = openBirdWeights;
window.openBirdSheetInline = openBirdSheetInline;

document.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("locked");
  await loadData();

  setTimeout(() => {
  renderDashboardIntelligent();
}, 500);

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

  if (typeof resetBirdForm === "function") {
    resetBirdForm();
  }

  showSection("accueil");

setTimeout(() => {
  document.getElementById("dashboardDate").textContent = "dashboard actif";

  document.getElementById("dashboardToWeigh").innerHTML =
    `<p class="muted-line">⚖️ Pesées à vérifier aujourd’hui.</p>`;

  document.getElementById("dashboardToFly").innerHTML =
    `<p class="muted-line">🦅 Poids de vol à vérifier.</p>`;

  document.getElementById("dashboardComplements").innerHTML =
    `<p class="muted-line">💊 Aucun complément prévu aujourd’hui.</p>`;

  document.getElementById("dashboardSurveillance").innerHTML =
    `<p class="muted-line">❤️ Aucun soin actif renseigné.</p>`;

  document.getElementById("dashboardTasks").innerHTML =
    `<p class="muted-line">✅ Contrôle eau, fientes, comportement et stock.</p>`;

  document.getElementById("dashboardAlerts").innerHTML =
    `<p class="muted-line">⚠️ Aucune alerte active.</p>`;
}, 500);
});

function openBirdDocuments(id) {
  const bird = appData.oiseaux.find(o => o.id === id);
  if (!bird) return;

  const docs = safeArray(bird.documents);

  const rows = docs.map(doc => `
    <tr>
      <td>${safe(doc.name || doc.titre || "Document")}</td>
      <td>
        <a href="${safeAttr(doc.url || doc.lien || "")}"
           target="_blank">
           📎 Ouvrir
        </a>
      </td>
    </tr>
  `).join("");

  const win = window.open("", "_blank");

  win.document.write(`
    <html>
      <head>
        <title>Documents - ${safe(bird.nom)}</title>

        <style>
          body{
            font-family:Arial,sans-serif;
            background:#f5f7f4;
            padding:20px;
            color:#2f3b2f;
          }

          .card{
            background:white;
            border-radius:16px;
            padding:20px;
            box-shadow:0 2px 10px rgba(0,0,0,.08);
          }

          h2{
            margin-top:0;
            color:#2f4f2f;
          }

          table{
            width:100%;
            border-collapse:collapse;
          }

          th{
            background:#2f4f2f;
            color:white;
            padding:10px;
            text-align:left;
          }

          td{
            padding:10px;
            border-bottom:1px solid #ddd;
          }

          tr:nth-child(even){
            background:#f7faf7;
          }

          a{
            color:#2f4f2f;
            font-weight:bold;
            text-decoration:none;
          }

          .print-btn{
            background:#2f4f2f;
            color:white;
            border:none;
            padding:10px 16px;
            border-radius:8px;
            cursor:pointer;
            margin-bottom:15px;
          }
        </style>
      </head>

      <body>

        <div class="card">

          <button class="print-btn" onclick="window.print()">
            🖨️ Imprimer
          </button>

          <h2>📎 Documents - ${safe(bird.nom)}</h2>

          <table>
            <tr>
              <th>Document</th>
              <th>Action</th>
            </tr>

            ${rows}

          </table>

        </div>

      </body>
    </html>
  `);

  win.document.close();
}

function openBirdVet(id) {
  const bird = appData.oiseaux.find(o => o.id === id);
  if (!bird) return;

  const rows = getVetForBird(bird.nom)
    .map(item => `
      <tr>
        <td>${safe(formatDateFR(item.date || ""))}</td>
        <td>${safe(item.veterinaire || "")}</td>
        <td>${safe(item.motif || "")}</td>
        <td>${safe(item.diagnostic || "")}</td>
        <td>${safe(item.traitement || "")}</td>
      </tr>
    `)
    .join("");

  const win = window.open("", "_blank");

  win.document.write(`
    <html>
      <head>
        <title>Vétérinaire - ${safe(bird.nom)}</title>

        <style>
          body{
            font-family:Arial,sans-serif;
            background:#f5f7f4;
            padding:20px;
            color:#2f3b2f;
          }

          .card{
            background:white;
            border-radius:16px;
            padding:20px;
            box-shadow:0 2px 10px rgba(0,0,0,.08);
          }

          h2{
            margin-top:0;
            color:#2f4f2f;
          }

          table{
            width:100%;
            border-collapse:collapse;
          }

          th{
            background:#2f4f2f;
            color:white;
            padding:10px;
            text-align:left;
          }

          td{
            padding:10px;
            border-bottom:1px solid #ddd;
          }

          tr:nth-child(even){
            background:#f7faf7;
          }

          .print-btn{
            background:#2f4f2f;
            color:white;
            border:none;
            padding:10px 16px;
            border-radius:8px;
            cursor:pointer;
            margin-bottom:15px;
          }
        </style>
      </head>

      <body>

        <div class="card">

          <button class="print-btn" onclick="window.print()">
            🖨️ Imprimer
          </button>

          <h2>🏥 Historique vétérinaire - ${safe(bird.nom)}</h2>

          <table>
            <tr>
              <th>Date</th>
              <th>Vétérinaire</th>
              <th>Motif</th>
              <th>Diagnostic</th>
              <th>Traitement</th>
            </tr>

            ${rows}

          </table>

        </div>

      </body>
    </html>
  `);

  win.document.close();
}

function openBirdFeed(id) {
  const bird = appData.oiseaux.find(o => o.id === id);
  if (!bird) return;

  const rows = getFeedsForBird(bird.nom)
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(item => `
      <tr>
        <td>${safe(formatDateFR(item.date || ""))}</td>
        <td>${safe(item.nourriture || "")}</td>
        <td>${safe(item.quantite || 0)}</td>
        <td>${safe(item.remarques || "")}</td>
      </tr>
    `)
    .join("");

  const win = window.open("", "_blank");

  win.document.write(`
    <html>
      <head>
        <title>Nourrissage - ${safe(bird.nom)}</title>
        <style>
          body{font-family:Arial,sans-serif;background:#f5f7f4;padding:20px;color:#2f3b2f;}
          .card{background:white;border-radius:16px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.08);}
          h2{margin-top:0;color:#2f4f2f;}
          table{width:100%;border-collapse:collapse;}
          th{background:#2f4f2f;color:white;padding:10px;text-align:left;}
          td{padding:10px;border-bottom:1px solid #ddd;}
          tr:nth-child(even){background:#f7faf7;}
          .print-btn{background:#2f4f2f;color:white;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;margin-bottom:15px;}
        </style>
      </head>
      <body>
        <div class="card">
          <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
          <h2>🍗 Historique nourrissage - ${safe(bird.nom)}</h2>

          <table>
            <tr>
              <th>Date</th>
              <th>Nourriture</th>
              <th>Quantité</th>
              <th>Remarque</th>
            </tr>
            ${rows}
          </table>
        </div>
      </body>
    </html>
  `);

  win.document.close();
}

function openBirdWeights(id) {
  const bird = appData.oiseaux.find(o => o.id === id);
  if (!bird) return;

  const rows = safeArray(bird.historiquePoids)
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(item => `
      <tr>
        <td>${safe(formatDateFR(item.date || ""))}</td>
        <td>${safe(item.poids || "")} g</td>
      </tr>
    `)
    .join("");

  const win = window.open("", "_blank");

  win.document.write(`
    <html>
      <head>
        <title>Poids - ${safe(bird.nom)}</title>
        <style>
          body{font-family:Arial,sans-serif;background:#f5f7f4;padding:20px;color:#2f3b2f;}
          .card{background:white;border-radius:16px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.08);}
          h2{margin-top:0;color:#2f4f2f;}
          table{width:100%;border-collapse:collapse;}
          th{background:#2f4f2f;color:white;padding:10px;text-align:left;}
          td{padding:10px;border-bottom:1px solid #ddd;}
          tr:nth-child(even){background:#f7faf7;}
          .print-btn{background:#2f4f2f;color:white;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;margin-bottom:15px;}
        </style>
      </head>
      <body>
        <div class="card">
          <button class="print-btn" onclick="window.print()">🖨️ Imprimer</button>
          <h2>⚖️ Historique des poids - ${safe(bird.nom)}</h2>

          <table>
            <tr>
              <th>Date</th>
              <th>Poids</th>
            </tr>
            ${rows}
          </table>
        </div>
      </body>
    </html>
  `);

  win.document.close();
}