import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
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
    souris: 0
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
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

  return {
    oiseaux,
    encodages,
    documents,
    nourrissage: nourrissageSource,
    stock: {
      poussin: Number(data?.stock?.poussin || 0),
      caille: Number(data?.stock?.caille || 0),
      pigeon: Number(data?.stock?.pigeon || 0),
      lapin: Number(data?.stock?.lapin || 0),
      poisson: Number(data?.stock?.poisson || 0),
      souris: Number(data?.stock?.souris || 0)
    }
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

  return {
    ...rawRapacesData,
    oiseaux,
    encodages,
    nourrissage: appData.nourrissage,
    stock: appData.stock,
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
    .map((o) => `<option value="${safe(o.nom)}">${safe(o.nom)}</option>`)
    .join("");

  const encNom = document.getElementById("encNom");
  const feedBird = document.getElementById("feedBird");

  if (encNom) encNom.innerHTML = `<option value="">Choisir un oiseau</option>${birds}`;
  if (feedBird) feedBird.innerHTML = `<option value="">Choisir un oiseau</option>${birds}`;
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
          <a href="${safe(docItem.url)}" target="_blank" rel="noopener noreferrer">
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
        <div style="margin-bottom:10px;padding:10px;border:1px solid #333;border-radius:10px;background:#141414;">
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
            <img src="${safe(oiseau.photoUrl)}" alt="${safe(oiseau.nom)}" class="bird-photo">
          </p>
        ` : ""}

        <p><strong>Espèce :</strong> ${safe(oiseau.espece)}</p>
        <p><strong>Sexe :</strong> ${safe(oiseau.sexe)}</p>
        <p><strong>Âge :</strong> ${safe(oiseau.age)}</p>
        <p><strong>Poids actuel :</strong> ${safe(oiseau.poidsActuel)}</p>
        <p><strong>Notes :</strong> ${safe(oiseau.notes)}</p>

        <hr style="border-color:#333;margin:14px 0;">

        <h4>Documents liés</h4>
        ${renderDocumentsOiseau(oiseau.documents)}

        <hr style="border-color:#333;margin:14px 0;">

        <h4>Historique du poids</h4>
        ${renderHistoriquePoids(oiseau.historiquePoids)}

        <hr style="border-color:#333;margin:14px 0;">

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
      ${docItem.lien ? `<p><a href="${safe(docItem.lien)}" target="_blank" rel="noopener noreferrer">Ouvrir le document</a></p>` : ""}
      <div class="small-actions">
        <button class="btn btn-danger" onclick="supprimerDocument('${docItem.id}')">Supprimer</button>
      </div>
    </div>
  `).join("");
}

function renderNourrissage() {
  const zone = document.getElementById("listeNourrissage");
  if (!zone) return;

  if (!appData.nourrissage.length) {
    zone.innerHTML = `<p>Aucun nourrissage.</p>`;
    return;
  }

  zone.innerHTML = appData.nourrissage.map((item) => `
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

function fillStockForm() {
  const ids = {
    poussin: "stockPoussin",
    caille: "stockCaille",
    pigeon: "stockPigeon",
    lapin: "stockLapin",
    poisson: "stockPoisson",
    souris: "stockSouris"
  };

  Object.entries(ids).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.value = appData.stock[key] ?? 0;
  });
}

function renderAll() {
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

function ajouterOiseau() {
  const nom = document.getElementById("oiseauNom")?.value.trim() || "";
  if (!nom) return;

  appData.oiseaux.unshift({
    id: makeId(),
    nom,
    espece: document.getElementById("oiseauEspece")?.value.trim() || "",
    sexe: document.getElementById("oiseauSexe")?.value.trim() || "",
    age: document.getElementById("oiseauAge")?.value.trim() || "",
    poidsActuel: document.getElementById("oiseauPoids")?.value.trim() || "",
    notes: document.getElementById("oiseauNotes")?.value.trim() || "",
    photoUrl: "",
    documents: [],
    historiquePoids: []
  });

  ["oiseauNom","oiseauEspece","oiseauSexe","oiseauAge","oiseauPoids","oiseauNotes"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderAll();
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

function ajouterNourrissage() {
  const oiseau = document.getElementById("feedBird")?.value || "";
  if (!oiseau) return;

  appData.nourrissage.unshift({
    id: makeId(),
    date: document.getElementById("feedDate")?.value || "",
    oiseau,
    nourriture: document.getElementById("feedFood")?.value.trim() || "",
    quantite: document.getElementById("feedQty")?.value.trim() || "",
    remarques: document.getElementById("feedNote")?.value.trim() || ""
  });

  const feedDateEl = document.getElementById("feedDate");
  if (feedDateEl) feedDateEl.value = todayStr();

  ["feedBird","feedFood","feedQty","feedNote"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderAll();
}

function enregistrerStock() {
  appData.stock = {
    poussin: Number(document.getElementById("stockPoussin")?.value || 0),
    caille: Number(document.getElementById("stockCaille")?.value || 0),
    pigeon: Number(document.getElementById("stockPigeon")?.value || 0),
    lapin: Number(document.getElementById("stockLapin")?.value || 0),
    poisson: Number(document.getElementById("stockPoisson")?.value || 0),
    souris: Number(document.getElementById("stockSouris")?.value || 0)
  };
  renderAll();
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

function supprimerNourrissage(id) {
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
  showSection("accueil");
});