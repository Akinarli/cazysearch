import { useState, useCallback, useRef, useEffect } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5052";

const FAMILY_COLORS = {
  GH:  { bg: "#E6F1FB", text: "#185FA5", label: "Glycoside Hydrolase" },
  GT:  { bg: "#EAF3DE", text: "#3B6D11", label: "GlycosylTransferase" },
  PL:  { bg: "#FAEEDA", text: "#854F0B", label: "Polysaccharide Lyase" },
  CE:  { bg: "#FBEAF0", text: "#993556", label: "Carbohydrate Esterase" },
  CBM: { bg: "#EEEDFE", text: "#534AB7", label: "Carbohydrate-Binding Module" },
  AA:  { bg: "#F1EFE8", text: "#5F5E5A", label: "Auxiliary Activity" },
};

function getFamilyType(family) {
  if (!family) return "GH";
  const f = family.toUpperCase();
  if (f.startsWith("CBM")) return "CBM";
  if (f.startsWith("GH"))  return "GH";
  if (f.startsWith("GT"))  return "GT";
  if (f.startsWith("PL"))  return "PL";
  if (f.startsWith("CE"))  return "CE";
  if (f.startsWith("AA"))  return "AA";
  return "GH";
}

function FamilyBadge({ family }) {
  const fams = family.split(",").map(f => f.trim()).filter(Boolean);
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {fams.map((f, i) => {
        const type  = getFamilyType(f);
        const color = FAMILY_COLORS[type] || FAMILY_COLORS.GH;
        return (
          <span key={i} style={{
            background: color.bg, color: color.text,
            fontSize: 11, padding: "2px 7px", borderRadius: 4,
            fontWeight: 500, whiteSpace: "nowrap",
          }}>{f}</span>
        );
      })}
    </span>
  );
}

