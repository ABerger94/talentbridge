import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquareText, Loader2, AlertTriangle, CheckCircle2,
  TrendingUp, FileText, Upload, Star
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const scoreColor = (score) => {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-500";
};

const scoreBg = (score) => {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
};

export default function ResumeCritique({ profile }) {
  const [critique, setCritique] = useState(null);
  const [loading, setLoading] = useState(false);

  const runCritique = async () => {
    if (!profile.resume_url && !profile.work_history && !profile.bio) {
      toast.error("Upload a resume or fill in your profile first.");
      return;
    }
    setLoading(true);

    const prompt = `You are an expert resume coach and career advisor. Conduct a thorough, honest, and constructive critique of this candidate's resume/profile.

Be specific and actionable — not vague. Reference actual content they provided.

CANDIDATE PROFILE:
Headline: ${profile.headline || "Not set"}
Bio/Summary: ${profile.bio || "Not set"}
Skills: ${profile.skills?.join(", ") || "Not set"}
Experience: ${profile.experience_years || 0} years (${profile.experience_level || "unknown"})
Work History: ${profile.work_history || "Not provided"}
Education: ${profile.education || "Not provided"}
Career Goals: ${profile.career_goals || "Not provided"}
${profile.resume_url ? "Resume file: provided (analyze based on profile data above)" : ""}

Evaluate across these dimensions:
1. Clarity & Impact of summary/headline
2. Skills presentation (depth, relevance, completeness)
3. Work history storytelling (achievements vs. duties)
4. ATS optimization potential
5. Completeness and gaps
6. Overall strength for the job market

Give an overall score 0-100 and specific dimension scores.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: profile.resume_url ? [profile.resume_url] : undefined,
      response_json_schema: {
        type: "object",
        properties: {
          overall_score: { type: "number" },
          overall_verdict: { type: "string" },
          dimension_scores: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dimension: { type: "string" },
                score: { type: "number" },
                feedback: { type: "string" }
              }
            }
          },
          critical_issues: { type: "array", items: { type: "string" } },
          quick_wins: { type: "array", items: { type: "string" } },
          strengths: { type: "array", items: { type: "string" } },
          rewrite_suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                section: { type: "string" },
                current: { type: "string" },
                improved: { type: "string" },
                why: { type: "string" }
              }
            }
          },
          ats_tips: { type: "array", items: { type: "string" } }
        }
      }
    });

    setCritique(result);
    setLoading(false);
  };

  if (!critique && !loading) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-primary" /> AI Resume Critique
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Get detailed, actionable feedback on your resume — formatting, content, ATS optimization, and rewrite suggestions.
        </p>
        {!profile.resume_url && !profile.work_history && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Upload a resume or fill in your Work History for a more detailed critique.
          </div>
        )}
        <Button className="gap-2" onClick={runCritique}>
          <MessageSquareText className="w-4 h-4" /> Critique My Resume
        </Button>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 py-6">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <div>
            <p className="font-medium">Analyzing your resume...</p>
            <p className="text-sm text-muted-foreground">Evaluating clarity, impact, ATS compatibility, and more.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-primary" /> Resume Critique
          </h2>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setCritique(null); }}>
            Re-run
          </Button>
        </div>

        <div className="flex items-center gap-6 mb-6">
          <div className="text-center">
            <div className={`text-5xl font-bold ${scoreColor(critique.overall_score)}`}>
              {critique.overall_score}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Overall Score</div>
          </div>
          <div className="flex-1">
            <Progress value={critique.overall_score} className="h-3 mb-2" />
            <p className="text-sm text-muted-foreground">{critique.overall_verdict}</p>
          </div>
        </div>

        {/* Dimension Scores */}
        {critique.dimension_scores?.length > 0 && (
          <div className="space-y-3">
            {critique.dimension_scores.map((d, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{d.dimension}</span>
                  <span className={`font-bold ${scoreColor(d.score)}`}>{d.score}/100</span>
                </div>
                <Progress value={d.score} className="h-1.5 mb-1" />
                <p className="text-xs text-muted-foreground">{d.feedback}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Strengths */}
      {critique.strengths?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-accent" /> What's Working
          </h3>
          <ul className="space-y-2">
            {critique.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" /> {s}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Critical Issues */}
      {critique.critical_issues?.length > 0 && (
        <Card className="p-5 border-destructive/20">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-destructive" /> Critical Issues
          </h3>
          <ul className="space-y-2">
            {critique.critical_issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" /> {issue}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Quick Wins */}
      {critique.quick_wins?.length > 0 && (
        <Card className="p-5 bg-primary/5 border-primary/15">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" /> Quick Wins
          </h3>
          <ul className="space-y-2">
            {critique.quick_wins.map((win, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                {win}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Rewrite Suggestions */}
      {critique.rewrite_suggestions?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" /> Rewrite Suggestions
          </h3>
          <div className="space-y-4">
            {critique.rewrite_suggestions.map((r, i) => (
              <div key={i} className="space-y-2">
                <Badge variant="outline" className="text-xs">{r.section}</Badge>
                {r.current && (
                  <div className="rounded bg-destructive/5 border border-destructive/15 px-3 py-2 text-xs text-muted-foreground line-through">
                    {r.current}
                  </div>
                )}
                {r.improved && (
                  <div className="rounded bg-accent/8 border border-accent/20 px-3 py-2 text-xs text-foreground">
                    {r.improved}
                  </div>
                )}
                {r.why && <p className="text-xs text-muted-foreground italic">{r.why}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ATS Tips */}
      {critique.ats_tips?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3">ATS Optimization Tips</h3>
          <ul className="space-y-2">
            {critique.ats_tips.map((tip, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary font-bold text-xs shrink-0 mt-0.5">→</span> {tip}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}