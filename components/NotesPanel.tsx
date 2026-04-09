"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Note = {
  id: string;
  content: string;
  manuscript_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type Manuscript = { id: string; title: string };

export default function NotesPanel({
  defaultManuscriptId,
  manuscripts,
}: {
  defaultManuscriptId?: string;
  manuscripts?: Manuscript[];
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");
  const [newManuscriptId, setNewManuscriptId] = useState<string>(defaultManuscriptId ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editManuscriptId, setEditManuscriptId] = useState<string>("");
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const [filter, setFilter] = useState<"unresolved" | "resolved" | "all">("unresolved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = defaultManuscriptId
        ? `/api/notes?manuscript_id=${encodeURIComponent(defaultManuscriptId)}`
        : "/api/notes";
      const res = await fetch(url);
      const data = (await res.json()) as { notes?: Note[]; error?: string };
      if (!res.ok) setError(data.error ?? "Failed to load notes.");
      else setNotes(data.notes ?? []);
    } catch {
      setError("Could not connect. Check your connection.");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [defaultManuscriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback((id: string, content: string, msId: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setAutoSaveLabel("Saving…");
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/notes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, manuscript_id: msId || null }),
        });
        const data = (await res.json()) as { note?: Note; error?: string };
        if (res.ok && data.note) {
          setNotes((prev) => prev.map((n) => (n.id === id ? data.note! : n)));
          setAutoSaveLabel("Saved");
          setTimeout(() => setAutoSaveLabel(null), 1500);
        } else {
          setAutoSaveLabel("Save failed");
        }
      } catch {
        setAutoSaveLabel("Save failed");
      }
    }, 800);
  }, []);

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditManuscriptId(note.manuscript_id ?? "");
    setAutoSaveLabel(null);
  }

  function onEditChange(content: string, msId: string) {
    setEditContent(content);
    setEditManuscriptId(msId);
    if (editingId) scheduleSave(editingId, content, msId);
  }

  async function addNote() {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, manuscript_id: newManuscriptId || null }),
      });
      const data = (await res.json()) as { note?: Note; error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save note.");
      } else if (data.note) {
        setNotes((prev) => [data.note!, ...prev]);
        setNewContent("");
        if (!defaultManuscriptId) setNewManuscriptId("");
      }
    } catch {
      setSaveError("Could not connect. Check your connection.");
    }
    setSaving(false);
  }

  async function resolveNote(id: string, resolved: boolean) {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      const data = (await res.json()) as { note?: Note };
      if (res.ok && data.note) {
        setNotes((prev) => prev.map((n) => (n.id === id ? data.note! : n)));
        if (editingId === id) setEditingId(null);
      }
    } catch { /* silent */ }
  }

  async function deleteNote(id: string) {
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (editingId === id) setEditingId(null);
    }
  }

  function msTitle(id: string | null) {
    if (!id || !manuscripts) return null;
    return manuscripts.find((m) => m.id === id)?.title ?? null;
  }

  function renderNote(note: Note) {
    const isEditing = editingId === note.id;
    return (
      <div key={note.id} className="rounded-lg border border-[rgba(120,120,120,0.25)] bg-neutral-900/40 p-3">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => onEditChange(e.target.value, editManuscriptId)}
              rows={5}
              autoFocus
              className="w-full resize-none overflow-y-auto rounded border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none"
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
            <div className="flex items-center justify-between">
              {autoSaveLabel && (
                <span className="text-[10px] text-neutral-500">{autoSaveLabel}</span>
              )}
              <button
                onClick={() => setEditingId(null)}
                className="ml-auto rounded-md border border-[rgba(120,120,120,0.3)] px-2 py-0.5 text-[10px] text-neutral-400 transition hover:border-[rgba(120,120,120,0.6)] hover:text-neutral-200"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p
              className={`max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed ${
                note.resolved ? "text-neutral-500 line-through" : "text-neutral-300"
              }`}
            >
              {note.content}
            </p>
            {msTitle(note.manuscript_id) && (
              <p className="mt-1.5 text-[10px] text-neutral-600">📖 {msTitle(note.manuscript_id)}</p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-neutral-700">
                {new Date(note.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <div className="flex items-center gap-2">
                {!note.resolved && (
                  <button
                    onClick={() => startEdit(note)}
                    className="rounded-md border border-[rgba(120,120,120,0.3)] px-2 py-0.5 text-[10px] text-neutral-500 transition hover:border-[rgba(120,120,120,0.6)] hover:text-neutral-200"
                  >
                    Edit
                  </button>
                )}
                {!note.resolved ? (
                  <button
                    onClick={() => void resolveNote(note.id, true)}
                    className="rounded-md border border-[rgba(120,120,120,0.3)] px-2 py-0.5 text-[10px] text-neutral-500 transition hover:border-emerald-700/50 hover:text-emerald-400"
                  >
                    Resolve
                  </button>
                ) : (
                  <button
                    onClick={() => void resolveNote(note.id, false)}
                    className="rounded-md border border-[rgba(120,120,120,0.3)] px-2 py-0.5 text-[10px] text-neutral-500 transition hover:border-[rgba(120,120,120,0.6)] hover:text-neutral-300"
                  >
                    Restore
                  </button>
                )}
                <button
                  onClick={() => void deleteNote(note.id)}
                  className="rounded-md border border-[rgba(120,120,120,0.3)] px-2 py-0.5 text-[10px] text-neutral-500 transition hover:border-red-700/50 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  const filteredNotes = notes.filter((n) =>
    filter === "all" ? true : filter === "resolved" ? n.resolved : !n.resolved
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Notes</p>
        <div className="flex gap-1">
          {(["unresolved", "resolved", "all"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-medium transition ${
                filter === opt
                  ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.22)] text-neutral-100"
                  : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.07)] text-neutral-400 hover:bg-[rgba(120,120,120,0.14)] hover:text-neutral-200"
              }`}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* New note form */}
      <div className="shrink-0 space-y-2">
        <textarea
          value={newContent}
          onChange={(e) => { setNewContent(e.target.value); setSaveError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addNote(); }}
          placeholder="Jot down an idea… (Ctrl+Enter to save)"
          rows={3}
          className="w-full resize-none overflow-y-auto rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/50 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.8)] focus:outline-none"
        />
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
        {saveError && <p className="text-[11px] text-red-400">{saveError}</p>}
        <button
          type="button"
          onClick={() => void addNote()}
          disabled={saving || !newContent.trim()}
          className="h-8 w-full rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.14)] text-xs font-medium text-neutral-200 transition hover:bg-[rgba(120,120,120,0.24)] disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add Note"}
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 border-t border-[rgba(120,120,120,0.2)] pt-3">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-neutral-800/40 animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : filteredNotes.length === 0 ? (
          <p className="text-xs text-neutral-600">
            {filter === "resolved" ? "No resolved notes." : filter === "all" ? "No notes yet." : "No active notes."}
          </p>
        ) : (
          filteredNotes.map((note) => renderNote(note))
        )}
      </div>
    </div>
  );
}
