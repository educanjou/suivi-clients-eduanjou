import { useState, useEffect, useCallback } from "react";
import { Plus, X, Trash2, Search, Check, Clock, CalendarClock } from "lucide-react";
import { supabase } from "./supabaseClient";
import { createCalendarEvent, isGoogleConfigured, defaultEventTitle } from "./googleCalendar";

const TABLE = "fiches";

const STATUTS = [
  { id: "prospect", label: "Prospects", accent: "#5B6B73", bg: "#EEF1F1" },
  { id: "edc", label: "EDC", accent: "#B8863B", bg: "#F5EEDD" },
  { id: "accompagnement", label: "Accompagnement domicile", accent: "#2F5233", bg: "#EAF0EA" },
  { id: "ancien", label: "Anciens clients", accent: "#8A8478", bg: "#F1F0EC" },
  { id: "sans_suite", label: "Sans suite", accent: "#A65C52", bg: "#F3EAE8" },
];

const SUPPORTS = ["SMS", "WhatsApp", "Appel"];
const SOURCES = ["Site", "Calendly", "Whatsapp", "Ads", "Mail", "Bouche à oreille", "Autre"];

// Quelles bulles afficher sur la carte, selon la colonne (statut) de la fiche
const PILL_VISIBILITY = {
  prospect: [],
  edc: ["edcPaye"],
  accompagnement: ["paye", "contrat", "edcPaye"],
  ancien: ["paye", "contrat", "edcPaye", "avis"],
  sans_suite: [],
};

function urgency(dateRappel) {
  if (!dateRappel) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateRappel + "T00:00:00");
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return "future";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

const URGENCY_STYLES = {
  overdue: { dot: "#B3432B", text: "#B3432B" },
  today: { dot: "#C97A2B", text: "#C97A2B" },
  future: { dot: "#5B6B73", text: "#5B6B73" },
};

const PRIORITY_STYLES = {
  1: { bg: "#B3432B", label: "1 - Très urgent" },
  2: { bg: "#C97A2B", label: "2 - Urgent" },
  3: { bg: "#8A8478", label: "3 - Normal" },
  4: { bg: "#5B6B73", label: "4 - Peu urgent" },
  5: { bg: "#A6A297", label: "5 - Pas pressé" },
};

function emptyFiche(statut) {
  return {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    prenom: "",
    nom: "",
    adresse: "",
    nomChien: "",
    probleme: "",
    avancement: "",
    support: "",
    source: "",
    formule: "",
    prix: "",
    dateProchainRdv: "",
    heureProchainRdv: "",
    dureeProchainRdv: 60,
    contratSigne: false,
    paye: false,
    edcPaye: false,
    avisOk: false,
    prixEdc: "",
    datePriseContact: "",
    dateFinAccompagnement: "",
    dateRappel: "",
    noteRappel: "",
    priorite: 3,
    ordre: null,
    archive: false,
    statut: statut || "prospect",
  };
}

// --- Conversion JS (camelCase) <-> table Supabase (snake_case) ---
function toRow(f) {
  return {
    id: f.id,
    prenom: f.prenom,
    nom: f.nom,
    adresse: f.adresse,
    nom_chien: f.nomChien,
    probleme: f.probleme,
    avancement: f.avancement,
    support: f.support,
    source: f.source,
    formule: f.formule,
    prix: f.prix === "" || f.prix === null ? null : Number(f.prix),
    date_prochain_rdv: f.dateProchainRdv || null,
    heure_prochain_rdv: f.heureProchainRdv || null,
    duree_prochain_rdv: f.dureeProchainRdv || 60,
    contrat_signe: f.contratSigne,
    paye: f.paye,
    edc_paye: f.edcPaye,
    avis_ok: f.avisOk,
    prix_edc: f.prixEdc === "" || f.prixEdc === null ? null : Number(f.prixEdc),
    date_prise_contact: f.datePriseContact || null,
    date_fin_accompagnement: f.dateFinAccompagnement || null,
    date_rappel: f.dateRappel || null,
    note_rappel: f.noteRappel,
    priorite: f.priorite || 3,
    ordre: f.ordre ?? null,
    archive: !!f.archive,
    statut: f.statut,
  };
}

function fromRow(r) {
  return {
    id: r.id,
    prenom: r.prenom || "",
    nom: r.nom || "",
    adresse: r.adresse || "",
    nomChien: r.nom_chien || "",
    probleme: r.probleme || "",
    avancement: r.avancement || "",
    support: r.support || "",
    source: r.source || "",
    formule: r.formule || "",
    prix: r.prix ?? "",
    dateProchainRdv: r.date_prochain_rdv || "",
    heureProchainRdv: r.heure_prochain_rdv || "",
    dureeProchainRdv: r.duree_prochain_rdv || 60,
    contratSigne: !!r.contrat_signe,
    paye: !!r.paye,
    edcPaye: !!r.edc_paye,
    avisOk: !!r.avis_ok,
    prixEdc: r.prix_edc ?? "",
    datePriseContact: r.date_prise_contact || "",
    dateFinAccompagnement: r.date_fin_accompagnement || "",
    dateRappel: r.date_rappel || "",
    noteRappel: r.note_rappel || "",
    priorite: r.priorite || 3,
    ordre: r.ordre ?? null,
    archive: !!r.archive,
    statut: r.statut || "prospect",
  };
}

