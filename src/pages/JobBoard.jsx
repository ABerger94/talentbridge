import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import JobCard from "@/components/jobs/JobCard";
import JobFilters from "@/components/jobs/JobFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase } from "lucide-react";

export default function JobBoard() {
  const [filters, setFilters] = useState({});

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => base44.entities.Job.filter({ status: "active" }, "-created_date"),
  });

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const match =
          job.title?.toLowerCase().includes(s) ||
          job.company?.toLowerCase().includes(s) ||
          job.skills?.some((sk) => sk.toLowerCase().includes(s)) ||
          job.location?.toLowerCase().includes(s);
        if (!match) return false;
      }
      if (filters.work_type && job.work_type !== filters.work_type) return false;
      if (filters.experience_level && job.experience_level !== filters.experience_level) return false;
      if (filters.employment_type && job.employment_type !== filters.employment_type) return false;
      return true;
    });
  }, [jobs, filters]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Explore Roles</h1>
        <p className="text-muted-foreground">
          {jobs.length} open roles — matched on capability and potential, not just keywords.
        </p>
      </div>

      <JobFilters
        filters={filters}
        onFilterChange={setFilters}
        onClear={() => setFilters({})}
      />

      <div className="mt-8 space-y-3">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))
        ) : filteredJobs.length > 0 ? (
          filteredJobs.map((job, i) => (
            <JobCard key={job.id} job={job} index={i} />
          ))
        ) : (
          <div className="text-center py-20">
            <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No jobs found</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}