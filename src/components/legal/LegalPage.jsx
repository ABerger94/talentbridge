import React from "react";
import { Link } from "react-router-dom";
import { LEGAL } from "@/lib/legal";

// Shared layout for the Privacy Policy and Terms: title, effective date,
// a table of contents, and numbered sections with anchor links.
export default function LegalPage({ title, intro, sections, otherDoc }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">Effective {LEGAL.effectiveDate}</p>
      <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-foreground/90">{intro}</div>

      <nav aria-label="Contents" className="mt-8 rounded-xl border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contents</p>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm list-decimal list-inside">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold mb-3">
              {i + 1}. {s.title}
            </h2>
            <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:font-semibold [&_a]:text-primary [&_a:hover]:underline">
              {s.body}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 border-t pt-6 text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
        <span>
          Questions? <a className="text-primary hover:underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        </span>
        {otherDoc && (
          <Link to={otherDoc.to} className="text-primary hover:underline">{otherDoc.label}</Link>
        )}
      </div>
    </div>
  );
}
