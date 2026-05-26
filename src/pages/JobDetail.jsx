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
import { ArrowLeft, MapPin, Building2, Clock, DollarSign, Briefcase, Sparkles, Send, CheckCircle2, Loader2, TrendingUp, Heart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const workTypeLabel = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const employmentLabel = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship", freelance: "Freelance" };
const levelLabel = { entry: "Entry Level", mid: "Mid Level", senior: "Senior", lead: "Lead", executive: "Executive" };

export default function JobDetail() {
  const { id } = useParams();
  const [coverLetter, setCoverLetter] = useState("");
  const [applied, setApplied] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const jobs = await base44.entities.Job.filter({ id });
      return jobs[0];
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      await base44.entities.JobApplication.create({
        job_id: id,
        cover_letter: coverLetter,
        applicant_name: user?.full_name || "Anonymous",
        applicant_email: user?.email || "",
        status: "applied",
      });
    },
    onSuccess: () => {
      setApplied(true);
      setApplyOpen(false);
      toast.success("Application submitted! The employer will be in touch.");
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    },
  });

  const getAiInsight = async () => {
    if (!job) return;
    setLoadingInsight(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a career advisor AI. Analyze this job posting and provide helpful, encouraging insights for a job seeker. Focus on:
1. What makes this role exciting
2. Transferable skills that could apply (even from unrelated fields)
3. Tips for a strong application
4. Growth potential in this role

Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Qualifications: ${job.qualifications || "Not specified"}
Nice-to-haves: ${job.nice_to_haves || "Not specified"}
Skills: ${job.skills?.join(", ") || "Not specified"}

Keep it encouraging, concise, and actionable. Use markdown formatting.`,
    });
    setAiInsight(result);
    setLoadingInsight(false);
  };

  const formatSalary = (min, max) => {
    if (!min && !max) return null;
    const fmt = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    return `Up to ${fmt(max)}`;
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-semibold">Job not found</h2>
        <Link to="/jobs"><Button variant="link" className="mt-4">Back to jobs</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/jobs">
        <Button variant="ghost" size="sm" className="gap-2 mb-6 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </Button>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                {job.company_logo_url ? (
                  <img src={job.company_logo_url} alt={job.company} className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <Building2 className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">{job.title}</h1>
                <p className="text-lg text-muted-foreground mt-1">{job.company}</p>
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
            <h2 className="text-lg font-semibold mb-3">About this role</h2>
            <div className="prose prose-sm max-w-none text-muted-foreground">
              <ReactMarkdown>{job.description}</ReactMarkdown>
            </div>
          </Card>

          {job.responsibilities && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-3">What you'll do</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.responsibilities}</ReactMarkdown>
              </div>
            </Card>
          )}

          {job.qualifications && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-3">What we're looking for</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.qualifications}</ReactMarkdown>
              </div>
            </Card>
          )}

          {job.nice_to_haves && (
            <Card className="p-6 border-dashed">
              <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <Heart className="w-4 h-4 text-accent" /> Nice to have
              </h2>
              <p className="text-xs text-muted-foreground mb-3">These aren't required — don't let them stop you from applying!</p>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.nice_to_haves}</ReactMarkdown>
              </div>
            </Card>
          )}

          {job.benefits && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-3">Benefits & Perks</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown>{job.benefits}</ReactMarkdown>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {applied ? (
            <Card className="p-6 bg-green-50 border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <div>
                  <h3 className="font-semibold text-green-800">Applied!</h3>
                  <p className="text-sm text-green-600">Your application has been submitted.</p>
                </div>
              </div>
            </Card>
          ) : (
            <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
              <DialogTrigger asChild>
                <Button className="w-full h-12 text-base gap-2 shadow-lg shadow-primary/20">
                  <Send className="w-4 h-4" /> Apply Now
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Apply to {job.title} at {job.company}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Why are you a great fit? (optional)</label>
                    <Textarea
                      placeholder="Share what excites you about this role, your relevant experience, or anything else you'd like the employer to know..."
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      className="min-h-[150px]"
                    />
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() => applyMutation.mutate()}
                    disabled={applyMutation.isPending}
                  >
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

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={getAiInsight}
            disabled={loadingInsight}
          >
            {loadingInsight ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-4 h-4 text-accent" /> Get AI Career Insight</>
            )}
          </Button>

          {aiInsight && (
            <Card className="p-5 bg-accent/5 border-accent/20">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">AI Career Insight</h3>
              </div>
              <div className="prose prose-sm max-w-none text-sm">
                <ReactMarkdown>{aiInsight}</ReactMarkdown>
              </div>
            </Card>
          )}

          {job.skills?.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-3">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                ))}
              </div>
            </Card>
          )}

          {job.culture_values?.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Heart className="w-3.5 h-3.5 text-accent" /> Culture & Values
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {job.culture_values.map((v) => (
                  <Badge key={v} variant="outline" className="text-xs bg-accent/5 border-accent/20 text-accent">{v}</Badge>
                ))}
              </div>
            </Card>
          )}

          {job.growth_opportunities && (
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-primary" /> Growth Opportunities
              </h3>
              <p className="text-sm text-muted-foreground">{job.growth_opportunities}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}