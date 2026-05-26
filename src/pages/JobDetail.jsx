import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft, MapPin, Building2, Clock, DollarSign,
  Send, CheckCircle2, Loader2, TrendingUp, Heart,
  Network, BookOpen, Layers
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import HiddenVectorsPanel from "@/components/jobs/HiddenVectorsPanel";
import InterviewPrepEngine from "@/components/jobs/InterviewPrepEngine";

const workTypeLabel = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const employmentLabel = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship", freelance: "Freelance" };
const levelLabel = { entry: "Entry Level", mid: "Mid Level", senior: "Senior", lead: "Lead", executive: "Executive" };

export default function JobDetail() {
  const { id } = useParams();
  const [coverLetter, setCoverLetter] = useState("");
  const [applied, setApplied] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // 'vectors' | 'prep' | null
  const queryClient = useQueryClient();

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const jobs = await base44.entities.Job.filter({ id });
      return jobs[0];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["seekerProfileForDetail"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.SeekerProfile.filter({ created_by_id: user.id });
    },
  });

  const profile = profiles[0] || null;

  const applyMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      await base44.entities.JobApplication.create({
        job_id: id,
        cover_letter: coverLetter,
        applicant_name: user?.full_name || "Anonymous",
        applicant_email: user?.email || "",
        status: "applied",
        seeker_profile_id: profile?.id || null,
        resume_url: profile?.resume_url || null,
      });
    },
    onSuccess: () => {
      setApplied(true);
      setApplyOpen(false);
      toast.success("Application submitted. The employer will receive your Capability Profile.");
    },
  });

  const formatSalary = (min, max) => {
    if (!min && !max) return null;
    const fmt = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    return `Up to ${fmt(max)}`;
  };

  if (jobLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-semibold">Role not found</h2>
        <Link to="/jobs"><Button variant="link" className="mt-4">Back to roles</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/jobs">
        <Button variant="ghost" size="sm" className="gap-2 mb-6 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Roles
        </Button>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header */}
          <div>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                {job.company_logo_url ? (
                  <img src={job.company_logo_url} alt={job.company} className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <Building2 className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold">{job.title}</h1>
                <p className="text-lg text-muted-foreground mt-0.5">{job.company}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {job.location && (
                <Badge variant="secondary" className="gap-1"><MapPin className="w-3 h-3" /> {job.location}</Badge>
              )}
              {job.work_type && <Badge variant="secondary">{workTypeLabel[job.work_type]}</Badge>}
              {job.employment_type && <Badge variant="secondary">{employmentLabel[job.employment_type]}</Badge>}
              {job.experience_level && <Badge variant="outline">{levelLabel[job.experience_level]}</Badge>}
              {formatSalary(job.salary_min, job.salary_max) && (
                <Badge variant="secondary" className="gap-1"><DollarSign className="w-3 h-3" /> {formatSalary(job.salary_min, job.salary_max)}</Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                <Clock className="w-3 h-3" />
                {job.created_date ? formatDistanceToNow(new Date(job.created_date), { addSuffix: true }) : "Recently"}
              </Badge>
            </div>
          </div>

          <Card className="p-6">
            <h2 className="text-base font-semibold mb-3">About this role</h2>
            <div className="prose prose-sm max-w-none text-muted-foreground">
              <ReactMarkdown>{job.description}</ReactMarkdown>
            </div>
          </Card>

          {job.responsibilities && (
            <Card className="p-6">
              <h2 className="text-base font-semibold mb-3">What you'll do</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.responsibilities}</ReactMarkdown>
              </div>
            </Card>
          )}

          {job.qualifications && (
            <Card className="p-6">
              <h2 className="text-base font-semibold mb-3">What we're looking for</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.qualifications}</ReactMarkdown>
              </div>
            </Card>
          )}

          {job.nice_to_haves && (
            <Card className="p-6 border-dashed">
              <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
                <Heart className="w-4 h-4 text-accent" /> Nice to have
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                These aren't required — our Capability Engine will show how your adjacent skills bridge any gaps.
              </p>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.nice_to_haves}</ReactMarkdown>
              </div>
            </Card>
          )}

          {job.benefits && (
            <Card className="p-6">
              <h2 className="text-base font-semibold mb-3">Benefits & Perks</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.benefits}</ReactMarkdown>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {applied ? (
            <Card className="p-5 bg-accent/8 border-accent/25">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-accent" />
                <div>
                  <h3 className="font-semibold text-sm text-accent">Application Submitted</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Your Capability Profile has been sent.</p>
                </div>
              </div>
            </Card>
          ) : (
            <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
              <DialogTrigger asChild>
                <Button className="w-full h-11 text-sm gap-2 shadow-md shadow-primary/20">
                  <Send className="w-4 h-4" /> Apply to This Role
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Apply to {job.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="rounded-lg bg-primary/5 border border-primary/15 p-3 text-xs text-muted-foreground">
                    <Layers className="w-3.5 h-3.5 text-primary inline mr-1.5" />
                    Your full Capability Profile will be shared with {job.company} — not just this cover letter.
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Statement (optional)</label>
                    <Textarea
                      placeholder="What specifically excites you about the problems this role solves? What have you built that's directly relevant?"
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      className="min-h-[130px] text-sm"
                    />
                  </div>
                  <Button className="w-full gap-2" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                    {applyMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Submit Application</>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Panel Toggles */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={activePanel === "vectors" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setActivePanel(p => p === "vectors" ? null : "vectors")}
            >
              <Network className="w-3.5 h-3.5" /> Capability Fit
            </Button>
            <Button
              variant={activePanel === "prep" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setActivePanel(p => p === "prep" ? null : "prep")}
            >
              <BookOpen className="w-3.5 h-3.5" /> Interview Prep
            </Button>
          </div>

          {activePanel === "vectors" && (
            <HiddenVectorsPanel job={job} profile={profile} />
          )}

          {activePanel === "prep" && (
            <InterviewPrepEngine job={job} profile={profile} />
          )}

          {job.skills?.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                ))}
              </div>
            </Card>
          )}

          {job.culture_values?.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">Culture & Values</h3>
              <div className="flex flex-wrap gap-1.5">
                {job.culture_values.map((v) => (
                  <Badge key={v} variant="outline" className="text-xs bg-accent/8 border-accent/20 text-accent">{v}</Badge>
                ))}
              </div>
            </Card>
          )}

          {job.growth_opportunities && (
            <Card className="p-4">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary" /> Growth Path
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{job.growth_opportunities}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}