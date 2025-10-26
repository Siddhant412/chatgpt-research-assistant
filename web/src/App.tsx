import * as React from "react";

const RA_THEME = `
:root{
  --ra-bg:#0b0f14;
  --ra-panel:#11161d;
  --ra-card:#131a23;
  --ra-border:rgba(255,255,255,0.10);
  --ra-elev:rgba(0,0,0,0.30);
  --ra-text:#e9edf3;
  --ra-heading:#ffffff;
  --ra-muted:#aab4c2;
  --ra-accent:#7aa2ff;
  --ra-success:#5fe1a5;
  --ra-danger:#ff6b6b;
  --ra-focus:#b3d3ff;
}
html, body { background: transparent; }
.ra-root{ font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial; color:var(--ra-text); }
.ra-grid{ display:grid; grid-template-columns: 360px 1fr; gap:16px; }
.ra-root h1,.ra-root h2,.ra-root h3{ color:var(--ra-heading); letter-spacing:.2px; margin:0 0 6px; }
.ra-muted{ color:var(--ra-muted); }
.ra-title{ font-weight:700; font-size:22px; }

/* Cards */
.ra-card{ background:var(--ra-card); border:1px solid var(--ra-border); border-radius:16px; box-shadow:0 4px 18px var(--ra-elev); padding:16px; }
.ra-card.section{ padding:18px; }
.ra-card + .ra-card{ margin-top:12px; }

/* List (papers) */
.ra-list{ margin:0; padding:0; list-style:none; }
.ra-list-item{ padding:10px 12px; margin:6px 0; border:1px solid var(--ra-border); border-radius:12px; background:rgba(255,255,255,0.02); cursor:pointer; transition:background .15s ease, border-color .15s ease, transform .04s ease; }
.ra-list-item:hover{ background:rgba(255,255,255,0.05); }
.ra-list-item.active{ background:linear-gradient(180deg, rgba(122,162,255,.20), rgba(122,162,255,.06)); border-color:rgba(122,162,255,.5); transform: translateY(-1px); }
.ra-list-item .title{ color:var(--ra-heading); font-weight:600; }

/* Buttons */
.ra-btn{ appearance:none; border:1px solid var(--ra-border); background:rgba(255,255,255,.04); color:var(--ra-heading); border-radius:12px; padding:8px 12px; font-weight:600; cursor:pointer; transition: transform .04s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease; }
.ra-btn:hover{ background:rgba(255,255,255,.07); }
.ra-btn:active{ transform: translateY(1px); }
.ra-btn:focus-visible{ outline:none; box-shadow:0 0 0 3px var(--ra-focus); border-color:var(--ra-focus); }
.ra-btn[disabled]{ opacity:.55; cursor:not-allowed; }
.ra-btn-primary{ background: linear-gradient(180deg, rgba(122,162,255,.35), rgba(122,162,255,.18)); border-color: rgba(122,162,255,.6); }
.ra-btn-primary:hover{ background: linear-gradient(180deg, rgba(122,162,255,.45), rgba(122,162,255,.22)); }
.ra-btn-outline{ background: transparent; border-color: var(--ra-border); }
.ra-btn-success{ background: linear-gradient(180deg, rgba(95,225,165,.35), rgba(95,225,165,.18)); border-color: rgba(95,225,165,.55); }
.ra-btn-danger{ background: linear-gradient(180deg, rgba(255,107,107,.35), rgba(255,107,107,.18)); border-color: rgba(255,107,107,.55); }
.ra-btn-danger:hover{ background: linear-gradient(180deg, rgba(255,107,107,.45), rgba(255,107,107,.22)); }

/* Header bar (each column) */
.ra-bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }

/* Inline add form */
.ra-add{ display:flex; gap:8px; margin-top:10px; }
.ra-input{
  flex:1 1 auto;
  padding:10px 12px;
  border-radius:10px;
  border:1px solid var(--ra-border);
  background:rgba(255,255,255,.03);
  color:var(--ra-text);
}
.ra-input::placeholder{ color:var(--ra-muted); }

/* Notes */
.ra-note-title{ font-weight:700; margin:10px 0 6px; }
.ra-note-time{ font-size:12px; color:var(--ra-muted); margin-bottom:8px; }
.ra-note-body p{ margin:8px 0; }
.ra-note-body ul{ margin:8px 0 8px 18px; }
.ra-note-body li{ margin: 4px 0; }

/* Scroll areas */
.ra-scroll{ max-height: 520px; overflow:auto; scrollbar-width: thin; }
.ra-scroll::-webkit-scrollbar { height: 6px; width: 8px; }
.ra-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 8px; }
`;

