import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Save, User, Briefcase, TrendingUp, X, Plus, Zap, Brain } from "lucide-react";
import { toast } from "sonner";
import JobCard from "@/components/jobs/JobCard";

export default function SeekerDashboard() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState(null);
  const [skillInput, setSkillInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [aiMatches, setAiMatches] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);

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
      } else {
        return base44.entities.SeekerProfile.create(profile);
      }
    },
    onSuccess: () => {
      toast.success("Profile saved!");
      queryClient.invalidateQueries({ queryKey: ["seekerProfile"] });
    },
  });

  const update = (key, value) => setProfile((p) => ({ ...p, [key]: value }));

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

  const getAiMatches = async () => {
    if (!profile?.headline && !profile?.skills?.length) {
      toast.error("Fill in your profile first for better matches!");
      return;
    }
    setMatchLoading(true);
    const jobSummaries = jobs.slice(0, 20).map((j) => ({
      id: j.id, title: j.title, company: j.company, skills: j.skills,
      work_type: j.work_type, experience_level: j.experience_level,
      culture_values: j.culture_values, description: j.description?.slice(0, 200),
    }));

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an empathetic AI career matcher. Your job is to match job seekers with positions focusing on:
- Transferable skills (not exact keyword matches)
- Growth potential
- Culture and value alignment
- Where the person could thrive, not just survive

Seeker Profile:
- Headline: ${profile.headline}
- Skills: ${profile.skills?.join(", ")}
- Experience: ${profile.experience_years} years, ${profile.experience_level} level
- Values: ${profile.values?.join(", ")}
- Career Goals: ${profile.career_goals}
- Work History: ${profile.work_history}
- Preferred work type: ${profile.preferred_work_type}

Available Jobs:
${JSON.stringify(jobSummaries)}

Match the seeker with the best jobs. Be generous — look for potential and transferable skills, not just exact matches. 
Score each match 0-100 and explain WHY they'd be great, focusing on their potential and growth.`,
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
                reason: { type: "string" },
                growth_note: { type: "string" },
              },
            },
          },
          overall_advice: { type: "string" },
        },
      },
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

  const statusLabel = { applied: "Applied", reviewed: "Reviewed", shortlisted: "Shortlisted", interview: "Interview", offered: "Offered", rejected: "Not Selected", withdrawn: "Withdrawn" };
  const statusColor = { applied: "bg-blue-100 text-blue-700", reviewed: "bg-yellow-100 text-yellow-700", shortlisted: "bg-green-100 text-green-700", interview: "bg-purple-100 text-purple-700", offered: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-700", withdrawn: "bg-gray-100 text-gray-700" };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Dashboard</h1>
        <p className="text-muted-foreground">Manage your profile and discover AI-powered job matches.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile" className="gap-2"><User className="w-4 h-4" /> Profile</TabsTrigger>
          <TabsTrigger value="matches" className="gap-2"><Sparkles className="w-4 h-4" /> AI Matches</TabsTrigger>
          <TabsTrigger value="applications" className="gap-2"><Briefcase className="w-4 h-4" /> Applications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-lg">About You</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Professional Headline</Label>
                <Input placeholder="e.g. Creative Software Engineer with a passion for accessibility" value={profile.headline || ""} onChange={(e) => update("headline", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>About Me</Label>
                <Textarea placeholder="Tell employers about yourself, your journey, and what drives you..." value={profile.bio || ""} onChange={(e) => update("bio", e.target.value)} className="min-h-[100px]" />
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
                    <SelectItem value="entry">Entry Level</SelectItem>
                    <SelectItem value="mid">Mid Level</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-lg">Skills & Values</h2>
            <div className="space-y-2">
              <Label>Skills</Label>
              <div className="flex gap-2">
                <Input placeholder="Add a skill" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
                <Button variant="outline" size="icon" onClick={addSkill}><Plus className="w-4 h-4" /></Button>
              </div>
              {profile.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1 pr-1">
                      {s}
                      <button onClick={() => update("skills", profile.skills.filter((sk) => sk !== s))} className="ml-1 hover:bg-foreground/10 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>What matters to you at work?</Label>
              <div className="flex gap-2">
                <Input placeholder="e.g. Work-life balance, mentorship" value={valueInput} onChange={(e) => setValueInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValue())} />
                <Button variant="outline" size="icon" onClick={addValue}><Plus className="w-4 h-4" /></Button>
              </div>
              {profile.values?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.values.map((v) => (
                    <Badge key={v} variant="outline" className="gap-1 pr-1 bg-accent/5 border-accent/20 text-accent">
                      {v}
                      <button onClick={() => update("values", profile.values.filter((vl) => vl !== v))} className="ml-1 hover:bg-foreground/10 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-lg">Preferences & Goals</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preferred Work Type</Label>
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
                <Label>Preferred Location</Label>
                <Input placeholder="e.g. San Francisco, CA" value={profile.preferred_location || ""} onChange={(e) => update("preferred_location", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Career Goals</Label>
              <Textarea placeholder="Where do you see yourself growing? What excites you about the future?" value={profile.career_goals || ""} onChange={(e) => update("career_goals", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Work History</Label>
              <Textarea placeholder="Summarize your work experience..." value={profile.work_history || ""} onChange={(e) => update("work_history", e.target.value)} className="min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label>Education</Label>
              <Textarea placeholder="Your education background..." value={profile.education || ""} onChange={(e) => update("education", e.target.value)} />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button className="gap-2 px-8" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="matches" className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  AI-Powered Job Matches
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Our AI looks beyond keywords to find roles where you'll truly thrive.
                </p>
              </div>
              <Button className="gap-2" onClick={getAiMatches} disabled={matchLoading}>
                {matchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Find Matches
              </Button>
            </div>

            {aiMatches && (
              <div className="space-y-4">
                {aiMatches.overall_advice && (
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-sm flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      {aiMatches.overall_advice}
                    </p>
                  </div>
                )}
                {aiMatches.matches?.map((match) => {
                  const job = jobs.find((j) => j.id === match.job_id);
                  if (!job) return null;
                  return (
                    <div key={match.job_id} className="space-y-2">
                      <JobCard job={job} matchScore={match.score} />
                      <div className="ml-16 space-y-1">
                        <p className="text-sm text-muted-foreground flex items-start gap-2">
                          <Zap className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                          {match.reason}
                        </p>
                        {match.growth_note && (
                          <p className="text-sm text-muted-foreground flex items-start gap-2">
                            <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            {match.growth_note}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!aiMatches && !matchLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Click "Find Matches" to discover AI-curated jobs for you</p>
                <p className="text-sm mt-1 opacity-60">Make sure your profile is filled in for best results</p>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          {applications.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No applications yet</p>
              <p className="text-sm mt-1">Browse jobs and apply to get started</p>
            </Card>
          ) : (
            applications.map((app) => {
              const job = jobs.find((j) => j.id === app.job_id);
              return (
                <Card key={app.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{job?.title || "Unknown Job"}</h3>
                      <p className="text-sm text-muted-foreground">{job?.company || ""}</p>
                    </div>
                    <Badge className={statusColor[app.status] || "bg-gray-100 text-gray-700"}>
                      {statusLabel[app.status] || app.status}
                    </Badge>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}