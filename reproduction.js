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

function joursDepuis(dateStr) {

    if (!dateStr) return 0;

    const d = new Date(dateStr + "T00:00:00");
    const now = new Date();

    d.setHours(0,0,0,0);
    now.setHours(0,0,0,0);

    return Math.floor((now - d) / 86400000);

}

function progressionIncubation(ponte){

    const base =
        ponte.debutCouvaison ||
        ponte.dernierOeuf ||
        ponte.premierOeuf;

    if(!base) return 0;

    return joursDepuis(base);

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

  function recalculerPonte(ponte) {
  if (!ponte) return;

  const oeufs = safeArray(ponte.oeufs);

  ponte.nbOeufs = oeufs.length;

  ponte.nbFecondes = oeufs.filter(o =>
    o.statut === "Fécondé" || o.statut === "Éclos"
  ).length;

  ponte.nbClairs = oeufs.filter(o =>
    o.statut === "Clair"
  ).length;

  ponte.nbSousMere = oeufs.filter(o =>
    o.lieu === "Sous mère"
  ).length;

  ponte.nbCouveuse = oeufs.filter(o =>
    o.lieu === "Couveuse"
  ).length;
}

  function getActiveOiseaux() {
    return data().oiseaux.filter(o => {
      const statut = String(o.statut || "").toLowerCase();
      return !statut.includes("sorti") && !statut.includes("décédé") && !statut.includes("decede");
    });
  }

  function joursRestants(dateStr) {

    if (!dateStr) return null;

    const d = new Date(dateStr + "T00:00:00");
    const now = new Date();

    d.setHours(0,0,0,0);
    now.setHours(0,0,0,0);

    return Math.ceil((d - now) / 86400000);

}

function getAlertesPonte(ponte) {

    const alertes=[];

    const mirage=getMirageDate(ponte);

    const eclosion=getEclosionDate(ponte);

    const baguage=getDatePlusDays(
        ponte.debutCouvaison || ponte.dernierOeuf || ponte.premierOeuf,
        ponte.jourBaguage || 14
    );

    const rMirage=joursRestants(mirage);
    const rEclosion=joursRestants(eclosion);
    const rBaguage=joursRestants(baguage);

    if(rMirage===0)
        alertes.push("🔦 Mirage aujourd'hui");

    else if(rMirage>0 && rMirage<=2)
        alertes.push(`🔦 Mirage dans ${rMirage} jour(s)`);

    if(rEclosion===0)
        alertes.push("🐣 Éclosion aujourd'hui");

    else if(rEclosion>0 && rEclosion<=3)
        alertes.push(`🐣 Éclosion dans ${rEclosion} jour(s)`);

    if(rBaguage===0)
        alertes.push("🏷️ Baguage aujourd'hui");

    else if(rBaguage>0 && rBaguage<=2)
        alertes.push(`🏷️ Baguage dans ${rBaguage} jour(s)`);

    return alertes;

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
    const elevageStats = calculerStatsElevage();

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
  <h2>Statistiques d’élevage</h2>

  <div class="resume-grid">
    <div><strong>${elevageStats.tauxFertilite}%</strong><span>Fertilité</span></div>
    <div><strong>${elevageStats.tauxEclosion}%</strong><span>Éclosion</span></div>
    <div><strong>${elevageStats.tauxReussite}%</strong><span>Réussite globale</span></div>
    <div><strong>${elevageStats.eclos}</strong><span>Éclos</span></div>
    <div><strong>${elevageStats.morts}</strong><span>Morts dans l’œuf</span></div>
    <div><strong>${elevageStats.perdus}</strong><span>Perdus</span></div>
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

  if (!Array.isArray(couple.saisons)) couple.saisons = [];

  root.innerHTML = `
    <div class="module-header">
      <div>
        <h1>${safe(couple.espece || "Couple reproducteur")}</h1>
        <p class="muted-line">${safe(couple.maleNom || "-")} × ${safe(couple.femelleNom || "-")}</p>
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
        <button class="btn" onclick="sauverCoupleReproduction('${safeAttr(couple.id)}')">
          💾 Enregistrer toute la fiche
        </button>
        <button class="btn info-btn" onclick="ajouterSaisonReproduction('${safeAttr(couple.id)}')">
          ➕ Ajouter une saison
        </button>
      </div>
    </div>

    ${
      safeArray(couple.saisons).length
        ? safeArray(couple.saisons).map(saison => `
          <div class="card">
            <h2>📅 Saison ${safe(saison.annee || "-")}</h2>

            <div class="form-grid">
              <div>
                <label>Année</label>
                <input id="saison_${safeAttr(saison.id)}_annee" value="${safeAttr(saison.annee || "")}">
              </div>

              <div>
                <label>Notes saison</label>
                <input id="saison_${safeAttr(saison.id)}_notes" value="${safeAttr(saison.notes || "")}">
              </div>
            </div>

            <button class="btn info-btn" onclick="ajouterPonteDirecte('${safeAttr(couple.id)}','${safeAttr(saison.id)}')">
              ➕ Ajouter une ponte
            </button>

            ${
              safeArray(saison.pontes).length
                ? safeArray(saison.pontes).map(ponte => `
                  <div class="item" style="margin-top:16px;">
                    <h3>🥚 Ponte ${safe(ponte.numero || "-")}</h3>

                    ${renderAvancementPonte(ponte)}

                    <div class="form-grid">
                      <div><label>Premier œuf</label><input type="date" id="ponte_${safeAttr(ponte.id)}_premier" value="${safeAttr(ponte.premierOeuf || "")}"></div>
                      <div><label>Dernier œuf</label><input type="date" id="ponte_${safeAttr(ponte.id)}_dernier" value="${safeAttr(ponte.dernierOeuf || "")}"></div>
                      <div><label>Début couvaison</label><input type="date" id="ponte_${safeAttr(ponte.id)}_couvaison" value="${safeAttr(ponte.debutCouvaison || "")}"></div>
                      <div><label>Durée incubation</label><input type="number" id="ponte_${safeAttr(ponte.id)}_duree" value="${safeAttr(ponte.dureeIncubation || ponte.dureeCouvaison || 30)}"></div>
                      <div><label>Mirage après X jours</label><input type="number" id="ponte_${safeAttr(ponte.id)}_mirage" value="${safeAttr(ponte.joursMirage || ponte.mirageApresJours || 10)}"></div>
                    </div>

                    <h4>🥚 Œufs</h4>
                    ${
                      safeArray(ponte.oeufs).length
                        ? safeArray(ponte.oeufs).map(oeuf => `
                          <div class="form-grid">
                            <div><label>Œuf</label><input value="Œuf ${safeAttr(oeuf.numero || "")}" disabled></div>
                            <div><label>Date ponte</label><input type="date" id="oeuf_${safeAttr(oeuf.id)}_date" value="${safeAttr(oeuf.datePonte || oeuf.date || "")}"></div>
                            <div>
                              <label>Statut</label>
                              <select id="oeuf_${safeAttr(oeuf.id)}_statut">
                                ${["Inconnu","À mirer","Clair","Fécondé","Éclos","Mort dans l'œuf","Perdu"].map(v => `
                                  <option value="${safeAttr(v)}" ${(oeuf.statut || "Inconnu") === v ? "selected" : ""}>${safe(v)}</option>
                                `).join("")}
                              </select>
                            </div>
                            <div>
                              <label>Lieu</label>
                              <select id="oeuf_${safeAttr(oeuf.id)}_lieu">
                                ${["Sous mère","Couveuse","Éleveuse"].map(v => `
                                  <option value="${safeAttr(v)}" ${(oeuf.lieu || oeuf.emplacement || "Sous mère") === v ? "selected" : ""}>${safe(v)}</option>
                                `).join("")}
                              </select>
                            </div>
                          </div>
                        `).join("")
                        : `<p class="muted-line">Aucun œuf encodé.</p>`
                    }

                    <button class="btn small-btn" onclick="ajouterOeufDirect('${safeAttr(couple.id)}','${safeAttr(saison.id)}','${safeAttr(ponte.id)}')">
                      ➕ Ajouter un œuf
                    </button>

                    <h4 style="margin-top:18px;">🐣 Jeunes</h4>
                    ${
                      safeArray(ponte.jeunes).length
                        ? safeArray(ponte.jeunes).map(jeune => `
                          <div class="form-grid">
                            <div><label>Jeune</label><input value="Jeune ${safeAttr(jeune.numero || "")}" disabled></div>
                            <div><label>Repère / couleur</label><input id="jeune_${safeAttr(jeune.id)}_couleur" value="${safeAttr(jeune.couleur || "")}"></div>
                            <div><label>Bague</label><input id="jeune_${safeAttr(jeune.id)}_bague" value="${safeAttr(jeune.bague || "")}"></div>
                            <div><label>Naissance</label><input type="date" id="jeune_${safeAttr(jeune.id)}_naissance" value="${safeAttr(jeune.dateNaissance || "")}"></div>
                            <div>
                              <label>Sexe</label>
                              <select id="jeune_${safeAttr(jeune.id)}_sexe">
                                ${["Inconnu","M","F","ADN en attente"].map(v => `
                                  <option value="${safeAttr(v)}" ${(jeune.sexe || "Inconnu") === v ? "selected" : ""}>${safe(v)}</option>
                                `).join("")}
                              </select>
                            </div>
                            <div>
                              <label>Destination</label>
                              <select id="jeune_${safeAttr(jeune.id)}_destination">
                                ${["","Gardé","Vendu","Échangé","Cédé","Décédé"].map(v => `
                                  <option value="${safeAttr(v)}" ${(jeune.destination || jeune.statut || "") === v ? "selected" : ""}>${safe(v || "À définir")}</option>
                                `).join("")}
                              </select>
                              <button
  class="btn btn-danger small-btn"
  onclick="supprimerJeuneDirect('${safeAttr(couple.id)}','${safeAttr(saison.id)}','${safeAttr(ponte.id)}','${safeAttr(jeune.id)}')">
  🗑️ Supprimer ce jeune
</button>
                            </div>
                          </div>
                        `).join("")
                        : `<p class="muted-line">Aucun jeune encodé.</p>`
                    }

                    <button class="btn small-btn" onclick="ajouterJeuneDirect('${safeAttr(couple.id)}','${safeAttr(saison.id)}','${safeAttr(ponte.id)}')">
                      ➕ Ajouter un jeune
                    </button>
                  </div>
                `).join("")
                : `<p class="muted-line">Aucune ponte enregistrée.</p>`
            }
          </div>
        `).join("")
        : `<div class="card"><p class="muted-line">Aucune saison créée.</p></div>`
    }
  `;
}

async function sauverCoupleReproduction(coupleId) {
  const couple = getCouple(coupleId);
  if (!couple) return;

  couple.saison = document.getElementById("coupleSaison")?.value || "";
  couple.espece = document.getElementById("coupleEspece")?.value || "";
  couple.notes = document.getElementById("coupleNotes")?.value || "";

  safeArray(couple.saisons).forEach(saison => {
    saison.annee = document.getElementById(`saison_${saison.id}_annee`)?.value || saison.annee || "";
    saison.notes = document.getElementById(`saison_${saison.id}_notes`)?.value || "";

    safeArray(saison.pontes).forEach(ponte => {
      ponte.premierOeuf = document.getElementById(`ponte_${ponte.id}_premier`)?.value || "";
      ponte.dernierOeuf = document.getElementById(`ponte_${ponte.id}_dernier`)?.value || "";
      ponte.debutCouvaison = document.getElementById(`ponte_${ponte.id}_couvaison`)?.value || "";
      ponte.dureeIncubation = toNumber(document.getElementById(`ponte_${ponte.id}_duree`)?.value || 30);
      ponte.joursMirage = toNumber(document.getElementById(`ponte_${ponte.id}_mirage`)?.value || 10);

      safeArray(ponte.oeufs).forEach(oeuf => {
        oeuf.datePonte = document.getElementById(`oeuf_${oeuf.id}_date`)?.value || "";
        oeuf.statut = document.getElementById(`oeuf_${oeuf.id}_statut`)?.value || "Inconnu";
        oeuf.lieu = document.getElementById(`oeuf_${oeuf.id}_lieu`)?.value || "Sous mère";
        oeuf.emplacement = oeuf.lieu;
      });

      safeArray(ponte.jeunes).forEach(jeune => {
        jeune.couleur = document.getElementById(`jeune_${jeune.id}_couleur`)?.value || "";
        jeune.bague = document.getElementById(`jeune_${jeune.id}_bague`)?.value || "";
        jeune.dateNaissance = document.getElementById(`jeune_${jeune.id}_naissance`)?.value || "";
        jeune.sexe = document.getElementById(`jeune_${jeune.id}_sexe`)?.value || "Inconnu";
        jeune.destination = document.getElementById(`jeune_${jeune.id}_destination`)?.value || "";
      });

      recalculerPonte(ponte);
    });
  });

  await persistAndRender("Fiche reproduction enregistrée.");
  ouvrirCoupleReproduction(coupleId);
}

async function ajouterPonteDirecte(coupleId, saisonId) {
  const saison = getSaison(coupleId, saisonId);
  if (!saison) return;

  if (!Array.isArray(saison.pontes)) saison.pontes = [];

  saison.pontes.push({
    id: makeId(),
    numero: saison.pontes.length + 1,
    premierOeuf: "",
    dernierOeuf: "",
    debutCouvaison: "",
    dureeIncubation: 30,
    joursMirage: 10,
    oeufs: [],
    jeunes: []
  });

  await persistAndRender("Ponte ajoutée.");
  ouvrirCoupleReproduction(coupleId);
}

async function ajouterOeufDirect(coupleId, saisonId, ponteId) {
  const ponte = getPonte(coupleId, saisonId, ponteId);
  if (!ponte) return;

  if (!Array.isArray(ponte.oeufs)) ponte.oeufs = [];

  ponte.oeufs.push({
    id: makeId(),
    numero: ponte.oeufs.length + 1,
    datePonte: "",
    statut: "À mirer",
    lieu: "Sous mère",
    emplacement: "Sous mère",
    notes: ""
  });

  recalculerPonte(ponte);
  await persistAndRender("Œuf ajouté.");
  ouvrirCoupleReproduction(coupleId);
}

async function ajouterJeuneDirect(coupleId, saisonId, ponteId) {
  const ponte = getPonte(coupleId, saisonId, ponteId);
  if (!ponte) return;

  if (!Array.isArray(ponte.jeunes)) ponte.jeunes = [];

  ponte.jeunes.push({
    id: makeId(),
    numero: ponte.jeunes.length + 1,
    couleur: "",
    bague: "",
    sexe: "Inconnu",
    dateNaissance: todayStr(),
    destination: "",
    notes: ""
  });

  await persistAndRender("Jeune ajouté.");
  ouvrirCoupleReproduction(coupleId);
}

window.ajouterPonteDirecte = ajouterPonteDirecte;
window.ajouterOeufDirect = ajouterOeufDirect;
window.ajouterJeuneDirect = ajouterJeuneDirect;

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
            ? 
            `
            ${(() => {

    const pontes = safeArray(saison.pontes);

    const oeufs = pontes.reduce((t,p)=>t+toNumber(p.nbOeufs),0);

    const fecondes = pontes.reduce((t,p)=>t+toNumber(p.nbFecondes),0);

    const clairs = pontes.reduce((t,p)=>t+toNumber(p.nbClairs),0);

    const jeunes = pontes.reduce((t,p)=>t+safeArray(p.jeunes).length,0);

    const taux = oeufs ? Math.round((fecondes/oeufs)*100) : 0;

    return `

<div class="repro-resume">

<div class="resume-box">

<h3>Résumé de la saison</h3>

<div class="resume-grid">

<div><strong>${pontes.length}</strong><span>Pontes</span></div>

<div><strong>${oeufs}</strong><span>Œufs</span></div>

<div><strong>${fecondes}</strong><span>Fécondés</span></div>

<div><strong>${clairs}</strong><span>Clairs</span></div>

<div><strong>${jeunes}</strong><span>Jeunes</span></div>

<div><strong>${taux}%</strong><span>Fertilité</span></div>

</div>

</div>

</div>

`;

})()}
              <div class="repro-ponte-grid">
  ${saison.pontes.map(p => {
    recalculerPonte(p);

    const total = toNumber(p.nbOeufs);
    const fecondes = toNumber(p.nbFecondes);
    const clairs = toNumber(p.nbClairs);
    const jeunes = safeArray(p.jeunes).length;
    const alertes = getAlertesPonte(p);

    return `
      <div class="repro-ponte-card">
        <div class="repro-ponte-head">
          <div>
            <h3>🥚 Ponte ${safe(p.numero || "-")}</h3>
            <p>${formatDateBE(p.premierOeuf)} → ${formatDateBE(p.dernierOeuf)}</p>
          </div>
          <span class="repro-badge">${progressionIncubation(p)} j</span>
        </div>

        <div class="repro-mini-stats">
          <span>🥚 ${total} œufs</span>
          <span>🟢 ${fecondes} fécondés</span>
          <span>⚪ ${clairs} clairs</span>
          <span>👶 ${jeunes} jeunes</span>
        </div>

        <div class="repro-dates">
          <p><strong>Mirage :</strong> ${formatDateBE(getMirageDate(p))}</p>
          <p><strong>Éclosion :</strong> ${formatDateBE(getEclosionDate(p))}</p>
        </div>

        <div class="repro-card-alerts">
          ${
            alertes.length
              ? alertes.map(a => `<div class="repro-alert">${safe(a)}</div>`).join("")
              : `<div class="repro-alert ok">Aucune alerte</div>`
          }
        </div>

        <div class="actions">
          <button class="btn small-btn" onclick="ouvrirPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(p.id)}')">
            Ouvrir
          </button>
          <button class="btn btn-danger small-btn" onclick="supprimerPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(p.id)}')">
            Supprimer
          </button>
        </div>
      </div>
    `;
  }).join("")}
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

  function getResumePonteDashboard(couple, saison, ponte) {
  const base = ponte.debutCouvaison || ponte.dernierOeuf || ponte.premierOeuf;
  if (!base) return "";

  const duree = toNumber(ponte.dureeIncubation || ponte.dureeCouvaison || 30);
  const jour = progressionIncubation(ponte);
  const restant = duree - jour;

  const mirage = getMirageDate(ponte);
  const eclosion = getEclosionDate(ponte);

  let badge = "Incubation";
  let couleur = "#7aa7a6";
  let detail = `Jour ${jour} / ${duree}`;

  if (todayStr() === mirage) {
    badge = "Mirage aujourd’hui";
    couleur = "#d98c2f";
  }

  if (restant === 1) {
    badge = "Éclosion demain";
    couleur = "#d98c2f";
  }

  if (restant === 0) {
    badge = "Éclosion aujourd’hui";
    couleur = "#789a63";
  }

  if (restant < 0) {
    badge = "Éclosion dépassée";
    couleur = "#b85c5c";
    detail = `Dépassé de ${Math.abs(restant)} jour(s)`;
  }

  return `
    <div class="dashboard-row" style="border-left:8px solid ${couleur};cursor:pointer;"
         onclick="ouvrirCoupleReproduction('${safeAttr(couple.id)}')">
      <div>
        <strong>🥚 ${safe(couple.espece || "Reproduction")} — Ponte ${safe(ponte.numero || "-")}</strong>
        <small>
          Saison ${safe(saison.annee || "-")} • ${safe(detail)}
          • Mirage ${mirage ? formatDateBE(mirage) : "-"}
          • Éclosion ${eclosion ? formatDateBE(eclosion) : "-"}
        </small>
      </div>
      <span class="dashboard-badge warn">${safe(badge)}</span>
    </div>
  `;
}

function renderDashboardReproduction() {
  const zone = document.getElementById("dashboardReproInfos")
    || document.getElementById("dashboardReproAlerts")
    || document.getElementById("dashboardReproduction");

  if (!zone) return;

  const lignes = [];

  safeArray(data().reproduction).forEach(couple => {
    safeArray(couple.saisons).forEach(saison => {
      safeArray(saison.pontes).forEach(ponte => {
        const html = getResumePonteDashboard(couple, saison, ponte);
        if (html) lignes.push(html);
      });
    });
  });

  zone.innerHTML = lignes.length
    ? lignes.join("")
    : `<p class="muted-line">Aucune reproduction en cours.</p>`;
}

window.renderDashboardReproduction = renderDashboardReproduction;

  function renderAvancementPonte(ponte) {
  const base = ponte.debutCouvaison || ponte.dernierOeuf || ponte.premierOeuf;
  const duree = toNumber(ponte.dureeIncubation || ponte.dureeCouvaison || 30);
  const mirage = getMirageDate(ponte);
  const eclosion = getEclosionDate(ponte);

  let jour = 0;
  if (base) {
    jour = progressionIncubation(ponte);
  }

  const restant = duree - jour;
  const pct = duree > 0 ? Math.min(100, Math.max(0, Math.round((jour / duree) * 100))) : 0;

  let couleur = "#7aa7a6";
  let texte = `Jour ${jour} / ${duree}`;

  if (!base) {
    couleur = "#999";
    texte = "Couvaison non commencée";
  } else if (restant > 1) {
    texte = `Jour ${jour} / ${duree} — éclosion dans ${restant} jours`;
  } else if (restant === 1) {
    couleur = "#d98c2f";
    texte = `Jour ${jour} / ${duree} — éclosion demain`;
  } else if (restant === 0) {
    couleur = "#789a63";
    texte = `Jour ${jour} / ${duree} — éclosion aujourd'hui`;
  } else {
    couleur = "#b85c5c";
    texte = `Dépassé de ${Math.abs(restant)} jour(s)`;
  }

  return `
    <div class="item" style="border-left:8px solid ${couleur};margin:12px 0;">
      <strong>📊 Avancement incubation</strong>
      <p>${safe(texte)}</p>

      <div style="height:12px;background:#efe2d0;border-radius:999px;overflow:hidden;margin:8px 0;">
        <div style="height:12px;width:${pct}%;background:${couleur};"></div>
      </div>

      <p class="muted-line">
        🔦 Mirage : ${mirage ? formatDateBE(mirage) : "-"}
        &nbsp; | &nbsp;
        🐣 Éclosion prévue : ${eclosion ? formatDateBE(eclosion) : "-"}
      </p>
    </div>
  `;
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
            <input id="detailPonteMirage" type="number" value="${safeAttr(ponte.joursMirage || 10)}">s
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
                <div class="repro-progress">
                <div class="repro-alerts">
  ${
    getAlertesPonte(ponte).length
      ? getAlertesPonte(ponte).map(a => `<div class="repro-alert">${safe(a)}</div>`).join("")
      : `<div class="repro-alert ok">Aucune alerte pour cette ponte</div>`
  }
