/* =========================================================
   PHIL Ô PLUMES — MODULE REPRODUCTION
   Découpage sécurisé — ne touche pas directement Firebase
   Dépendances attendues :
   window.appData
   window.saveData()
   window.renderAll()
   window.showSection()
   ========================================================= */

(function () {
  "use strict";

    const REPRO_ESPECES_PARAMS = {
    "Parabuteo unicinctus": { incubation: 35, mirage: 10, baguage: 18, sortieEleveuse: 45 },
    "Falco peregrinus": { incubation: 32, mirage: 8, baguage: 12, sortieEleveuse: 42 },
    "Falco cherrug": { incubation: 32, mirage: 8, baguage: 12, sortieEleveuse: 42 },
    "Falco rusticolus": { incubation: 34, mirage: 8, baguage: 12, sortieEleveuse: 45 },
    "Falco sparverius": { incubation: 30, mirage: 8, baguage: 10, sortieEleveuse: 35 },
    "Bubo bubo": { incubation: 35, mirage: 10, baguage: 18, sortieEleveuse: 50 },
    "Bubo sibiricus": { incubation: 35, mirage: 10, baguage: 18, sortieEleveuse: 50 },
    "Tyto alba": { incubation: 31, mirage: 9, baguage: 14, sortieEleveuse: 45 },
    "Strix aluco": { incubation: 30, mirage: 9, baguage: 14, sortieEleveuse: 40 },
    "Asio otus": { incubation: 28, mirage: 8, baguage: 12, sortieEleveuse: 38 },
    "Strix virgata": { incubation: 30, mirage: 9, baguage: 14, sortieEleveuse: 40 },
    "Ptilopsis leucotis": { incubation: 30, mirage: 9, baguage: 14, sortieEleveuse: 40 },
    "Megascops choliba": { incubation: 26, mirage: 7, baguage: 10, sortieEleveuse: 35 },
    "Glaucidium brasilianum": { incubation: 28, mirage: 8, baguage: 10, sortieEleveuse: 35 },
    default: { incubation: 30, mirage: 10, baguage: 14, sortieEleveuse: 40 }
  };

  function getParamsEspece(espece) {
    return REPRO_ESPECES_PARAMS[espece] || REPRO_ESPECES_PARAMS.default;
  }

  function data() {
    if (!window.appData) window.appData = {};
    if (!Array.isArray(window.appData.reproduction)) {
      window.appData.reproduction = [];
    }
    if (!Array.isArray(window.appData.oiseaux)) {
      window.appData.oiseaux = [];
    }
    return window.appData;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function makeId() {
    if (typeof window.makeId === "function") return window.makeId();
    return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateBE(dateStr){

    if(!dateStr) return "-";

    const d=new Date(dateStr+"T00:00:00");

    if(isNaN(d)) return dateStr;

    return d.toLocaleDateString("fr-BE");

}

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function safe(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeAttr(value) {
    return safe(value);
  }

  function status(message) {
    const el = document.getElementById("status");
    if (el) el.textContent = message;
  }

  async function persistAndRender(message = "Sauvegardé") {
    if (typeof window.saveData === "function") {
      await window.saveData();
    }

    if (typeof window.renderAll === "function") {
      window.renderAll();
    } else {
      renderReproduction();
    }

    status(message);
  }

  function getOiseauById(id) {
    return data().oiseaux.find(o => o.id === id);
  }

  function getCouple(coupleId) {
    return data().reproduction.find(c => c.id === coupleId);
  }

  function getSaison(coupleId, saisonId) {
    const couple = getCouple(coupleId);
    return safeArray(couple?.saisons).find(s => s.id === saisonId);
  }

  function getPonte(coupleId, saisonId, ponteId) {
    const saison = getSaison(coupleId, saisonId);
    return safeArray(saison?.pontes).find(p => p.id === ponteId);
  }

  function getJeune(coupleId, saisonId, ponteId, jeuneId) {
    const ponte = getPonte(coupleId, saisonId, ponteId);
    return safeArray(ponte?.jeunes).find(j => j.id === jeuneId);
  }

  function getActiveOiseaux() {
    return data().oiseaux.filter(o => {
      const statut = String(o.statut || "").toLowerCase();
      return !statut.includes("sorti") && !statut.includes("décédé") && !statut.includes("decede");
    });
  }

  function computeStats() {
    const couples = data().reproduction;
    let saisons = 0;
    let pontes = 0;
    let oeufs = 0;
    let fecondes = 0;
    let jeunes = 0;

    couples.forEach(c => {
      saisons += safeArray(c.saisons).length;

      safeArray(c.saisons).forEach(s => {
        pontes += safeArray(s.pontes).length;

        safeArray(s.pontes).forEach(p => {
          oeufs += toNumber(p.nbOeufs);
          fecondes += toNumber(p.nbFecondes);
          jeunes += safeArray(p.jeunes).length;
        });
      });
    });

    return { couples: couples.length, saisons, pontes, oeufs, fecondes, jeunes };
  }

  function renderReproduction() {
    const root = document.getElementById("reproductionContent")
      || document.getElementById("section-reproduction");

    if (!root) return;

    const oiseaux = getActiveOiseaux();
    const couples = data().reproduction;
    const stats = computeStats();

    root.innerHTML = `
    <div id="dashboardReproduction"></div>
      <div class="module-header">
        <div>
          <h1>Reproduction</h1>
          <p class="muted-line">Gestion des couples, saisons, pontes, œufs et jeunes.</p>
        </div>
      </div>

      <div class="dashboard-grid reproduction-stats">
        <div class="card">
          <h3>Couples</h3>
          <strong>${stats.couples}</strong>
        </div>
        <div class="card">
          <h3>Saisons</h3>
          <strong>${stats.saisons}</strong>
        </div>
        <div class="card">
          <h3>Pontes</h3>
          <strong>${stats.pontes}</strong>
        </div>
        <div class="card">
          <h3>Œufs</h3>
          <strong>${stats.oeufs}</strong>
        </div>
        <div class="card">
          <h3>Fécondés</h3>
          <strong>${stats.fecondes}</strong>
        </div>
        <div class="card">
          <h3>Jeunes</h3>
          <strong>${stats.jeunes}</strong>
        </div>
      </div>

      <div class="card">
        <h2>Créer un couple reproducteur</h2>

        <div class="form-grid">
          <div>
            <label>Saison</label>
            <input id="reproSaison" type="number" value="${new Date().getFullYear()}">
          </div>

          <div>
            <label>Espèce</label>
            <input id="reproEspece" placeholder="Ex : Falco sparverius">
          </div>

          <div>
            <label>Mâle</label>
            <select id="reproMale">
              <option value="">Choisir</option>
              ${oiseaux.map(o => `
                <option value="${safeAttr(o.id)}">${safe(o.nom || "Sans nom")} — ${safe(o.espece || "")}</option>
              `).join("")}
            </select>
          </div>

          <div>
            <label>Femelle</label>
            <select id="reproFemelle">
              <option value="">Choisir</option>
              ${oiseaux.map(o => `
                <option value="${safeAttr(o.id)}">${safe(o.nom || "Sans nom")} — ${safe(o.espece || "")}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div class="actions">
          <button class="btn" onclick="ajouterCoupleReproduction()">+ Ajouter le couple</button>
        </div>
      </div>

      <div class="card">
        <h2>Couples reproducteurs</h2>

        ${
          couples.length
            ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Saison</th>
                      <th>Espèce</th>
                      <th>Mâle</th>
                      <th>Femelle</th>
                      <th>Saisons</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${couples.map(c => `
                      <tr>
                        <td>${safe(c.saison || "-")}</td>
                        <td>${safe(c.espece || "-")}</td>
                        <td>
                          <strong>${safe(c.maleNom || "-")}</strong><br>
                          <small>${safe(c.maleBague || "")}</small>
                        </td>
                        <td>
                          <strong>${safe(c.femelleNom || "-")}</strong><br>
                          <small>${safe(c.femelleBague || "")}</small>
                        </td>
                        <td>${safeArray(c.saisons).length}</td>
                        <td>
                          <button class="btn small-btn" onclick="ouvrirCoupleReproduction('${safeAttr(c.id)}')">Ouvrir</button>
                          <button class="btn btn-danger small-btn" onclick="supprimerCoupleReproduction('${safeAttr(c.id)}')">Supprimer</button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<p class="muted-line">Aucun couple reproducteur créé pour l’instant.</p>`
        }
      </div>
    `;
    renderDashboardReproduction();
  }

  async function ajouterCoupleReproduction() {
    const saison = document.getElementById("reproSaison")?.value || String(new Date().getFullYear());
    const especeInput = document.getElementById("reproEspece")?.value.trim() || "";
    const maleId = document.getElementById("reproMale")?.value || "";
    const femelleId = document.getElementById("reproFemelle")?.value || "";

    if (!maleId || !femelleId) {
      alert("Choisis un mâle et une femelle.");
      return;
    }

    if (maleId === femelleId) {
      alert("Le mâle et la femelle doivent être deux oiseaux différents.");
      return;
    }

    const male = getOiseauById(maleId);
    const femelle = getOiseauById(femelleId);

    if (!male || !femelle) {
      alert("Oiseau introuvable.");
      return;
    }

    const couple = {
      id: makeId(),
      saison,
      espece: especeInput || femelle.espece || male.espece || "",
      maleId: male.id,
      maleNom: male.nom || "",
      maleBague: male.bague || "",
      maleCites: male.cites || "",
      maleCarteVerte: male.carteVerte || "",
      maleEspece: male.espece || "",
      femelleId: femelle.id,
      femelleNom: femelle.nom || "",
      femelleBague: femelle.bague || "",
      femelleCites: femelle.cites || "",
      femelleCarteVerte: femelle.carteVerte || "",
      femelleEspece: femelle.espece || "",
      saisons: [
        {
          id: makeId(),
          annee: saison,
          notes: "",
          pontes: []
        }
      ],
      pontes: []
    };

    data().reproduction.push(couple);
    await persistAndRender("Couple reproducteur créé.");
  }

  function ouvrirCoupleReproduction(coupleId) {
    const root = document.getElementById("reproductionContent")
      || document.getElementById("section-reproduction");

    const couple = getCouple(coupleId);
    if (!root || !couple) return;

    if (!Array.isArray(couple.saisons)) {
      couple.saisons = [];
    }

    root.innerHTML = `
      <div class="module-header">
        <div>
          <h1>${safe(couple.espece || "Couple reproducteur")}</h1>
          <p class="muted-line">
            ${safe(couple.maleNom || "-")} × ${safe(couple.femelleNom || "-")}
          </p>
        </div>

        <button class="btn secondary-btn" onclick="renderReproduction()">← Retour</button>
      </div>

      <div class="card">
        <h2>Informations du couple</h2>

        <div class="form-grid">
          <div>
            <label>Saison principale</label>
            <input id="coupleSaison" value="${safeAttr(couple.saison || "")}">
          </div>

          <div>
            <label>Espèce</label>
            <input id="coupleEspece" value="${safeAttr(couple.espece || "")}">
          </div>

          <div>
            <label>Notes</label>
            <textarea id="coupleNotes">${safe(couple.notes || "")}</textarea>
          </div>
        </div>

        <div class="actions">
          <button class="btn" onclick="sauverCoupleReproduction('${safeAttr(couple.id)}')">Enregistrer</button>
        </div>
      </div>

      <div class="card">
        <h2>Ajouter une saison</h2>

        <div class="form-grid">
          <div>
            <label>Année</label>
            <input id="nouvelleSaisonAnnee" type="number" value="${new Date().getFullYear()}">
          </div>

          <div>
            <label>Notes</label>
            <input id="nouvelleSaisonNotes" placeholder="Ex : première reproduction, couple formé...">
          </div>
        </div>

        <div class="actions">
          <button class="btn" onclick="ajouterSaisonReproduction('${safeAttr(couple.id)}')">+ Ajouter la saison</button>
        </div>
      </div>

      <div class="card">
        <h2>Saisons</h2>

        ${
          safeArray(couple.saisons).length
            ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Année</th>
                      <th>Notes</th>
                      <th>Pontes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${safeArray(couple.saisons).map(s => `
                      <tr>
                        <td>${safe(s.annee || "-")}</td>
                        <td>${safe(s.notes || "")}</td>
                        <td>${safeArray(s.pontes).length}</td>
                        <td>
                          <button class="btn small-btn" onclick="ouvrirSaisonReproduction('${safeAttr(couple.id)}','${safeAttr(s.id)}')">Ouvrir</button>
                          <button class="btn btn-danger small-btn" onclick="supprimerSaisonReproduction('${safeAttr(couple.id)}','${safeAttr(s.id)}')">Supprimer</button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<p class="muted-line">Aucune saison créée.</p>`
        }
      </div>
    `;
  }

  async function sauverCoupleReproduction(coupleId) {
    const couple = getCouple(coupleId);
    if (!couple) return;

    couple.saison = document.getElementById("coupleSaison")?.value || "";
    couple.espece = document.getElementById("coupleEspece")?.value || "";
    couple.notes = document.getElementById("coupleNotes")?.value || "";

    await persistAndRender("Couple enregistré.");
    ouvrirCoupleReproduction(coupleId);
  }

  async function supprimerCoupleReproduction(coupleId) {
    if (!confirm("Supprimer ce couple et toutes ses saisons/pontes ?")) return;

    data().reproduction = data().reproduction.filter(c => c.id !== coupleId);
    await persistAndRender("Couple supprimé.");
  }

  async function ajouterSaisonReproduction(coupleId) {
    const couple = getCouple(coupleId);
    if (!couple) return;

    if (!Array.isArray(couple.saisons)) couple.saisons = [];

    couple.saisons.push({
      id: makeId(),
      annee: document.getElementById("nouvelleSaisonAnnee")?.value || String(new Date().getFullYear()),
      notes: document.getElementById("nouvelleSaisonNotes")?.value || "",
      pontes: []
    });

    await persistAndRender("Saison ajoutée.");
    ouvrirCoupleReproduction(coupleId);
  }

  async function supprimerSaisonReproduction(coupleId, saisonId) {
    if (!confirm("Supprimer cette saison et toutes ses pontes ?")) return;

    const couple = getCouple(coupleId);
    if (!couple) return;

    couple.saisons = safeArray(couple.saisons).filter(s => s.id !== saisonId);

    await persistAndRender("Saison supprimée.");
    ouvrirCoupleReproduction(coupleId);
  }

  function ouvrirSaisonReproduction(coupleId, saisonId) {
    const root = document.getElementById("reproductionContent")
      || document.getElementById("section-reproduction");

    const couple = getCouple(coupleId);
    const saison = getSaison(coupleId, saisonId);

    if (!root || !couple || !saison) return;

    if (!Array.isArray(saison.pontes)) saison.pontes = [];

    root.innerHTML = `
      <div class="module-header">
        <div>
          <h1>Saison ${safe(saison.annee || "")}</h1>
          <p class="muted-line">${safe(couple.maleNom || "-")} × ${safe(couple.femelleNom || "-")}</p>
        </div>

        <button class="btn secondary-btn" onclick="ouvrirCoupleReproduction('${safeAttr(coupleId)}')">← Retour couple</button>
      </div>

      <div class="card">
        <h2>Modifier la saison</h2>

        <div class="form-grid">
          <div>
            <label>Année</label>
            <input id="saisonAnnee" value="${safeAttr(saison.annee || "")}">
          </div>

          <div>
            <label>Notes</label>
            <textarea id="saisonNotes">${safe(saison.notes || "")}</textarea>
          </div>
        </div>

        <div class="actions">
          <button class="btn" onclick="sauverSaisonReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}')">Enregistrer</button>
        </div>
      </div>

      <div class="card">
        <h2>Ajouter une ponte</h2>

        <div class="form-grid">
          <div>
            <label>Numéro ponte</label>
            <input id="ponteNumero" value="${safeAttr(safeArray(saison.pontes).length + 1)}">
          </div>

          <div>
            <label>Premier œuf</label>
            <input id="pontePremierOeuf" type="date">
          </div>

          <div>
            <label>Dernier œuf</label>
            <input id="ponteDernierOeuf" type="date">
          </div>

          <div>
            <label>Début couvaison</label>
            <input id="ponteDebutCouvaison" type="date">
          </div>

          <div>
            <label>Durée incubation</label>
            <input id="ponteDuree" type="number" value="${safeAttr(getParamsEspece(couple.espece || '').incubation)}">
          </div>
        </div>

        <div class="actions">
          <button class="btn" onclick="ajouterPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}')">+ Ajouter la ponte</button>
        </div>
      </div>

      <div class="card">
        <h2>Pontes</h2>

        ${
          saison.pontes.length
            ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ponte</th>
                      <th>Premier œuf</th>
                      <th>Dernier œuf</th>
                      <th>Mirage prévu</th>
                      <th>Éclosion prévue</th>
                      <th>Œufs</th>
                      <th>Jeunes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${saison.pontes.map(p => `
                      <tr>
                        <td>${safe(p.numero || "-")}</td>
                        <td>${formatDateBE(p.premierOeuf)}</td>
                        <td>${formatDateBE(p.dernierOeuf)}</td>
                        <td>${formatDateBE(getMirageDate(p))}</td>
                        <td>${formatDateBE(getEclosionDate(p))}</td>
                        <td>${toNumber(p.nbOeufs)}</td>
                        <td>${safeArray(p.jeunes).length}</td>
                        <td>
                          <button class="btn small-btn" onclick="ouvrirPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(p.id)}')">Ouvrir</button>
                          <button class="btn btn-danger small-btn" onclick="supprimerPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(p.id)}')">Supprimer</button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<p class="muted-line">Aucune ponte créée.</p>`
        }
      </div>
    `;
  }

  function getDatePlusDays(dateStr, days) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + toNumber(days));
    return d.toISOString().slice(0, 10);
  }

  function getMirageDate(ponte) {
    return getDatePlusDays(ponte.debutCouvaison || ponte.dernierOeuf || ponte.premierOeuf, ponte.joursMirage || 10);
  }

  function getEclosionDate(ponte) {
    return getDatePlusDays(ponte.debutCouvaison || ponte.dernierOeuf || ponte.premierOeuf, ponte.dureeIncubation || 30);
  }

  async function sauverSaisonReproduction(coupleId, saisonId) {
    const saison = getSaison(coupleId, saisonId);
    if (!saison) return;

    saison.annee = document.getElementById("saisonAnnee")?.value || "";
    saison.notes = document.getElementById("saisonNotes")?.value || "";

    await persistAndRender("Saison enregistrée.");
    ouvrirSaisonReproduction(coupleId, saisonId);
  }

  async function ajouterPonteReproduction(coupleId, saisonId) {
    const saison = getSaison(coupleId, saisonId);
    if (!saison) return;

    if (!Array.isArray(saison.pontes)) saison.pontes = [];

        const couple = getCouple(coupleId);
    const params = getParamsEspece(couple?.espece || "");

    saison.pontes.push({
      id: makeId(),
      numero: document.getElementById("ponteNumero")?.value || String(saison.pontes.length + 1),
      premierOeuf: document.getElementById("pontePremierOeuf")?.value || "",
      dernierOeuf: document.getElementById("ponteDernierOeuf")?.value || "",
      debutCouvaison: document.getElementById("ponteDebutCouvaison")?.value || "",
      dureeIncubation: toNumber(document.getElementById("ponteDuree")?.value || params.incubation),
      joursMirage: params.mirage,
      jourBaguage: params.baguage,
      jourSortieEleveuse: params.sortieEleveuse,
      nbOeufs: 0,
      nbFecondes: 0,
      nbClairs: 0,
      nbSousMere: 0,
      nbCouveuse: 0,
      observations: "",
      oeufs: [],
      jeunes: []
    });

    await persistAndRender("Ponte ajoutée.");
    ouvrirSaisonReproduction(coupleId, saisonId);
  }

  async function supprimerPonteReproduction(coupleId, saisonId, ponteId) {
    if (!confirm("Supprimer cette ponte ?")) return;

    const saison = getSaison(coupleId, saisonId);
    if (!saison) return;

    saison.pontes = safeArray(saison.pontes).filter(p => p.id !== ponteId);

    await persistAndRender("Ponte supprimée.");
    ouvrirSaisonReproduction(coupleId, saisonId);
  }

  function ouvrirPonteReproduction(coupleId, saisonId, ponteId) {
    const root = document.getElementById("reproductionContent")
      || document.getElementById("section-reproduction");

    const couple = getCouple(coupleId);
    const saison = getSaison(coupleId, saisonId);
    const ponte = getPonte(coupleId, saisonId, ponteId);

    if (!root || !couple || !saison || !ponte) return;

    if (!Array.isArray(ponte.jeunes)) ponte.jeunes = [];

    root.innerHTML = `
      <div class="module-header">
        <div>
          <h1>Ponte ${safe(ponte.numero || "")}</h1>
          <p class="muted-line">
            Saison ${safe(saison.annee || "")} — ${safe(couple.maleNom || "-")} × ${safe(couple.femelleNom || "-")}
          </p>
        </div>

        <button class="btn secondary-btn" onclick="ouvrirSaisonReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}')">← Retour saison</button>
      </div>

      <div class="card">
        <h2>Détails de la ponte</h2>

        <div class="form-grid">
          <div>
            <label>Numéro</label>
            <input id="detailPonteNumero" value="${safeAttr(ponte.numero || "")}">
          </div>

          <div>
            <label>Premier œuf</label>
            <input id="detailPontePremierOeuf" type="date" value="${safeAttr(ponte.premierOeuf || "")}">
          </div>

          <div>
            <label>Dernier œuf</label>
            <input id="detailPonteDernierOeuf" type="date" value="${safeAttr(ponte.dernierOeuf || "")}">
          </div>

          <div>
            <label>Début couvaison</label>
            <input id="detailPonteDebutCouvaison" type="date" value="${safeAttr(ponte.debutCouvaison || "")}">
          </div>

          <div>
            <label>Durée incubation</label>
            <input id="detailPonteDuree" type="number" value="${safeAttr(ponte.dureeIncubation || 30)}">
          </div>

          <div>
            <label>Mirage après X jours</label>
            <input id="detailPonteMirage" type="number" value="${safeAttr(ponte.joursMirage || 10)}">
          </div>

          <div>
            <label>Nombre œufs</label>
            <input id="detailPonteNbOeufs" type="number" value="${safeAttr(ponte.nbOeufs || 0)}">
          </div>

          <div>
            <label>Fécondés</label>
            <input id="detailPonteFecondes" type="number" value="${safeAttr(ponte.nbFecondes || 0)}">
          </div>

          <div>
            <label>Clairs</label>
            <input id="detailPonteClairs" type="number" value="${safeAttr(ponte.nbClairs || 0)}">
          </div>

          <div>
            <label>Sous mère</label>
            <input id="detailPonteSousMere" type="number" value="${safeAttr(ponte.nbSousMere || 0)}">
          </div>

          <div>
            <label>En couveuse</label>
            <input id="detailPonteCouveuse" type="number" value="${safeAttr(ponte.nbCouveuse || 0)}">
          </div>
        </div>

                <div class="info-box">
          <p><strong>Mirage prévu :</strong> ${formatDateBE(getMirageDate(ponte))}</p>
<p><strong>Éclosion prévue :</strong> ${formatDateBE(getEclosionDate(ponte))}</p>
<p><strong>Baguage conseillé :</strong> ${formatDateBE(getDatePlusDays(ponte.debutCouvaison || ponte.dernierOeuf || ponte.premierOeuf, ponte.jourBaguage || 14))}</p>
<p><strong>Sortie éleveuse estimée :</strong> ${formatDateBE(getDatePlusDays(ponte.debutCouvaison || ponte.dernierOeuf || ponte.premierOeuf, ponte.jourSortieEleveuse || 40))}</p>
        </div>

        <label>Observations</label>
        <textarea id="detailPonteObservations">${safe(ponte.observations || "")}</textarea>

        <div class="actions">
          <button class="btn" onclick="sauverPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}')">Enregistrer la ponte</button>
        </div>
      </div>

            <div class="card">
        <h2>Suivi des œufs</h2>

        <div class="form-grid">
          <div>
            <label>Numéro œuf</label>
            <input id="oeufNumero" value="${safeAttr(safeArray(ponte.oeufs).length + 1)}">
          </div>

          <div>
            <label>Date de ponte</label>
            <input id="oeufDate" type="date" value="${todayStr()}">
          </div>

          <div>
            <label>Statut</label>
            <select id="oeufStatut">
              <option>À mirer</option>
              <option>Fécondé</option>
              <option>Clair</option>
              <option>Mort dans l’œuf</option>
              <option>Éclos</option>
              <option>Perdu</option>
            </select>
          </div>

          <div>
            <label>Lieu</label>
            <select id="oeufLieu">
              <option>Sous mère</option>
              <option>Couveuse</option>
              <option>Retiré</option>
            </select>
          </div>
        </div>

        <label>Notes œuf</label>
        <textarea id="oeufNotes"></textarea>

        <div class="actions">
          <button class="btn" onclick="ajouterOeufReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}')">
            + Ajouter l’œuf
          </button>
        </div>

        ${
          safeArray(ponte.oeufs).length
            ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Œuf</th>
                      <th>Date</th>
                      <th>Statut</th>
                      <th>Lieu</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                   ${safeArray(ponte.oeufs).map(o => {
  let couleur = "#FFC107";

  if (o.statut === "Fécondé") couleur = "#4CAF50";
  if (o.statut === "Clair") couleur = "#9E9E9E";
  if (o.statut === "Éclos") couleur = "#2196F3";
  if (o.statut === "Mort dans l’œuf") couleur = "#F44336";
  if (o.statut === "Perdu") couleur = "#000";

  return `
    <tr>
      <td><strong>${safe(o.numero || "-")}</strong></td>
      <td>${formatDateBE(o.date)}</td>

      <td>
        <select onchange="modifierStatutOeuf('${coupleId}','${saisonId}','${ponteId}','${o.id}',this.value)"
                style="background:${couleur};color:white;font-weight:bold;">
          <option ${o.statut === "À mirer" ? "selected" : ""}>À mirer</option>
          <option ${o.statut === "Fécondé" ? "selected" : ""}>Fécondé</option>
          <option ${o.statut === "Clair" ? "selected" : ""}>Clair</option>
          <option ${o.statut === "Éclos" ? "selected" : ""}>Éclos</option>
          <option ${o.statut === "Mort dans l’œuf" ? "selected" : ""}>Mort dans l’œuf</option>
          <option ${o.statut === "Perdu" ? "selected" : ""}>Perdu</option>
        </select>
      </td>

      <td>
        <select onchange="modifierLieuOeuf('${coupleId}','${saisonId}','${ponteId}','${o.id}',this.value)">
          <option ${o.lieu === "Sous mère" ? "selected" : ""}>Sous mère</option>
          <option ${o.lieu === "Couveuse" ? "selected" : ""}>Couveuse</option>
          <option ${o.lieu === "Retiré" ? "selected" : ""}>Retiré</option>
        </select>
      </td>

      <td>
        <input value="${safeAttr(o.notes || "")}"
               onchange="modifierNoteOeuf('${coupleId}','${saisonId}','${ponteId}','${o.id}',this.value)">
      </td>

      <td>
        <button class="btn btn-danger small-btn"
                onclick="supprimerOeufReproduction('${coupleId}','${saisonId}','${ponteId}','${o.id}')">
          Supprimer
        </button>
      </td>
    </tr>
  `;
}).join("")} 
                  </tbody>
                </table>
              </div>
            `
            : `<p class="muted-line">Aucun œuf encodé pour cette ponte.</p>`
        }
      </div>

      <div class="card">
        <h2>Ajouter un jeune</h2>

        <div class="form-grid">
          <div>
            <label>Numéro</label>
            <input id="jeuneNumero" value="${safeAttr(ponte.jeunes.length + 1)}">
          </div>

          <div>
            <label>Date naissance</label>
            <input id="jeuneDateNaissance" type="date" value="${todayStr()}">
          </div>

          <div>
            <label>Bague</label>
            <input id="jeuneBague">
          </div>

          <div>
            <label>Sexe</label>
            <select id="jeuneSexe">
              <option>Inconnu</option>
              <option>Mâle</option>
              <option>Femelle</option>
            </select>
          </div>

          <div>
            <label>Couleur / repère</label>
            <input id="jeuneCouleur">
          </div>

          <div>
            <label>Destination</label>
            <select id="jeuneDestination">
              <option value="">À définir</option>
              <option>Gardé</option>
              <option>Vendu</option>
              <option>Échangé</option>
              <option>Cédé</option>
              <option>Décédé</option>
            </select>
          </div>
        </div>

        <div class="actions">
          <button class="btn" onclick="ajouterJeuneReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}')">+ Ajouter le jeune</button>
        </div>
      </div>

      <div class="card">
        <h2>Jeunes</h2>

        ${
          ponte.jeunes.length
            ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Naissance</th>
                      <th>Bague</th>
                      <th>Sexe</th>
                      <th>Repère</th>
                      <th>Destination</th>
                      <th>Fiche oiseau</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ponte.jeunes.map(j => `
                      <tr>
                        <td>${safe(j.numero || "-")}</td>
                        <td>${formatDateBE(j.dateNaissance)}</td>
                        <td>${safe(j.bague || "")}</td>
                        <td>${safe(j.sexe || "Inconnu")}</td>
                        <td>${safe(j.couleur || "")}</td>
                        <td>${safe(j.destination || "")}</td>
                        <td>${j.oiseauId ? "✅ créée" : "—"}</td>
                        <td>
                          <button class="btn small-btn" onclick="ouvrirJeuneReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(j.id)}')">Modifier</button>
                          ${
                            j.oiseauId
                              ? ""
                              : `<button class="btn secondary-btn small-btn" onclick="creerOiseauDepuisJeune('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(j.id)}')">Créer fiche</button>`
                          }
                          <button class="btn btn-danger small-btn" onclick="supprimerJeuneReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(j.id)}')">Supprimer</button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            `
            : `<p class="muted-line">Aucun jeune encodé.</p>`
        }
      </div>
    `;
  }

  async function sauverPonteReproduction(coupleId, saisonId, ponteId) {
    const ponte = getPonte(coupleId, saisonId, ponteId);
    if (!ponte) return;

    ponte.numero = document.getElementById("detailPonteNumero")?.value || "";
    ponte.premierOeuf = document.getElementById("detailPontePremierOeuf")?.value || "";
    ponte.dernierOeuf = document.getElementById("detailPonteDernierOeuf")?.value || "";
    ponte.debutCouvaison = document.getElementById("detailPonteDebutCouvaison")?.value || "";
    ponte.dureeIncubation = toNumber(document.getElementById("detailPonteDuree")?.value || 30);
    ponte.joursMirage = toNumber(document.getElementById("detailPonteMirage")?.value || 10);
        if (!ponte.jourBaguage) ponte.jourBaguage = 14;
    if (!ponte.jourSortieEleveuse) ponte.jourSortieEleveuse = 40;
    ponte.nbOeufs = toNumber(document.getElementById("detailPonteNbOeufs")?.value || 0);
    ponte.nbFecondes = toNumber(document.getElementById("detailPonteFecondes")?.value || 0);
    ponte.nbClairs = toNumber(document.getElementById("detailPonteClairs")?.value || 0);
    ponte.nbSousMere = toNumber(document.getElementById("detailPonteSousMere")?.value || 0);
    ponte.nbCouveuse = toNumber(document.getElementById("detailPonteCouveuse")?.value || 0);
    ponte.observations = document.getElementById("detailPonteObservations")?.value || "";

    await persistAndRender("Ponte enregistrée.");
    ouvrirPonteReproduction(coupleId, saisonId, ponteId);
  }

  async function ajouterJeuneReproduction(coupleId, saisonId, ponteId) {
    const ponte = getPonte(coupleId, saisonId, ponteId);
    if (!ponte) return;

    if (!Array.isArray(ponte.jeunes)) ponte.jeunes = [];

    ponte.jeunes.push({
      id: makeId(),
      numero: document.getElementById("jeuneNumero")?.value || String(ponte.jeunes.length + 1),
      dateNaissance: document.getElementById("jeuneDateNaissance")?.value || "",
      bague: document.getElementById("jeuneBague")?.value || "",
      sexe: document.getElementById("jeuneSexe")?.value || "Inconnu",
      couleur: document.getElementById("jeuneCouleur")?.value || "",
      destination: document.getElementById("jeuneDestination")?.value || "",
      notes: "",
      oiseauId: ""
    });

    await persistAndRender("Jeune ajouté.");
    ouvrirPonteReproduction(coupleId, saisonId, ponteId);
  }

  function ouvrirJeuneReproduction(coupleId, saisonId, ponteId, jeuneId) {
    const jeune = getJeune(coupleId, saisonId, ponteId, jeuneId);
    if (!jeune) return;

    const root = document.getElementById("reproductionContent")
      || document.getElementById("section-reproduction");

    if (!root) return;

    root.innerHTML = `
      <div class="module-header">
        <div>
          <h1>Jeune ${safe(jeune.numero || "")}</h1>
          <p class="muted-line">Modification du jeune</p>
        </div>

        <button class="btn secondary-btn" onclick="ouvrirPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}')">← Retour ponte</button>
      </div>

      <div class="card">
        <div class="form-grid">
          <div>
            <label>Numéro</label>
            <input id="editJeuneNumero" value="${safeAttr(jeune.numero || "")}">
          </div>

          <div>
            <label>Date naissance</label>
            <input id="editJeuneDateNaissance" type="date" value="${safeAttr(jeune.dateNaissance || "")}">
          </div>

          <div>
            <label>Bague</label>
            <input id="editJeuneBague" value="${safeAttr(jeune.bague || "")}">
          </div>

          <div>
            <label>Sexe</label>
            <select id="editJeuneSexe">
              ${["Inconnu", "Mâle", "Femelle"].map(s => `
                <option ${jeune.sexe === s ? "selected" : ""}>${safe(s)}</option>
              `).join("")}
            </select>
          </div>

          <div>
            <label>Couleur / repère</label>
            <input id="editJeuneCouleur" value="${safeAttr(jeune.couleur || "")}">
          </div>

          <div>
            <label>Destination</label>
            <select id="editJeuneDestination">
              ${["", "Gardé", "Vendu", "Échangé", "Cédé", "Décédé"].map(s => `
                <option value="${safeAttr(s)}" ${jeune.destination === s ? "selected" : ""}>${safe(s || "À définir")}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <label>Notes</label>
        <textarea id="editJeuneNotes">${safe(jeune.notes || "")}</textarea>

        <div class="actions">
          <button class="btn" onclick="sauverJeuneReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(jeuneId)}')">Enregistrer</button>
          ${
            jeune.oiseauId
              ? ""
              : `<button class="btn secondary-btn" onclick="creerOiseauDepuisJeune('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(jeuneId)}')">Créer fiche oiseau</button>`
          }
        </div>
      </div>
    `;
  }

  async function sauverJeuneReproduction(coupleId, saisonId, ponteId, jeuneId) {
    const jeune = getJeune(coupleId, saisonId, ponteId, jeuneId);
    if (!jeune) return;

    jeune.numero = document.getElementById("editJeuneNumero")?.value || "";
    jeune.dateNaissance = document.getElementById("editJeuneDateNaissance")?.value || "";
    jeune.bague = document.getElementById("editJeuneBague")?.value || "";
    jeune.sexe = document.getElementById("editJeuneSexe")?.value || "Inconnu";
    jeune.couleur = document.getElementById("editJeuneCouleur")?.value || "";
    jeune.destination = document.getElementById("editJeuneDestination")?.value || "";
    jeune.notes = document.getElementById("editJeuneNotes")?.value || "";

    await persistAndRender("Jeune enregistré.");
    ouvrirPonteReproduction(coupleId, saisonId, ponteId);
  }

  async function supprimerJeuneReproduction(coupleId, saisonId, ponteId, jeuneId) {
    if (!confirm("Supprimer ce jeune ?")) return;

    const ponte = getPonte(coupleId, saisonId, ponteId);
    if (!ponte) return;

    ponte.jeunes = safeArray(ponte.jeunes).filter(j => j.id !== jeuneId);

    await persistAndRender("Jeune supprimé.");
    ouvrirPonteReproduction(coupleId, saisonId, ponteId);
  }

  async function creerOiseauDepuisJeune(coupleId, saisonId, ponteId, jeuneId) {
    const couple = getCouple(coupleId);
    const saison = getSaison(coupleId, saisonId);
    const ponte = getPonte(coupleId, saisonId, ponteId);
    const jeune = getJeune(coupleId, saisonId, ponteId, jeuneId);

    if (!couple || !saison || !ponte || !jeune) return;

    if (jeune.oiseauId) {
      alert("Une fiche oiseau existe déjà pour ce jeune.");
      return;
    }

    const nouvelOiseau = {
      id: makeId(),
      nom: jeune.couleur ? `Jeune ${jeune.couleur}` : `Jeune ${jeune.numero}`,
      ordre: 0,
      bague: jeune.bague || "",
      cites: "",
      carteVerte: "",
      espece: couple.espece || "",
      sexe: jeune.sexe || "Inconnu",
      age: jeune.dateNaissance || "",
      annexe: "",
      dateEntree: jeune.dateNaissance || todayStr(),
      registreEntree: "",
      statut: "Né chez Phil Ô Plumes",
      dateSortie: "",
      registreSortie: "",
      motifSortie: "",
      poidsActuel: "",
      poidsVol: 0,
      toleranceVol: 0,
      notes: `Né chez Phil Ô Plumes
Père : ${couple.maleNom || "-"} (${couple.maleBague || "-"})
Mère : ${couple.femelleNom || "-"} (${couple.femelleBague || "-"})
Saison : ${saison.annee || "-"}
Ponte : ${ponte.numero || "-"}
Couleur/repère : ${jeune.couleur || "-"}`,
      nourritureHabituelle: "Poussin",
      quantiteHabituelle: 0,
      nourritureHabituelle2: "",
      quantiteHabituelle2: "",
      photoUrl: "",
      documents: [],
      historiquePoids: [],
      reproduction: {
        pereId: couple.maleId || "",
        pereNom: couple.maleNom || "",
        pereBague: couple.maleBague || "",
        mereId: couple.femelleId || "",
        mereNom: couple.femelleNom || "",
        mereBague: couple.femelleBague || "",
        coupleId,
        saisonId,
        ponteId,
        jeuneId
      }
    };

    data().oiseaux.unshift(nouvelOiseau);
    jeune.oiseauId = nouvelOiseau.id;

    await persistAndRender("Fiche oiseau créée.");

    if (typeof window.showSection === "function") {
      window.showSection("oiseaux");
    }
  }

    async function ajouterOeufReproduction(coupleId, saisonId, ponteId) {
    const ponte = getPonte(coupleId, saisonId, ponteId);
    if (!ponte) return;

    if (!Array.isArray(ponte.oeufs)) ponte.oeufs = [];

    ponte.oeufs.push({
      id: makeId(),
      numero: document.getElementById("oeufNumero")?.value || String(ponte.oeufs.length + 1),
      date: document.getElementById("oeufDate")?.value || "",
      statut: document.getElementById("oeufStatut")?.value || "À mirer",
      lieu: document.getElementById("oeufLieu")?.value || "Sous mère",
      notes: document.getElementById("oeufNotes")?.value || ""
    });

    ponte.nbOeufs = safeArray(ponte.oeufs).length;
    ponte.nbFecondes = safeArray(ponte.oeufs).filter(o => o.statut === "Fécondé" || o.statut === "Éclos").length;
    ponte.nbClairs = safeArray(ponte.oeufs).filter(o => o.statut === "Clair").length;
    ponte.nbSousMere = safeArray(ponte.oeufs).filter(o => o.lieu === "Sous mère").length;
    ponte.nbCouveuse = safeArray(ponte.oeufs).filter(o => o.lieu === "Couveuse").length;

    await persistAndRender("Œuf ajouté.");
    ouvrirPonteReproduction(coupleId, saisonId, ponteId);
  }

  async function supprimerOeufReproduction(coupleId, saisonId, ponteId, oeufId) {
    if (!confirm("Supprimer cet œuf ?")) return;

    const ponte = getPonte(coupleId, saisonId, ponteId);
    if (!ponte) return;

    ponte.oeufs = safeArray(ponte.oeufs).filter(o => o.id !== oeufId);

    ponte.nbOeufs = safeArray(ponte.oeufs).length;
    ponte.nbFecondes = safeArray(ponte.oeufs).filter(o => o.statut === "Fécondé" || o.statut === "Éclos").length;
    ponte.nbClairs = safeArray(ponte.oeufs).filter(o => o.statut === "Clair").length;
    ponte.nbSousMere = safeArray(ponte.oeufs).filter(o => o.lieu === "Sous mère").length;
    ponte.nbCouveuse = safeArray(ponte.oeufs).filter(o => o.lieu === "Couveuse").length;

    await persistAndRender("Œuf supprimé.");
    ouvrirPonteReproduction(coupleId, saisonId, ponteId);
  }

  /* =====================================================
   DASHBOARD REPRODUCTION
===================================================== */

function getReproductionDashboard() {

    const resume = {
        couples: 0,
        saisons: 0,
        pontes: 0,
        oeufs: 0,
        fecondes: 0,
        clairs: 0,
        eclos: 0,
        jeunes: 0,
        alertes: []
    };

    safeArray(appData.reproduction).forEach(couple => {

        resume.couples++;

        safeArray(couple.saisons).forEach(saison => {

            resume.saisons++;

            safeArray(saison.pontes).forEach(ponte => {

                resume.pontes++;

                resume.oeufs += Number(ponte.nbOeufs || 0);
                resume.fecondes += Number(ponte.nbFecondes || 0);
                resume.clairs += Number(ponte.nbClairs || 0);
                resume.jeunes += safeArray(ponte.jeunes).length;

                safeArray(ponte.oeufs).forEach(oeuf => {

                    if (oeuf.statut === "Éclos")
                        resume.eclos++;

                });

                const mirage = getMirageDate(ponte);

                if (mirage && mirage < todayStr()) {

                    resume.alertes.push({
                        type: "mirage",
                        texte:
                            `${couple.espece} • Ponte ${ponte.numero} : mirage prévu le ${mirage}`
                    });

                }

                const eclosion = getEclosionDate(ponte);

                if (eclosion && eclosion < todayStr()) {

                    resume.alertes.push({
                        type: "eclosion",
                        texte:
                            `${couple.espece} • Ponte ${ponte.numero} : éclosion prévue le ${eclosion}`
                    });

                }

            });

        });

    });

    return resume;

}

function renderDashboardReproduction(containerId = "dashboardReproduction") {

    const container = document.getElementById(containerId);

    if (!container) return;

    const d = getReproductionDashboard();

    const taux =
        d.oeufs === 0
            ? 0
            : Math.round((d.fecondes / d.oeufs) * 100);

    container.innerHTML = `

<div class="dashboard-grid">

<div class="card">
<h3>Couples</h3>
<h2>${d.couples}</h2>
</div>

<div class="card">
<h3>Saisons</h3>
<h2>${d.saisons}</h2>
</div>

<div class="card">
<h3>Pontes</h3>
<h2>${d.pontes}</h2>
</div>

<div class="card">
<h3>Œufs</h3>
<h2>${d.oeufs}</h2>
</div>

<div class="card">
<h3>Fécondés</h3>
<h2>${d.fecondes}</h2>
</div>

<div class="card">
<h3>Jeunes</h3>
<h2>${d.jeunes}</h2>
</div>

<div class="card">
<h3>Taux fécondité</h3>
<h2>${taux}%</h2>
</div>

</div>

<div class="card" style="margin-top:20px">

<h2>Alertes reproduction</h2>

${
d.alertes.length
?
`
<ul>

${d.alertes.map(a=>`

<li>${safe(a.texte)}</li>

`).join("")}

</ul>
`
:
"<p>Aucune alerte.</p>"
}

</div>

`;

}

async function modifierStatutOeuf(coupleId, saisonId, ponteId, oeufId, statut) {
  const ponte = getPonte(coupleId, saisonId, ponteId);
  if (!ponte) return;

  const oeuf = safeArray(ponte.oeufs).find(o => o.id === oeufId);
  if (!oeuf) return;

  oeuf.statut = statut;
  recalculerPonte(ponte);

  await persistAndRender("Œuf modifié.");
  ouvrirPonteReproduction(coupleId, saisonId, ponteId);
}

async function modifierLieuOeuf(coupleId, saisonId, ponteId, oeufId, lieu) {
  const ponte = getPonte(coupleId, saisonId, ponteId);
  if (!ponte) return;

  const oeuf = safeArray(ponte.oeufs).find(o => o.id === oeufId);
  if (!oeuf) return;

  oeuf.lieu = lieu;
  recalculerPonte(ponte);

  await persistAndRender("Œuf modifié.");
  ouvrirPonteReproduction(coupleId, saisonId, ponteId);
}

async function modifierNoteOeuf(coupleId, saisonId, ponteId, oeufId, note) {
  const ponte = getPonte(coupleId, saisonId, ponteId);
  if (!ponte) return;

  const oeuf = safeArray(ponte.oeufs).find(o => o.id === oeufId);
  if (!oeuf) return;

  oeuf.notes = note;

  await persistAndRender("Note œuf modifiée.");
}

  window.renderReproduction = renderReproduction;
  window.ajouterCoupleReproduction = ajouterCoupleReproduction;
  window.ouvrirCoupleReproduction = ouvrirCoupleReproduction;
  window.sauverCoupleReproduction = sauverCoupleReproduction;
  window.supprimerCoupleReproduction = supprimerCoupleReproduction;

  window.ajouterSaisonReproduction = ajouterSaisonReproduction;
  window.ouvrirSaisonReproduction = ouvrirSaisonReproduction;
  window.sauverSaisonReproduction = sauverSaisonReproduction;
  window.supprimerSaisonReproduction = supprimerSaisonReproduction;

  window.ajouterPonteReproduction = ajouterPonteReproduction;
  window.ouvrirPonteReproduction = ouvrirPonteReproduction;
  window.sauverPonteReproduction = sauverPonteReproduction;
  window.supprimerPonteReproduction = supprimerPonteReproduction;

  window.ajouterJeuneReproduction = ajouterJeuneReproduction;
  window.ouvrirJeuneReproduction = ouvrirJeuneReproduction;
  window.sauverJeuneReproduction = sauverJeuneReproduction;
  window.supprimerJeuneReproduction = supprimerJeuneReproduction;

  window.creerOiseauDepuisJeune = creerOiseauDepuisJeune;
  window.ajouterOeufReproduction = ajouterOeufReproduction;
  window.supprimerOeufReproduction = supprimerOeufReproduction;

  window.modifierStatutOeuf = modifierStatutOeuf;
window.modifierLieuOeuf = modifierLieuOeuf;
window.modifierNoteOeuf = modifierNoteOeuf;
})();