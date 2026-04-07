const APP_PIN = "0212";

let appData = {
  oiseaux: [],
  nourrissage: []
};

function formatDateFR(d){
  if(!d)return "";
  const p=d.split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
}

/* PIN */
function checkPin(){
  const val=document.getElementById("pinInput").value;
  if(val===APP_PIN){
    document.getElementById("pinOverlay").style.display="none";
    document.getElementById("appContent").classList.remove("hidden");
  }else{
    document.getElementById("pinError").innerText="Code incorrect";
  }
}

document.getElementById("pinInput").addEventListener("keydown",e=>{
  if(e.key==="Enter")checkPin();
});

/* NAV */
function showSection(id){
  document.querySelectorAll(".card").forEach(c=>c.classList.add("hidden"));
  document.getElementById("section-"+id).classList.remove("hidden");
}

/* OISEAUX */
function ajouterOiseau(){
  const nom=document.getElementById("oiseauNom").value;
  const espece=document.getElementById("oiseauEspece").value;

  appData.oiseaux.push({id:Date.now(),nom,espece});
  renderOiseaux();
}

function renderOiseaux(){
  const zone=document.getElementById("listeOiseaux");
  zone.innerHTML=appData.oiseaux.map(o=>`
    <div class="card">
      <b>${o.nom}</b><br>${o.espece}
    </div>
  `).join("");
}

/* TERRAIN */
function renderTerrain(){
  const zone=document.getElementById("terrainZone");

  zone.innerHTML=appData.oiseaux.map(o=>`
    <div class="card">
      <b>${o.nom}</b><br>
      <button onclick="feed('${o.id}','Poussin')">+Poussin</button>
      <button onclick="feed('${o.id}','Souris')">+Souris</button>
    </div>
  `).join("");
}

function feed(id,food){
  const o=appData.oiseaux.find(x=>x.id==id);
  appData.nourrissage.push({
    date:document.getElementById("feedDate").value,
    oiseau:o.nom,
    nourriture:food
  });
  renderNourrissage();
}

/* NOURRISSAGE */
function renderNourrissage(){
  const zone=document.getElementById("listeNourrissage");

  zone.innerHTML=appData.nourrissage.map(n=>`
    <div class="card">
      ${formatDateFR(n.date)} - ${n.oiseau} - ${n.nourriture}
    </div>
  `).join("");
}

/* INIT */
document.getElementById("feedDate").value=new Date().toISOString().slice(0,10);

renderOiseaux();
renderNourrissage();
renderTerrain();