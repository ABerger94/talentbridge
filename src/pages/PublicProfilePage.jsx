import React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, UserX } from "lucide-react";
import ProfileView from "@/components/profile/ProfileView";

// A seeker's public share link (/p/<slug>): open to anyone with the link,
// only while the seeker keeps it on. Search engines are told not to index it.
export default function PublicProfilePage() {
  const { slug } = useParams();
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["publicProfile", slug],
    queryFn: () => base44.profiles.getPublic(slug),
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
          <p className="font-medium text-foreground">This profile link isn’t active</p>
          <p className="text-sm">Its owner may have turned it off or made a new link.</p>
        </Card>
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      <ProfileView profile={profile} />
      <Card className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-primary/5 border-primary/20">
        <div>
          <p className="font-semibold">Show employers what you can actually do</p>
          <p className="text-sm text-muted-foreground mt-0.5">Build your own Capability Graph on TalentBridge: your strengths, how deep they go, and the proof behind them.</p>
        </div>
        <Button asChild className="gap-1.5 shrink-0"><Link to="/signup">Build yours <ArrowRight className="w-4 h-4" /></Link></Button>
      </Card>
    </div>
  );
}
