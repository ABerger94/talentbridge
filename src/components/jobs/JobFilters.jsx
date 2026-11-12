import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, X, MapPin } from "lucide-react";

export default function JobFilters({ filters, onFilterChange, onClear }) {
  const update = (key, value) => onFilterChange({ ...filters, [key]: value });

  const hasFilters = filters.search || filters.location || filters.work_type || filters.experience_level || filters.employment_type || filters.origin;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Job title, company, or skill"
            aria-label="Search roles"
            className="pl-10 h-12 text-base bg-card"
            value={filters.search || ""}
            onChange={(e) => update("search", e.target.value)}
          />
        </div>
        <div className="relative sm:w-64">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="City, state, or Remote"
            aria-label="Location"
            className="pl-10 h-12 text-base bg-card"
            value={filters.location || ""}
            onChange={(e) => update("location", e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SlidersHorizontal className="w-4 h-4" />
          Filters:
        </div>
        <Select value={filters.work_type || "all"} onValueChange={(v) => update("work_type", v === "all" ? "" : v)}>
          <SelectTrigger className="w-36 h-9 bg-card">
            <SelectValue placeholder="Work Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="onsite">On-site</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.experience_level || "all"} onValueChange={(v) => update("experience_level", v === "all" ? "" : v)}>
          <SelectTrigger className="w-36 h-9 bg-card">
            <SelectValue placeholder="Experience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="entry">Entry Level</SelectItem>
            <SelectItem value="mid">Mid Level</SelectItem>
            <SelectItem value="senior">Senior</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="executive">Executive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.employment_type || "all"} onValueChange={(v) => update("employment_type", v === "all" ? "" : v)}>
          <SelectTrigger className="w-36 h-9 bg-card">
            <SelectValue placeholder="Employment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="full_time">Full-time</SelectItem>
            <SelectItem value="part_time">Part-time</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="internship">Internship</SelectItem>
            <SelectItem value="freelance">Freelance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.origin || "all"} onValueChange={(v) => update("origin", v === "all" ? "" : v)}>
          <SelectTrigger className="w-48 h-9 bg-card" aria-label="Where the role is posted">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="direct">Posted on TalentBridge</SelectItem>
            <SelectItem value="imported">From company job boards</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1 text-muted-foreground">
            <X className="w-3 h-3" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}