// Connexion à Google Agenda via Google Identity Services (OAuth côté navigateur).
// Aucune donnée ne transite par un serveur : le jeton d'accès reste dans le navigateur,
// valable le temps de la session (il faudra se reconnecter de temps en temps, c'est normal).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

let tokenClient = null;
let accessToken = null;

export function defaultEventTitle(fiche) {
  return `🐾 ${fiche.prenom} ${fiche.nom}${fiche.nomChien ? " · " + fiche.nomChien : ""}`;
}

export function isGoogleConfigured() {
  return !!CLIENT_ID;
}

function ensureTokenClient() {
  if (!window.google || !window.google.accounts) {
    throw new Error("Google n'est pas encore chargé, réessaie dans un instant.");
  }
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
  }
  return tokenClient;
}

export function getAccessToken() {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error("Google Agenda n'est pas configuré (VITE_GOOGLE_CLIENT_ID manquant)."));
      return;
    }
    try {
      const client = ensureTokenClient();
      client.callback = (resp) => {
        if (resp.error) {
          reject(new Error("Connexion à Google refusée ou annulée."));
          return;
        }
        accessToken = resp.access_token;
        resolve(accessToken);
      };
      client.requestAccessToken({ prompt: accessToken ? "" : "consent" });
    } catch (e) {
      reject(e);
    }
  });
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// Ajoute des minutes à une date+heure locale et renvoie "YYYY-MM-DDTHH:MM:00"
function addMinutes(dateStr, timeStr, minutes) {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

const STATUT_LABELS = { prospect: "Prospect", client: "Client", ancien: "Ancien client" };

// Crée un événement dans l'agenda principal à partir d'une fiche client.
// Un titre personnalisé peut être fourni ; sinon un titre par défaut est généré.
// Si une heure est renseignée, l'événement a un horaire précis (avec durée) ;
// sinon, il est créé en "journée entière".
export async function createCalendarEvent(fiche, customTitle) {
  if (!fiche.dateProchainRdv) {
    throw new Error("Aucune date de prochain rdv n'est définie sur cette fiche.");
  }
  const token = await getAccessToken();

  const title = (customTitle || "").trim() || defaultEventTitle(fiche);

  const descriptionLines = [
    `Client : ${fiche.prenom} ${fiche.nom}${fiche.nomChien ? " (chien : " + fiche.nomChien + ")" : ""}`,
    fiche.adresse && `Adresse : ${fiche.adresse}`,
    `Statut : ${STATUT_LABELS[fiche.statut] || fiche.statut}`,
    fiche.formule && `Formule : ${fiche.formule}${fiche.prix ? " — " + fiche.prix + " €" : ""}`,
    fiche.probleme && `Problème : ${fiche.probleme}`,
    fiche.avancement && `Avancement : ${fiche.avancement}`,
  ].filter(Boolean);

  let start, end;
  if (fiche.heureProchainRdv) {
    const startStr = `${fiche.dateProchainRdv}T${fiche.heureProchainRdv}:00`;
    const duree = Number(fiche.dureeProchainRdv) || 60;
    const endStr = addMinutes(fiche.dateProchainRdv, fiche.heureProchainRdv, duree);
    start = { dateTime: startStr, timeZone: "Europe/Paris" };
    end = { dateTime: endStr, timeZone: "Europe/Paris" };
  } else {
    start = { date: fiche.dateProchainRdv };
    end = { date: fiche.dateProchainRdv };
  }

  const event = {
    summary: title,
    location: fiche.adresse || undefined,
    description: descriptionLines.join("\n"),
    start,
    end,
    reminders: { useDefault: true },
  };

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Erreur lors de la création de l'événement Google Agenda.");
  }
  return res.json();
}
