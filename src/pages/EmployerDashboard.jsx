import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Users, Plus, Eye, Sparkles, Loader2, Brain, TrendingUp, Clock, CheckCircle2, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function EmployerDashboard() {
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState(null);
  const [aiVetting, setAiVetting] = useState({});
  const [vettingLoading, setVettingLoading] = useState({});

  const { data: myJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["myJobs"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.Job.filter({ created_by_id: user.id }, "-created_date");
    },
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["jobApplications", selectedJob],
    queryFn: () => {
      if (!selectedJob) return [];
      return base44.entities.JobApplication.filter({ job_id: selectedJob }, "-created_date");
    },
    enabled: !!selectedJob,
  });

  const updateAppMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.JobApplication.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobApplications"] });
      toast.success("Application status updated");
    },
  });

  const vetCandidate = async (application) => {
    const job = myJobs.find((j) => j.id === application.job_id);
    if (!job) return;
    setVettingLoading((p) => ({ ...p, [application.id]: true }));

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a people-first AI hiring assistant. Analyze this candidate for the role. Be encouraging and focus on potential, transferable skills, and growth opportunities. NEVER be harsh or dismissive. Even if the candidate isn't a perfect match, highlight their strengths and where they could contribute.

Job: ${job.title} at ${job.company}
Description: ${job.description}
Required Skills: ${job.skills?.join(", ")}
Culture Values: ${job.culture_values?.join(", ")}

Candidate Application:
Name: ${application.applicant_name}
Cover Letter: ${application.cover_letter || "Not provided"}

Provide a fair, encouraging assessment.`,
      response_json_schema: {
        type: "object",
        properties: {
          match_score: { type: "number" },
          strengths: { type: "array", items: { type: "string" } },
          growth_areas: { type: "array", items: { type: "string" } },
          recommendation: { type: "string" },
          culture_fit_note: { type: "string" },
        },
      },
    });

    setAiVetting((p) => ({ ...p, [application.id]: result }));
    setVettingLoading((p) => ({ ...p, [application.id]: false }));

    // Save to application
    base44.entities.JobApplication.update(application.id, {
      ai_match_score: result.match_score,
      ai_match_summary: result.recommendation,
      ai_growth_potential: result.growth_areas?.join("; "),
    });
  };

  const statusLabel = { applied: "New", reviewed: "Reviewed", shortlisted: "Shortlisted", interview: "Interview", offered: "Offered", rejected: "Not Selected", withdrawn: "Withdrawn" };
  const statusColor = { applied: "bg-blue-100 text-blue-700", reviewed: "bg-yellow-100 text-yellow-700", shortlisted: "bg-green-100 text-green-700", interview: "bg-purple-100 text-purple-700", offered: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-700", withdrawn: "bg-gray-100 text-gray-700" };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Employer Dashboard</h1>
          <p className="text-muted-foreground">Manage your job postings and review candidates.</p>
        </div>
        <Link to="/post-job">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Post New Job
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="jobs">
        <TabsList className="mb-6">
          <TabsTrigger value="jobs" className="gap-2"><Briefcase className="w-4 h-4" /> My Jobs ({myJobs.length})</TabsTrigger>
          <TabsTrigger value="candidates" className="gap-2"><Users className="w-4 h-4" /> Candidates</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-3">
          {jobsLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : myJobs.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No jobs posted yet</p>
              <Link to="/post-job"><Button className="mt-4 gap-2"><Plus className="w-4 h-4" /> Post Your First Job</Button></Link>
            </Card>
          ) : (
            myJobs.map((job) => (
              <Card key={job.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-base">{job.title}</h3>
                      <Badge variant={job.status === "active" ? "default" : "secondary"}>
                        {job.status === "active" ? "Active" : job.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span>{job.company}</span>
                      {job.location && <span>· {job.location}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {job.created_date ? formatDistanceToNow(new Date(job.created_date), { addSuffix: true }) : "Recently"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/jobs/${job.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <Eye className="w-4 h-4" /> View
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => setSelectedJob(job.id)}
                    >
                      <Users className="w-4 h-4" /> Candidates
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="candidates" className="space-y-4">
          {!selectedJob ? (
            <Card className="p-8 text-center text-muted-foreground">
              <p>Select a job from the "My Jobs" tab to view its candidates.</p>
              <p className="text-sm mt-1">Click "Candidates" on any job posting.</p>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">
                  Candidates for: {myJobs.find((j) => j.id === selectedJob)?.title}
                </h3>
                <Badge variant="secondary">{applications.length} applicants</Badge>
              </div>

              {applications.length === 0 ? (
                <Card className="p-12 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No applications yet for this position.</p>
                </Card>
              ) : (
                applications.map((app) => (
                  <Card key={app.id} className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{app.applicant_name || "Anonymous"}</h4>
                        <p className="text-sm text-muted-foreground">{app.applicant_email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {app.ai_match_score && (
                          <Badge className="bg-accent/10 text-accent border-accent/20 gap-1">
                            <Sparkles className="w-3 h-3" /> {app.ai_match_score}%
                          </Badge>
                        )}
                        <Select
                          value={app.status}
                          onValueChange={(v) => updateAppMutation.mutate({ id: app.id, status: v })}
                        >
                          <SelectTrigger className="w-36 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="applied">New</SelectItem>
                            <SelectItem value="reviewed">Reviewed</SelectItem>
                            <SelectItem value="shortlisted">Shortlisted</SelectItem>
                            <SelectItem value="interview">Interview</SelectItem>
                            <SelectItem value="offered">Offered</SelectItem>
                            <SelectItem value="rejected">Not Selected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {app.cover_letter && (
                      <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3 mb-3">
                        "{app.cover_letter}"
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => vetCandidate(app)}
                        disabled={vettingLoading[app.id]}
                      >
                        {vettingLoading[app.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Brain className="w-3.5 h-3.5 text-primary" />
                        )}
                        AI Assessment
                      </Button>
                    </div>

                    {aiVetting[app.id] && (
                      <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-primary" /> AI Assessment
                          </span>
                          <Badge className="bg-accent/10 text-accent">{aiVetting[app.id].match_score}% match</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{aiVetting[app.id].recommendation}</p>
                        {aiVetting[app.id].strengths?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Strengths
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {aiVetting[app.id].strengths.map((s, i) => (
                                <Badge key={i} variant="secondary" className="text-xs bg-green-50 text-green-700">{s}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiVetting[app.id].growth_areas?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> Growth Potential
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {aiVetting[app.id].growth_areas.map((g, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{g}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {aiVetting[app.id].culture_fit_note && (
                          <p className="text-xs text-muted-foreground italic">💡 {aiVetting[app.id].culture_fit_note}</p>
                        )}
                      </div>
                    )}
                  </Card>
                ))
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}