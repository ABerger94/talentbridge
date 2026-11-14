import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Check, Loader2, Pencil, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { FIELD_FAMILIES, fieldFamilyFor, storyPromptsFor, privacyNoteFor } from "@/lib/capabilityRubric";

export const MAX_STORIES = 8;
const FIELD_MAX = 1200;

// Short, guided examples of the work resumes leave out. They count as the
// strongest evidence when the Capability Graph is built.
// `request` ({ question, nonce }) opens a story answering one of the graph's
// follow-up questions; the question is saved with the story.
// The prompts are worded for the seeker's field (worked out from their
// profile and graph, or picked here with `onFamilyChange`).
export default function ProofStories({ stories = [], onSave, saving, request, profile, graph, onFamilyChange }) {
  const family = fieldFamilyFor(profile, graph);
  const prompts = storyPromptsFor(family);
  const privacyNote = privacyNoteFor(family);
  const [editing, setEditing] = useState(null); // index being edited, or "new"
  const [draft, setDraft] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!request?.question) return;
    const i = stories.findIndex((s) => s.question === request.question);
    if (i >= 0) { setDraft({ ...stories[i] }); setEditing(i); } else {
      setDraft({ prompt_id: "followup", question: request.question, situation: "", action: "", result: "" });
      setEditing("new");
    }
    // Bring the form into view and put the cursor in the first box.
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      formRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
    }, 60);
  }, [request?.nonce]);

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
  const prompt = (id) => prompts.find((p) => p.id === id);
  const titleOf = (s) => (s.question ? s.question : prompt(s.prompt_id)?.title);
  const hintOf = (s) => (s.question ? "Answer in your own words: the situation, what you did, and what changed. Specific numbers count most." : prompt(s.prompt_id)?.hint);

  const form = draft && (
    <div ref={formRef} className="rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
      <div>
        {draft.question && <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-0.5">Answering</p>}
        <p className="text-sm font-semibold">{titleOf(draft)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hintOf(draft)}</p>
        {privacyNote && (
          <p className="text-xs text-amber-900 mt-1.5 flex items-start gap-1"><ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" /> {privacyNote}</p>
        )}
      </div>
      {[
        ["situation", "The situation", "What was happening, and what was at stake?"],
        ["action", "What you did", "Your own actions and decisions: what you noticed, decided, built or led."],
        ["result", "What changed", "The outcome. Numbers help: fewer errors or incidents, better outcomes, time or money saved."],
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
        {onFamilyChange && (
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
            <label htmlFor="story-family">Questions written for</label>
            <Select value={family || "general"} onValueChange={(v) => onFamilyChange(v)} disabled={saving}>
              <SelectTrigger id="story-family" className="h-8 w-auto min-w-[12rem] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_FAMILIES).map(([id, f]) => <SelectItem key={id} value={id} className="text-xs">{f.label}</SelectItem>)}
                <SelectItem value="general" className="text-xs">Any field (general)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {stories.map((s, i) => (editing === i ? <div key={i}>{form}</div> : (
        <div key={i} className="rounded-lg border border-border p-3 flex gap-3 items-start">
          <div className="min-w-0 flex-1">
            <Badge variant="secondary" className="text-[11px] mb-1 max-w-full whitespace-normal text-left">{s.question ? `Answer: ${s.question}` : prompt(s.prompt_id)?.title || "Story"}</Badge>
            <p className="text-sm line-clamp-2">{s.action}</p>
            {s.result && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Result: {s.result}</p>}
          </div>
          <div className="flex shrink-0">
            <Button type="button" variant="ghost" size="icon" className={`h-8 w-8 ${s.private ? "text-amber-700" : "text-muted-foreground"}`}
              aria-label={s.private ? "Show this story on your profile page" : "Hide this story from your profile page"}
              title={s.private ? "Hidden from your profile page (still used for your graph)" : "Shown on your profile page"}
              onClick={() => onSave(stories.map((x, j) => (j === i ? { ...x, private: !x.private } : x)))} disabled={saving}>
              {s.private ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit story" onClick={() => edit(i)}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Delete story" onClick={() => remove(i)} disabled={saving}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )))}

      {editing === "new" && form}

      {editing === null && stories.length < MAX_STORIES && (
        <div className="flex flex-wrap gap-2">
          {prompts.filter((p) => !used.has(p.id)).map((p) => (
            <Button key={p.id} type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => start(p.id)}>
              <Plus className="w-3 h-3" /> {p.title}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
