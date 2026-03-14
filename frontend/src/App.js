import { useState, useCallback } from "react";

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
        const type = getFamilyType(f);
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
        <a
          href={`https://quickgo.ebi.ac.uk/term/${item.go_id}`}
          target="_blank" rel="noreferrer"
          style={{ color: "#185FA5", whiteSpace: "nowrap", fontWeight: 500 }}
        >
          {item.go_id}
        </a>
      )}
      <span style={{ color: "var(--color-text-secondary)" }}>
        {item.description}
        {item.evidence && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>[{item.evidence}]</span>}
      </span>
    </div>
  );
}

function ProteinPanel({ accession, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [goOpen, setGoOpen] = useState({ function: false, process: false, component: false });

  useState(() => {
    fetch(`${API}/protein/${accession}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [accession]);

  return (
    <div style={{
      border: "0.5px solid var(--color-border-secondary)",
      borderRadius: 10, background: "var(--color-background-secondary)",
      padding: "12px 16px", marginTop: 4,
    }}>
      {loading && <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "8px 0" }}>NCBI'dan yükleniyor...</div>}
      {err && <div style={{ fontSize: 13, color: "var(--color-text-danger)" }}>Hata: {err}</div>}
      {data && !data.error && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{data.product || accession}</div>
              {data.organism && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{data.organism}</div>}
            </div>
            <button onClick={onClose} style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, marginBottom: 8, color: "var(--color-text-secondary)" }}>
            {data.gene      && <span><b>Gene:</b> {data.gene}</span>}
            {data.locus_tag && <span><b>Locus:</b> {data.locus_tag}</span>}
            {data.ec_number && <span><b>EC:</b> {data.ec_number}</span>}
            {data.length    && <span><b>Uzunluk:</b> {data.length}</span>}
          </div>

          <a href={data.ncbi_url} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: "#185FA5", display: "block", marginBottom: 10 }}>
            NCBI'da görüntüle → {accession}
          </a>

          {/* GO bölümleri */}
          {[
            { key: "function",  label: "GO Function",   items: data.go_function   },
            { key: "process",   label: "GO Process",    items: data.go_process    },
            { key: "component", label: "GO Component",  items: data.go_component  },
          ].map(({ key, label, items }) => items && items.length > 0 && (
            <div key={key} style={{ marginBottom: 6 }}>
              <button onClick={() => setGoOpen(p => ({ ...p, [key]: !p[key] }))} style={{
                background: "none", border: "none", padding: "4px 0", cursor: "pointer",
                fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 10, transform: goOpen[key] ? "rotate(90deg)" : "none", display: "inline-block", transition: "0.15s" }}>▶</span>
                {label} <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>({items.length})</span>
              </button>
              {goOpen[key] && (
                <div style={{ paddingLeft: 16, borderLeft: "2px solid var(--color-border-tertiary)" }}>
                  {items.map((item, i) => <GoItem key={i} item={item} />)}
                </div>
              )}
            </div>
          ))}

          {data.go_function?.length === 0 && data.go_process?.length === 0 && data.go_component?.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>GO annotation bulunamadı.</div>
          )}
        </>
      )}
      {data?.error && <div style={{ fontSize: 13, color: "var(--color-text-danger)" }}>{data.error}</div>}
    </div>
  );
}

function OrganismCard({ org }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeProtein, setActiveProtein] = useState(null);

  function toggleOpen() {
    if (!open && !detail) {
      setLoading(true);
      fetch(`${API}/organism/${org.id}`)
        .then(r => r.json())
        .then(d => { setDetail(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
    setOpen(p => !p);
  }

  // Proteinleri family type'a göre grupla
  const groups = {};
  if (detail?.proteins) {
    detail.proteins.forEach(p => {
      const fams = p.family.split(",").map(f => f.trim());
      const type = getFamilyType(fams[0]);
      if (!groups[type]) groups[type] = [];
      groups[type].push(p);
    });
  }

  const familyOrder = ["GH", "GT", "PL", "CE", "CBM", "AA"];

  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 12, marginBottom: 8, overflow: "hidden",
    }}>
      {/* Header */}
      <div onClick={toggleOpen} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", cursor: "pointer",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
        onMouseLeave={e => e.currentTarget.style.background = ""}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{org.name}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
            {detail ? `${detail.protein_count} protein` : "Detay için tıkla"}
          </div>
        </div>
        <span style={{
          fontSize: 11, color: "var(--color-text-tertiary)",
          transform: open ? "rotate(180deg)" : "none",
          transition: "0.2s", display: "inline-block",
        }}>▼</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "12px 16px" }}>
          {loading && <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Yükleniyor...</div>}
          {detail && (
            <>
              <div style={{ marginBottom: 10 }}>
                <a href={org.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: "#185FA5" }}>CAZy'de görüntüle →</a>
              </div>

              {familyOrder.map(type => {
                if (!groups[type]?.length) return null;
                const color = FAMILY_COLORS[type];
                return (
                  <div key={type} style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 500, letterSpacing: "0.05em",
                      color: color.text, background: color.bg,
                      padding: "3px 8px", borderRadius: 4, display: "inline-block", marginBottom: 6,
                    }}>
                      {color.label}
                    </div>

                    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, overflow: "hidden" }}>
                      {groups[type].map((p, i) => (
                        <div key={i}>
                          <div
                            onClick={() => setActiveProtein(activeProtein === p.accession ? null : p.accession)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px", cursor: "pointer",
                              borderBottom: i < groups[type].length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                              background: activeProtein === p.accession ? "var(--color-background-secondary)" : "",
                            }}
                          >
                            <span style={{ flex: 1, fontSize: 13, color: "var(--color-text-primary)" }}>{p.name}</span>
                            <FamilyBadge family={p.family} />
                            <span style={{ fontSize: 12, color: "#185FA5", minWidth: 90, textAlign: "right" }}>{p.accession}</span>
                            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", transform: activeProtein === p.accession ? "rotate(180deg)" : "none", display: "inline-block" }}>▼</span>
                          </div>
                          {activeProtein === p.accession && (
                            <div style={{ padding: "0 12px 8px" }}>
                              <ProteinPanel accession={p.accession} onClose={() => setActiveProtein(null)} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 20, padding: "1px 8px" }}>
            Bacteria · v1.0
          </span>
        </div>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
          CAZy veritabanındaki tüm bakterilerde organizma ara, family tablosunu ve NCBI protein detaylarını gör.
        </p>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
          placeholder="Organizma adı girin (örn: Halomonas, Bacillus, Pseudomonas...)"
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
            border: "none", fontSize: 14, fontWeight: 500 }}
        >
          {loading ? "Aranıyor..." : "Ara"}
        </button>
      </div>

      {/* Hint chips */}
      {!results && !loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "2rem" }}>
          {["Halomonas", "Bacillus", "Pseudomonas", "Streptomyces", "Clostridium", "Lactobacillus"].map(s => (
            <button key={s} onClick={() => { setQuery(s); setTimeout(doSearch, 0); }}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
                background: "var(--color-background-secondary)", color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-tertiary)" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: "var(--color-background-danger)", color: "var(--color-text-danger)",
          borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            <b>{results.count}</b> organizma bulundu
            {results.count > 50 && <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>(ilk 50 gösteriliyor)</span>}
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
