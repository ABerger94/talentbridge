import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Clock, ShieldAlert, Building2 } from "lucide-react";

// Explains an employer's verification state and what to do next.
export default function EmployerStatusBanner({ user }) {
  const status = user?.employer_status;
  const company = user?.data?.company;
  if (!status || user?.role === "admin") return null;

  if (status === "rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
        <div className="flex-1 text-sm text-red-900">
          <p className="font-semibold">We couldn’t verify your company yet.</p>
          <p className="mt-0.5">
            {user?.data?.employer_review_note || "Adding your company website and using a work email on that domain usually helps."}
          </p>
        </div>
        <Link to="/company"><Button size="sm" variant="outline">Update & resubmit</Button></Link>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <Clock className="w-6 h-6 text-amber-600 shrink-0" />
        <div className="flex-1 text-sm text-amber-900">
          {company?.name ? (
            <>
              <p className="font-semibold">Your account is under review.</p>
              <p className="mt-0.5">
                We usually approve employers within a day. You can draft roles now; they go live and candidate search
                unlocks as soon as you’re approved. We’ll email you.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Add your company profile to get verified.</p>
              <p className="mt-0.5">We review every employer before they can see candidates.</p>
            </>
          )}
        </div>
        <Link to="/company"><Button size="sm" variant="outline">{company?.name ? "View company profile" : "Add company profile"}</Button></Link>
      </div>
    );
  }
  if (!company?.name) {
    return (
      <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <Building2 className="w-5 h-5 text-primary shrink-0" />
        <p className="flex-1 text-sm text-muted-foreground">
          Add a company profile. Candidates see it on your job postings, with your website and what you do.
        </p>
        <Link to="/company"><Button size="sm" variant="outline">Add company profile</Button></Link>
      </div>
    );
  }
  return null;
}
