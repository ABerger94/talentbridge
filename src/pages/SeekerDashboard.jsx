import React, { useState, useEffect, useRef } from "react";
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
  X, Plus, Zap, Brain, TrendingUp, GitBranch, FileText, Users, Eye, Globe
} from "lucide-react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import ProfileChecklist from "@/components/seeker/ProfileChecklist";
import { JobAlertNudge } from "@/components/seeker/JobAlertSettings";
import JobCard from "@/components/jobs/JobCard";
import MatchFilters, { loadMatchFilters, saveMatchFilters } from "@/components/seeker/MatchFilters";
import { normalizePercent, normalizeCapabilityGraph } from "@/lib/scales";
import ResumeUploader from "@/components/resume/ResumeUploader";
import ResumeCritique from "@/components/resume/ResumeCritique";
import ApplicationCard from "@/components/seeker/ApplicationCard";
import PortfolioSection from "@/components/seeker/PortfolioSection";
import { useAuth } from "@/lib/AuthContext";
import { Switch } from "@/components/ui/switch";
import { profileCompleteness } from "@/lib/completeness";

export default function SeekerDashboard() {
  const { user } = useAuth();
  // The open tab lives in the URL (?tab=resume) so steps and emails can deep-link.
  const [searchParams, setSearchParams] = useSearchParams();
  const TABS = ["profile", "resume", "portfolio", "capability", "matches", "applications", "invitations"];
  const tab = TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "profile";
  const setTab = (t) => setSearchParams((sp) => { const n = new URLSearchParams(sp); n.set("tab", t); return n; }, { replace: true });
  const goToStep = (t, focusId) => {
    setTab(t);
    if (focusId) {
      setTimeout(() => {
        const el = document.getElementById(focusId);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus({ preventScroll: true });
      }, 150);
    } else {
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
    }
  };
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

  // Filters for the match pool (location, work type, pay...). Remembered on
  // this device; the typed location waits for a pause before refetching.
  const [matchFilters, setMatchFiltersState] = useState(loadMatchFilters);
  const setMatchFilters = (f) => { setMatchFiltersState(f); saveMatchFilters(f); };
  const [poolFilters, setPoolFilters] = useState(matchFilters);
  useEffect(() => {
    const t = setTimeout(() => setPoolFilters(matchFilters), 350);
    return () => clearTimeout(t);
  }, [matchFilters]);
  const filtersKey = JSON.stringify(poolFilters);

  // The open roles most relevant to this profile that fit the filters (from
  // every source, including employers' own job boards), for AI matching.
  const { data: suggested, isFetching: poolLoading } = useQuery({
    queryKey: ["suggestedJobs", poolFilters],
    queryFn: () => base44.jobs.suggested(25, poolFilters),
    placeholderData: (prev) => prev,
  });
  const jobs = suggested?.data || [];

  const { data: invitations = [] } = useQuery({
    queryKey: ["myInvitations"],
    queryFn: async () => {
      const user = await base44.auth.me();
      const seekerProfiles = await base44.entities.SeekerProfile.filter({ created_by_id: user.id });
      if (seekerProfiles.length === 0) return [];
      return base44.entities.Invitation.filter({ seeker_profile_id: seekerProfiles[0].id }, "-created_date");
    },
  });

  useEffect(() => {
    if (profiles.length > 0) {
      setProfile(profiles[0]);
      if (profiles[0].capability_graph) {
        setCapabilityGraph(normalizeCapabilityGraph(profiles[0].capability_graph));
      }
    } else if (!profileLoading) {
      setProfile({
        full_name: user?.full_name || user?.data?.full_name || "",
        headline: "", bio: "", skills: [], experience_years: 0, experience_level: "entry",
        preferred_work_type: "any", preferred_location: "", salary_expectation_min: 0,
        salary_expectation_max: 0, industries_of_interest: [], values: [],
        career_goals: "", work_history: "", education: "", open_to_opportunities: true,
      });
    }
  }, [profiles, profileLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile.full_name?.trim()) {
        const field = document.getElementById("full_name");
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
        field?.focus({ preventScroll: true });
        throw new Error("Please add your full name — employers see it on your applications.");
      }
      if (profiles.length > 0) {
        return base44.entities.SeekerProfile.update(profiles[0].id, profile);
      }
      return base44.entities.SeekerProfile.create(profile);
    },
    onSuccess: () => {
      toast.success("Profile saved!");
      queryClient.invalidateQueries({ queryKey: ["seekerProfile"] });
    },
    onError: (err) => {
      toast.error(err?.message || "Couldn't save your profile. Please try again.");
    },
  });

  const update = (key, val) => setProfile(p => ({ ...p, [key]: val }));

  // Saves immediately (used by resume upload): persists the given fields plus
  // any unsaved edits on the form. Returns true on success.
  const savedIdRef = useRef(null);
  savedIdRef.current = savedIdRef.current || profiles[0]?.id || null;
  // Latest form state, so back-to-back saves (resume, then parsed fields)
  // build on each other instead of a stale copy.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const autoSave = async (updates) => {
    const next = { ...profileRef.current, ...updates };
    profileRef.current = next;
    setProfile(next);
    try {
      const { id: _id, created_by_id: _c, created_date: _cd, updated_date: _ud, ...fields } = next;
      // A blank name would be rejected; send only the new fields until it's set.
      const body = String(next.full_name || "").trim() ? fields : updates;
      if (savedIdRef.current) {
        await base44.entities.SeekerProfile.update(savedIdRef.current, body);
      } else {
        const created = await base44.entities.SeekerProfile.create(body);
        savedIdRef.current = created.id;
      }
      queryClient.invalidateQueries({ queryKey: ["seekerProfile"] });
      return true;
    } catch (err) {
      toast.error(err?.message || "Couldn't save your profile automatically. Please click Save.");
      return false;
    }
  };
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
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are TalentBridge's Capability Graph Engine. Analyze this candidate's holistic profile and build a structured map of their true execution capabilities — not just their job titles.

