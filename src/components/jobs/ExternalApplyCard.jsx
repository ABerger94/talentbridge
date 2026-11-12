import React from "react";
import { Card } from "@/components/ui/card";
import { ExternalLink, Info } from "lucide-react";

// Sidebar card for a role imported from an employer's own job board (or a
// partner feed): applying happens on their site, with credit to the source.
export default function ExternalApplyCard({ job, open }) {
  if (!open) {
    return (
      <Card className="p-5 bg-secondary/60">
        <h3 className="font-semibold text-sm">This role is no longer listed</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {job.company || "The employer"} has taken it down from their job board. Browse other open roles instead.
        </p>
      </Card>
    );
  }
  const via = job.attribution?.label;
  return (
    <Card className="p-5 space-y-3">
      <a
        href={job.external_url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
      >
        {via ? `View and apply on ${via.replace(/^Jobs by /, "")}` : `Apply on ${job.company ? `${job.company}’s` : "the employer’s"} site`}
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
      <p className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {via
            ? `This listing comes from ${via.replace(/^Jobs by /, "")}. You’ll apply outside TalentBridge,`
            : `This role is listed on ${job.company ? `${job.company}’s` : "the employer’s"} own job board. You’ll apply there,`}{" "}
          and TalentBridge doesn’t see or store that application. Use Capability Fit below to see how your profile lines up first.
        </span>
      </p>
      {via && (
        <p className="text-xs text-muted-foreground">
          Listing via{" "}
          {job.attribution.url ? (
            <a href={job.attribution.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{via}</a>
          ) : via}
        </p>
      )}
    </Card>
  );
}
