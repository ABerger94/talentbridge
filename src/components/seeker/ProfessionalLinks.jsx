import React from "react";
import { Globe, Linkedin, Github, Briefcase, Link as LinkIcon } from "lucide-react";

export const LINK_TYPES = [
  { value: "website", label: "Website", icon: Globe },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin },
  { value: "portfolio", label: "Portfolio", icon: Briefcase },
  { value: "github", label: "GitHub", icon: Github },
  { value: "other", label: "Other", icon: LinkIcon },
];

// A profile's links, including the older github_url / portfolio_url fields.
export function linksOf(profile) {
  if (Array.isArray(profile?.professional_links) && profile.professional_links.length) return profile.professional_links;
  const legacy = [];
  if (profile?.portfolio_url) legacy.push({ url: profile.portfolio_url, type: "portfolio", label: "" });
  if (profile?.github_url) legacy.push({ url: profile.github_url, type: "github", label: "" });
  return legacy;
}

function display(link) {
  if (link.label) return link.label;
  try {
    const u = new URL(link.url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    if (link.type === "linkedin" || link.type === "github") return path.split("/").filter(Boolean).pop() || host;
    return path && path.length < 28 ? `${host}${path}` : host;
  } catch {
    return link.url;
  }
}

// Read-only chips linking out to a seeker's professional pages.
export default function ProfessionalLinks({ links, size = "sm" }) {
  if (!links?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((link) => {
        const t = LINK_TYPES.find((x) => x.value === link.type) || LINK_TYPES[0];
        return (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={link.url}
            className={`inline-flex items-center gap-1.5 rounded-full border bg-background hover:bg-secondary transition-colors max-w-full ${
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
            }`}
          >
            <t.icon className="w-3.5 h-3.5 shrink-0 text-primary" />
            <span className="truncate">{display(link)}</span>
          </a>
        );
      })}
    </div>
  );
}