Current date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

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

Generate a deep capability analysis.

IMPORTANT: Rate each core execution vector's "strength" as an integer from 0 to 100 (100 = deepest, most proven expertise). Never return strength as a decimal or fraction.`,
        response_json_schema: {
          type: "object",
          properties: {
            core_execution_vectors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  vector: { type: "string" },
                  strength: { type: "number", description: "Integer from 0 to 100" },
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
      const normalizedResult = normalizeCapabilityGraph(result);
      setCapabilityGraph(normalizedResult);
      // Persist to the profile so employers can see it
      const profileId = profiles[0]?.id;
      if (profileId) {
        await base44.entities.SeekerProfile.update(profileId, { capability_graph: normalizedResult });
        queryClient.invalidateQueries({ queryKey: ["seekerProfile"] });
      }
      toast.success("Capability Graph saved to your profile!");
    } catch (err) {
      console.error("buildCapabilityGraph failed", err);
      toast.error(`Couldn't build your Capability Graph: ${err?.message || "please try again."}`);
    } finally {
      setGraphLoading(false);
    }
  };

  const getAiMatches = async () => {
    if (!profile?.headline && !profile?.skills?.length) {
      toast.error("Fill in your profile first for better matches.");
      return;
    }
    if (!jobs.length) {
      toast.error("No open roles fit your filters. Try loosening them.");
      return;
    }
    setMatchLoading(true);
    const pool = jobs.slice(0, 25);
    const poolKey = filtersKey;
    try {
      const jobSummaries = pool.map(j => ({
        id: j.id, title: j.title, company: j.company, skills: j.skills,
        location: j.location, work_type: j.work_type, employment_type: j.employment_type, experience_level: j.experience_level,
        culture_values: j.culture_values, description: (j.snippet || j.description)?.slice(0, 200),
        qualifications: j.qualifications?.slice(0, 200),
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are TalentBridge's Bi-Directional Semantic Matcher. Match this candidate with roles using capability alignment, not keyword matching.

Current date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

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
                  score: { type: "number", description: "Integer from 0 to 100" },
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
      // Keep the roles these matches were drawn from, so changing the
      // filters afterwards doesn't make the shown matches disappear.
      const ids = new Set(pool.map((j) => j.id));
      setAiMatches({
        ...result,
        jobs: pool,
        filtersKey: poolKey,
        matches: result?.matches?.filter((m) => ids.has(m?.job_id)).map((m) => ({ ...m, score: normalizePercent(m?.score) })),
      });
    } catch (err) {
      console.error("getAiMatches failed", err);
      toast.error(`Couldn't get AI matches: ${err?.message || "please try again."}`);
    } finally {
      setMatchLoading(false);
    }
  };

  const updateInvitationMutation = useMutation({
    mutationFn: async ({ id, status, job_id, seeker_profile_id }) => {
      // Accepting applies first, so a closed role or duplicate application
      // fails before the invitation is marked accepted.
      if (status === "accepted") {
        await base44.entities.JobApplication.create({
          job_id,
          seeker_profile_id,
          cover_letter: "Accepted invitation from employer",
        });
      }
      await base44.entities.Invitation.update(id, { status });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["myInvitations"] });
      queryClient.invalidateQueries({ queryKey: ["myApplications"] });
      toast.success(status === "accepted" ? "Applied to job!" : "Invitation updated!");
    },
    onError: (err) => {
      toast.error(err?.message || "Couldn't update the invitation. Please try again.");
    },
  });

  if (profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const invitationStatusLabel = { pending: "Pending", accepted: "Accepted", declined: "Declined" };
  const invitationStatusColor = { pending: "bg-amber-100 text-amber-700", accepted: "bg-green-100 text-green-700", declined: "bg-red-100 text-red-700" };



  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">My Capability Profile</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Build your Capability Graph. Let AI surface your full potential to the right employers.</p>
      </div>

      <div className="mb-6"><ProfileChecklist saved={profiles[0]} onGo={goToStep} /></div>
      {profiles[0] && profileCompleteness(profiles[0]).complete && profiles[0].open_to_opportunities !== false && (
        <div className="mb-6"><JobAlertNudge /></div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="profile" className="gap-1 text-xs sm:text-sm"><User className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Profile</span></TabsTrigger>
          <TabsTrigger value="resume" className="gap-1 text-xs sm:text-sm"><FileText className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Resume</span></TabsTrigger>
          <TabsTrigger value="portfolio" className="gap-1 text-xs sm:text-sm"><Globe className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Links</span></TabsTrigger>
          <TabsTrigger value="capability" className="gap-1 text-xs sm:text-sm"><Network className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Graph</span></TabsTrigger>
          <TabsTrigger value="matches" className="gap-1 text-xs sm:text-sm"><Brain className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Matches</span></TabsTrigger>
          <TabsTrigger value="applications" className="gap-1 text-xs sm:text-sm"><Briefcase className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Apps</span></TabsTrigger>
          <TabsTrigger value="invitations" className="gap-1 text-xs sm:text-sm"><Users className="w-3 h-3 sm:w-4 sm:h-4" /> ({invitations.length})</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">


          {/* Visibility to employers */}
          {(() => {
            const saved = profiles[0];
            const status = profileCompleteness(saved || {});
            const visibleOn = (saved?.open_to_opportunities ?? profile.open_to_opportunities) !== false;
            const toggle = async (on) => {
              update("open_to_opportunities", on);
              if (!saved) return; // saved with the profile
              try {
                await base44.entities.SeekerProfile.update(saved.id, { open_to_opportunities: on });
                queryClient.invalidateQueries({ queryKey: ["seekerProfile"] });
                toast.success(on ? "Employers can find you once your profile is complete." : "You're hidden from employer search.");
              } catch (err) {
                toast.error(err?.message || "Couldn't update your visibility.");
              }
            };
            return (
              <Card className="p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="visible-to-employers" className="text-sm font-medium cursor-pointer">Visible to employers</label>
                  <Switch id="visible-to-employers" checked={visibleOn} onCheckedChange={toggle} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {!visibleOn
                    ? "You're hidden from employer search. Employers you apply to can still see your application."
                    : saved && status.complete
                      ? "Approved employers can find your profile and invite you to apply."
                      : `Not visible yet. To appear in employer search (and to apply), add ${status.missing.join(", ")}, then save.`}
                </p>
              </Card>
            );
          })()}

          <Card className="p-4 sm:p-6 space-y-5">
            <h2 className="text-sm sm:text-base font-semibold">About You</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input id="full_name" autoComplete="name" placeholder="e.g. Jordan Rivera" value={profile.full_name || ""} onChange={(e) => update("full_name", e.target.value)} />
                <p className="text-xs text-muted-foreground">Shown to employers on your applications.</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Professional Headline</Label>
                <Input id="headline" placeholder="e.g. Systems builder who ships at velocity — React, Node, Supabase" value={profile.headline || ""} onChange={(e) => update("headline", e.target.value)} />
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

          <Card className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            <h2 className="text-sm sm:text-base font-semibold">Execution Capabilities</h2>
            <div className="space-y-2">
              <Label>Skills & Technologies</Label>
              <div className="flex gap-2">
                <Input id="skill-input" placeholder="Add a skill or tool" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
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

          <Card className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            <h2 className="text-sm sm:text-base font-semibold">What You're Looking For</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
            <Button size="sm" className="gap-2 sm:px-8" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </Button>
          </div>
        </TabsContent>

        {/* Resume Tab */}
        <TabsContent value="resume" className="space-y-5">
          <ResumeUploader
            profile={profile}
            onAutoSave={autoSave}
          />
          <ResumeCritique profile={profile} />
        </TabsContent>

        {/* Portfolio Tab */}
        <TabsContent value="portfolio" className="space-y-5">
          <PortfolioSection 
            seeker={profile} 
            onUpdate={() => queryClient.invalidateQueries({ queryKey: ["seekerProfile"] })}
          />
        </TabsContent>

        {/* Capability Graph Tab */}
         <TabsContent value="capability" className="space-y-4 sm:space-y-5">
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <Network className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> Your Capability Graph
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  AI maps your actual execution capabilities — not just titles — into a semantic profile employers can understand at a glance.
                </p>
              </div>
              <Button size="sm" className="gap-2 w-full sm:w-auto" onClick={buildCapabilityGraph} disabled={graphLoading}>
                {graphLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                Build Graph
              </Button>
            </div>

            {!capabilityGraph && !graphLoading && (
              <div className="text-center py-8 sm:py-14 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Network className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">No Capability Graph yet</p>
                <p className="text-xs mt-1 opacity-60">Fill in your profile and click "Build Graph" to generate your semantic capability map</p>
              </div>
            )}

            {capabilityGraph && (
              <div className="space-y-4 sm:space-y-5">
                {capabilityGraph.capability_headline && (
                  <div className="rounded-xl bg-primary/8 border border-primary/15 p-3 sm:p-4">
                    <p className="text-xs sm:text-sm font-semibold text-primary mb-1">Capability Headline</p>
                    <p className="text-sm sm:text-base font-medium text-foreground">{capabilityGraph.capability_headline}</p>
                  </div>
                )}

                {capabilityGraph.core_execution_vectors?.length > 0 && (
                  <div className="space-y-2 sm:space-y-3">
                    <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">Core Execution Vectors</h3>
                    {capabilityGraph.core_execution_vectors.map((v, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <span className="text-xs sm:text-sm font-medium truncate">{v.vector}</span>
                          <span className="text-xs text-muted-foreground">{v.strength}%</span>
                        </div>
                        <Progress value={v.strength} className="h-1.5" />
                        <p className="text-xs text-muted-foreground line-clamp-2">{v.evidence}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {capabilityGraph.architectural_pattern && (
                    <div className="rounded-lg bg-secondary p-3 sm:p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Architectural Pattern</p>
                      <p className="text-xs sm:text-sm line-clamp-3">{capabilityGraph.architectural_pattern}</p>
                    </div>
                  )}
                  {capabilityGraph.unique_methodology && (
                    <div className="rounded-lg bg-secondary p-3 sm:p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Unique Methodology</p>
                      <p className="text-xs sm:text-sm line-clamp-3">{capabilityGraph.unique_methodology}</p>
                    </div>
                  )}
                </div>

                {capabilityGraph.adjacent_zones?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Adjacent Adaptability Zones</h3>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {capabilityGraph.adjacent_zones.map((z, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-accent/8 border-accent/20 text-accent line-clamp-1">{z}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {capabilityGraph.suggested_role_types?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Roles You're Built For</h3>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {capabilityGraph.suggested_role_types.map((r, i) => (
                        <Badge key={i} variant="secondary" className="text-xs line-clamp-1">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Matches Tab */}
         <TabsContent value="matches" className="space-y-4 sm:space-y-5">
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> Semantic Role Matches
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Matched on capability alignment and problem-solving overlap — not keyword counting.
                </p>
              </div>
              {/* On phones the button sits under the filters instead. */}
              <div className="hidden sm:block">
              <Button size="sm" className="gap-2 w-full sm:w-auto" onClick={getAiMatches} disabled={matchLoading || poolLoading || !jobs.length}>
                {matchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Find Matches
              </Button>
              </div>
            </div>

            <MatchFilters filters={matchFilters} onChange={setMatchFilters} pool={suggested?.pool} />
            <div className="sm:hidden mb-4">
              <Button size="sm" className="gap-2 w-full sm:w-auto" onClick={getAiMatches} disabled={matchLoading || poolLoading || !jobs.length}>
                {matchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Find Matches
              </Button>
            </div>

            {!poolLoading && suggested && !jobs.length && (
              <p className="text-sm text-muted-foreground mb-4">
                {suggested.pool ? "None of the roles that fit these filters overlap with your profile yet. Try loosening a filter or adding skills to your profile." : "No open roles fit these filters. Try loosening one."}
              </p>
            )}

            {aiMatches && aiMatches.filtersKey !== filtersKey && (
              <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 mb-4">
                These matches are from your earlier filters. Tap Find Matches to update them.
              </p>
            )}

            {aiMatches?.search_insight && (
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 mb-4">
                <p className="text-xs sm:text-sm flex items-start gap-2 text-muted-foreground">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {aiMatches.search_insight}
                </p>
              </div>
            )}

            {aiMatches?.matches?.length > 0 && (
              <div className="space-y-4">
                {aiMatches.matches.map(match => {
                  const job = aiMatches.jobs.find(j => j.id === match.job_id);
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
              <div className="text-center py-8 sm:py-14 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                <Brain className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 opacity-20" />
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
                <ApplicationCard
                  key={app.id}
                  application={app}
                  job={job || app.job}
                  onUpdate={() => queryClient.invalidateQueries({ queryKey: ["myApplications"] })}
                />
              );
            })
          )}
        </TabsContent>

          {/* Invitations Tab */}
          <TabsContent value="invitations" className="space-y-2 sm:space-y-3">
          {invitations.length === 0 ? (
           <Card className="p-8 sm:p-12 text-center text-muted-foreground">
             <Users className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-20" />
             <p className="text-sm sm:text-base font-medium">No invitations yet</p>
             <p className="text-xs sm:text-sm mt-1">Employers will invite you to roles they think you're a great fit for</p>
           </Card>
          ) : (
           invitations.map(invitation => {
           const job = jobs.find(j => j.id === invitation.job_id) || invitation.job;
           const jobOpen = !job?.status || job.status === "active";
           return (
             <Card key={invitation.id} className="p-4 sm:p-5">
               <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                 <div className="flex-1 min-w-0">
                   <h3 className="font-semibold text-xs sm:text-sm truncate">{job?.title || "Unknown Role"}</h3>
                   <p className="text-xs text-muted-foreground mt-0.5 truncate">{job?.company || ""}</p>
                   {job?.location && (
                     <p className="text-xs text-muted-foreground mt-1 truncate">{job.location}</p>
                   )}
                 </div>
                 <Badge className={`text-xs whitespace-nowrap ${invitationStatusColor[invitation.status] || "bg-gray-100 text-gray-700"}`}>
                   {invitationStatusLabel[invitation.status] || invitation.status}
                 </Badge>
               </div>
               <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:mt-4">
                 {invitation.status === "pending" && !jobOpen && (
                   <p className="text-xs text-muted-foreground self-center">This role is no longer open.</p>
                 )}
                 {job && jobOpen && (
                   <Link to={`/jobs/${job.id}`} className="w-full sm:w-auto">
                     <Button size="sm" variant="ghost" className="gap-1 w-full sm:w-auto">
                       <Eye className="w-3.5 h-3.5" /> View Job
                     </Button>
                   </Link>
                 )}
                 {invitation.status === "pending" && jobOpen && (
                   <>
                     <Button size="sm" className="flex-1 sm:flex-none" onClick={() => updateInvitationMutation.mutate({ id: invitation.id, status: "accepted", job_id: invitation.job_id, seeker_profile_id: invitation.seeker_profile_id })} disabled={updateInvitationMutation.isPending}>
                       Accept & Apply
                     </Button>
                     <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => updateInvitationMutation.mutate({ id: invitation.id, status: "declined" })} disabled={updateInvitationMutation.isPending}>
                       Decline
                     </Button>
                   </>
                 )}
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