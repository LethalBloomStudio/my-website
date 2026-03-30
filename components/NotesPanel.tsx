"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Note = {
  id: string;
  content: string;
  manuscript_id: string | null;
  created_at: string;
  updated_at: string;
};

type Manuscript = { id: string; title: string };

export default function NotesPanel({
  /** If provided, only notes for this manuscript are shown and new notes default to it */
  defaultManuscriptId,
  /** Pass user's manuscripts so the project selector is populated */
  manuscripts,
}: {
  defaultManuscriptId?: string;
  manuscripts?: Manuscript[];
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [newManuscriptId, setNewManuscriptId] = useState<string>(defaultManuscriptId ?? "");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editManuscriptId, setEditManuscriptId] = useState<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notes
  useEffect(() => {
    async function load() {
      setLoading(true);
      const url = defaultManuscriptId
        ? `/api/notes?manuscript_id=${encodeURIComponent(defaultManuscriptId)}`
        : "/api/notes";
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { notes: Note[] };
        setNotes(data.notes ?? []);
      }
      setLoading(false);
    }
    void load();
  }, [defaultManuscriptId]);

  // Auto-save edited note (debounced 800ms)
  const scheduleSave = useCallback((id: string, content: string, manuscriptId: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, manuscript_id: manuscriptId || null }),
      });
      if (res.ok) {
        const data = (await res.json()) as { note: Note };
        setNotes((prev) => prev.map((n) => (n.id === id ? data.note : n)));
      }
    }, 800);
  }, []);

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditManuscriptId(note.manuscript_id ?? "");
  }

  function onEditChange(content: string, manuscriptId: string) {
    setEditContent(content);
    setEditManuscriptId(manuscriptId);
    if (editingId) scheduleSave(editingId, content, manuscriptId);
  }

  async function addNote() {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setSaving(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed, manuscript_id: newManuscriptId || null }),
    });
    if (res.ok) {
      const data = (await res.json()) as { note: Note };
      setNotes((prev) => [data.note, ...prev]);
      setNewContent("");
      if (!defaultManuscriptId) setNewManuscriptId("");
    }
    setSaving(false);
  }

  async function deleteNote(id: string) {
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (res.ok) setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function manuscriptTitle(id: string | null) {
    if (!id || !manuscripts) return null;
    return manuscripts.find((m) => m.id === id)?.title ?? null;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Notes</p>

      {/* New note form */}
      <div className="space-y-2">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addNote();
          }}
          placeholder="Jot down an idea…"
          rows={3}
          className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/50 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.8)] focus:outline-none"
        />
        {/* Project selector */}
        {manuscripts && manuscripts.length > 0 && !defaultManuscriptId && (
          <select
            value={newManuscriptId}
            onChange={(e) => setNewManuscriptId(e.target.value)}
            className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/50 px-3 py-1.5 text-xs text-neutral-300 focus:outline-none"
          >
            <option value="">No project</option>
            {manuscripts.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => void addNote()}
          disabled={saving || !newContent.trim()}
          className="h-8 w-full rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.14)] text-xs font-medium text-neutral-200 transition hover:bg-[rgba(120,120,120,0.24)] disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add Note"}
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-neutral-800/40 animate-pulse" />)}
          </div>
        ) : notes.length === 0 ? (
          <p className="text-xs text-neutral-600">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="group rounded-lg border border-[rgba(120,120,120,0.25)] bg-neutral-900/40 p-3"
            >
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => onEditChange(e.target.value, editManuscriptId)}
                    rows={3}
                    autoFocus
                    className="w-full resize-none rounded border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none"
                  />
                  {manuscripts && manuscripts.length > 0 && !defaultManuscriptId && (
                    <select
                      value={editManuscriptId}
                      onChange={(e) => onEditChange(editContent, e.target.value)}
                      className="w-full rounded border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-2 py-1 text-xs text-neutral-300 focus:outline-none"
                    >
                      <option value="">No project</option>
                      {manuscripts.map((m) => (
                        <option key={m.id} value={m.id}>{m.title}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-300"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <p
                    onClick={() => startEdit(note)}
                    className="cursor-text whitespace-pre-wrap text-xs leading-relaxed text-neutral-300"
                  >
                    {note.content}
                  </p>
                  {manuscriptTitle(note.manuscript_id) && (
                    <p className="mt-1.5 text-[10px] text-neutral-600">
                      📖 {manuscriptTitle(note.manuscript_id)}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-700">
                      {new Date(note.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <button
                      onClick={() => void deleteNote(note.id)}
                      className="text-[10px] text-neutral-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
