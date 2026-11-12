import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Briefcase, Users, Plus, Eye, Clock, Layers, Send, Pencil, Trash2, Building2, Lock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import CandidateCapabilityCard from "@/components/employer/CandidateCapabilityCard";
import EmployerStatusBanner from "@/components/employer/EmployerStatusBanner";
import ProfessionalLinks, { linksOf } from "@/components/seeker/ProfessionalLinks";
import { useAuth } from "@/lib/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// AI match score (0-100) that counts as a strong match ("Strong matches only").
const MATCH_THRESHOLD = 60;

const JOB_STATUS = {
  active: { label: "Open", badge: "default" },
  paused: { label: "Paused", badge: "secondary" },
  closed: { label: "Closed", badge: "outline" },
  pending_review: { label: "Awaiting approval", badge: "secondary" },
};

const scoreTone = (score) =>
  score >= MATCH_THRESHOLD
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : score >= 40
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-secondary text-muted-foreground border-border";

export default function EmployerDashboard() {
  const { user } = useAuth();
  const approved = user?.employer_status === "approved";
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState(null);
  const [tab, setTab] = useState("jobs");
  const [strongOnly, setStrongOnly] = useState(false);
  const [invitingSeekerId, setInvitingSeekerId] = useState(null);

  const { data: myJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["myJobs"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.Job.filter({ created_by_id: user.id }, "-created_date");
    },
  });

  const { data: allApplications = [], isLoading: allAppsLoading } = useQuery({
    queryKey: ["allApplications", myJobs],
    queryFn: async () => {
      const allApps = await base44.entities.JobApplication.list("-created_date", 1000);
      return allApps.map(app => {
        const job = myJobs.find(j => j.id === app.job_id);
        return { ...app, matched_job: job };
      });
    },
  });

  // One matching call per open role. The server lists only complete, visible
  // profiles, caches one score per (role, seeker), and never scores a profile
  // with nothing to judge. Group per seeker; filter by strength at render time.
  const openJobs = myJobs.filter((j) => (j.status || "active") === "active");
  const { data: explore = { seekers: [], unscored: 0, failedRoles: [], hiddenIncomplete: 0 }, isLoading: allSeekersLoading } = useQuery({
    queryKey: ["allSeekers", openJobs.map((j) => `${j.id}:${j.updated_date}`).join(",")],
    enabled: openJobs.length > 0 && approved,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const results = await Promise.allSettled(
        openJobs.map((job) => base44.functions.invoke("findMatchingSeekers", { job_id: job.id }))
      );
      const bySeeker = new Map();
      const failedRoles = [];
      let unscored = 0;
      let hiddenIncomplete = 0;
      results.forEach((r, i) => {
        const job = openJobs[i];
        if (r.status !== "fulfilled") {
          failedRoles.push(job.title);
          return;
        }
        unscored += r.value.data?.unscored || 0;
        hiddenIncomplete = Math.max(hiddenIncomplete, r.value.data?.hidden_incomplete || 0);
        for (const m of r.value.data?.matches || []) {
          if (!m.seeker) continue;
          const entry = bySeeker.get(m.seeker_id) || { ...m.seeker, roles: [] };
          entry.roles.push({ job, score: m.match_score, status: m.status, summary: m.match_summary || "" });
          bySeeker.set(m.seeker_id, entry);
        }
      });
      const seekers = [...bySeeker.values()].map((sk) => {
        sk.roles.sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
        const scored = sk.roles.filter((r) => r.score != null);
        return { ...sk, best_score: scored.length ? scored[0].score : null };
      });
      seekers.sort((x, y) => (y.best_score ?? -1) - (x.best_score ?? -1));
      return { seekers, unscored, failedRoles, hiddenIncomplete };
    },
  });

  const exploreSeekers = strongOnly
    ? explore.seekers
        .map((sk) => ({ ...sk, roles: sk.roles.filter((r) => (r.score ?? 0) >= MATCH_THRESHOLD) }))
        .filter((sk) => sk.roles.length > 0)
    : explore.seekers;
  const hiddenByFilter = explore.seekers.length - exploreSeekers.length;

  const jobStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Job.update(id, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["myJobs"] });
      toast.success(
        status === "active" ? "Role reopened — it's back on the job board."
          : status === "paused" ? "Role paused — hidden from the job board, no new applications."
            : "Role closed — hidden from the job board, no new applications."
      );
    },
    onError: (err) => toast.error(err?.message || "Couldn't update the role."),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id) => base44.entities.Job.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myJobs"] });
      setSelectedJob(null);
      toast.success("Role deleted.");
    },
    onError: (err) => toast.error(err?.message || "Couldn't delete the role."),
  });

  const applicantCount = (jobId) => allApplications.filter((a) => a.job_id === jobId && a.status !== "withdrawn").length;

  const updateAppMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.JobApplication.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["allApplications"] }),
  });

  const inviteMutation = useMutation({
    mutationFn: ({ seeker_profile_id, job_id }) =>
      base44.functions.invoke("inviteSeekerToJob", { seeker_profile_id, job_id }),
    onSuccess: () => {
      toast.success("Invitation sent successfully!");
      setInvitingSeekerId(null);
    },
    onError: () => {
      toast.error("Failed to send invitation");
    },
  });

  const selectedJobData = myJobs.find(j => j.id === selectedJob);
  const visibleApplications = selectedJob
    ? allApplications.filter((a) => a.job_id === selectedJob)
    : allApplications;

  const totalApplications = myJobs.reduce((sum) => sum + 0, 0);
  const activeJobs = myJobs.filter(j => j.status === "active").length;

  const statusGroups = {
    new: allApplications.filter(a => a.status === "applied").length,
    shortlisted: allApplications.filter(a => a.status === "shortlisted").length,
    interview: allApplications.filter(a => a.status === "interview").length,
    offered: allApplications.filter(a => a.status === "offered").length,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Employer Dashboard</h1>
          <p className="text-muted-foreground">AI-powered candidate capability assessments — see beyond the resume.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link to="/company">
            <Button variant="outline" className="gap-2">
              <Building2 className="w-4 h-4" /> <span className="hidden sm:inline">Company profile</span>
            </Button>
          </Link>
          <Link to="/post-job">
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Post New Role
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-6 empty:hidden"><EmployerStatusBanner user={user} /></div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Roles", value: activeJobs, icon: Briefcase, color: "text-primary" },
          { label: "Total Roles", value: myJobs.length, icon: Layers, color: "text-muted-foreground" },
          { label: "Viewing Role", value: selectedJob ? "1" : "—", icon: Eye, color: "text-accent" },
          { label: "Applicants", value: allApplications.length, icon: Users, color: "text-primary" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* On phones the three tabs must fit the screen width (they used to
            overflow and make the whole page scroll sideways). */}
        <TabsList className="mb-6 w-full sm:w-auto max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="jobs" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Briefcase className="w-4 h-4 shrink-0" /> <span><span className="hidden sm:inline">My </span>Roles ({myJobs.length})</span>
          </TabsTrigger>
          <TabsTrigger value="candidates" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Users className="w-4 h-4 shrink-0" /> Candidates ({allApplications.length})
          </TabsTrigger>
          <TabsTrigger value="explore" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Users className="w-4 h-4 shrink-0" /> <span><span className="hidden sm:inline">Explore </span>Seekers ({exploreSeekers.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-3">
          {jobsLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : myJobs.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No roles posted yet</p>
              <Link to="/post-job">
                <Button className="mt-4 gap-2"><Plus className="w-4 h-4" /> Post Your First Role</Button>
              </Link>
            </Card>
          ) : (
            myJobs.map(job => (
              <Card
                key={job.id}
                className={`p-5 hover:shadow-md transition-all cursor-pointer ${selectedJob === job.id ? "border-primary/40 bg-primary/3" : ""}`}
                onClick={() => setSelectedJob(job.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-sm">{job.title}</h3>
                      <Badge variant={(JOB_STATUS[job.status] || JOB_STATUS.active).badge} className="text-xs">
                        {(JOB_STATUS[job.status] || { label: job.status }).label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {applicantCount(job.id)} applicant{applicantCount(job.id) === 1 ? "" : "s"}
                      </span>
                      {selectedJob === job.id && (
                        <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Viewing</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span>{job.company}</span>
                      {job.location && <span>· {job.location}</span>}
                      {job.work_type && <span>· {job.work_type}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {job.created_date ? formatDistanceToNow(new Date(job.created_date), { addSuffix: true }) : "Recently"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end" onClick={e => e.stopPropagation()}>
                    {job.status === "pending_review" ? null : (
                    <Select
                      value={job.status || "active"}
                      onValueChange={(status) => jobStatusMutation.mutate({ id: job.id, status })}
                      disabled={jobStatusMutation.isPending}
                    >
                      <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Role status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Open</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    )}
                    <Link to={`/post-job?edit=${job.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    </Link>
                    {applicantCount(job.id) === 0 && !allApplications.some((a) => a.job_id === job.id) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" aria-label="Delete role">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete “{job.title}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the role. Roles with applicants can only be closed, not deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteJobMutation.mutate(job.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Link to={`/jobs/${job.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => { setSelectedJob(job.id); setTab("candidates"); }}
                    >
                      <Users className="w-3.5 h-3.5" /> Candidates
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Candidates Tab */}
        <TabsContent value="candidates" className="space-y-4">
          {selectedJobData && (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-muted-foreground">Showing candidates for</span>
              <Badge>{selectedJobData.title}</Badge>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedJob(null)}>
                Show all roles
              </Button>
            </div>
          )}
          {allAppsLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          ) : visibleApplications.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>{selectedJobData ? "No applications for this role yet." : "No applications yet across your roles."}</p>
            </Card>
          ) : (
            visibleApplications.map(app => (
              <div key={app.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Matching role:</p>
                    {app.matched_job && (
                      <Badge className="text-xs gap-1 mt-1">
                        {app.matched_job.title}
                      </Badge>
                    )}
                  </div>
                </div>
                <CandidateCapabilityCard
                  application={app}
                  job={app.matched_job}
                  onStatusChange={(id, status) => updateAppMutation.mutate({ id, status })}
                />
              </div>
            ))
          )}
        </TabsContent>

          {/* Explore Seekers Tab */}
          <TabsContent value="explore" className="space-y-4">
            {!approved ? (
              <Card className="p-10 text-center text-muted-foreground">
                <Lock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium text-foreground">Candidate search unlocks once you’re approved</p>
                <p className="text-sm mt-1">We review every employer to keep job seekers safe. We’ll email you as soon as you’re verified.</p>
              </Card>
            ) : (<>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Every job seeker, scored by AI against each of your roles. Best match first.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Switch id="strong-only" checked={strongOnly} onCheckedChange={setStrongOnly} />
                <Label htmlFor="strong-only" className="text-sm cursor-pointer">
                  Strong matches only ({MATCH_THRESHOLD}%+)
                </Label>
              </div>
            </div>

            {!allSeekersLoading && (hiddenByFilter > 0 || explore.unscored > 0 || explore.failedRoles.length > 0 || (explore.hiddenIncomplete > 0 && explore.seekers.length > 0)) && (
              <div className="rounded-lg border bg-secondary/50 px-4 py-3 text-xs text-muted-foreground space-y-1">
                {hiddenByFilter > 0 && (
                  <p>
                    {hiddenByFilter} seeker{hiddenByFilter === 1 ? "" : "s"} scored below {MATCH_THRESHOLD}% and {hiddenByFilter === 1 ? "is" : "are"} hidden.{" "}
                    <button type="button" className="underline text-foreground" onClick={() => setStrongOnly(false)}>Show all</button>
                  </p>
                )}
                {explore.unscored > 0 && (
                  <p>{explore.unscored} seeker match{explore.unscored === 1 ? "" : "es"} couldn't be scored right now (AI unavailable) — reload later to include them.</p>
                )}
                {explore.hiddenIncomplete > 0 && explore.seekers.length > 0 && (
                  <p>{explore.hiddenIncomplete} more seeker{explore.hiddenIncomplete === 1 ? " is" : "s are"} still completing {explore.hiddenIncomplete === 1 ? "their profile" : "their profiles"} and will appear here once done.</p>
                )}
                {explore.failedRoles.length > 0 && (
                  <p>Matching failed for: {explore.failedRoles.join(", ")}. Reload later to try again.</p>
                )}
              </div>
            )}

            {allSeekersLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            ) : exploreSeekers.length === 0 ? (
              <Card className="p-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>
                  {openJobs.length === 0
                    ? "Open a role to see matching seekers."
                    : explore.seekers.length > 0
                      ? `No seekers scored ${MATCH_THRESHOLD}% or higher for your roles.`
                      : "Seekers are still completing their profiles — check back soon."}
                </p>
              </Card>
            ) : (
              exploreSeekers.map(seeker => {
                const vectors = (seeker.capability_graph?.core_execution_vectors || []).slice(0, 3);
                return (
                <Card key={seeker.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">{seeker.full_name}</h3>
                      {seeker.headline && <p className="text-sm text-foreground/80 mt-0.5">{seeker.headline}</p>}
                      {seeker.bio && <p className="text-xs text-muted-foreground mt-1">{seeker.bio.substring(0, 140)}{seeker.bio.length > 140 ? "…" : ""}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {vectors.length > 0 && (
                          <Badge variant="outline" className="text-[11px] bg-primary/5 text-primary border-primary/20">Capability Graph built ✓</Badge>
                        )}
                        {seeker.has_resume && <Badge variant="outline" className="text-[11px]">Resume on file</Badge>}
                        {vectors.map((v, i) => (
                          <Badge key={i} variant="secondary" className="text-[11px]">{v.vector}</Badge>
                        ))}
                      </div>
                      {linksOf(seeker).length > 0 && <div className="mt-2"><ProfessionalLinks links={linksOf(seeker)} /></div>}
                    </div>
                    {seeker.best_score != null && (
                      <Badge variant="outline" className={`text-xs shrink-0 ${scoreTone(seeker.best_score)}`}>
                        Best {seeker.best_score}%
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {seeker.roles.map(({ job, score, status, summary }) => (
                      <div key={job.id} className="rounded-lg border border-border/60 p-2.5 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Match for</span>
                          <Badge className="text-xs">{job.title}</Badge>
                          {score != null ? (
                            <Badge variant="outline" className={`text-xs ${scoreTone(score)}`}>{score}%</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {status === "insufficient_data" ? "Not enough profile to match yet" : "Not scored yet"}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 gap-1 text-xs ml-auto"
                            onClick={() => inviteMutation.mutate({ seeker_profile_id: seeker.id, job_id: job.id })}
                            disabled={invitingSeekerId === seeker.id || inviteMutation.isPending}
                            title={`Invite to apply for ${job.title}`}
                          >
                            <Send className="w-3.5 h-3.5" /> Invite
                          </Button>
                        </div>
                        {score != null && summary && <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>}
                      </div>
                    ))}
                  </div>
                  {seeker.skills && seeker.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {seeker.skills.slice(0, 6).map((skill, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">{skill}</Badge>
                      ))}
                      {seeker.skills.length > 6 && <Badge variant="secondary" className="text-xs">+{seeker.skills.length - 6}</Badge>}
                    </div>
                  )}
                </Card>
                );
              })
            )}
            </>)}
          </TabsContent>
          </Tabs>
          </div>
          );
          }