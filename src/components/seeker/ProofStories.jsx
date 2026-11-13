import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, Loader2, Pencil } from "lucide-react";
import { STORY_PROMPTS } from "@/lib/capabilityRubric";

export const MAX_STORIES = 6;
const FIELD_MAX = 1200;

// Short, guided examples of the work resumes leave out. They count as the
// strongest evidence when the Capability Graph is built.
export default function ProofStories({ stories = [], onSave, saving }) {
  const [editing, setEditing] = useState(null); // index being edited, or "new"
  const [draft, setDraft] = useState(null);

  const used = new Set(stories.map((s) => s.prompt_id));
  const start = (prompt_id) => { setDraft({ prompt_id, situation: "", action: "", result: "" }); setEditing("new"); };
  const edit = (i) => { setDraft({ ...stories[i] }); setEditing(i); };
  const cancel = () => { setDraft(null); setEditing(null); };
  const commit = async () => {
    const next = editing === "new" ? [...stories, draft] : stories.map((s, i) => (i === editing ? draft : s));
    await onSave(next);
    cancel();
  };
  const remove = (i) => onSave(stories.filter((_, j) => j !== i));
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value.slice(0, FIELD_MAX) }));
  const prompt = (id) => STORY_PROMPTS.find((p) => p.id === id);

  const form = draft && (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">{prompt(draft.prompt_id)?.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{prompt(draft.prompt_id)?.hint}</p>
      </div>
      {[
        ["situation", "The situation", "What was happening, and what was at stake?"],
        ["action", "What you did", "Your own actions and decisions: how you investigated, assessed, built or led."],
        ["result", "What changed", "The outcome. Numbers help: fewer incidents, time saved, audit results, cost avoided."],
      ].map(([k, label, ph]) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`story-${k}`} className="text-xs">{label}</Label>
          <Textarea id={`story-${k}`} value={draft[k] || ""} onChange={set(k)} placeholder={ph} className="min-h-[64px] bg-card text-sm" />
        </div>
      ))}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
        <Button type="button" size="sm" className="gap-1.5" onClick={commit} disabled={saving || !(draft.action || "").trim()}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save story
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Proof of your best work</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Resumes list responsibilities. These short stories show what you’re exceptionally good at, and they count as the strongest evidence in your graph.
          {stories.length === 0 && " Add two or three before you build it."}
        </p>
      </div>

      {stories.map((s, i) => (editing === i ? <div key={i}>{form}</div> : (
        <div key={i} className="rounded-lg border border-border p-3 flex gap-3 items-start">
          <div className="min-w-0 flex-1">
            <Badge variant="secondary" className="text-[11px] mb-1">{prompt(s.prompt_id)?.title || "Story"}</Badge>
            <p className="text-sm line-clamp-2">{s.action}</p>
            {s.result && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Result: {s.result}</p>}
          </div>
          <div className="flex shrink-0">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit story" onClick={() => edit(i)}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Delete story" onClick={() => remove(i)} disabled={saving}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )))}

      {editing === "new" && form}

      {editing === null && stories.length < MAX_STORIES && (
        <div className="flex flex-wrap gap-2">
          {STORY_PROMPTS.filter((p) => !used.has(p.id)).map((p) => (
            <Button key={p.id} type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => start(p.id)}>
              <Plus className="w-3 h-3" /> {p.title}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
