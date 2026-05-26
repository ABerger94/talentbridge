import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Network, Zap, TrendingUp, BookOpen, Loader2, ChevronRight, Star } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function HiddenVectorsPanel({ job, profile }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are Symbiot's Capability Alignment Engine. Analyze how this candidate's actual capabilities map to this job's core problems.

CRITICAL RULES:
- NEVER reject. Always find the bridge.
- Focus on what problems the job needs solved, and find evidence in the candidate's profile that they've solved adjacent problems.
- Highlight transferable logic, not just title/keyword matches.
- If the candidate lacks something, show the adaptability path — what they already know that makes picking it up fast.
- Be specific — reference actual skills and projects from their profile.

CANDIDATE CAPABILITY PROFILE:
Headline: ${profile?.headline || "Not set"}
Skills: ${profile?.skills?.join(", ") || "Not specified"}
Experience: ${profile?.experience_years || 0} years (${profile?.experience_level || "entry"})
Career Goals: ${profile?.career_goals || "Not specified"}
Work History: ${profile?.work_history || "Not specified"}
Values: ${profile?.values?.join(", ") || "Not specified"}

JOB REQUIREMENTS & PROBLEMS:
Title: ${job.title} at ${job.company}
Core Description: ${job.description?.slice(0, 500)}
Skills Needed: ${job.skills?.join(", ") || "Not specified"}
Qualifications: ${job.qualifications?.slice(0, 300) || "Not specified"}
Culture Values: ${job.culture_values?.join(", ") || "Not specified"}

Return a highly specific, encouraging analysis.`,
      response_json_schema: {
        type: "object",
        properties: {
          alignment_score: { type: "number" },
          capability_matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                job_problem: { type: "string" },
                candidate_proof: { type: "string" },
                strength: { type: "number" }
              }
            }
          },
          adaptability_bridge: { type: "string" },
          portfolio_highlight: { type: "string" },
          interview_edge: { type: "string" },
          missing_links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                gap: { type: "string" },
                bridge_path: { type: "string" }
              }
            }
          }
        }
      }
    });
    setAnalysis(result);
    setLoading(false);
  };

  if (!analysis && !loading) {
    return (
      <Card className="p-5 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-primary/15 rounded-lg flex items-center justify-center">
            <Network className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Hidden Vectors Panel</h3>
            <p className="text-xs text-muted-foreground">See exactly how your capabilities map to this role</p>
          </div>
        </div>
        <Button className="w-full gap-2" onClick={runAnalysis} size="sm">
          <Network className="w-4 h-4" />
          Analyze My Capability Fit
        </Button>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-5 border-primary/20">
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <div>
            <p className="text-sm font-medium">Running Capability Graph Analysis</p>
            <p className="text-xs text-muted-foreground">Mapping your vectors to role problems...</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Hidden Vectors Panel</h3>
        </div>
        <Badge className="bg-primary/15 text-primary border-primary/20 text-sm font-bold">
          {analysis.alignment_score}% aligned
        </Badge>
      </div>

      <Progress value={analysis.alignment_score} className="h-2" />

      {/* Capability Matches */}
      {analysis.capability_matches?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capability → Problem Mapping</p>
          {analysis.capability_matches.map((match, i) => (
            <div key={i} className="rounded-lg border border-border/50 bg-card p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{match.job_problem}</p>
                <div className="flex items-center gap-1 shrink-0">
                  {[1, 2, 3].map(n => (
                    <div key={n} className={`w-1.5 h-1.5 rounded-full ${n <= Math.round((match.strength || 70) / 33) ? "bg-accent" : "bg-muted"}`} />
                  ))}
                </div>
              </div>
              <p className="text-xs text-foreground flex items-start gap-1.5">
                <Zap className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                {match.candidate_proof}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Adaptability Bridge */}
      {analysis.adaptability_bridge && (
        <div className="rounded-lg bg-accent/8 border border-accent/20 p-3">
          <p className="text-xs font-semibold text-accent mb-1.5 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Adaptability Bridge
          </p>
          <p className="text-xs text-foreground leading-relaxed">{analysis.adaptability_bridge}</p>
        </div>
      )}

      {/* Portfolio Highlight */}
      {analysis.portfolio_highlight && (
        <div className="rounded-lg bg-secondary p-3">
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
            <Star className="w-3 h-3 text-primary" /> What to surface in your application
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{analysis.portfolio_highlight}</p>
        </div>
      )}

      {/* Missing Links with Bridges */}
      {analysis.missing_links?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gaps & Bridges</p>
          {analysis.missing_links.map((ml, i) => (
            <div key={i} className="rounded-lg border border-dashed border-border p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{ml.gap}</p>
              <p className="text-xs text-foreground flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                {ml.bridge_path}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Interview Edge */}
      {analysis.interview_edge && (
        <div className="rounded-lg bg-primary/8 border border-primary/15 p-3">
          <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1.5">
            <BookOpen className="w-3 h-3" /> Your Interview Edge
          </p>
          <p className="text-xs text-foreground leading-relaxed">{analysis.interview_edge}</p>
        </div>
      )}

      <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={runAnalysis}>
        Re-run Analysis
      </Button>
    </Card>
  );
}