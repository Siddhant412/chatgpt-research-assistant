// web/src/App.tsx
import { useState } from "react";
import { useToolOutput, useWidgetState } from "./bridge";

type Paper = { id: string; title: string; source_url?: string };
type Note = { id: string; paper_id: string; title: string; body: string; created_at: string };
type LibraryPayload = { papers: Paper[]; notesByPaper: Record<string, Note[]> };

export default function App() {
  const data = useToolOutput<LibraryPayload>() ?? { papers: [], notesByPaper: {} };
  const [selectedId, setSelectedId] = useWidgetState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selectedNotes = selectedId ? data.notesByPaper[selectedId] ?? [] : [];

  const addPaper = async (url: string) => {
    await window.openai.callTool("add_paper", { url });
    await window.openai.callTool("render_library", {}); // refresh
  };

  const summarize = async () => {
    const p = data.papers.find(p => p.id === selectedId);
    if (!p) return;
    // Ask ChatGPT (in this same chat) to orchestrate tool calls and save a note
    await window.openai.sendFollowUpMessage({
      prompt:
        `Summarize the paper "${p.title}" (paperId=${p.id}). ` +
        `If needed, call "index_paper" then call "get_paper_chunk" per section to read it. ` +
        `Write a crisp summary (250–400 words) with 5 bullets of key findings and 3 limitations. ` +
        `Finally, call "save_note" with { paperId: "${p.id}", title: "${p.title}", summary: <your text> }.`
    });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 16 }}>
      <section>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Research Papers</h3>
          <button onClick={() => setAdding(true)}>+ Add</button>
        </header>
        <ul>
          {data.papers.map(p => (
            <li key={p.id} style={{ margin: "8px 0" }}>
              <button onClick={() => setSelectedId(p.id)} style={{ fontWeight: selectedId === p.id ? 700 : 400 }}>
                {p.title}
              </button>
            </li>
          ))}
        </ul>
        {adding && (
          <form style={{ marginTop: 8 }}
            onSubmit={async (e) => { e.preventDefault(); const url = (e.currentTarget.elements.namedItem("url") as HTMLInputElement).value; await addPaper(url); setAdding(false); }}>
            <input name="url" placeholder="Paste DOI, arXiv link/ID, landing page, or .pdf" style={{ width: "100%" }} />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button type="submit">Download</button>
              <button type="button" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Notes {selectedId ? `for "${data.papers.find(p => p.id === selectedId)?.title}"` : ""}</h3>
          <button onClick={summarize} disabled={!selectedId}>Summarize this paper</button>
        </header>
        <ul>
          {selectedNotes.map(n => (
            <li key={n.id} style={{ margin: "12px 0" }}>
              <div style={{ fontWeight: 700 }}>{n.title}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{new Date(n.created_at).toLocaleString()}</div>
              <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
            </li>
          ))}
          {selectedId && selectedNotes.length === 0 && <p>No notes yet.</p>}
        </ul>
      </section>
    </div>
  );
}
