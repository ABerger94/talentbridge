import React, { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import JobCard from "@/components/jobs/JobCard";
import JobFilters from "@/components/jobs/JobFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Briefcase, Loader2 } from "lucide-react";

const PER_PAGE = 20;

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Server-side search over every open role: posted on TalentBridge first, then
// real listings imported from employers' own job boards.
export default function JobBoard() {
  const [filters, setFilters] = useState({});
  const q = useDebounced(filters.search || "");
  const location = useDebounced(filters.location || "");
  const params = {
    q,
    location,
    work_type: filters.work_type,
    employment_type: filters.employment_type,
    experience_level: filters.experience_level,
    origin: filters.origin,
  };

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["jobSearch", params],
    queryFn: ({ pageParam }) => base44.jobs.search({ ...params, page: pageParam, per: PER_PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.data.page * last.data.per < last.data.total ? last.data.page + 1 : undefined),
    staleTime: 60000,
  });

  const pages = data?.pages || [];
  const jobs = pages.flatMap((p) => p.data.jobs);
  const total = pages[0]?.data.total ?? 0;
  const counts = pages[0]?.counts;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Explore Roles</h1>
        <p className="text-muted-foreground">
          {counts
            ? `${(counts.direct + counts.imported).toLocaleString()} open roles: ${counts.direct.toLocaleString()} posted on TalentBridge, plus ${counts.imported.toLocaleString()} from employers’ own job boards.`
            : "Open roles, matched on capability and potential, not just keywords."}
        </p>
      </div>

      <JobFilters filters={filters} onFilterChange={setFilters} onClear={() => setFilters({})} />

      {!isLoading && !isError && (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {total.toLocaleString()} {total === 1 ? "role" : "roles"}{q || location || filters.work_type || filters.employment_type || filters.experience_level || filters.origin ? " match your filters" : ""}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
        ) : isError ? (
          <div className="text-center py-20 text-muted-foreground">Couldn’t load roles. Please refresh the page.</div>
        ) : jobs.length > 0 ? (
          <>
            {jobs.map((job, i) => <JobCard key={job.id} job={job} index={i % PER_PAGE} />)}
            {hasNextPage && (
              <div className="pt-4 text-center">
                <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="gap-2">
                  {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />} Show more roles
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No roles found</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">Try a different search or fewer filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