function GoItem({ item }) {
  return (
    <div style={{ fontSize: 12, padding: "4px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
      {item.go_id && (
        <a href={`https://quickgo.ebi.ac.uk/term/${item.go_id}`}
          target="_blank" rel="noreferrer"
          style={{ color: "#185FA5", whiteSpace: "nowrap", fontWeight: 500 }}>
          {item.go_id}
        </a>
      )}
      <span style={{ color: "var(--color-text-secondary)" }}>
        {item.description}
        {item.evidence && (
          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>
            [{item.evidence}]
          </span>
        )}
      </span>
    </div>
  );
}

// ── Protein satır kartı ──────────────────────────────────────────────────────
function ProteinRow({ protein, isLast }) {
  const [open, setOpen] = useState(false);
  const hasGo = (
    (protein.go_function?.length  > 0) ||
    (protein.go_process?.length   > 0) ||
    (protein.go_component?.length > 0)
  );
  const [goOpen, setGoOpen] = useState({ function: false, process: false, component: false });

  const displayName = protein.product
    ? (protein.organism ? `${protein.product} [${protein.organism}]` : protein.product)
    : protein.cazy_name || protein.accession;

  return (
    <div>
      <div
        onClick={() => setOpen(p => !p)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 12px", cursor: "pointer",
          borderBottom: (!open && !isLast) ? "0.5px solid var(--color-border-tertiary)" : "none",
          background: open ? "var(--color-background-secondary)" : "",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--color-background-secondary)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = ""; }}
      >
        <span style={{ flex: 1, fontSize: 13, color: "var(--color-text-primary)" }}>
          {displayName}
          {protein.loading && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
              yükleniyor…
            </span>
          )}
        </span>
        <FamilyBadge family={protein.family} />
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", minWidth: 90, textAlign: "right" }}>
          {protein.accession}
        </span>
        <span style={{
          fontSize: 10, color: "var(--color-text-tertiary)",
          transform: open ? "rotate(180deg)" : "none",
          display: "inline-block", transition: "0.15s",
        }}>▼</span>
      </div>

      {open && (
        <div style={{
          borderBottom: !isLast ? "0.5px solid var(--color-border-tertiary)" : "none",
          padding: "10px 16px 12px",
          background: "var(--color-background-secondary)",
        }}>
          {protein.loading ? (
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>NCBI'dan yükleniyor…</div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12,
                color: "var(--color-text-secondary)", marginBottom: 8 }}>
                {protein.gene       && <span><b>Gene:</b> {protein.gene}</span>}
                {protein.locus_tag  && <span><b>Locus:</b> {protein.locus_tag}</span>}
                {protein.ec_number  && <span><b>EC:</b> {protein.ec_number}</span>}
                {protein.length     && <span><b>Uzunluk:</b> {protein.length}</span>}
                <a href={protein.ncbi_url} target="_blank" rel="noreferrer"
                  style={{ color: "#185FA5", textDecoration: "none" }}>
                  NCBI ↗
                </a>
              </div>

              {[
                { key: "function",  label: "GO Function",  items: protein.go_function  },
                { key: "process",   label: "GO Process",   items: protein.go_process   },
                { key: "component", label: "GO Component", items: protein.go_component },
              ].map(({ key, label, items }) => items?.length > 0 && (
                <div key={key} style={{ marginBottom: 4 }}>
                  <button
                    onClick={e => { e.stopPropagation(); setGoOpen(p => ({ ...p, [key]: !p[key] })); }}
                    style={{ background: "none", border: "none", padding: "3px 0", cursor: "pointer",
                      fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)",
                      display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, transform: goOpen[key] ? "rotate(90deg)" : "none",
                      display: "inline-block", transition: "0.15s" }}>▶</span>
                    {label}
                    <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>
                      ({items.length})
                    </span>
                  </button>
                  {goOpen[key] && (
                    <div style={{ paddingLeft: 16, borderLeft: "2px solid var(--color-border-tertiary)" }}>
                      {items.map((item, i) => <GoItem key={i} item={item} />)}
                    </div>
                  )}
                </div>
              ))}

              {!hasGo && (
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                  GO annotation bulunamadı.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Organizma kartı — SSE ile tarar ─────────────────────────────────────────
function OrganismCard({ org }) {
  const [open,     setOpen]     = useState(false);
  const [proteins, setProteins] = useState([]);   // { accession, family, cazy_name, loading, ...ncbi }
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [orgName,  setOrgName]  = useState(org.name);
  const esRef = useRef(null);

  // Kart açılınca SSE başlat
  function handleOpen() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (proteins.length > 0) return;  // zaten tarandı

    setScanning(true);
    setProteins([]);
    setProgress({ done: 0, total: 0 });

    const es = new EventSource(`${API}/scan/${org.id}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.error) {
        setScanning(false);
        es.close();
        return;
      }

      // İlk meta mesajı
      if (msg.started) {
        setProgress({ done: 0, total: msg.total });
        return;
      }

      // Bitti
      if (msg.done) {
        setScanning(false);
        setProgress(p => ({ ...p, done: p.total }));
        es.close();
        return;
      }

      // Normal protein verisi
      setProgress(p => ({ done: (msg.index ?? p.done) + 1, total: msg.total ?? p.total }));
      setProteins(prev => {
        // accession zaten varsa güncelle (loading placeholder → gerçek veri)
        const idx = prev.findIndex(p => p.accession === msg.accession);
        const entry = { ...msg, loading: false };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
    };

    es.onerror = () => {
      setScanning(false);
      es.close();
    };
  }

  // Kart kapanınca SSE kapat
  useEffect(() => {
    if (!open && esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, [open]);

  // Family'ye göre grupla
  const groups = {};
  proteins.forEach(p => {
    const fams = p.family.split(",").map(f => f.trim());
    const type = getFamilyType(fams[0]);
    if (!groups[type]) groups[type] = [];
    groups[type].push(p);
  });
  const familyOrder = ["GH", "GT", "PL", "CE", "CBM", "AA"];

  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 12, marginBottom: 8, overflow: "hidden",
    }}>
      {/* Header */}
      <div onClick={handleOpen} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", cursor: "pointer",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
        onMouseLeave={e => e.currentTarget.style.background = ""}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
            {orgName}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
            {scanning
              ? `${progress.done} / ${progress.total || "?"} protein tarandı…`
              : proteins.length > 0
                ? `${proteins.length} protein`
                : "Detay için tıkla"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {scanning && (
            <div style={{
              width: 80, height: 4, borderRadius: 2,
              background: "var(--color-border-tertiary)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 2, background: "#185FA5",
                width: progress.total
                  ? `${Math.round((progress.done / progress.total) * 100)}%`
                  : "10%",
                transition: "width 0.3s",
              }} />
            </div>
          )}
          <span style={{
            fontSize: 11, color: "var(--color-text-tertiary)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "0.2s", display: "inline-block",
          }}>▼</span>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "12px 16px" }}>
          <div style={{ marginBottom: 10 }}>
            <a href={org.url} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: "#185FA5" }}>
              CAZy'de görüntüle →
            </a>
          </div>

          {familyOrder.map(type => {
            if (!groups[type]?.length) return null;
            const color = FAMILY_COLORS[type];
            return (
              <div key={type} style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: "0.05em",
                  color: color.text, background: color.bg,
                  padding: "3px 8px", borderRadius: 4,
                  display: "inline-block", marginBottom: 6,
                }}>
                  {color.label}
                </div>
                <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, overflow: "hidden" }}>
                  {groups[type].map((p, i) => (
                    <ProteinRow
                      key={p.accession}
                      protein={p}
                      isLast={i === groups[type].length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {scanning && proteins.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "8px 0" }}>
              Proteinler yükleniyor…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ana uygulama ─────────────────────────────────────────────────────────────
export default function App() {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const doSearch = useCallback(async () => {
    if (query.trim().length < 2) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(query.trim())}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setResults(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1rem", fontFamily: "var(--font-sans, system-ui)" }}>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>
            CAZy<span style={{ color: "#185FA5" }}>Search</span>
          </h1>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)",
            border: "0.5px solid var(--color-border-tertiary)", borderRadius: 20, padding: "1px 8px" }}>
            Bacteria · v2.0
          </span>
        </div>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
          CAZy veritabanındaki tüm bakterilerde organizma ara — proteinler NCBI'dan sırayla çekilir, GO annotation ile gösterilir.
        </p>
      </div>

      {/* Arama kutusu */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
          placeholder="Organizma adı girin (örn: Halomonas, Bacillus, Pseudomonas…)"
          style={{ flex: 1, fontSize: 14, padding: "8px 12px", borderRadius: 8,
            border: "0.5px solid var(--color-border-secondary)", outline: "none",
            background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
        />
        <button
          onClick={doSearch}
          disabled={loading || query.trim().length < 2}
          style={{ padding: "8px 20px", borderRadius: 8, cursor: "pointer",
            background: loading ? "var(--color-background-secondary)" : "#185FA5",
            color: loading ? "var(--color-text-secondary)" : "#fff",
            border: "none", fontSize: 14, fontWeight: 500 }}>
          {loading ? "Aranıyor…" : "Ara"}
        </button>
      </div>

      {/* Hint chips */}
      {!results && !loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "2rem" }}>
          {["Halomonas", "Bacillus", "Pseudomonas", "Streptomyces", "Clostridium", "Lactobacillus"].map(s => (
            <button key={s}
              onClick={() => { setQuery(s); setTimeout(doSearch, 0); }}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
                background: "var(--color-background-secondary)", color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-tertiary)" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Hata */}
      {error && (
        <div style={{ background: "var(--color-background-danger)", color: "var(--color-text-danger)",
          borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Sonuçlar */}
      {results && (
        <>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            <b>{results.count}</b> organizma bulundu
            {results.count > 50 && (
              <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>(ilk 50 gösteriliyor)</span>
            )}
          </div>
          {results.results.slice(0, 50).map(org => (
            <OrganismCard key={org.id} org={org} />
          ))}
          {results.count === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-tertiary)", fontSize: 14 }}>
              "{results.query}" için sonuç bulunamadı.
            </div>
          )}
        </>
      )}
    </div>
  );
}
