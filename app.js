import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
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
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const statusEl = document.getElementById("status");
const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");
const userInfo = document.getElementById("userInfo");

let currentUser = null;

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

function initPhotoViewer() {
  const modal = document.getElementById("photoModal");
  const modalImg = document.getElementById("photoModalImg");
  const closeBtn = document.getElementById("photoClose");

  if (!modal || !modalImg || !closeBtn) return;

  closeBtn.onclick = () => {
    modal.classList.add("hidden");
    modalImg.src = "";
  };

  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
      modalImg.src = "";
    }
  };
}

async function uploadBirdPhoto(file, birdId) {
  if (!file || !currentUser) return "";
  const path = `users/${currentUser.uid}/oiseaux/${birdId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

function showSection(section) {
  document.querySelectorAll(".section").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".nav button").forEach(btn => btn.classList.remove("active"));

  document.getElementById(`section-${section}`)?.classList.remove("hidden");
  document.getElementById(`btn-${section}`)?.classList.add("active");
}

function refreshStats() {
  document.getElementById("statOiseaux").textContent = appData.oiseaux.length;
  document.getElementById("statEncodages").textContent = appData.encodages.length;
  document.getElementById("statDocuments").textContent = appData.documents.length;
  document.getElementById("statNourrissages").textContent = appData.nourrissage.length;
}

function refreshBirdSelects() {
  const encNom = document.getElementById("encNom");
  const feedBird = document.getElementById("feedBird");

  const options = ['<option value="">Choisir un oiseau</option>']
    .concat(appData.oiseaux.map(o => `<option value="${safe(o.nom)}">${safe(o.nom)}</option>`))
    .join("");

  encNom.innerHTML = options;
  feedBird.innerHTML = options;
}

function renderOiseaux() {
  const zone = document.getElementById("listeOiseaux");
  if (!appData.oiseaux.length) {
    zone.innerHTML = '<p class="muted">Aucun oiseau.</p>';
    return;
  }

  zone.innerHTML = appData.oiseaux.map((oiseau) => `
    <div class="item">
      <h3>${safe(oiseau.nom)}</h3>
      ${oiseau.photoUrl ? `<p><img src="${oiseau.photoUrl}" alt="${safe(oiseau.nom)}" class="bird-photo" data-photo="${oiseau.photoUrl}"></p>` : ""}
      <p><strong>Espèce :</strong> ${safe(oiseau.espece)}</p>
      <p><strong>Sexe :</strong> ${safe(oiseau.sexe)}</p>
      <p><strong>Âge :</strong> ${safe(oiseau.age)}</p>
      <p><strong>Poids :</strong> ${safe(oiseau.poidsActuel)}</p>
      <p><strong>Notes :</strong> ${safe(oiseau.notes)}</p>
      <div class="actions">
        <button data-delete-oiseau="${oiseau.id}" class="danger">Supprimer</button>
      </div>
    </div>
  `).join("");

  zone.querySelectorAll("[data-delete-oiseau]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-oiseau");
      appData.oiseaux = appData.oiseaux.filter(o => o.id !== id);
      renderAll();
    });
  });
}
zone.querySelectorAll("[data-photo]").forEach(img => {
  img.addEventListener("click", () => {
    const modal = document.getElementById("photoModal");
    const modalImg = document.getElementById("photoModalImg");
    if (!modal || !modalImg) return;
    modalImg.src = img.getAttribute("data-photo");
    modal.classList.remove("hidden");
  });

function renderEncodages() {
  const zone = document.getElementById("listeEncodages");
  if (!appData.encodages.length) {
    zone.innerHTML = '<p class="muted">Aucun encodage.</p>';
    return;
  }

  zone.innerHTML = appData.encodages.map(item => `
    <div class="item">
      <p><strong>Date :</strong> ${safe(item.date)}</p>
      <p><strong>Nom :</strong> ${safe(item.nom)}</p>
      <p><strong>Espèce :</strong> ${safe(item.espece)}</p>
      <p><strong>Poids :</strong> ${safe(item.poids)}</p>
      <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
      <p><strong>État :</strong> ${safe(item.etat)}</p>
      <p><strong>Lieu :</strong> ${safe(item.lieu)}</p>
      <p><strong>Observations :</strong> ${safe(item.observations)}</p>
      <div class="actions">
        <button data-delete-enc="${item.id}" class="danger">Supprimer</button>
      </div>
    </div>
  `).join("");

  zone.querySelectorAll("[data-delete-enc]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-enc");
      appData.encodages = appData.encodages.filter(e => e.id !== id);
      renderAll();
    });
  });
}

function renderDocuments() {
  const zone = document.getElementById("listeDocuments");
  if (!appData.documents.length) {
    zone.innerHTML = '<p class="muted">Aucun document.</p>';
    return;
  }

  zone.innerHTML = appData.documents.map(docItem => `
    <div class="item">
      <h3>${safe(docItem.titre)}</h3>
      <p><strong>Type :</strong> ${safe(docItem.type)}</p>
      <p><strong>Description :</strong> ${safe(docItem.description)}</p>
      <div class="actions">
        <button data-delete-doc="${docItem.id}" class="danger">Supprimer</button>
      </div>
    </div>
  `).join("");

  zone.querySelectorAll("[data-delete-doc]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-doc");
      appData.documents = appData.documents.filter(d => d.id !== id);
      renderAll();
    });
  });
}

function renderNourrissage() {
  const zone = document.getElementById("listeNourrissage");
  if (!appData.nourrissage.length) {
    zone.innerHTML = '<p class="muted">Aucun nourrissage.</p>';
    return;
  }

  zone.innerHTML = appData.nourrissage.map(item => `
    <div class="item">
      <p><strong>Date :</strong> ${safe(item.date)}</p>
      <p><strong>Oiseau :</strong> ${safe(item.oiseau)}</p>
      <p><strong>Nourriture :</strong> ${safe(item.nourriture)}</p>
      <p><strong>Quantité :</strong> ${safe(item.quantite)}</p>
      <p><strong>Remarques :</strong> ${safe(item.remarques)}</p>
      <div class="actions">
        <button data-delete-feed="${item.id}" class="danger">Supprimer</button>
      </div>
    </div>
  `).join("");

  zone.querySelectorAll("[data-delete-feed]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete-feed");
      appData.nourrissage = appData.nourrissage.filter(n => n.id !== id);
      renderAll();
    });
  });
}

function fillStockForm() {
  document.getElementById("stockPoussin").value = appData.stock.poussin ?? 0;
  document.getElementById("stockCaille").value = appData.stock.caille ?? 0;
  document.getElementById("stockPigeon").value = appData.stock.pigeon ?? 0;
  document.getElementById("stockLapin").value = appData.stock.lapin ?? 0;
  document.getElementById("stockPoisson").value = appData.stock.poisson ?? 0;
  document.getElementById("stockSouris").value = appData.stock.souris ?? 0;
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
  if (!currentUser) return;
  await setDoc(doc(db, "users", currentUser.uid), appData);
  statusEl.innerHTML = '<span class="ok">✅ Sauvegardé</span>';
}

async function loadData() {
  if (!currentUser) return;
  const refDoc = doc(db, "users", currentUser.uid);
  const snap = await getDoc(refDoc);

  if (snap.exists()) {
    const data = snap.data();
    appData = {
      oiseaux: Array.isArray(data.oiseaux) ? data.oiseaux : [],
      encodages: Array.isArray(data.encodages) ? data.encodages : [],
      documents: Array.isArray(data.documents) ? data.documents : [],
      nourrissage: Array.isArray(data.nourrissage) ? data.nourrissage : [],
      stock: {
        poussin: Number(data.stock?.poussin || 0),
        caille: Number(data.stock?.caille || 0),
        pigeon: Number(data.stock?.pigeon || 0),
        lapin: Number(data.stock?.lapin || 0),
        poisson: Number(data.stock?.poisson || 0),
        souris: Number(data.stock?.souris || 0)
      }
    };
  }

  renderAll();
}

document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    statusEl.textContent = "✅ Connecté";
  } catch (e) {
    statusEl.textContent = "❌ " + e.message;
  }
});

document.getElementById("btnRegister").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    statusEl.textContent = "✅ Compte créé";
  } catch (e) {
    statusEl.textContent = "❌ " + e.message;
  }
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("btnSave").addEventListener("click", saveData);

document.querySelectorAll(".nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    showSection(btn.dataset.section);
  });
});

document.getElementById("btnAddOiseau").addEventListener("click", async () => {
  const nom = document.getElementById("oiseauNom").value.trim();
  if (!nom) return;

  const birdId = makeId();
  const photoFile = document.getElementById("oiseauPhoto")?.files?.[0] || null;
  let photoUrl = "";

  try {
    if (photoFile) {
      photoUrl = await uploadBirdPhoto(photoFile, birdId);
    }

    appData.oiseaux.unshift({
      id: birdId,
      nom,
      espece: document.getElementById("oiseauEspece").value.trim(),
      sexe: document.getElementById("oiseauSexe").value.trim(),
      age: document.getElementById("oiseauAge").value.trim(),
      poidsActuel: document.getElementById("oiseauPoids").value.trim(),
      notes: document.getElementById("oiseauNotes").value.trim(),
      photoUrl
    });

    document.getElementById("oiseauNom").value = "";
    document.getElementById("oiseauEspece").value = "";
    document.getElementById("oiseauSexe").value = "";
    document.getElementById("oiseauAge").value = "";
    document.getElementById("oiseauPoids").value = "";
    document.getElementById("oiseauNotes").value = "";
    if (document.getElementById("oiseauPhoto")) {
      document.getElementById("oiseauPhoto").value = "";
    }

    renderAll();
    await saveData();
  } catch (e) {
    statusEl.textContent = "❌ Erreur upload photo : " + e.message;
  }
});

document.getElementById("btnAddEncodage").addEventListener("click", () => {
  const nom = document.getElementById("encNom").value;
  if (!nom) return;

  appData.encodages.unshift({
    id: makeId(),
    date: document.getElementById("encDate").value,
    nom,
    espece: document.getElementById("encEspece").value.trim(),
    poids: document.getElementById("encPoids").value.trim(),
    nourriture: document.getElementById("encNourriture").value.trim(),
    etat: document.getElementById("encEtat").value.trim(),
    lieu: document.getElementById("encLieu").value.trim(),
    observations: document.getElementById("encObs").value.trim()
  });

  document.getElementById("encDate").value = todayStr();
  document.getElementById("encNom").value = "";
  document.getElementById("encEspece").value = "";
  document.getElementById("encPoids").value = "";
  document.getElementById("encNourriture").value = "";
  document.getElementById("encEtat").value = "";
  document.getElementById("encLieu").value = "";
  document.getElementById("encObs").value = "";

  renderAll();
});

document.getElementById("btnAddDocument").addEventListener("click", () => {
  const titre = document.getElementById("docTitre").value.trim();
  if (!titre) return;

  appData.documents.unshift({
    id: makeId(),
    titre,
    type: document.getElementById("docType").value.trim(),
    description: document.getElementById("docDescription").value.trim()
  });

  document.getElementById("docTitre").value = "";
  document.getElementById("docType").value = "";
  document.getElementById("docDescription").value = "";

  renderAll();
});

document.getElementById("btnAddFeed").addEventListener("click", () => {
  const oiseau = document.getElementById("feedBird").value;
  if (!oiseau) return;

  appData.nourrissage.unshift({
    id: makeId(),
    date: document.getElementById("feedDate").value,
    oiseau,
    nourriture: document.getElementById("feedFood").value.trim(),
    quantite: document.getElementById("feedQty").value.trim(),
    remarques: document.getElementById("feedNote").value.trim()
  });

  document.getElementById("feedDate").value = todayStr();
  document.getElementById("feedBird").value = "";
  document.getElementById("feedFood").value = "";
  document.getElementById("feedQty").value = "";
  document.getElementById("feedNote").value = "";

  renderAll();
});

document.getElementById("btnSaveStock").addEventListener("click", () => {
  appData.stock = {
    poussin: Number(document.getElementById("stockPoussin").value || 0),
    caille: Number(document.getElementById("stockCaille").value || 0),
    pigeon: Number(document.getElementById("stockPigeon").value || 0),
    lapin: Number(document.getElementById("stockLapin").value || 0),
    poisson: Number(document.getElementById("stockPoisson").value || 0),
    souris: Number(document.getElementById("stockSouris").value || 0)
  };
  renderAll();
});

document.getElementById("encDate").value = todayStr();
document.getElementById("feedDate").value = todayStr();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    userInfo.textContent = "Connecté : " + user.email;
    await loadData();
    showSection("accueil");
  } else {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    userInfo.textContent = "";
    statusEl.textContent = "";
  }
});
initPhotoViewer();