type PaperRow = { id: string; title: string };
type NoteRow = { id: string; paper_id: string; title: string; body: string; created_at: string };
type SC = { papers: PaperRow[]; notesByPaper: Record<string, NoteRow[]> };
function isSC(x: any): x is SC {
  return !!x && typeof x === "object" && Array.isArray(x.papers) && typeof x.notesByPaper === "object";
}

function useResearchAppTheme() {
  React.useEffect(() => {
    const host = document.getElementById("root") as HTMLElement | null;
    const target: ShadowRoot | HTMLElement | null = (host && (host as any).shadowRoot) || document.head;
    if (!target) return;
    const getById = (n: string) => ("getElementById" in target ? (target as any).getElementById(n) : document.getElementById(n));
    if (getById("ra-theme")) return;
    const style = document.createElement("style");
    (style as any).id = "ra-theme";
    style.textContent = RA_THEME;
    (target as any).appendChild(style);
  }, []);
}

declare global { interface Window { openai: any; } }

/** APP */
export default function App() {
  useResearchAppTheme();

  const [data, setData] = React.useState<SC>({ papers: [], notesByPaper: {} });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [addMode, setAddMode] = React.useState(false);
  const [addUrl, setAddUrl] = React.useState("");


  const fetchAndSetLibrary = React.useCallback(async () => {
    try {
      const out = await window.openai?.callTool?.("render_library", {});
      const sc = out?.structuredContent ?? out;
      if (isSC(sc)) {
        setData(sc);
        if (!selectedId && sc.papers.length) setSelectedId(sc.papers[0].id);
        else if (selectedId && !sc.papers.some((p: PaperRow) => p.id === selectedId)) {
          setSelectedId(sc.papers[0]?.id ?? null);
        }
      }
    } catch (e) {
      console.error("render_library failed:", e);
    }
  }, [selectedId]);


  React.useEffect(() => {
    const immediate =
      window.openai?.structuredContent ||
      (window as any).__OPENAI_INITIAL_STRUCTURED_CONTENT__;
    if (isSC(immediate)) {
      setData(immediate);
      if (!selectedId && immediate.papers.length) setSelectedId(immediate.papers[0].id);
    }
    fetchAndSetLibrary();
    const off =
      window.openai?.onStructuredContent?.((sc: any) => {
        if (isSC(sc)) {
          setData(sc);
          if (!selectedId && sc.papers.length) setSelectedId(sc.papers[0].id);
          else if (selectedId && !sc.papers.some((p: PaperRow) => p.id === selectedId)) {
            setSelectedId(sc.papers[0]?.id ?? null);
          }
        }
      }) ?? undefined;
    return () => { try { off?.(); } catch {} };
  }, [fetchAndSetLibrary, selectedId]);

  const currentPaper = React.useMemo(
    () => data.papers.find(p => p.id === selectedId) || null,
    [data.papers, selectedId]
  );
  const notes = currentPaper ? (data.notesByPaper[currentPaper.id] || []) : [];

  // UI triggered tool calls
  const refresh = fetchAndSetLibrary;

  const onAddClick = () => {
    setAddMode(v => !v);
    setAddUrl("");
  };

  const onAddSubmit = async () => {
    const url = addUrl.trim();
    if (!url) return;
    try {
      await window.openai?.callTool?.("add_paper", { url });
      await fetchAndSetLibrary();
    } catch (e) {
      console.error("add_paper failed:", e);
    }
    setAddUrl("");
    setAddMode(false);
  };

  const onDelete = async () => {
    if (!selectedId) return;
    try {
      await window.openai?.callTool?.("delete_paper", { paperId: selectedId });
      setSelectedId(null);
      await fetchAndSetLibrary();
    } catch (e) {
      console.error("delete_paper failed:", e);
    }
  };

  const summarize = async () => {
    const p = currentPaper;
    if (!p) return;
    await window.openai.sendFollowUpMessage({
      prompt: `
  You are connected to a Research Notes App with tools: render_library, add_paper, index_paper, get_paper_chunk, save_note.
  IMPORTANT:
  - Always use the paper's DATABASE id for "paperId"; DO NOT use DOI/URL as paperId.
  - If not indexed, call: index_paper { "paperId": "${p.id}" }.
  - To read: call get_paper_chunk per section you need.
  Write a crisp 250-400 word summary with 5 key bullets and 3 limitations.
  Then save it:
    save_note { "paperId": "${p.id}", "title": ${JSON.stringify(p.title)}, "summary": "<your text>" }
  (Do not call render_library; save_note already refreshes the UI.)
  `
    });
  };

  return (
    <div className="ra-root">
      <div className="ra-grid">
        {/* LEFT: Papers */}
        <div className="ra-card section">
          <div className="ra-bar">
            <h2 className="ra-title">Research Papers</h2>
            <div style={{display:"flex", gap:8}}>
              <button className="ra-btn ra-btn-outline" onClick={refresh} title="Refresh list">Refresh</button>
              <button className="ra-btn ra-btn-danger" disabled={!selectedId} onClick={onDelete}>Delete</button>
              <button className="ra-btn ra-btn-primary" onClick={onAddClick}>{addMode ? "Close" : "Add"}</button>
            </div>
          </div>

          {addMode && (
            <div className="ra-add">
              <input
                className="ra-input"
                placeholder="Paste DOI, landing page, or direct .pdf"
                value={addUrl}
                onChange={e => setAddUrl(e.target.value)}
              />
              <button className="ra-btn ra-btn-success" onClick={onAddSubmit}>Add</button>
            </div>
          )}

          <div className="ra-scroll" style={{marginTop: addMode ? 8 : 0}}>
            <ul className="ra-list">
              {data.papers.length === 0 && (
                <li className="ra-muted">No papers yet. Click “+ Add”.</li>
              )}
              {data.papers.map(p => (
                <li
                  key={p.id}
                  className={`ra-list-item ${selectedId === p.id ? "active" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                  title={p.title}
                >
                  <div className="title">{p.title}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* RIGHT: Notes */}
        <div className="ra-card section">
          <div className="ra-bar">
            <h2 className="ra-title">Notes</h2>
            <div style={{display:"flex", gap:8}}>
              <button className="ra-btn ra-btn-outline" onClick={refresh}>Refresh</button>
              <button
                className="ra-btn ra-btn-primary"
                disabled={!currentPaper}
                onClick={summarize}
              >
                Summarize this paper
              </button>
            </div>
          </div>

          {!currentPaper && <div className="ra-muted">Select a paper to see notes.</div>}

          {currentPaper && (
            <div className="ra-scroll">
              {notes.length === 0 ? (
                <div className="ra-card" style={{background:"rgba(255,255,255,.02)"}}>
                  <div className="ra-muted">No notes yet for this paper.</div>
                </div>
              ) : (
                notes.map(n => (
                  <div className="ra-card" key={n.id}>
                    <div className="ra-note-title">{n.title || "Note"}</div>
                    <div className="ra-note-time">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                    </div>
                    <div className="ra-note-body">
                      {renderMarkdownLite(n.body)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderMarkdownLite(md: string) {
  const safe = typeof md === "string" ? md : "";
  let html = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n{2,}/g, "\n\n");
  const blocks = html.split(/\n\s*\n/);
  const nodes = blocks.map((blk, i) => {
    const lines = blk.split("\n");
    const isList = lines.every(l => /^(\u2022|-)\s+/.test(l.trim()));
    if (isList) {
      return (
        <ul key={i}>
          {lines.map((l, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: l.replace(/^(\u2022|-)\s+/, "") }} />
          ))}
        </ul>
      );
    }
    return <p key={i} dangerouslySetInnerHTML={{ __html: blk }} />;
  });
  return <>{nodes}</>;
}
