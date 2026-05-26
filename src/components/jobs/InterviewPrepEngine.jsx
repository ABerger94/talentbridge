import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Loader2, MessageSquare, Target, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function InterviewPrepEngine({ job, profile }) {
  const [prep, setPrep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});

  const generatePrep = async () => {
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are Symbiot's Interview Preparation Engine. Create a highly personalized interview prep guide for this specific candidate applying to this specific role.

Your job: Tell the candidate EXACTLY which of their existing experiences and projects to reference when answering each likely interview question. Be concrete and strategic.

CANDIDATE:
Skills: ${profile?.skills?.join(", ") || "General"}
Experience: ${profile?.experience_years || 0} years
Work History: ${profile?.work_history || "Not provided"}
Career Goals: ${profile?.career_goals || "Not provided"}

ROLE: ${job.title} at ${job.company}
Core Problems: ${job.description?.slice(0, 400)}
Required Skills: ${job.skills?.join(", ")}
Culture: ${job.culture_values?.join(", ") || "Not specified"}
Growth: ${job.growth_opportunities || "Not specified"}

Return targeted, specific prep.`,
      response_json_schema: {
        type: "object",
        properties: {
          opening_strategy: { type: "string" },
          likely_questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                why_asked: { type: "string" },
                how_to_answer: { type: "string" },
                what_to_highlight: { type: "string" }
              }
            }
          },
          questions_to_ask_them: { type: "array", items: { type: "string" } },
          red_flags_to_avoid: { type: "array", items: { type: "string" } },
          closing_statement: { type: "string" }
        }
      }
    });
    setPrep(result);
    setLoading(false);
  };

  const toggle = (i) => setExpanded(p => ({ ...p, [i]: !p[i] }));

  if (!prep && !loading) {
    return (
      <Card className="p-5 border-accent/20 bg-accent/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-accent/15 rounded-lg flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Interview Prep Engine</h3>
            <p className="text-xs text-muted-foreground">Custom guide for exactly this role</p>
          </div>
        </div>
        <Button variant="outline" className="w-full gap-2 border-accent/30 text-accent hover:bg-accent/10 hover:text-accent" size="sm" onClick={generatePrep}>
          <BookOpen className="w-4 h-4" />
          Generate My Prep Guide
        </Button>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <div>
            <p className="text-sm font-medium">Building Personalized Prep Guide</p>
            <p className="text-xs text-muted-foreground">Analyzing role problems and your experience...</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-accent/20 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-sm">Your Interview Prep Guide</h3>
      </div>

      {prep.opening_strategy && (
        <div className="rounded-lg bg-accent/8 border border-accent/20 p-3">
          <p className="text-xs font-semibold text-accent mb-1.5 flex items-center gap-1.5">
            <Target className="w-3 h-3" /> Opening Strategy
          </p>
          <p className="text-xs text-foreground leading-relaxed">{prep.opening_strategy}</p>
        </div>
      )}

      {prep.likely_questions?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Likely Questions ({prep.likely_questions.length})
          </p>
          {prep.likely_questions.map((q, i) => (
            <div key={i} className="rounded-lg border border-border/60 overflow-hidden">
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-secondary/50 transition-colors"
              >
                <div>
                  <p className="text-xs font-medium flex items-start gap-1.5">
                    <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                    {q.question}
                  </p>
                  {q.why_asked && <p className="text-xs text-muted-foreground/70 mt-1 ml-4.5">{q.why_asked}</p>}
                </div>
                {expanded[i] ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
              </button>
              {expanded[i] && (
                <div className="border-t border-border/50 p-3 bg-secondary/30 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1">How to answer:</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{q.how_to_answer}</p>
                  </div>
                  {q.what_to_highlight && (
                    <div className="rounded bg-accent/8 p-2">
                      <p className="text-xs font-semibold text-accent mb-0.5 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" /> Highlight from your profile:
                      </p>
                      <p className="text-xs text-foreground">{q.what_to_highlight}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {prep.questions_to_ask_them?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions to Ask Them</p>
          <div className="space-y-1.5">
            {prep.questions_to_ask_them.map((q, i) => (
              <div key={i} className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-foreground flex items-start gap-2">
                <span className="text-primary font-bold shrink-0">{i + 1}.</span> {q}
              </div>
            ))}
          </div>
        </div>
      )}

      {prep.red_flags_to_avoid?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What to Avoid</p>
          <div className="space-y-1.5">
            {prep.red_flags_to_avoid.map((r, i) => (
              <div key={i} className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {prep.closing_statement && (
        <div className="rounded-lg bg-primary/8 border border-primary/15 p-3">
          <p className="text-xs font-semibold text-primary mb-1.5">Closing Statement Framework</p>
          <p className="text-xs text-foreground leading-relaxed">{prep.closing_statement}</p>
        </div>
      )}

      <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={generatePrep}>
        Regenerate
      </Button>
    </Card>
  );
}