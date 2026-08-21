window.restaurerOiseauxDepuisBackup = async function restaurerOiseauxDepuisBackup() {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".json,application/json";

  input.onchange = async () => {
    const file = input.files?.[0];

    if (!file) {
      alert("Aucun fichier sélectionné.");
      return;
    }

    try {
      const texte = await file.text();
      const backup = JSON.parse(texte);

      if (!Array.isArray(backup.oiseaux)) {
        alert("Le fichier ne contient pas de liste oiseaux.");
        return;
      }

      if (backup.oiseaux.length !== 23) {
        const continuer = confirm(
          `Le fichier contient ${backup.oiseaux.length} oiseaux au lieu de 23. Continuer quand même ?`
        );

        if (!continuer) return;
      }

      const noms = backup.oiseaux
        .map(oiseau => oiseau.nom || "Sans nom")
        .join("\n");

      const confirmation = confirm(
        `Restaurer ${backup.oiseaux.length} oiseaux ?\n\n${noms}\n\nLes autres données de l'application seront conservées.`
      );

      if (!confirmation) return;

      window.appData.oiseaux = structuredClone(backup.oiseaux);

      await window.saveData();

      window.renderAll();

      alert(
        `${backup.oiseaux.length} oiseaux restaurés avec succès.`
      );

    } catch (error) {
      console.error("Erreur restauration oiseaux :", error);

      alert(
        "Erreur pendant la restauration. Aucune restauration complète n'a été validée."
      );
    }
  };

  input.click();
};