function exportCsv(fiches) {
  const headers = [
    "Prénom", "Nom", "Adresse", "Nom du chien", "Statut", "Problème", "Avancement",
    "Support", "Source", "Formule", "Prix formule", "Prix EDC", "Total",
    "Payé", "EDC payé", "Contrat signé", "Avis OK",
    "Date prise de contact", "Date fin accompagnement", "Prochain rdv", "Date de rappel", "Priorité", "Archivé",
  ];
  const rows = fiches.map((f) => [
    f.prenom, f.nom, f.adresse, f.nomChien,
    STATUTS.find((s) => s.id === f.statut)?.label || f.statut,
    f.probleme, f.avancement, f.support, f.source, f.formule,
    f.prix || 0, f.prixEdc || 0, (Number(f.prix) || 0) + (Number(f.prixEdc) || 0),
    f.paye ? "Oui" : "Non", f.edcPaye ? "Oui" : "Non", f.contratSigne ? "Oui" : "Non", f.avisOk ? "Oui" : "Non",
    f.datePriseContact, f.dateFinAccompagnement, f.dateProchainRdv, f.dateRappel, f.priorite,
    f.archive ? "Oui" : "Non",
  ]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fiches-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [fiches, setFiches] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState("board"); // board | stats | archive
  const [dropIndicator, setDropIndicator] = useState(null); // { cardId, pos: 'before'|'after' }
  const [filterSource, setFilterSource] = useState("all");
  const [filterSupport, setFilterSupport] = useState("all");
  const [filterPriorite, setFilterPriorite] = useState("all");

  const loadFiches = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      setLoadError(true);
    } else {
      setFiches((data || []).map(fromRow));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadFiches();
  }, [loadFiches]);

  const flash = (ok) => {
    setSaveState(ok ? "saved" : "error");
    setTimeout(() => setSaveState("idle"), 1200);
  };

  const saveFiche = async (fiche) => {
    setSaveState("saving");
    const { error } = await supabase.from(TABLE).upsert(toRow(fiche));
    flash(!error);
    if (!error) {
      setFiches((prev) => {
        const exists = prev.some((f) => f.id === fiche.id);
        return exists ? prev.map((f) => (f.id === fiche.id ? fiche : f)) : [...prev, fiche];
      });
      setEditing(null);
      setConfirmDelete(false);
    }
  };

  const deleteFiche = async (id) => {
    setSaveState("saving");
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    flash(!error);
    if (!error) {
      setFiches((prev) => prev.filter((f) => f.id !== id));
      setEditing(null);
      setConfirmDelete(false);
    }
  };

  const patchFiche = async (id, patch) => {
    setSaveState("saving");
    const { error } = await supabase.from(TABLE).update(toRow({ ...fiches.find((f) => f.id === id), ...patch })).eq("id", id);
    flash(!error);
    if (!error) {
      setFiches((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    }
  };

  const moveFiche = (id, statut) => patchFiche(id, { statut });
  const validateRappel = (id) => patchFiche(id, { dateRappel: "", noteRappel: "" });
  const rescheduleRappel = (id, newDate) => patchFiche(id, { dateRappel: newDate });

  // Réordonne manuellement une fiche à l'intérieur d'une colonne (ou en la déplaçant depuis une autre colonne)
  const reorderColumn = async (draggedId, statutId, targetId, position) => {
    setDropIndicator(null);
    const columnIds = fiches
      .filter((f) => f.statut === statutId && f.id !== draggedId)
      .sort((a, b) => (a.ordre ?? 999999) - (b.ordre ?? 999999))
      .map((f) => f.id);

    let insertAt = targetId ? columnIds.indexOf(targetId) : columnIds.length;
    if (insertAt === -1) insertAt = columnIds.length;
    if (targetId && position === "after") insertAt += 1;
    columnIds.splice(insertAt, 0, draggedId);

    const updates = columnIds.map((id, idx) => ({ id, ordre: idx }));

    setSaveState("saving");
    setFiches((prev) =>
      prev.map((f) => {
        const u = updates.find((u) => u.id === f.id);
        if (!u) return f;
        return { ...f, ordre: u.ordre, statut: f.id === draggedId ? statutId : f.statut };
      })
    );

    try {
      await Promise.all(
        updates.map((u) =>
          supabase
            .from(TABLE)
            .update(u.id === draggedId ? { ordre: u.ordre, statut: statutId } : { ordre: u.ordre })
            .eq("id", u.id)
        )
      );
      flash(true);
    } catch (e) {
      flash(false);
    }
  };

  const archiveFiche = (id) => patchFiche(id, { archive: true });
  const restoreFiche = (id) => patchFiche(id, { archive: false });

  const matchesSearch = (f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.prenom.toLowerCase().includes(q) ||
      f.nom.toLowerCase().includes(q) ||
      f.nomChien.toLowerCase().includes(q) ||
      f.probleme.toLowerCase().includes(q)
    );
  };

  const matchesFilters = (f) => {
    if (filterSource !== "all" && f.source !== filterSource) return false;
    if (filterSupport !== "all" && f.support !== filterSupport) return false;
    if (filterPriorite !== "all" && String(f.priorite || 3) !== filterPriorite) return false;
    return true;
  };

  const filtersActive = filterSource !== "all" || filterSupport !== "all" || filterPriorite !== "all";

  const aFaire = fiches
    .filter((f) => !f.archive && matchesSearch(f) && matchesFilters(f) && (urgency(f.dateRappel) === "overdue" || urgency(f.dateRappel) === "today"))
    .sort((a, b) => (a.priorite || 3) - (b.priorite || 3) || a.dateRappel.localeCompare(b.dateRappel));

  const byStatut = (statutId) =>
    fiches
      .filter((f) => !f.archive && f.statut === statutId && matchesSearch(f) && matchesFilters(f))
      .sort((a, b) => (a.ordre ?? 999999) - (b.ordre ?? 999999));

  return (
    <div className="min-h-screen w-full" style={{ background: "#F3F5F1", fontFamily: "'Inter', sans-serif", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #D6D9D2; border-radius: 4px; }
        .card-tab::before {
          content: '';
          position: absolute;
          top: -1px; left: 14px;
          width: 22px; height: 6px;
          background: inherit;
          border-radius: 0 0 3px 3px;
        }
      `}</style>

      <header className="sticky top-0 z-20 border-b" style={{ background: "#F3F5F1F0", borderColor: "#DEE1D9", backdropFilter: "blur(6px)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src="/icons/icon-v2-192.png" alt="Éduc'Anjou" className="w-9 h-9 rounded-lg shrink-0" style={{ border: "1px solid #DEE1D9" }} />
            <div>
              <h1 className="font-display text-xl sm:text-2xl" style={{ color: "#1E2A22" }}>
                Éduc'Anjou <span style={{ color: "#5B6B73" }}>· Suivi clients</span>
              </h1>
              <p className="font-mono text-xs mt-0.5" style={{ color: "#8A8478" }}>
                {fiches.filter((f) => !f.archive).length} fiche{fiches.filter((f) => !f.archive).length !== 1 ? "s" : ""} ·{" "}
                {saveState === "saving" ? "enregistrement…" : saveState === "saved" ? "enregistré" : saveState === "error" ? "erreur d'enregistrement" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border shrink-0" style={{ borderColor: "#DEE1D9" }}>
              <button
                onClick={() => setView("board")}
                className="px-3 py-2 text-sm font-medium focus:outline-none"
                style={view === "board" ? { background: "#2F5233", color: "#FFFFFF" } : { background: "#FFFFFF", color: "#5B6B73" }}
              >
                Tableau
              </button>
              <button
                onClick={() => setView("stats")}
                className="px-3 py-2 text-sm font-medium focus:outline-none"
                style={view === "stats" ? { background: "#2F5233", color: "#FFFFFF" } : { background: "#FFFFFF", color: "#5B6B73" }}
              >
                📊 Statistiques
              </button>
              <button
                onClick={() => setView("archive")}
                className="px-3 py-2 text-sm font-medium focus:outline-none"
                style={view === "archive" ? { background: "#2F5233", color: "#FFFFFF" } : { background: "#FFFFFF", color: "#5B6B73" }}
              >
                🗄️ Archivés
              </button>
            </div>
            {view === "board" && (
              <div className="relative flex-1 sm:flex-none min-w-0">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#8A8478" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="pl-9 pr-3 py-2 rounded-lg text-sm outline-none border focus:ring-2 w-full sm:w-60"
                  style={{ borderColor: "#DEE1D9", background: "#FFFFFF", color: "#1E2A22" }}
                />
              </div>
            )}
            {view === "board" && (
              <button
                onClick={() => setEditing(emptyFiche("prospect"))}
                className="shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-white transition-transform active:scale-95 focus:ring-2 focus:outline-none"
                style={{ background: "#2F5233" }}
              >
                <Plus size={16} /> Nouvelle fiche
              </button>
            )}
            <button
              onClick={() => exportCsv(fiches)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border focus:ring-2 focus:outline-none"
              style={{ background: "#FFFFFF", color: "#5B6B73", borderColor: "#DEE1D9" }}
              title="Exporter toutes les fiches en CSV"
            >
              ⬇️ Export CSV
            </button>
          </div>
        </div>
        {view === "board" && (
          <div className="max-w-[1400px] mx-auto px-4 sm:px-5 pb-3 flex flex-wrap items-center gap-2">
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border outline-none" style={{ borderColor: "#DEE1D9", background: "#FFFFFF", color: "#1E2A22" }}>
              <option value="all">Toutes les sources</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterSupport} onChange={(e) => setFilterSupport(e.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border outline-none" style={{ borderColor: "#DEE1D9", background: "#FFFFFF", color: "#1E2A22" }}>
              <option value="all">Tous les supports</option>
              {SUPPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterPriorite} onChange={(e) => setFilterPriorite(e.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border outline-none" style={{ borderColor: "#DEE1D9", background: "#FFFFFF", color: "#1E2A22" }}>
              <option value="all">Toutes priorités</option>
              {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{PRIORITY_STYLES[p].label}</option>)}
            </select>
            {filtersActive && (
              <button
                onClick={() => { setFilterSource("all"); setFilterSupport("all"); setFilterPriorite("all"); }}
                className="text-xs font-medium underline"
                style={{ color: "#B3432B" }}
              >
                Réinitialiser
              </button>
            )}
          </div>
        )}
      </header>

      {view === "stats" ? (
        <StatsPage fiches={fiches.filter((f) => !f.archive)} />
      ) : view === "archive" ? (
        <ArchivePage fiches={fiches.filter((f) => f.archive)} onRestore={restoreFiche} onDeleteForever={deleteFiche} />
      ) : (
      <main className="max-w-[1400px] mx-auto px-4 sm:px-5 py-6 overflow-x-auto">
        {!loaded ? (
          <p className="text-sm" style={{ color: "#8A8478" }}>Chargement…</p>
        ) : loadError ? (
          <p className="text-sm" style={{ color: "#B3432B" }}>
            Impossible de charger les fiches. Vérifie ta connexion et la configuration Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
          </p>
        ) : (
          <div className="flex gap-4 min-w-max pb-4">
            <Column title="À faire" subtitle="rappels du jour et en retard" accent="#C97A2B" bg="#FBF2E7" count={aFaire.length} isVirtual>
              {aFaire.length === 0 && <EmptyState text="Rien à relancer aujourd'hui." />}
              {aFaire.map((f) => (
                <Card
                  key={f.id}
                  fiche={f}
                  onClick={() => setEditing(f)}
                  readOnlyDrag
                  onValidate={() => validateRappel(f.id)}
                  onReschedule={(newDate) => rescheduleRappel(f.id, newDate)}
                />
              ))}
            </Column>

            {STATUTS.map((s) => (
              <Column
                key={s.id}
                title={s.label}
                accent={s.accent}
                bg={s.bg}
                count={byStatut(s.id).length}
                onAdd={() => setEditing(emptyFiche(s.id))}
                onDrop={(id) => {
                  if (dropIndicator && dropIndicator.statutId === s.id) {
                    reorderColumn(id, s.id, dropIndicator.cardId, dropIndicator.pos);
                  } else {
                    reorderColumn(id, s.id, null, "after");
                  }
                }}
                isDragOver={dragOverCol === s.id}
                onDragOverCol={() => setDragOverCol(s.id)}
                onDragLeaveCol={() => setDragOverCol(null)}
              >
                {byStatut(s.id).length === 0 && <EmptyState text="Aucune fiche ici." />}
                {byStatut(s.id).map((f) => (
                  <Card
                    key={f.id}
                    fiche={f}
                    onClick={() => setEditing(f)}
                    dropIndicator={dropIndicator}
                    onCardDragOver={(pos) => setDropIndicator({ cardId: f.id, statutId: s.id, pos })}
                  />
                ))}
              </Column>
            ))}
          </div>
        )}
      </main>
      )}

      {editing && (
        <FicheModal
          key={editing.id}
          fiche={editing}
          onChange={setEditing}
          onSave={saveFiche}
          onDelete={() => setConfirmDelete(true)}
          onClose={() => {
            setEditing(null);
            setConfirmDelete(false);
          }}
          confirmDelete={confirmDelete}
          onConfirmDelete={() => {
            archiveFiche(editing.id);
            setEditing(null);
            setConfirmDelete(false);
          }}
          onCancelDelete={() => setConfirmDelete(false)}
          isNew={!fiches.some((f) => f.id === editing.id)}
        />
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return <p className="text-xs italic px-1 py-3" style={{ color: "#A6A297" }}>{text}</p>;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl p-4 bg-white" style={{ border: "1px solid #E7E5DE" }}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#8A8478" }}>{label}</p>
      <p className="font-display text-2xl mt-1" style={{ color: "#1E2A22" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#8A8478" }}>{sub}</p>}
    </div>
  );
}

function BarList({ title, data, total }) {
  return (
    <div className="rounded-xl p-4 bg-white" style={{ border: "1px solid #E7E5DE" }}>
      <p className="text-sm font-semibold mb-3" style={{ color: "#1E2A22" }}>{title}</p>
      {data.length === 0 && <p className="text-xs italic" style={{ color: "#A6A297" }}>Pas encore de données.</p>}
      <div className="flex flex-col gap-2">
        {data.map(([label, count]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "#4A4A44" }}>{label}</span>
              <span className="font-mono" style={{ color: "#8A8478" }}>{count}</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "#EEF1F1" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%`, background: "#2F5233" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchivePage({ fiches, onRestore, onDeleteForever }) {
  const [confirmId, setConfirmId] = useState(null);

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-5 py-6">
      <h2 className="font-display text-xl mb-1" style={{ color: "#1E2A22" }}>Fiches archivées</h2>
      <p className="text-sm mb-4" style={{ color: "#8A8478" }}>
        Ces fiches ne sont plus visibles dans le tableau ni dans les statistiques. Tu peux les restaurer à tout moment, ou les supprimer définitivement.
      </p>
      {fiches.length === 0 ? (
        <EmptyState text="Aucune fiche archivée pour le moment." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fiches.map((f) => (
            <div key={f.id} className="rounded-lg p-3.5 bg-white" style={{ border: "1px solid #E7E5DE" }}>
              <p className="text-sm font-semibold" style={{ color: "#1E2A22" }}>{f.prenom} {f.nom}</p>
              {f.nomChien && <p className="text-xs italic" style={{ color: "#5B6B73" }}>🐾 {f.nomChien}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onRestore(f.id)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border focus:ring-2 focus:outline-none"
                  style={{ background: "#EAF0EA", color: "#2F5233", borderColor: "#2F5233" }}
                >
                  Restaurer
                </button>
                {confirmId === f.id ? (
                  <button
                    onClick={() => { onDeleteForever(f.id); setConfirmId(null); }}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "#B3432B", color: "#FFFFFF" }}
                  >
                    Confirmer ?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmId(f.id)}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border focus:ring-2 focus:outline-none"
                    style={{ background: "#F7E7E2", color: "#B3432B", borderColor: "#B3432B" }}
                  >
                    Supprimer définitivement
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function StatsPage({ fiches }) {
  const total = fiches.length;
  const num = (v) => Number(v) || 0;

  const parStatut = STATUTS.map((s) => ({ ...s, count: fiches.filter((f) => f.statut === s.id).length }));
  const clientsActifs = fiches.filter((f) => f.statut === "accompagnement").length;
  const anciens = fiches.filter((f) => f.statut === "ancien").length;

  const totalCA = fiches.reduce((sum, f) => sum + num(f.prix) + num(f.prixEdc), 0);
  const totalEncaisse = fiches.reduce((sum, f) => sum + (f.paye ? num(f.prix) : 0) + (f.edcPaye ? num(f.prixEdc) : 0), 0);
  const totalImpaye = totalCA - totalEncaisse;

  const fichesAvecPrix = fiches.filter((f) => num(f.prix) + num(f.prixEdc) > 0);
  const prixMoyen = fichesAvecPrix.length ? totalCA / fichesAvecPrix.length : 0;

  const tauxConversion = total ? ((clientsActifs + anciens) / total) * 100 : 0;

  const impayesCount = fiches.filter((f) => (num(f.prix) > 0 && !f.paye) || (num(f.prixEdc) > 0 && !f.edcPaye)).length;

  const avisRepondus = fiches.filter((f) => f.statut === "accompagnement" || f.statut === "ancien");
  const avisOkCount = avisRepondus.filter((f) => f.avisOk).length;

  const prospectCount = fiches.filter((f) => f.statut === "prospect").length;
  const edcCount = fiches.filter((f) => f.statut === "edc").length;
  const accompagnementTotal = clientsActifs + anciens;
  const sansSuiteCount = fiches.filter((f) => f.statut === "sans_suite").length;
  const traites = edcCount + accompagnementTotal + sansSuiteCount; // fiches ayant dépassé le simple statut "prospect"
  const pct = (n) => (traites ? Math.round((n / traites) * 100) : 0);

  const countBy = (key) => {
    const map = {};
    fiches.forEach((f) => {
      const v = f[key];
      if (v) map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };

  const parSource = countBy("source");
  const parSupport = countBy("support");

  const fmtEuro = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-5 py-6">
      <h2 className="font-display text-xl mb-4" style={{ color: "#1E2A22" }}>Vue d'ensemble de l'activité</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total fiches" value={total} />
        <StatCard label="Clients en accompagnement" value={clientsActifs} />
        <StatCard label="Taux de conversion" value={`${tauxConversion.toFixed(0)}%`} sub="prospects → clients" />
        <StatCard label="Prix moyen / client" value={fmtEuro(prixMoyen)} sub={`sur ${fichesAvecPrix.length} fiches facturées`} />
        <StatCard label="CA total (facturé)" value={fmtEuro(totalCA)} />
        <StatCard label="CA encaissé" value={fmtEuro(totalEncaisse)} />
        <StatCard label="Impayés" value={fmtEuro(totalImpaye)} sub={`${impayesCount} fiche(s) concernée(s)`} />
        <StatCard label="Avis clients OK" value={avisRepondus.length ? `${avisOkCount}/${avisRepondus.length}` : "—"} sub="sur clients / anciens clients" />
      </div>

      <div className="rounded-xl p-4 bg-white mb-4" style={{ border: "1px solid #E7E5DE" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "#1E2A22" }}>Entonnoir de conversion</p>
        <p className="text-xs mb-3" style={{ color: "#8A8478" }}>
          Basé sur la répartition actuelle des fiches (pas un historique de parcours).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="Prospects (pas encore traités)" value={prospectCount} />
          <StatCard label="S'arrêtent à l'EDC" value={edcCount} sub={`${pct(edcCount)}% des fiches traitées`} />
          <StatCard label="Vont jusqu'à l'accompagnement" value={accompagnementTotal} sub={`${pct(accompagnementTotal)}% des fiches traitées`} />
          <StatCard label="Sans suite" value={sansSuiteCount} sub={`${pct(sansSuiteCount)}% des fiches traitées`} />
        </div>
        <div className="flex items-stretch gap-1.5 h-8 rounded-lg overflow-hidden" style={{ background: "#EEF1F1" }}>
          {edcCount > 0 && <div style={{ width: `${pct(edcCount)}%`, background: "#B8863B" }} title={`EDC : ${edcCount}`} />}
          {accompagnementTotal > 0 && <div style={{ width: `${pct(accompagnementTotal)}%`, background: "#2F5233" }} title={`Accompagnement / Anciens : ${accompagnementTotal}`} />}
          {sansSuiteCount > 0 && <div style={{ width: `${pct(sansSuiteCount)}%`, background: "#A65C52" }} title={`Sans suite : ${sansSuiteCount}`} />}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-[11px]" style={{ color: "#8A8478" }}>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#B8863B" }} />EDC</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#2F5233" }} />Accompagnement / Anciens</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#A65C52" }} />Sans suite</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-4 bg-white" style={{ border: "1px solid #E7E5DE" }}>
          <p className="text-sm font-semibold mb-3" style={{ color: "#1E2A22" }}>Répartition par colonne</p>
          <div className="flex flex-col gap-2">
            {parStatut.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5" style={{ color: "#4A4A44" }}>
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.accent }} />
                    {s.label}
                  </span>
                  <span className="font-mono" style={{ color: "#8A8478" }}>{s.count}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "#EEF1F1" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${total ? (s.count / total) * 100 : 0}%`, background: s.accent }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <BarList title="Répartition par source" data={parSource} total={total} />
        <BarList title="Répartition par support de contact" data={parSupport} total={total} />
      </div>
    </main>
  );
}

function Column({ title, subtitle, accent, bg, count, children, onAdd, onDrop, isVirtual, isDragOver, onDragOverCol, onDragLeaveCol }) {
  return (
    <div
      className="rounded-xl w-[280px] shrink-0 flex flex-col"
      style={{ background: bg, border: `1px solid ${isDragOver ? accent : "transparent"}`, transition: "border-color 120ms" }}
      onDragOver={(e) => {
        if (isVirtual) return;
        e.preventDefault();
        onDragOverCol && onDragOverCol();
      }}
      onDragLeave={() => onDragLeaveCol && onDragLeaveCol()}
      onDrop={(e) => {
        if (isVirtual) return;
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id && onDrop) onDrop(id);
        onDragLeaveCol && onDragLeaveCol();
      }}
    >
      <div className="px-3.5 pt-3.5 pb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
            <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "#1E2A22" }}>{title}</h2>
            <span className="font-mono text-[11px]" style={{ color: "#8A8478" }}>{count}</span>
          </div>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: "#8A8478" }}>{subtitle}</p>}
        </div>
        {onAdd && (
          <button onClick={onAdd} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 focus:ring-2 focus:outline-none" style={{ color: accent }} aria-label={`Ajouter dans ${title}`}>
            <Plus size={16} />
          </button>
        )}
      </div>
      <div className="px-2.5 pb-3 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
        {children}
      </div>
    </div>
  );
}

function Pill({ ok, okLabel, koLabel }) {
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={ok ? { background: "#EAF0EA", color: "#2F5233" } : { background: "#F7E7E2", color: "#B3432B" }}
    >
      {ok ? okLabel : koLabel}
    </span>
  );
}

function Card({ fiche, onClick, readOnlyDrag, onValidate, onReschedule, dropIndicator, onCardDragOver }) {
  const u = urgency(fiche.dateRappel);
  const statutMeta = STATUTS.find((s) => s.id === fiche.statut);
  const [showReschedule, setShowReschedule] = useState(false);
  const cardBg = statutMeta ? `${statutMeta.accent}14` : "#FFFFFF";
  const isOver = dropIndicator && dropIndicator.cardId === fiche.id;

  return (
    <div
      draggable={!readOnlyDrag}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", fiche.id)}
      onDragOver={(e) => {
        if (readOnlyDrag || !onCardDragOver) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = e.clientY - rect.top < rect.height / 2 ? "before" : "after";
        onCardDragOver(pos);
      }}
      onClick={onClick}
      className="relative rounded-lg px-3.5 pt-4 pb-3 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
      style={{
        background: cardBg,
        borderTop: isOver && dropIndicator.pos === "before" ? "2px solid #2F5233" : "1px solid #E7E5DE",
        borderBottom: isOver && dropIndicator.pos === "after" ? "2px solid #2F5233" : "1px solid #E7E5DE",
        borderLeft: "1px solid #E7E5DE",
        borderRight: "1px solid #E7E5DE",
      }}
    >
      <div className="card-tab" style={{ background: u ? URGENCY_STYLES[u].dot : "#D6D9D2" }} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          {readOnlyDrag && (
            <span
              className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-mono text-[9px] font-bold text-white mt-0.5"
              style={{ background: PRIORITY_STYLES[fiche.priorite || 3].bg }}
              title={PRIORITY_STYLES[fiche.priorite || 3].label}
            >
              {fiche.priorite || 3}
            </span>
          )}
          <p className="text-sm font-semibold leading-tight" style={{ color: "#1E2A22" }}>{fiche.prenom} {fiche.nom}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {PILL_VISIBILITY[fiche.statut]?.includes("paye") && (
            <Pill ok={fiche.paye} okLabel="payé" koLabel="non payé" />
          )}
          {PILL_VISIBILITY[fiche.statut]?.includes("contrat") && (
            <Pill ok={fiche.contratSigne} okLabel="contrat" koLabel="sans contrat" />
          )}
          {PILL_VISIBILITY[fiche.statut]?.includes("edcPaye") && (
            <Pill ok={fiche.edcPaye} okLabel="EDC payé" koLabel="EDC non payé" />
          )}
          {PILL_VISIBILITY[fiche.statut]?.includes("avis") && (
            <Pill ok={fiche.avisOk} okLabel="avis ok" koLabel="avis non ok" />
          )}
        </div>
      </div>
      {fiche.adresse && <p className="text-[11px] mt-0.5" style={{ color: "#8A8478" }}>📍 {fiche.adresse}</p>}
      {fiche.nomChien && <p className="text-xs italic mt-0.5" style={{ color: "#5B6B73" }}>🐾 {fiche.nomChien}</p>}
      {fiche.probleme && <p className="text-xs mt-1.5 line-clamp-2" style={{ color: "#4A4A44" }}>{fiche.probleme}</p>}
      <div className="flex items-center justify-between mt-2.5">
        {fiche.dateRappel ? (
          <span className="font-mono text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ color: URGENCY_STYLES[u].text, background: u === "overdue" ? "#F7E7E2" : u === "today" ? "#FBF2E7" : "#EEF1F1" }}>
            <Clock size={10} /> {formatDate(fiche.dateRappel)}
          </span>
        ) : <span />}
        {readOnlyDrag && statutMeta && (
          <span className="font-mono text-[10px]" style={{ color: statutMeta.accent }}>{statutMeta.label.replace(/s$/, "")}</span>
        )}
      </div>
      {fiche.noteRappel && (
        <p className="text-[11px] mt-1.5 pt-1.5 border-t line-clamp-2" style={{ color: "#6B6659", borderColor: "#EDEBE4" }}>📝 {fiche.noteRappel}</p>
      )}
      {onValidate && (
        <div className="mt-2.5 pt-2 border-t flex items-center gap-1.5" style={{ borderColor: "#EDEBE4" }} onClick={(e) => e.stopPropagation()}>
          {!showReschedule ? (
            <>
              <button onClick={() => onValidate()} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-medium focus:ring-2 focus:outline-none" style={{ background: "#EAF0EA", color: "#2F5233" }}>
                <Check size={12} /> Valider
              </button>
              <button onClick={() => setShowReschedule(true)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-medium focus:ring-2 focus:outline-none" style={{ background: "#EEF1F1", color: "#5B6B73" }}>
                <CalendarClock size={12} /> Reprogrammer
              </button>
            </>
          ) : (
            <input
              type="date"
              autoFocus
              className="w-full text-[11px] px-2 py-1.5 rounded-md border outline-none"
              style={{ borderColor: "#DEE1D9", color: "#1E2A22" }}
              onChange={(e) => {
                if (e.target.value) {
                  onReschedule(e.target.value);
                  setShowReschedule(false);
                }
              }}
              onBlur={() => setShowReschedule(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FicheModal({ fiche, onChange, onSave, onDelete, onClose, confirmDelete, onConfirmDelete, onCancelDelete, isNew }) {
  const set = (patch) => onChange({ ...fiche, ...patch });
  const canSave = fiche.prenom.trim() && fiche.nom.trim();
  const [calState, setCalState] = useState("idle"); // idle | loading | done | error
  const [calMessage, setCalMessage] = useState("");
  const [eventTitle, setEventTitle] = useState(() => defaultEventTitle(fiche));

  const handleAddToCalendar = async () => {
    setCalState("loading");
    setCalMessage("");
    try {
      await createCalendarEvent(fiche, eventTitle);
      setCalState("done");
      setCalMessage("Ajouté à Google Agenda.");
    } catch (e) {
      setCalState("error");
      setCalMessage(e.message || "Erreur inconnue.");
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: "rgba(30,42,34,0.35)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white overflow-hidden" style={{ border: "1px solid #E7E5DE" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#EDEBE4" }}>
          <h3 className="font-display text-lg" style={{ color: "#1E2A22" }}>{isNew ? "Nouvelle fiche" : "Modifier la fiche"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5 focus:ring-2 focus:outline-none" aria-label="Fermer">
            <X size={18} style={{ color: "#5B6B73" }} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <div className="flex gap-2.5">
            <Field label="Prénom"><input className="input" value={fiche.prenom} onChange={(e) => set({ prenom: e.target.value })} /></Field>
            <Field label="Nom"><input className="input" value={fiche.nom} onChange={(e) => set({ nom: e.target.value })} /></Field>
          </div>

          <Field label="Ville / Adresse">
            <input className="input" value={fiche.adresse} onChange={(e) => set({ adresse: e.target.value })} placeholder="Ex : Doué-en-Anjou" />
          </Field>

          <Field label="Nom du chien">
            <input className="input" value={fiche.nomChien} onChange={(e) => set({ nomChien: e.target.value })} />
          </Field>

          <Field label="Problème comportemental">
            <textarea className="input resize-none" rows={2} value={fiche.probleme} onChange={(e) => set({ probleme: e.target.value })} />
          </Field>

          <Field label="Avancement">
            <textarea className="input resize-none" rows={2} value={fiche.avancement} onChange={(e) => set({ avancement: e.target.value })} placeholder="Ex : bilan fait, 2 séances réalisées, aboiements en baisse…" />
          </Field>

          <div className="flex gap-2.5">
            <Field label="Support">
              <select className="input" value={fiche.support} onChange={(e) => set({ support: e.target.value })}>
                <option value="">—</option>
                {SUPPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <select className="input" value={fiche.source} onChange={(e) => set({ source: e.target.value })}>
                <option value="">—</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex gap-2.5">
            <Field label="Formule">
              <input className="input" value={fiche.formule} onChange={(e) => set({ formule: e.target.value })} placeholder="Ex : Suivi 3 séances" />
            </Field>
            <Field label="Prix formule">
              <div className="relative">
                <input type="number" className="input pr-6" value={fiche.prix} onChange={(e) => set({ prix: e.target.value })} placeholder="0" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#8A8478" }}>€</span>
              </div>
            </Field>
          </div>

          <div className="flex gap-2.5 items-end">
            <Field label="Prix EDC">
              <div className="relative">
                <input type="number" className="input pr-6" value={fiche.prixEdc} onChange={(e) => set({ prixEdc: e.target.value })} placeholder="0" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#8A8478" }}>€</span>
              </div>
            </Field>
            <div className="flex-1 px-3 py-2 rounded-lg" style={{ background: "#F3F5F1" }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#8A8478" }}>Total client</p>
              <p className="text-sm font-semibold" style={{ color: "#1E2A22" }}>
                {((Number(fiche.prix) || 0) + (Number(fiche.prixEdc) || 0)).toFixed(2)} €
              </p>
            </div>
          </div>

          <div className="flex gap-2.5">
            <Field label="Statut">
              <select className="input" value={fiche.statut} onChange={(e) => set({ statut: e.target.value })}>
                {STATUTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Prochain rdv">
              <input type="date" className="input" value={fiche.dateProchainRdv} onChange={(e) => set({ dateProchainRdv: e.target.value })} />
            </Field>
          </div>

          <div className="flex gap-2.5">
            <Field label="Date de prise de contact">
              <input type="date" className="input" value={fiche.datePriseContact} onChange={(e) => set({ datePriseContact: e.target.value })} />
            </Field>
            <Field label="Date de fin d'accompagnement">
              <input type="date" className="input" value={fiche.dateFinAccompagnement} onChange={(e) => set({ dateFinAccompagnement: e.target.value })} />
            </Field>
          </div>

          <div className="flex gap-2.5">
            <Field label="Heure du rdv">
              <input type="time" className="input" value={fiche.heureProchainRdv} onChange={(e) => set({ heureProchainRdv: e.target.value })} />
            </Field>
            <Field label="Durée">
              <select className="input" value={fiche.dureeProchainRdv || 60} onChange={(e) => set({ dureeProchainRdv: Number(e.target.value) })}>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1h</option>
                <option value={90}>1h30</option>
                <option value={120}>2h</option>
                <option value={150}>2h30</option>
              </select>
            </Field>
          </div>

          {isGoogleConfigured() && fiche.dateProchainRdv && (
            <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: "#F3F5F1" }}>
              <Field label="Titre du rendez-vous (Google Agenda)">
                <input className="input" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
              </Field>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddToCalendar}
                  disabled={calState === "loading"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border focus:ring-2 focus:outline-none disabled:opacity-60"
                  style={{ background: "#FFFFFF", color: "#5B6B73", borderColor: "#DEE1D9" }}
                >
                  📅 {calState === "loading" ? "Ajout en cours…" : "Ajouter à Google Agenda"}
                </button>
                {calMessage && (
                  <span className="text-[11px]" style={{ color: calState === "error" ? "#B3432B" : "#2F5233" }}>
                    {calMessage}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2.5">
            <Field label="Date de rappel">
              <input type="date" className="input" value={fiche.dateRappel} onChange={(e) => set({ dateRappel: e.target.value })} />
            </Field>
            <Field label="Priorité">
              <select className="input" value={fiche.priorite || 3} onChange={(e) => set({ priorite: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>{PRIORITY_STYLES[p].label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Note à faire">
            <input className="input" value={fiche.noteRappel} onChange={(e) => set({ noteRappel: e.target.value })} placeholder="Ex : relancer pour le paiement" />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => set({ paye: !fiche.paye })}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border focus:ring-2 focus:outline-none"
              style={fiche.paye ? { background: "#EAF0EA", color: "#2F5233", borderColor: "#2F5233" } : { background: "#F7E7E2", color: "#B3432B", borderColor: "#B3432B" }}
            >
              {fiche.paye ? <Check size={14} /> : <X size={14} />} {fiche.paye ? "Payé" : "Non payé"}
            </button>
            <button
              onClick={() => set({ contratSigne: !fiche.contratSigne })}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border focus:ring-2 focus:outline-none"
              style={fiche.contratSigne ? { background: "#EAF0EA", color: "#2F5233", borderColor: "#2F5233" } : { background: "#F1F0EC", color: "#8A8478", borderColor: "#DEE1D9" }}
            >
              {fiche.contratSigne ? <Check size={14} /> : <X size={14} />} {fiche.contratSigne ? "Contrat signé" : "Contrat non signé"}
            </button>
            <button
              onClick={() => set({ edcPaye: !fiche.edcPaye })}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border focus:ring-2 focus:outline-none"
              style={fiche.edcPaye ? { background: "#EAF0EA", color: "#2F5233", borderColor: "#2F5233" } : { background: "#F5EEDD", color: "#B8863B", borderColor: "#B8863B" }}
            >
              {fiche.edcPaye ? <Check size={14} /> : <X size={14} />} {fiche.edcPaye ? "EDC payé" : "EDC non payé"}
            </button>
            <button
              onClick={() => set({ avisOk: !fiche.avisOk })}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border focus:ring-2 focus:outline-none"
              style={fiche.avisOk ? { background: "#EAF0EA", color: "#2F5233", borderColor: "#2F5233" } : { background: "#F1F0EC", color: "#8A8478", borderColor: "#DEE1D9" }}
            >
              {fiche.avisOk ? <Check size={14} /> : <X size={14} />} {fiche.avisOk ? "Avis OK" : "Avis non OK"}
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between" style={{ borderColor: "#EDEBE4" }}>
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span style={{ color: "#B3432B" }}>Archiver cette fiche ?</span>
                <button onClick={onConfirmDelete} className="font-medium underline" style={{ color: "#B3432B" }}>Oui</button>
                <button onClick={onCancelDelete} style={{ color: "#8A8478" }}>Annuler</button>
              </div>
            ) : (
              <button onClick={onDelete} className="flex items-center gap-1.5 text-xs font-medium focus:ring-2 focus:outline-none" style={{ color: "#B3432B" }}>
                <Trash2 size={14} /> Archiver
              </button>
            )
          ) : <span />}
          <button disabled={!canSave} onClick={() => onSave(fiche)} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 focus:ring-2 focus:outline-none" style={{ background: "#2F5233" }}>
            Enregistrer
          </button>
        </div>
      </div>

      <style>{`
        .input { width: 100%; border: 1px solid #DEE1D9; border-radius: 8px; padding: 7px 10px; font-size: 13px; color: #1E2A22; outline: none; background: #FFFFFF; }
        .input:focus { box-shadow: 0 0 0 2px #2F523333; border-color: #2F5233; }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#8A8478" }}>{label}</span>
      {children}
    </label>
  );
}
