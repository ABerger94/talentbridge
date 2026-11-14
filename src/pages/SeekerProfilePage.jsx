import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Loader2, Send, UserX } from "lucide-react";
import { toast } from "sonner";
import ProfileView from "@/components/profile/ProfileView";

// Employers: invite this seeker to one of their open roles.
function InviteToApply({ profileId }) {
  const [jobId, setJobId] = useState("");
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["myOpenJobs"],
    queryFn: async () => {
      const me = await base44.auth.me();
      return (await base44.entities.Job.filter({ created_by_id: me.id }, "-created_date")).filter((j) => (j.status || "active") === "active");
    },
  });
  const invite = useMutation({
    mutationFn: () => base44.functions.invoke("inviteSeekerToJob", { seeker_profile_id: profileId, job_id: jobId }),
    onSuccess: () => toast.success("Invitation sent. They’ll get an email and see it on their dashboard."),
    onError: (e) => toast.error(e?.message || "Couldn’t send the invitation."),
  });
  if (isLoading) return <Skeleton className="h-10 w-56" />;
  if (!jobs.length) return <Button asChild variant="outline" size="sm"><Link to="/post-job">Post a role to invite them</Link></Button>;
  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      <Select value={jobId} onValueChange={setJobId}>
        <SelectTrigger className="h-9 sm:w-56" aria-label="Role to invite them to"><SelectValue placeholder="Choose a role" /></SelectTrigger>
        <SelectContent>{jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" className="h-9 gap-1.5" disabled={!jobId || invite.isPending} onClick={() => invite.mutate()}>
        {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invite to apply
      </Button>
    </div>
  );
}

export default function SeekerProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["seekerProfilePage", id],
    queryFn: () => base44.profiles.get(id),
    retry: false,
  });

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-8 space-y-4"><Skeleton className="h-56 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
  }
  if (error || !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Card className="p-10 text-center text-muted-foreground space-y-2">
          <UserX className="w-10 h-10 mx-auto opacity-30" />
          <p className="font-medium text-foreground">This profile isn’t available</p>
          <p className="text-sm">The person may have hidden it from employers, or the link is wrong.</p>
        </Card>
      </div>
    );
  }
  const isOwner = profile.audience === "owner";
  const isEmployer = user?.role === "employer" || user?.role === "admin";
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      {isOwner && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-sm flex items-start gap-2"><Eye className="w-4 h-4 mt-0.5 text-primary shrink-0" />This is your profile as employers see it. Private stories and hidden sections aren’t shown.</p>
          <Button asChild size="sm" variant="outline" className="shrink-0"><Link to="/dashboard?tab=profile">Edit profile &amp; sharing</Link></Button>
        </div>
      )}
      <ProfileView profile={profile} actions={!isOwner && isEmployer ? <InviteToApply profileId={profile.id} /> : null} />
    </div>
  );
}
