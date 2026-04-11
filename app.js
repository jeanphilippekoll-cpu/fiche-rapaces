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
  "Cailleteau 30gr"
];

let rawRapacesData = {};
let rawUserData = {};
let editingBirdId = null;
let autoSaveTimer = null;
let editingFeedId = null;

let appData = {
  oiseaux: [],
  pesees: [],
  documents: [],
  nourrissage: [],
  veterinaire: [],
  entretien: [],
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
  bague: o.bague || "",
  cites: o.cites || "",
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
    stock
  };
}

function buildRapacesPayload() {
  const oldBirds = safeArray(rawRapacesData?.oiseaux);

  return {
  ...ancien,
  id: o.id,
  nom: o.nom || "",
  bague: o.bague || "",
  cites: o.cites || "",
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

function partagerFicheOiseau(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  const birdFeeds = getFeedsForBird(bird.nom);
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

function openBirdSheet(id) {
  const bird = appData.oiseaux.find((o) => o.id === id);
  if (!bird) return;

  const birdFeeds = getFeedsForBird(bird.nom);
  const birdVet = getVetForBird(bird.nom);

  const poidsRows = safeArray(bird.historiquePoids)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((item) => `
      <tr>
        <td>${safe(formatDateFR(item.date || ""))}</td>
        <td>${safe(item.poids || "")}</td>
      </tr>
    `).join("");

  const feedRows = birdFeeds
    .map((item) => `
      <tr>
        <td>${safe(formatDateFR(item.date || ""))}</td>
        <td>${safe(item.nourriture || "")}</td>
        <td>${safe(item.quantite || 0)}</td>
      </tr>
    `).join("");

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
        h1{
          margin:0 0 6px 0;
          font-size:28px;
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
          background:#f2f2f2;
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
              <th>Sexe</th>
              <td>${safe(bird.sexe || "-")}</td>
              <th>Âge</th>
              <td>${safe(bird.age || "-")}</td>
            </tr>
            <tr>
              <th>N° bague</th>
              <td>${safe(bird.bague || "-")}</td>
              <th>N° CITES</th>
              <td>${safe(bird.cites || "-")}</td>
            </tr>
            <tr>
              <th>Annexe</th>
              <td>${safe(bird.annexe || "-")}</td>
              <th>Poids actuel</th>
              <td>${safe(bird.poidsActuel || "-")} g</td>
            </tr>
            <tr>
              <th>Date d'entrée</th>
              <td>${safe(formatDateFR(bird.dateEntree || "") || "-")}</td>
              <th>N° registre d'entrée</th>
              <td>${safe(bird.registreEntree || "-")}</td>
            </tr>
            <tr>
              <th>Statut</th>
              <td>${safe(bird.statut || "-")}</td>
              <th>Date de sortie</th>
              <td>${safe(formatDateFR(bird.dateSortie || "") || "-")}</td>
            </tr>
            <tr>
              <th>N° registre de sortie</th>
              <td>${safe(bird.registreSortie || "-")}</td>
              <th>Motif sortie</th>
              <td>${safe(bird.motifSortie || "-")}</td>
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

      <h2>Historique nourrissage</h2>
      ${
        feedRows
          ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Nourriture</th>
                  <th>Quantité</th>
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
  <div><span>N° bague</span><strong>${safe(oiseau.bague || "-")}</strong></div>
  <div><span>N° CITES</span><strong>${safe(oiseau.cites || "-")}</strong></div>
  <div><span>Annexe</span><strong>${safe(oiseau.annexe || "-")}</strong></div>
  <div><span>Date d'entrée</span><strong>${safe(formatDateFR(oiseau.dateEntree || "") || "-")}</strong></div>
  <div><span>Registre entrée</span><strong>${safe(oiseau.registreEntree || "-")}</strong></div>
  <div><span>Statut</span><strong>${safe(oiseau.statut || "-")}</strong></div>
</div>       

<div class="card-section">
  <h4>Entrée / sortie registre</h4>
  <p><strong>Date d'entrée :</strong> ${safe(formatDateFR(oiseau.dateEntree || "") || "-")}</p>
  <p><strong>N° registre entrée :</strong> ${safe(oiseau.registreEntree || "-")}</p>
  <p><strong>Statut :</strong> ${safe(oiseau.statut || "-")}</p>
  <p><strong>Date de sortie :</strong> ${safe(formatDateFR(oiseau.dateSortie || "") || "-")}</p>
  <p><strong>N° registre sortie :</strong> ${safe(oiseau.registreSortie || "-")}</p>
  <p><strong>Motif / remarque :</strong> ${safe(oiseau.motifSortie || "-")}</p>
  <p><strong>Bague :</strong> ${safe(oiseau.bague || "-")}</p>

          <div class="card-section">
            <h4>Notes</h4>
            <p>${safe(oiseau.notes || "Aucune note")}</p>
          </div>

          <div class="card-section">
            <h4>Suivi vétérinaire</h4>
            ${renderVetForBird(oiseau.nom)}
          </div>

          <div class="card-section">
            <h4>Nourriture habituelle</h4>
            <p>${safe(oiseau.nourritureHabituelle || "Non définie")} — ${safe(oiseau.quantiteHabituelle || 0)} pièce(s)</p>
            <p>${safe(oiseau.nourritureHabituelle2 || "Aucune")}${oiseau.nourritureHabituelle2 ? " — " + safe(oiseau.quantiteHabituelle2 || 0) + " pièce(s)" : ""}</p>
          </div>

          <div class="card-section">
            <h4>Documents liés</h4>
            ${renderDocumentsList(oiseau.documents)}
          </div>

          <div class="card-section">
            <h4>Poids enregistrés</h4>
            ${renderHistoriquePoidsTable(oiseau.historiquePoids)}
          </div>

         <div class="small-actions">
          <button class="btn secondary-btn" onclick="modifierOiseau('${oiseau.id}')">Modifier</button>
          <button class="btn info-btn" onclick="openBirdSheet('${oiseau.id}')">Ouvrir fiche</button>
          <button class="btn warn-btn" onclick="partagerFicheOiseau('${oiseau.id}')">Partager</button>
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

  const groupedByDateAndBird = {};

  appData.nourrissage.forEach((item) => {
    const date = item.date || "Sans date";
    const oiseau = item.oiseau || "Sans oiseau";
    const key = `${date}__${oiseau}`;

    if (!groupedByDateAndBird[key]) {
      groupedByDateAndBird[key] = {
        date,
        oiseau,
        total: 0,
        aliments: {}
      };
    }

    const qty = toNumber(item.quantite);
    const nourriture = item.nourriture || "Inconnu";

    groupedByDateAndBird[key].total += qty;
    groupedByDateAndBird[key].aliments[nourriture] =
      (groupedByDateAndBird[key].aliments[nourriture] || 0) + qty;
  });

  const groupedByDate = {};

  Object.values(groupedByDateAndBird).forEach((entry) => {
    if (!groupedByDate[entry.date]) groupedByDate[entry.date] = [];
    groupedByDate[entry.date].push(entry);
  });

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  zone.innerHTML = sortedDates.map((date) => {
    const rows = groupedByDate[date]
      .sort((a, b) => (a.oiseau || "").localeCompare(b.oiseau || ""))
      .map((entry) => {
        const detailNourriture = Object.entries(entry.aliments)
          .map(([food, qty]) => `${safe(food)} x${safe(qty)}`)
          .join(" | ");

        return `
          <tr>
            <td>${safe(formatDateFR(entry.date))}</td>
            <td>${safe(entry.oiseau)}</td>
            <td>${detailNourriture}</td>
            <td>${safe(entry.total)}</td>
          </tr>
        `;
      }).join("");

    return `
      <div class="card-section">
        <div class="feed-table-wrap">
          <table class="feed-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Oiseau</th>
                <th>Nourriture donnée</th>
                <th>Total</th>
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

  const search = document.getElementById("terrainSearch")?.value.toLowerCase() || "";

  let oiseaux = appData.oiseaux;

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

function renderVeterinaire() {
  const zone = document.getElementById("listeVeterinaire");
  const filtre = document.getElementById("vetFilterBird")?.value || "";
  if (!zone) return;

  const normaliser = (txt) =>
    String(txt || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  let liste = safeArray(appData.veterinaire);

  if (filtre) {
    const filtreNormalise = normaliser(filtre);

    liste = liste.filter((item) => {
      const nomItem = normaliser(item.oiseau);
      return nomItem === filtreNormalise;
    });
  }

  if (!liste.length) {
    zone.innerHTML = `<p class="muted-line">Aucun suivi vétérinaire.</p>`;
    return;
  }

  const groupes = {};

  liste.forEach((item) => {
    const nomOiseau = item.oiseau || "Sans oiseau";
    if (!groupes[nomOiseau]) groupes[nomOiseau] = [];
    groupes[nomOiseau].push(item);
  });

  const oiseauxTries = Object.keys(groupes).sort((a, b) => a.localeCompare(b));

  const totalSuivis = liste.length;
  const totalOiseaux = oiseauxTries.length;

  zone.innerHTML = `
    <div class="summary-grid" style="margin-bottom:18px;">
      <div class="summary-card">
        <div>Nombre de suivis vétérinaires</div>
        <div class="summary-total">${totalSuivis}</div>
      </div>
      <div class="summary-card">
        <div>Oiseaux concernés</div>
        <div class="summary-total">${totalOiseaux}</div>
      </div>
    </div>

    ${oiseauxTries.map((nomOiseau) => {
      const suivis = groupes[nomOiseau]
        .slice()
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      return `
        <div class="card-section" style="margin-bottom:18px;">
          <h3 style="margin-top:0;">${safe(nomOiseau)}</h3>
          <p class="muted-line" style="margin-top:-4px;">
            ${suivis.length} suivi(s) vétérinaire(s)
          </p>

          <div class="list-grid">
            ${suivis.map((item) => `
              <div class="item">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                  <div>
                    <p style="margin:0 0 8px 0;font-size:18px;font-weight:700;">
                      ${safe(formatDateFR(item.date))}
                    </p>
                    <p><strong>Vétérinaire :</strong> ${safe(item.veterinaire || "-")}</p>
                    <p><strong>Motif :</strong> ${safe(item.motif || "-")}</p>
                    <p><strong>Diagnostic :</strong> ${safe(item.diagnostic || "-")}</p>
                    <p><strong>Traitement :</strong> ${safe(item.traitement || "-")}</p>
                  </div>
                </div>

                <div class="card-section">
                  <h4>Protocole</h4>
                  <p>${safe(item.protocole || "Aucun protocole")}</p>
                </div>

                <div class="card-section">
                  <h4>Observations</h4>
                  <p>${safe(item.observations || "Aucune observation")}</p>
                </div>

                <div class="card-section">
                  <h4>Fichiers vétérinaires</h4>
                  ${
                    safeArray(item.fichiers).length
                      ? `
                        <div class="stack-list">
                          ${safeArray(item.fichiers).map((f) => `
                            <div class="item" style="margin-top:0;">
                              <p style="margin-top:0;"><strong>${safe(f.name)}</strong></p>
                              <div class="actions">
                                <a class="doc-link" href="${safeAttr(f.url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>
                              </div>
                              <p class="muted-line" style="word-break:break-all;font-size:12px;">
                                ${safe(f.url)}
                              </p>
                            </div>
                          `).join("")}
                        </div>
                      `
                      : `<p class="muted-line">Aucun fichier.</p>`
                  }
                </div>

                <div class="small-actions">
                  <button class="btn btn-danger" onclick="supprimerSuiviVeterinaire('${item.id}')">Supprimer</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("")}
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

function renderInventaire() {
  const zone = document.getElementById("inventaireZone");
  if (!zone) return;

  if (!appData.oiseaux.length) {
    zone.innerHTML = `<p class="muted-line">Aucun oiseau.</p>`;
    return;
  }

  const rows = appData.oiseaux
    .filter((o) => (o.statut || "En place") === "En place")
    .slice()
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""))
    .map((oiseau) => `
      <tr>
        <td>${safe(oiseau.nom || "")}</td>
        <td>${safe(oiseau.bague || "-")}</td>
        <td>${safe(oiseau.cites || "-")}</td>
        <td>${safe(oiseau.espece || "")}</td>
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
            <th>N° bague</th>
            <th>N° CITES</th>
            <th>Espèce</th>
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

function ouvrirInventaire() {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre inventaire.");
    return;
  }

  win.document.write(getInventaireHtml());
  win.document.close();
}

function imprimerInventaire() {
  ouvrirInventaire();
}

function partagerInventaire() {
  let texte = `Inventaire oiseaux présents sur site\n`;
  texte += `Date : ${formatDateFR(todayStr())}\n\n`;

  appData.oiseaux
    .slice()
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""))
    .forEach((oiseau) => {
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

  if (!appData.oiseaux.length) {
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
          ${appData.oiseaux.map((o) => `
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

function remplirVacances() {
  renderVacances();
}

function renderAll() {
  syncBoitesFromPoussins();
  refreshStats();
  refreshBirdSelects();
  renderOiseaux();
  renderPesees();
  renderDocuments();
  renderNourrissage();
  renderVeterinaire();
  renderInventaire();
  renderEntretien();
  fillStockForm();
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
  "oiseauBague",
  "oiseauCites",
  "oiseauEspece",
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

  const bague = document.getElementById("oiseauBague")?.value.trim() || "";
  const cites = document.getElementById("oiseauCites")?.value.trim() || "";
  const espece = document.getElementById("oiseauEspece")?.value.trim() || "";
  const sexe = document.getElementById("oiseauSexe")?.value.trim() || "";
  const age = document.getElementById("oiseauAge")?.value.trim() || "";
  const poidsActuel = document.getElementById("oiseauPoids")?.value.trim() || "";
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
      existingBird.bague = bague;
      existingBird.cites = cites;
      existingBird.espece = espece;
      existingBird.sexe = sexe;
      existingBird.age = age;
      existingBird.annexe = annexe;
      existingBird.poidsActuel = poidsActuel;
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
        bague,
        cites,
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
  set("oiseauBague", bird.bague);
  set("oiseauCites", bird.cites);
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

function ajouterNourrissage() {
  const date = document.getElementById("feedDate")?.value || todayStr();
  const remarques = document.getElementById("feedNote")?.value.trim() || "";

  if (editingFeedId) {
  const ancien = appData.nourrissage.find((n) => n.id === editingFeedId);
  if (ancien) restoreStockFromDeletedFeed(ancien);
  appData.nourrissage = appData.nourrissage.filter((n) => n.id !== editingFeedId);
  editingFeedId = null;
}
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
    const food1 = document.getElementById(`feedFood1_${oiseau.id}`);
    const qty1 = document.getElementById(`feedQty1_${oiseau.id}`);
    const food2 = document.getElementById(`feedFood2_${oiseau.id}`);
    const qty2 = document.getElementById(`feedQty2_${oiseau.id}`);

    if (food1) food1.value = item.nourriture || "Poussin";
    if (qty1) qty1.value = item.quantite || "";

    if (food2) food2.value = "";
    if (qty2) qty2.value = "";
  }

  if (statusEl) statusEl.textContent = `Modification du nourrissage de ${item.oiseau}`;
  showSection("nourrissage");
  window.scrollTo({ top: 0, behavior: "smooth" });
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
window.ajouterSuiviVeterinaire = ajouterSuiviVeterinaire;
window.supprimerOiseau = supprimerOiseau;
window.supprimerDocument = supprimerDocument;
window.supprimerNourrissage = supprimerNourrissage;
window.modifierNourrissage = modifierNourrissage;
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
window.exportControle = exportControle;
window.remplirVacances = remplirVacances;

window.partagerFicheOiseau = partagerFicheOiseau;
window.ouvrirInventaire = ouvrirInventaire;

function ouvrirFicheOiseau(id) {
  showSection("oiseaux");
  setTimeout(() => {
    const el = document.querySelector(`[onclick="modifierOiseau('${id}')"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
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

function exportControle() {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Le navigateur bloque la fenêtre d’export.");
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
          <p><strong>Sexe :</strong> ${safe(o.sexe || "-")}</p>
          <p><strong>Âge :</strong> ${safe(o.age || "-")}</p>
          <p><strong>Annexe :</strong> ${safe(o.annexe || "-")}</p>
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

window.ouvrirFicheOiseau = ouvrirFicheOiseau;
window.ouvrirVetoOiseau = ouvrirVetoOiseau;

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

  resetBirdForm();
  showSection("accueil");
});