import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase, Users, Plus, Eye, Brain, Clock,
  CheckCircle2, BarChart3, Layers
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import CandidateCapabilityCard from "@/components/employer/CandidateCapabilityCard";
import ExploreSeekersPanel from "@/components/employer/ExploreSeekersPanel";

export default function EmployerDashboard() {
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState(null);

  const { data: myJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["myJobs"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.Job.filter({ created_by_id: user.id }, "-created_date");
    },
  });

  const { data: allApplications = [], isLoading: allAppsLoading } = useQuery({
    queryKey: ["allApplications"],
    queryFn: async () => {
      const allApps = await base44.entities.JobApplication.list("-created_date", 1000);
      return allApps.map(app => {
        const job = myJobs.find(j => j.id === app.job_id);
        return { ...app, matched_job: job };
      });
    },
    enabled: myJobs.length > 0,
  });

  const { data: allSeekers = [], isLoading: allSeekersLoading } = useQuery({
    queryKey: ["allSeekers"],
    queryFn: async () => {
      if (myJobs.length === 0) return [];
      const seekers = await base44.entities.SeekerProfile.list("", 1000);
      const matchedSeekers = [];
      
      for (const seeker of seekers) {
        const matchingJobs = [];
        for (const job of myJobs) {
          try {
            const result = await base44.functions.invoke("findMatchingSeekers", { job_id: job.id });
            const matches = result.data || [];
            if (matches.some(m => m.seeker_id === seeker.id)) {
              matchingJobs.push(job);
            }
          } catch {
            // Skip on error
          }
        }
        if (matchingJobs.length > 0) {
          matchedSeekers.push({ ...seeker, matched_jobs: matchingJobs });
        }
      }
      return matchedSeekers;
    },
    enabled: myJobs.length > 0,
  });

  const updateAppMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.JobApplication.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobApplications"] }),
  });

  const selectedJobData = myJobs.find(j => j.id === selectedJob);

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
        <Link to="/post-job">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Post New Role
          </Button>
        </Link>
      </div>

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

      <Tabs defaultValue="jobs">
        <TabsList className="mb-6">
          <TabsTrigger value="jobs" className="gap-2">
            <Briefcase className="w-4 h-4" /> My Roles ({myJobs.length})
          </TabsTrigger>
          <TabsTrigger value="candidates" className="gap-2">
            <Users className="w-4 h-4" /> Candidates ({allApplications.length})
          </TabsTrigger>
          <TabsTrigger value="explore" className="gap-2">
            <Users className="w-4 h-4" /> Explore Seekers ({allSeekers.length})
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
                      <Badge variant={job.status === "active" ? "default" : "secondary"} className="text-xs">
                        {job.status === "active" ? "Active" : job.status}
                      </Badge>
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
                  <div className="flex items-center gap-2">
                    <Link to={`/jobs/${job.id}`} onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); setSelectedJob(job.id); }}
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
          {allAppsLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          ) : allApplications.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No applications yet across your roles.</p>
            </Card>
          ) : (
            allApplications.map(app => (
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
            {allSeekersLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            ) : allSeekers.length === 0 ? (
              <Card className="p-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No matching seekers found for your active roles.</p>
              </Card>
            ) : (
              allSeekers.map(seeker => (
                <Card key={seeker.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm">{seeker.headline}</h3>
                      {seeker.bio && <p className="text-xs text-muted-foreground mt-1">{seeker.bio.substring(0, 100)}</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Matches with:</p>
                    <div className="flex flex-wrap gap-2">
                      {seeker.matched_jobs.map(job => (
                        <Badge key={job.id} className="text-xs">
                          {job.title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {seeker.skills && seeker.skills.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Skills:</p>
                      <div className="flex flex-wrap gap-1">
                        {seeker.skills.slice(0, 5).map((skill, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {seeker.skills.length > 5 && (
                          <Badge variant="secondary" className="text-xs">
                            +{seeker.skills.length - 5}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </TabsContent>
          </Tabs>
          </div>
          );
          }