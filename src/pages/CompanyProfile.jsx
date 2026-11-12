import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BadgeCheck, Building2 } from "lucide-react";
import { toast } from "sonner";
import CompanyProfileForm from "@/components/employer/CompanyProfileForm";
import EmployerStatusBanner from "@/components/employer/EmployerStatusBanner";

const STATUS = {
  approved: { label: "Verified employer", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pending: { label: "Under review", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  rejected: { label: "Not approved", cls: "bg-red-100 text-red-700 border-red-200" },
};

export default function CompanyProfile() {
  const { user, checkUserAuth } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["employerProfile"], queryFn: () => base44.employer.profile() });

  const save = useMutation({
    mutationFn: (company) => base44.employer.saveProfile(company),
    onSuccess: async (res) => {
      await checkUserAuth();
      queryClient.invalidateQueries({ queryKey: ["employerProfile"] });
      queryClient.invalidateQueries({ queryKey: ["myJobs"] });
      toast.success(res.status === "approved" ? "Company profile saved." : "Saved and submitted for review. We'll email you.");
    },
    onError: (err) => toast.error(err?.message || "Couldn't save your company profile."),
  });

  const status = STATUS[data?.status] || null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-5">
      <Link to="/employer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Employer dashboard
      </Link>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2.5">
          <Building2 className="w-7 h-7 text-primary" /> Company profile
        </h1>
        {status && (
          <Badge variant="outline" className={`gap-1 ${status.cls}`}>
            {data.status === "approved" && <BadgeCheck className="w-3.5 h-3.5" />}
            {status.label}
          </Badge>
        )}
      </div>
      <EmployerStatusBanner user={user} />
      <Card className="p-5 sm:p-6">
        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <CompanyProfileForm
            initial={data?.company}
            email={user?.email}
            saving={save.isPending}
            onSubmit={(company) => save.mutate(company)}
            submitLabel={data?.status === "approved" ? "Save changes" : data?.status === "rejected" ? "Save and resubmit for review" : "Save and submit for review"}
          />
        )}
      </Card>
    </div>
  );
}
