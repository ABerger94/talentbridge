import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sparkles, Loader2, Save, User, Briefcase, Network,
  X, Plus, Zap, Brain, TrendingUp, GitBranch, Layers, FileText
} from "lucide-react";
import { toast } from "sonner";
import JobCard from "@/components/jobs/JobCard";
import ResumeUploader from "@/components/resume/ResumeUploader";
import ResumeCritique from "@/components/resume/ResumeCritique";

export default function SeekerDashboard() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState(null);
  const [skillInput, setSkillInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [aiMatches, setAiMatches] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [capabilityGraph, setCapabilityGraph] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const { data: profiles = [], isLoading: profileLoading } = useQuery({
    queryKey: ["seekerProfile"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.SeekerProfile.filter({ created_by_id: user.id });
    },
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["myApplications"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.JobApplication.filter({ created_by_id: user.id }, "-created_date");
    },
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["allJobs"],
    queryFn: () => base44.entities.Job.filter({ status: "active" }),
  });

  useEffect(() => {
    if (profiles.length > 0) {
      setProfile(profiles[0]);
    } else if (!profileLoading) {
      setProfile({
        headline: "", bio: "", skills: [], experience_years: 0, experience_level: "entry",
        preferred_work_type: "any", preferred_location: "", salary_expectation_min: 0,
        salary_expectation_max: 0, industries_of_interest: [], values: [],
        career_goals: "", work_history: "", education: "", open_to_opportunities: true,
      });
    }
  }, [profiles, profileLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (profiles.length > 0) {
        return base44.entities.SeekerProfile.update(profiles[0].id, profile);
      }
      return base44.entities.SeekerProfile.create(profile);
    },
    onSuccess: () => {
      toast.success("Profile saved!");
      queryClient.invalidateQueries({ queryKey: ["seekerProfile"] });
    },
  });

  const update = (key, val) => setProfile(p => ({ ...p, [key]: val }));
  const addSkill = () => {
    if (skillInput.trim() && !profile.skills?.includes(skillInput.trim())) {
      update("skills", [...(profile.skills || []), skillInput.trim()]);
      setSkillInput("");
    }
  };
  const addValue = () => {
    if (valueInput.trim() && !profile.values?.includes(valueInput.trim())) {
      update("values", [...(profile.values || []), valueInput.trim()]);
      setValueInput("");
    }
  };

  const buildCapabilityGraph = async () => {
    if (!profile?.skills?.length && !profile?.work_history) {
      toast.error("Fill in your skills and work history first.");
      return;
    }
    setGraphLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are TalentBridge's Capability Graph Engine. Analyze this candidate's holistic profile and build a structured map of their true execution capabilities — not just their job titles.

Focus on:
- Core execution vectors (what systems/problems they can actually solve)
- Adjacent adaptability zones (areas they could move into quickly)
- Architectural logic patterns (how they think about systems)
- Transferable methodology (approaches that work across domains)

CANDIDATE:
Headline: ${profile.headline}
Skills: ${profile.skills?.join(", ")}
Experience: ${profile.experience_years} years (${profile.experience_level})
Work History: ${profile.work_history}
Education: ${profile.education}
Career Goals: ${profile.career_goals}
Values: ${profile.values?.join(", ")}

Generate a deep capability analysis.`,
      response_json_schema: {
        type: "object",
        properties: {
          core_execution_vectors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                vector: { type: "string" },
                strength: { type: "number" },
                evidence: { type: "string" }
              }
            }
          },
          adjacent_zones: { type: "array", items: { type: "string" } },
          architectural_pattern: { type: "string" },
          unique_methodology: { type: "string" },
          suggested_role_types: { type: "array", items: { type: "string" } },
          capability_headline: { type: "string" }
        }
      }
    });
    setCapabilityGraph(result);
    setGraphLoading(false);
  };

  const getAiMatches = async () => {
    if (!profile?.headline && !profile?.skills?.length) {
      toast.error("Fill in your profile first for better matches.");
      return;
    }
    setMatchLoading(true);
    const jobSummaries = jobs.slice(0, 25).map(j => ({
      id: j.id, title: j.title, company: j.company, skills: j.skills,
      work_type: j.work_type, experience_level: j.experience_level,
      culture_values: j.culture_values, description: j.description?.slice(0, 200),
      qualifications: j.qualifications?.slice(0, 200),
    }));

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are TalentBridge's Bi-Directional Semantic Matcher. Match this candidate with roles using capability alignment, not keyword matching.

CRITICAL RULES:
- Find roles where the candidate's PROBLEM-SOLVING LOGIC maps to the PROBLEMS the role needs solved
- Consider adjacent skills and transferable methodology — not just direct matches
- Score generously for candidates with strong trajectory and growth indicators
- Never dismiss someone for lacking arbitrary years of experience

CANDIDATE:
${JSON.stringify({ headline: profile.headline, skills: profile.skills, experience_years: profile.experience_years, experience_level: profile.experience_level, values: profile.values, career_goals: profile.career_goals, work_history: profile.work_history?.slice(0, 300) })}

AVAILABLE ROLES:
${JSON.stringify(jobSummaries)}

Return the top matches with specific reasoning.`,
      response_json_schema: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                job_id: { type: "string" },
                score: { type: "number" },
                capability_reason: { type: "string" },
                adaptability_note: { type: "string" },
                growth_signal: { type: "string" }
              }
            }
          },
          search_insight: { type: "string" }
        }
      }
    });
    setAiMatches(result);
    setMatchLoading(false);
  };

  if (profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusLabel = { applied: "Applied", reviewed: "Under Review", shortlisted: "Shortlisted", interview: "Interview", offered: "Offer Received!", rejected: "Passed", withdrawn: "Withdrawn" };
  const statusColor = { applied: "bg-blue-100 text-blue-700", reviewed: "bg-yellow-100 text-yellow-700", shortlisted: "bg-green-100 text-green-700", interview: "bg-purple-100 text-purple-700", offered: "bg-emerald-100 text-emerald-700", rejected: "bg-gray-100 text-gray-500", withdrawn: "bg-gray-100 text-gray-400" };

  const profileScore = (() => {
    let s = 0;
    if (profile.headline) s += 20;
    if (profile.bio) s += 15;
    if (profile.skills?.length > 0) s += 20;
    if (profile.work_history) s += 20;
    if (profile.career_goals) s += 15;
    if (profile.values?.length > 0) s += 10;
    return s;
  })();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Capability Profile</h1>
        <p className="text-muted-foreground">Build your Capability Graph. Let AI surface your full potential to the right employers.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6 flex-wrap h-auto">
          <TabsTrigger value="profile" className="gap-2"><User className="w-4 h-4" /> Profile</TabsTrigger>
          <TabsTrigger value="resume" className="gap-2"><FileText className="w-4 h-4" /> Resume</TabsTrigger>
          <TabsTrigger value="capability" className="gap-2"><Network className="w-4 h-4" /> Capability Graph</TabsTrigger>
          <TabsTrigger value="matches" className="gap-2"><Brain className="w-4 h-4" /> AI Matches</TabsTrigger>
          <TabsTrigger value="applications" className="gap-2"><Briefcase className="w-4 h-4" /> Applications</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          {/* Completion score */}
          <Card className="p-5 bg-primary/5 border-primary/15">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Capability Profile Strength
              </span>
              <span className="text-sm font-bold text-primary">{profileScore}%</span>
            </div>
            <Progress value={profileScore} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {profileScore < 60 ? "Complete your profile to improve match quality." : profileScore < 90 ? "Strong profile — add more context to maximize AI matching." : "Excellent profile — your Capability Graph is rich with signal."}
            </p>
          </Card>

          <Card className="p-6 space-y-5">
            <h2 className="font-semibold">About You</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Professional Headline</Label>
                <Input placeholder="e.g. Systems builder who ships at velocity — React, Node, Supabase" value={profile.headline || ""} onChange={(e) => update("headline", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>About Me</Label>
                <Textarea placeholder="Tell the story of your trajectory. What problems do you love solving? What have you built that matters?" value={profile.bio || ""} onChange={(e) => update("bio", e.target.value)} className="min-h-[100px]" />
              </div>
              <div className="space-y-2">
                <Label>Years of Experience</Label>
                <Input type="number" value={profile.experience_years || ""} onChange={(e) => update("experience_years", Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Experience Level</Label>
                <Select value={profile.experience_level || "entry"} onValueChange={(v) => update("experience_level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entry">Entry</SelectItem>
                    <SelectItem value="mid">Mid</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <h2 className="font-semibold">Execution Capabilities</h2>
            <div className="space-y-2">
              <Label>Skills & Technologies</Label>
              <div className="flex gap-2">
                <Input placeholder="Add a skill or tool" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
                <Button variant="outline" size="icon" onClick={addSkill}><Plus className="w-4 h-4" /></Button>
              </div>
              {profile.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.skills.map(s => (
                    <Badge key={s} variant="secondary" className="gap-1 pr-1">
                      {s}
                      <button onClick={() => update("skills", profile.skills.filter(sk => sk !== s))} className="ml-1 rounded-full p-0.5 hover:bg-foreground/10"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Work History</Label>
              <Textarea placeholder="Describe what you've built, shipped, or led. Be specific about outcomes and scale — this feeds your Capability Graph." value={profile.work_history || ""} onChange={(e) => update("work_history", e.target.value)} className="min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <Label>Education</Label>
              <Textarea placeholder="Formal education, bootcamps, self-directed learning, certifications..." value={profile.education || ""} onChange={(e) => update("education", e.target.value)} />
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <h2 className="font-semibold">What You're Looking For</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Work Preference</Label>
                <Select value={profile.preferred_work_type || "any"} onValueChange={(v) => update("preferred_work_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Open to anything</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="e.g. New York, NY or Anywhere" value={profile.preferred_location || ""} onChange={(e) => update("preferred_location", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Career Goals</Label>
              <Textarea placeholder="Where are you going? What problems do you want to be solving in 3 years?" value={profile.career_goals || ""} onChange={(e) => update("career_goals", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Values — What matters to you at work?</Label>
              <div className="flex gap-2">
                <Input placeholder="e.g. Ownership, remote-first, mission-driven" value={valueInput} onChange={(e) => setValueInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValue())} />
                <Button variant="outline" size="icon" onClick={addValue}><Plus className="w-4 h-4" /></Button>
              </div>
              {profile.values?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.values.map(v => (
                    <Badge key={v} variant="outline" className="gap-1 pr-1 bg-accent/8 border-accent/20 text-accent">
                      {v}
                      <button onClick={() => update("values", profile.values.filter(vl => vl !== v))} className="ml-1 rounded-full p-0.5 hover:bg-foreground/10"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button className="gap-2 px-8" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </Button>
          </div>
        </TabsContent>

        {/* Resume Tab */}
        <TabsContent value="resume" className="space-y-5">
          <ResumeUploader
            profile={profile}
            onProfileUpdate={update}
            onSave={() => saveMutation.mutate()}
          />
          <ResumeCritique profile={profile} />
        </TabsContent>

        {/* Capability Graph Tab */}
        <TabsContent value="capability" className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Network className="w-5 h-5 text-primary" /> Your Capability Graph
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  AI maps your actual execution capabilities — not just titles — into a semantic profile employers can understand at a glance.
                </p>
              </div>
              <Button className="gap-2" onClick={buildCapabilityGraph} disabled={graphLoading}>
                {graphLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                Build Graph
              </Button>
            </div>

            {!capabilityGraph && !graphLoading && (
              <div className="text-center py-14 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Network className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">No Capability Graph yet</p>
                <p className="text-xs mt-1 opacity-60">Fill in your profile and click "Build Graph" to generate your semantic capability map</p>
              </div>
            )}

            {capabilityGraph && (
              <div className="space-y-5">
                {capabilityGraph.capability_headline && (
                  <div className="rounded-xl bg-primary/8 border border-primary/15 p-4">
                    <p className="text-sm font-semibold text-primary mb-1">Capability Headline</p>
                    <p className="text-base font-medium text-foreground">{capabilityGraph.capability_headline}</p>
                  </div>
                )}

                {capabilityGraph.core_execution_vectors?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Core Execution Vectors</h3>
                    {capabilityGraph.core_execution_vectors.map((v, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{v.vector}</span>
                          <span className="text-xs text-muted-foreground">{v.strength}%</span>
                        </div>
                        <Progress value={v.strength} className="h-1.5" />
                        <p className="text-xs text-muted-foreground">{v.evidence}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {capabilityGraph.architectural_pattern && (
                    <div className="rounded-lg bg-secondary p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Architectural Pattern</p>
                      <p className="text-sm">{capabilityGraph.architectural_pattern}</p>
                    </div>
                  )}
                  {capabilityGraph.unique_methodology && (
                    <div className="rounded-lg bg-secondary p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Unique Methodology</p>
                      <p className="text-sm">{capabilityGraph.unique_methodology}</p>
                    </div>
                  )}
                </div>

                {capabilityGraph.adjacent_zones?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Adjacent Adaptability Zones</h3>
                    <div className="flex flex-wrap gap-2">
                      {capabilityGraph.adjacent_zones.map((z, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-accent/8 border-accent/20 text-accent">{z}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {capabilityGraph.suggested_role_types?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Roles You're Built For</h3>
                    <div className="flex flex-wrap gap-2">
                      {capabilityGraph.suggested_role_types.map((r, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Matches Tab */}
        <TabsContent value="matches" className="space-y-5">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" /> Semantic Role Matches
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Matched on capability alignment and problem-solving overlap — not keyword counting.
                </p>
              </div>
              <Button className="gap-2" onClick={getAiMatches} disabled={matchLoading}>
                {matchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Find Matches
              </Button>
            </div>

            {aiMatches?.search_insight && (
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 mb-4">
                <p className="text-sm flex items-start gap-2 text-muted-foreground">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {aiMatches.search_insight}
                </p>
              </div>
            )}

            {aiMatches?.matches?.length > 0 && (
              <div className="space-y-4">
                {aiMatches.matches.map(match => {
                  const job = jobs.find(j => j.id === match.job_id);
                  if (!job) return null;
                  return (
                    <div key={match.job_id} className="space-y-2">
                      <JobCard job={job} matchScore={match.score} />
                      <div className="ml-2 pl-4 border-l-2 border-border space-y-1 pb-2">
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                          {match.capability_reason}
                        </p>
                        {match.adaptability_note && (
                          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <Network className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            {match.adaptability_note}
                          </p>
                        )}
                        {match.growth_signal && (
                          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            {match.growth_signal}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!aiMatches && !matchLoading && (
              <div className="text-center py-14 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                <Brain className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Ready to find your matches</p>
                <p className="text-xs mt-1 opacity-60">A complete profile produces significantly better matches</p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Applications Tab */}
        <TabsContent value="applications" className="space-y-3">
          {applications.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No applications yet</p>
              <p className="text-sm mt-1">Browse roles and apply to get started</p>
            </Card>
          ) : (
            applications.map(app => {
              const job = jobs.find(j => j.id === app.job_id);
              return (
                <Card key={app.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{job?.title || "Unknown Role"}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{job?.company || ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {app.ai_match_score && (
                        <span className="text-xs text-muted-foreground">{app.ai_match_score}% match</span>
                      )}
                      <Badge className={`text-xs ${statusColor[app.status] || "bg-gray-100 text-gray-700"}`}>
                        {statusLabel[app.status] || app.status}
                      </Badge>
                    </div>
                  </div>
                  {app.ai_match_summary && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{app.ai_match_summary}</p>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}