</div>

<div class="repro-alerts">
  ${
    getAlertesPonte(ponte).length
      ? getAlertesPonte(ponte).map(a => `<div class="repro-alert">${safe(a)}</div>`).join("")
      : `<div class="repro-alert ok">Aucune alerte pour cette ponte</div>`
  }
</div>

<div class="repro-progress-title">

Incubation : Jour ${progressionIncubation(ponte)}

</div>

<progress
value="${Math.min(progressionIncubation(ponte),35)}"
max="35"
style="width:100%;height:18px;">
</progress>

</div>
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
                      <th>Dernière action</th>
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
    <label>Nom</label>
    <input id="jeuneNom" placeholder="Ex : Jeune 1, Koa, Plume...">
  </div>

  <div>
    <label>Date naissance</label>
    <input id="jeuneDateNaissance" type="date" value="${todayStr()}">
  </div>

  <div>
    <label>Poids naissance (g)</label>
    <input id="jeunePoidsNaissance" type="number" step="0.1">
  </div>

  <div>
    <label>Poids actuel (g)</label>
    <input id="jeunePoidsActuel" type="number" step="0.1">
  </div>

  <div>
    <label>Bague</label>
    <input id="jeuneBague">
  </div>

  <div>
    <label>Date baguage</label>
    <input id="jeuneDateBaguage" type="date">
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
    <label>Statut</label>
    <select id="jeuneStatut">
      <option>Vivant</option>
      <option>Décédé</option>
      <option>Gardé</option>
      <option>Cédé</option>
      <option>Vendu</option>
    </select>
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

  <div>
    <label>
      <input id="jeuneAdnEnvoye" type="checkbox">
      ADN envoyé
    </label>
  </div>

  <div>
    <label>
      <input id="jeuneAdnRecu" type="checkbox">
      ADN reçu
    </label>
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
<th>Nom</th>
<th>Naissance</th>
<th>Âge</th>
<th>Poids</th>
<th>Bague</th>
<th>Sexe</th>
<th>ADN</th>
<th>Statut</th>
<th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ponte.jeunes.map(j => `
  <tr>
    <td>${safe(j.numero || "-")}</td>
    <td>${safe(j.nom || j.couleur || "-")}</td>
    <td>${formatDateBE(j.dateNaissance)}</td>
    <td>${j.dateNaissance ? joursDepuis(j.dateNaissance) + " j" : "-"}</td>
    <td>${safe(j.poidsActuel || j.poidsNaissance || "-")} g</td>
    <td>${safe(j.bague || "-")}</td>
    <td>${safe(j.sexe || "Inconnu")}</td>
    <td>${j.adnRecu ? "✅ Reçu" : j.adnEnvoye ? "📨 Envoyé" : "—"}</td>
    <td>${safe(j.statut || j.destination || "Vivant")}</td>
    <td>
      <button class="btn small-btn" onclick="ouvrirJeuneReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(j.id)}')">Modifier</button>
     ${
j.oiseauId

?

`<button class="btn small-btn"
onclick="window.ouvrirFicheOiseau && window.ouvrirFicheOiseau('${safeAttr(j.oiseauId)}')">
Ouvrir fiche
</button>`

:

`<button class="btn secondary-btn small-btn"
onclick="creerOiseauDepuisJeune('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(j.id)}')">
Créer fiche
</button>`
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
  nom: document.getElementById("jeuneNom")?.value || "",
  dateNaissance: document.getElementById("jeuneDateNaissance")?.value || "",
  bague: document.getElementById("jeuneBague")?.value || "",
  dateBaguage: document.getElementById("jeuneDateBaguage")?.value || "",
  sexe: document.getElementById("jeuneSexe")?.value || "Inconnu",
  poidsNaissance: document.getElementById("jeunePoidsNaissance")?.value || "",
  poidsActuel: document.getElementById("jeunePoidsActuel")?.value || "",
  adnEnvoye: document.getElementById("jeuneAdnEnvoye")?.checked || false,
  adnRecu: document.getElementById("jeuneAdnRecu")?.checked || false,
  couleur: document.getElementById("jeuneCouleur")?.value || "",
  destination: document.getElementById("jeuneDestination")?.value || "",
  statut: document.getElementById("jeuneStatut")?.value || "Vivant",
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
        <h1>${safe(jeune.nom || "Jeune " + (jeune.numero || ""))}</h1>
        <p class="muted-line">
          Né le ${formatDateBE(jeune.dateNaissance)} —
          ${jeune.dateNaissance ? joursDepuis(jeune.dateNaissance) + " jours" : "âge inconnu"}
        </p>
      </div>

      <button class="btn secondary-btn" onclick="ouvrirPonteReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}')">
        ← Retour ponte
      </button>
    </div>

    <div class="card">
      <h2>Fiche jeune</h2>

      <div class="form-grid">
        <div>
          <label>Numéro</label>
          <input id="editJeuneNumero" value="${safeAttr(jeune.numero || "")}">
        </div>

        <div>
          <label>Nom</label>
          <input id="editJeuneNom" value="${safeAttr(jeune.nom || "")}">
        </div>

        <div>
          <label>Date naissance</label>
          <input id="editJeuneDateNaissance" type="date" value="${safeAttr(jeune.dateNaissance || "")}">
        </div>

        <div>
          <label>Poids naissance (g)</label>
          <input id="editJeunePoidsNaissance" type="number" step="0.1" value="${safeAttr(jeune.poidsNaissance || "")}">
        </div>

        <div>
          <label>Poids actuel (g)</label>
          <input
    id="editJeunePoidsActuel"
    type="number"
    step="0.1"
    value="${safeAttr(jeune.poidsActuel || "")}"
>
<div>
    <label>Date de pesée</label>
    <input
        id="editJeuneDatePesee"
        type="date"
        value="${todayStr()}"
    >
</div>

<div class="actions">
    <button class="btn"
        onclick="ajouterPeseeJeune('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(jeuneId)}')">
        + Ajouter pesée
    </button>
</div>
        </div>

        <div>
          <label>Bague</label>
          <input id="editJeuneBague" value="${safeAttr(jeune.bague || "")}">
        </div>

        <div>
          <label>Date baguage</label>
          <input id="editJeuneDateBaguage" type="date" value="${safeAttr(jeune.dateBaguage || "")}">
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
          <label>Statut</label>
          <select id="editJeuneStatut">
            ${["Vivant", "Décédé", "Gardé", "Cédé", "Vendu", "Échangé"].map(s => `
              <option ${jeune.statut === s ? "selected" : ""}>${safe(s)}</option>
            `).join("")}
          </select>
        </div>

        <div>
          <label>Destination</label>
          <select id="editJeuneDestination">
            ${["", "Gardé", "Vendu", "Échangé", "Cédé", "Décédé"].map(s => `
              <option value="${safeAttr(s)}" ${jeune.destination === s ? "selected" : ""}>${safe(s || "À définir")}</option>
            `).join("")}
          </select>
        </div>

        <div>
          <label>
            <input id="editJeuneAdnEnvoye" type="checkbox" ${jeune.adnEnvoye ? "checked" : ""}>
            ADN envoyé
          </label>
        </div>

        <div>
          <label>
            <input id="editJeuneAdnRecu" type="checkbox" ${jeune.adnRecu ? "checked" : ""}>
            ADN reçu
          </label>
        </div>
      </div>

      <label>Notes</label>
      <textarea id="editJeuneNotes">${safe(jeune.notes || "")}</textarea>

      <div class="actions">
        <button class="btn" onclick="sauverJeuneReproduction('${safeAttr(coupleId)}','${safeAttr(saisonId)}','${safeAttr(ponteId)}','${safeAttr(jeuneId)}')">
          Enregistrer
        </button>

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
  jeune.nom = document.getElementById("editJeuneNom")?.value || "";
  jeune.dateNaissance = document.getElementById("editJeuneDateNaissance")?.value || "";
  jeune.poidsNaissance = document.getElementById("editJeunePoidsNaissance")?.value || "";
  jeune.poidsActuel = document.getElementById("editJeunePoidsActuel")?.value || "";
  jeune.bague = document.getElementById("editJeuneBague")?.value || "";
  jeune.dateBaguage = document.getElementById("editJeuneDateBaguage")?.value || "";
  jeune.sexe = document.getElementById("editJeuneSexe")?.value || "Inconnu";
  jeune.couleur = document.getElementById("editJeuneCouleur")?.value || "";
  jeune.statut = document.getElementById("editJeuneStatut")?.value || "Vivant";
  jeune.destination = document.getElementById("editJeuneDestination")?.value || "";
  jeune.adnEnvoye = document.getElementById("editJeuneAdnEnvoye")?.checked || false;
  jeune.adnRecu = document.getElementById("editJeuneAdnRecu")?.checked || false;
  jeune.notes = document.getElementById("editJeuneNotes")?.value || "";

  if (!jeune.historique) jeune.historique = [];

jeune.historique.unshift({
    id: makeId(),
    date: new Date().toISOString(),
    action: "Modification",
    texte: `Fiche du jeune enregistrée.`
});

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
    const jeune = getJeune(coupleId, saisonId, ponteId, jeuneId);

    if (!couple || !jeune) return;

    if (jeune.oiseauId) {
        alert("Une fiche existe déjà.");
        return;
    }

    const oiseau = {

        id: makeId(),

        nom: jeune.nom || ("Jeune " + (jeune.numero || "")),

        espece: couple.espece || "",

        sexe: jeune.sexe || "Inconnu",

        bague: jeune.bague || "",

        dateNaissance: jeune.dateNaissance || "",

        couleur: jeune.couleur || "",

        origine: "Né à l'élevage",

        statut: "Elevage",

        cites: "",

        carteVerte: "",

        pere: couple.maleNom || "",

        mere: couple.femelleNom || "",

        poids: jeune.poidsActuel || jeune.poidsNaissance || "",

        documents: [],

        sante: [],

        nourrissage: [],

        reproduction: [],

        notes: jeune.notes || ""

    };

    data().oiseaux.push(oiseau);

    jeune.oiseauId = oiseau.id;
    if (!jeune.historique) jeune.historique = [];

jeune.historique.unshift({
    id: makeId(),
    date: new Date().toISOString(),
    action: "Création",
    texte: "Fiche oiseau créée automatiquement."
});

    await persistAndRender("Fiche oiseau créée.");

    if (typeof window.ouvrirFicheOiseau === "function") {

        window.ouvrirFicheOiseau(oiseau.id);

    } else {

        ouvrirPonteReproduction(coupleId, saisonId, ponteId);

    }

}

    async function ajouterOeufReproduction(coupleId, saisonId, ponteId) {
    const ponte = getPonte(coupleId, saisonId, ponteId);
    if (!ponte) return;

    if (!Array.isArray(ponte.oeufs)) ponte.oeufs = [];

    ponte.oeufs.push({
      id: makeId(),
      numero: document.getElementById("oeufNumero")?.value || String(ponte.oeufs.length + 1),
      date: "",
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
  oeuf.date = todayStr();
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
  oeuf.date = todayStr();
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
  oeuf.date = todayStr();

  await persistAndRender("Note œuf modifiée.");
}

async function ajouterPeseeJeune(coupleId, saisonId, ponteId, jeuneId) {

    const jeune = getJeune(coupleId, saisonId, ponteId, jeuneId);

    if (!jeune) return;

    if (!jeune.pesees)
        jeune.pesees = [];

    const poids = Number(document.getElementById("editJeunePoidsActuel").value);

    if (!poids)
        return alert("Poids invalide");

    jeune.poidsActuel = poids;

    jeune.pesees.unshift({

        id: makeId(),

        date: document.getElementById("editJeuneDatePesee").value,

        poids

    });

    await persistAndRender("Pesée enregistrée.");

    ouvrirJeuneReproduction(coupleId, saisonId, ponteId, jeuneId);

}

function calculerStatsElevage() {
  const stats = {
    couples: 0,
    saisons: 0,
    pontes: 0,
    oeufs: 0,
    fecondes: 0,
    clairs: 0,
    eclos: 0,
    morts: 0,
    perdus: 0,
    jeunes: 0
  };

  safeArray(data().reproduction).forEach(couple => {
    stats.couples++;

    safeArray(couple.saisons).forEach(saison => {
      stats.saisons++;

      safeArray(saison.pontes).forEach(ponte => {
        recalculerPonte(ponte);
        stats.pontes++;

        const oeufs = safeArray(ponte.oeufs);

        stats.oeufs += oeufs.length;
        stats.fecondes += oeufs.filter(o => o.statut === "Fécondé" || o.statut === "Éclos").length;
        stats.clairs += oeufs.filter(o => o.statut === "Clair").length;
        stats.eclos += oeufs.filter(o => o.statut === "Éclos").length;
        stats.morts += oeufs.filter(o => o.statut === "Mort dans l’œuf").length;
        stats.perdus += oeufs.filter(o => o.statut === "Perdu").length;
        stats.jeunes += safeArray(ponte.jeunes).length;
      });
    });
  });

  stats.tauxFertilite = stats.oeufs ? Math.round((stats.fecondes / stats.oeufs) * 100) : 0;
  stats.tauxEclosion = stats.fecondes ? Math.round((stats.eclos / stats.fecondes) * 100) : 0;
  stats.tauxReussite = stats.oeufs ? Math.round((stats.jeunes / stats.oeufs) * 100) : 0;

  return stats;
}

async function supprimerJeuneDirect(coupleId, saisonId, ponteId, jeuneId) {
  if (!confirm("Supprimer définitivement ce jeune ?")) return;

  const ponte = getPonte(coupleId, saisonId, ponteId);
  if (!ponte) return;

  ponte.jeunes = safeArray(ponte.jeunes).filter(j => j.id !== jeuneId);

  await persistAndRender("Jeune supprimé.");
  ouvrirCoupleReproduction(coupleId);
}

window.supprimerJeuneDirect = supprimerJeuneDirect;
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
window.ajouterPeseeJeune = ajouterPeseeJeune;

})();