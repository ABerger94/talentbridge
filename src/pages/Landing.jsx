import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Check, X, FileText, MessageSquare, Columns3, Clock, CalendarDays,
  BarChart3, ShieldCheck, EyeOff, Download,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// A sample Capability Graph (same shape the app stores on a seeker profile:
// core_execution_vectors with strength + evidence, and adjacent_zones).
// Illustrative only, and labeled as a sample on the page.
const SAMPLE_VECTORS = [
  { vector: "Root-cause investigation", strength: 94, evidence: "Closed 120+ non-conformances with documented corrective actions across two plants.", pos: { left: "50%", top: "13%" } },
  { vector: "Audit readiness", strength: 88, evidence: "Led three SQF audits with zero major findings.", pos: { left: "80%", top: "36%" } },
  { vector: "Lab method validation", strength: 81, evidence: "Validated six microbiology methods to ISO 17025.", pos: { left: "75%", top: "83%" } },
  { vector: "Process systems", strength: 86, evidence: "Rebuilt release testing so batch holds dropped by about a third.", pos: { left: "25%", top: "83%" } },
  { vector: "Team training", strength: 74, evidence: "Trained 40+ line staff on HACCP and sanitation SOPs.", pos: { left: "19%", top: "36%" } },
];
// Edge end points in the SVG's 560×470 space, matching the node positions.
const EDGES = [[280, 62], [468, 170], [420, 388], [140, 388], [92, 170]];

const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 min-h-[48px]";
const btnSecondary = "inline-flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-card px-6 text-base font-semibold text-foreground transition-colors hover:border-foreground min-h-[48px]";
const eyebrow = "text-[13px] font-bold uppercase tracking-[0.08em] text-primary";

function CapabilityGraphDemo() {
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState(false);

  // Cycle through the skills until the visitor picks one.
  useEffect(() => {
    if (touched) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const id = setInterval(() => setSelected((s) => (s + 1) % SAMPLE_VECTORS.length), 3200);
    return () => clearInterval(id);
  }, [touched]);

  const current = SAMPLE_VECTORS[selected];
  return (
    <div id="graph" className="rounded-[28px] border border-border/70 bg-card p-4 sm:p-5 shadow-[0_30px_70px_rgba(39,22,90,0.10)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-primary">Capability Graph</div>
          <div className="mt-0.5 text-[15px] font-semibold">Food-safety QA lead · 7 years</div>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">Sample profile · tap a skill</span>
      </div>

      <div className="relative w-full" style={{ aspectRatio: "560 / 470" }}>
        <svg viewBox="0 0 560 470" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {EDGES.map(([x, y], i) => (
            <line key={i} x1="280" y1="235" x2={x} y2={y} className="tb-edge" stroke="#C9B8F2" strokeWidth="2" style={{ animationDelay: `${0.25 + i * 0.15}s` }} />
          ))}
          <line x1="468" y1="170" x2="460" y2="291" className="tb-edge-adjacent" stroke="#9FDCCD" strokeWidth="2" />
          <line x1="92" y1="170" x2="100" y2="291" className="tb-edge-adjacent" stroke="#9FDCCD" strokeWidth="2" />
        </svg>

        <div className="tb-pulse absolute left-1/2 top-1/2 flex h-[22%] w-[22%] min-h-[72px] min-w-[72px] max-h-[118px] max-w-[118px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-primary text-center text-primary-foreground">
          <span className="font-display text-xl sm:text-2xl font-bold leading-none">MC</span>
          <span className="mt-1 hidden text-[11px] opacity-85 sm:block">5 core skills</span>
        </div>

        {SAMPLE_VECTORS.map((v, i) => {
          const on = i === selected;
          return (
            <button
              key={v.vector}
              type="button"
              onClick={() => { setSelected(i); setTouched(true); }}
              aria-pressed={on}
              className={`tb-pop absolute flex items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 text-[11px] sm:text-sm font-semibold shadow-[0_6px_18px_rgba(39,22,90,0.08)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                on ? "border-primary bg-[#F1EBFD] text-[#15172A] ring-4 ring-primary/15" : "border-[#E2DCF3] bg-white text-[#15172A] hover:border-primary"
              }`}
              style={{ ...v.pos, animationDelay: `${0.35 + i * 0.15}s` }}
            >
              <span className="hidden sm:inline">{v.vector}</span>
              <span className="sm:hidden">{v.vector.split(" ")[0]}</span>
              <span className={`rounded-md px-1.5 py-1 text-[11px] sm:text-xs font-bold leading-none text-primary ${on ? "bg-white" : "bg-[#F1EBFD]"}`}>{v.strength}</span>
            </button>
          );
        })}

        <span className="tb-fade-late absolute right-[3%] top-[62%] hidden whitespace-nowrap rounded-full border-[1.5px] border-dashed border-[#7CCFBD] bg-[#F2FBF8] px-3 py-1.5 text-xs font-semibold text-[#0B6E5C] md:block">Pharma QA</span>
        <span className="tb-fade-late absolute left-[3%] top-[62%] hidden whitespace-nowrap rounded-full border-[1.5px] border-dashed border-[#7CCFBD] bg-[#F2FBF8] px-3 py-1.5 text-xs font-semibold text-[#0B6E5C] md:block">Supply-chain quality</span>
      </div>

      <div className="mt-2.5 rounded-2xl border border-[#ECE6FA] bg-[#FAF8FE] px-4 py-4 text-[#15172A]" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-bold">{current.vector}</span>
          <span className="text-[13px] font-bold text-primary">{current.strength} / 100</span>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#EEE9F8]" role="img" aria-label={`Strength ${current.strength} out of 100`}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${current.strength}%` }} />
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-[#4A4D61]"><strong className="text-[#15172A]">Evidence:</strong> {current.evidence}</p>
        <p className="mt-1.5 text-xs text-[#4A4D61]">Could also move into: Pharma QA, Supply-chain quality</p>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {[["QA Technician II", "Northwind Foods", 92, "0s"], ["Production Supervisor", "Cedar Valley Co.", 81, "1.2s"]].map(([title, co, pct, delay]) => (
          <div key={title} className="tb-float flex min-w-[200px] flex-1 items-center justify-between gap-2.5 rounded-2xl border border-border/70 px-3.5 py-3" style={{ animationDelay: delay }}>
            <span className="text-[13px] font-semibold leading-snug">{title}<br /><span className="font-medium text-muted-foreground">{co}</span></span>
            <span className="rounded-lg bg-[#E3F6F1] px-2 py-1.5 text-[15px] font-bold leading-none text-[#0B7A66]">{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  const { isAuthenticated } = useAuth();
  const [audience, setAudience] = useState("seekers");
  const seekers = audience === "seekers";
  const tab = (on) => `min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`;
  const startPath = isAuthenticated ? "/dashboard" : "/signup";

  return (
    <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:pb-20">
      <div className="tb-rise">
        <div role="tablist" aria-label="Who you are" className="mb-7 inline-flex gap-1 rounded-full bg-secondary p-1">
          <button type="button" role="tab" aria-selected={seekers} className={tab(seekers)} onClick={() => setAudience("seekers")}>I’m looking for work</button>
          <button type="button" role="tab" aria-selected={!seekers} className={tab(!seekers)} onClick={() => setAudience("employers")}>I’m hiring</button>
        </div>

        {seekers ? (
          <div key="seekers">
            <h1 className="font-display text-[46px] font-bold leading-none tracking-[-0.025em] sm:text-6xl lg:text-[80px]">
              Hired for your <span className="tb-strike text-muted-foreground/80">keywords</span>
              <br />
              <span className="tb-rise-late text-primary">capabilities.</span>
            </h1>
            <p className="mt-6 max-w-[540px] text-lg leading-relaxed text-muted-foreground sm:text-[19px]">
              Upload your résumé and we build your Capability Graph: the skills you’ve proven, the evidence behind each one, and
              the roles they unlock. Employers see what you can do, not how many keywords you matched.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={startPath} className={btnPrimary}>Build my Capability Graph <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/jobs" className={btnSecondary}>See open roles</Link>
            </div>
          </div>
        ) : (
          <div key="employers">
            <h1 className="font-display text-[42px] font-bold leading-[1.02] tracking-[-0.025em] sm:text-6xl lg:text-[68px]">
              Meet the people your keyword filter <span className="text-primary">would have missed</span>.
            </h1>
            <p className="mt-6 max-w-[540px] text-lg leading-relaxed text-muted-foreground sm:text-[19px]">
              Every candidate arrives with a Capability Graph and a blind AI assessment. Move them through a pipeline board,
              schedule interviews in your time zone, and never auto-reject anyone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/post-job" className={btnPrimary}>Post a role free <ArrowRight className="h-4 w-4" /></Link>
              <a href="#employers" className={btnSecondary}>See the pipeline</a>
            </div>
          </div>
        )}

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground">
          {["No auto-rejections", "Blind AI scoring", "Free for both sides"].map((t) => (
            <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-[#0B7A66]" aria-hidden="true" />{t}</li>
          ))}
        </ul>
      </div>
      <CapabilityGraphDemo />
    </section>
  );
}

function StepVisual({ children }) {
  return <div className="flex h-[150px] flex-col gap-2.5 rounded-2xl border border-border/60 bg-card p-4">{children}</div>;
}

function HowItWorks() {
  const bars = [["Root-cause", 94], ["Audit readiness", 88], ["Team training", 74]];
  const steps = [
    {
      n: 1, title: "Upload your résumé", text: "PDF, Word, or text. Your profile fills itself in, and you edit anything that’s off.",
      visual: (
        <StepVisual>
          <div className="flex items-center gap-2 text-[13px] font-semibold"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />your-resume.pdf</div>
          {[88, 72, 80].map((w, i) => <div key={i} className="tb-bar h-2.5 rounded-md bg-[#ECE6FA]" style={{ width: `${w}%`, animationDelay: `${0.2 + i * 0.2}s` }} />)}
          <div className="mt-auto text-xs font-semibold text-[#0B7A66]">Profile fields filled for you</div>
        </StepVisual>
      ),
    },
    {
      n: 2, title: "AI builds your Capability Graph", text: "Each skill gets a strength and the evidence behind it, plus nearby fields you could move into.",
      visual: (
        <StepVisual>
          <div className="flex flex-1 flex-col justify-center gap-3">
            {bars.map(([label, w], i) => (
              <div key={label} className="flex items-center gap-2.5 text-xs font-semibold">
                <span className="w-[110px] shrink-0">{label}</span>
                <span className="h-2 flex-1 rounded-md bg-[#F1EEF8]"><span className="tb-bar block h-2 rounded-md bg-primary" style={{ width: `${w}%`, animationDelay: `${0.3 + i * 0.2}s` }} /></span>
              </div>
            ))}
          </div>
        </StepVisual>
      ),
    },
    {
      n: 3, title: "Get matched and invited", text: "Verified employers find you by fit, invite you to apply, and message you directly.",
      visual: (
        <StepVisual>
          <div className="flex flex-1 flex-col justify-center gap-2.5">
            <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5 text-[13px] font-semibold">QA Technician II <span className="rounded-md bg-[#E3F6F1] px-1.5 py-1 text-[#0B7A66]">92%</span></div>
            <div className="tb-float flex items-center gap-2 rounded-xl bg-[#F1EBFD] px-3 py-2.5 text-[13px] font-semibold text-[#4F1FB0]"><MessageSquare className="h-4 w-4" aria-hidden="true" />An employer invited you to apply</div>
          </div>
        </StepVisual>
      ),
    },
  ];
  return (
    <section id="how" className="border-y border-border/60 bg-card">
      <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-8 sm:py-24">
        <div className="max-w-[640px]">
          <div className={eyebrow}>How it works</div>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.02em] sm:text-[44px]">From résumé to the right roles in three steps.</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <article key={s.n} className="rounded-[22px] border border-border/70 bg-background p-6">
              {s.visual}
              <div className="mt-5 text-[13px] font-bold text-primary">Step {s.n}</div>
              <h3 className="mt-1.5 font-display text-[22px] font-bold">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TwoReads() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-[720px] text-center">
        <h2 className="font-display text-3xl font-bold leading-tight tracking-[-0.02em] sm:text-[44px]">Same person. Two very different reads.</h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">A keyword filter checks your résumé against a list. A Capability Graph reads what you’ve actually done.</p>
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-border/70 bg-card p-7">
          <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-[#9E1F36]"><X className="h-4 w-4" aria-hidden="true" />What a keyword filter sees</div>
          <p className="mt-5 flex flex-wrap gap-1.5 text-[15px]">
            {["HACCP", "GMP", "QA"].map((k) => <span key={k} className="rounded-md bg-[#FFF1D6] px-2 py-1 font-semibold text-[#7A4B00]">{k}</span>)}
            {["Bachelor’s in Chemistry", "5+ yrs pharma", "LIMS certification"].map((k) => <span key={k} className="rounded-md bg-[#FDE3E7] px-2 py-1 font-semibold text-[#9E1F36]">{k}</span>)}
          </p>
          <div className="mt-6 rounded-2xl bg-[#FDF3F5] p-4 text-[15px] font-semibold text-[#7E1A2E]">3 of 6 keywords · <span className="tb-strike text-[#8D90A3]">Moved to “Not a fit”</span></div>
          <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">Seven years of hands-on QA work, rejected for missing three phrases.</p>
        </div>
        <div className="rounded-3xl border-[1.5px] border-[#CDBDF4] bg-[#FCFAFF] p-7 text-[#15172A]">
          <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-primary"><Check className="h-4 w-4" aria-hidden="true" />What TalentBridge sees</div>
          <ul className="mt-5 space-y-3 text-[15px] leading-snug">
            <li><strong>Root-cause investigation · 94</strong><br /><span className="text-[#4A4D61]">Closed 120+ non-conformances with documented corrective actions</span></li>
            <li><strong>Lab method validation · 81</strong><br /><span className="text-[#4A4D61]">Validated six micro methods to ISO 17025 (the LIMS gap is learnable)</span></li>
            <li><strong>Adjacent field: Pharma QA</strong><br /><span className="text-[#4A4D61]">GMP and audit habits carry over directly</span></li>
          </ul>
          <div className="mt-6 rounded-2xl bg-[#E3F6F1] p-4 text-[15px] font-semibold text-[#0B5E4F]">92% capability match · Invited to interview</div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Example built from a sample profile.</p>
    </section>
  );
}

function ForEmployers() {
  const features = [
    [Columns3, "A pipeline board.", "Drag candidates from New to Offer. Shortlists and passes email them for you."],
    [EyeOff, "Blind AI assessments.", "Names, emails, and locations are removed before scoring. Every score is labeled AI-assisted."],
    [CalendarDays, "Interviews in your time zone.", "Calendar invites go to both sides automatically."],
    [BarChart3, "Role stats.", "Views, apply rate, offers, and who’s still waiting on you."],
  ];
  const card = "rounded-[10px] bg-white p-2.5 text-xs font-semibold text-[#15172A]";
  return (
    <section id="employers" className="bg-[#15172A] text-white">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-20 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#B9A3F5]">For employers</div>
          <h2 className="mt-3 font-display text-3xl font-bold leading-[1.06] tracking-[-0.02em] sm:text-[46px]">Your whole hiring pipeline, in one calm place.</h2>
          <ul className="mt-8 space-y-4 text-base leading-relaxed text-[#D9D7E6]">
            {features.map(([Icon, title, text]) => (
              <li key={title} className="flex gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#7FE0C9]" aria-hidden="true" /><span><strong className="text-white">{title}</strong> {text}</span></li>
            ))}
          </ul>
          <Link to="/post-job" className={`${btnPrimary} mt-9`}>Post a role free</Link>
        </div>
        <div className="overflow-hidden rounded-3xl border border-[#2E3150] bg-[#1F2238] p-4 sm:p-5" aria-hidden="true">
          <div className="flex items-center justify-between px-1 pb-3.5 text-[13px] text-[#B7B5C9]">
            <span className="font-semibold text-white">QA Technician II · Candidates</span><span>Board</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-xl border-t-[3px] border-[#6E9BF5] bg-[#262A45] p-2 sm:p-2.5">
              <div className="mb-2 text-[11px] sm:text-xs font-bold text-[#DAD8E8]">New · 2</div>
              <div className={`tb-move relative z-10 ${card}`}>Jordan R.<span className="mt-1 block font-bold text-primary">84%</span></div>
              <div className={`mt-2 ${card}`}>Aisha B.<span className="mt-1 block font-bold text-primary">77%</span></div>
            </div>
            <div className="rounded-xl border-t-[3px] border-[#4ECBA9] bg-[#262A45] p-2 sm:p-2.5">
              <div className="mb-2 text-[11px] sm:text-xs font-bold text-[#DAD8E8]">Shortlisted</div>
              <div className={`mt-[66px] ${card}`}>Priya N.<span className="mt-1 block font-bold text-primary">88%</span></div>
            </div>
            <div className="rounded-xl border-t-[3px] border-[#A98BF5] bg-[#262A45] p-2 sm:p-2.5">
              <div className="mb-2 text-[11px] sm:text-xs font-bold text-[#DAD8E8]">Interview</div>
              <div className={card}>Maya C.<span className="mt-1 block font-bold text-primary">92%</span><span className="mt-1.5 flex items-center gap-1 font-semibold text-primary"><Clock className="h-3 w-3" />Thu 10 AM</span></div>
            </div>
            <div className="hidden rounded-xl border-t-[3px] border-[#F2B45A] bg-[#262A45] p-2 sm:block sm:p-2.5">
              <div className="mb-2 text-[11px] sm:text-xs font-bold text-[#DAD8E8]">Offer</div>
              <div className={card}>Hannah W.<span className="mt-1 block font-semibold text-[#0B7A66]">Accepted</span></div>
            </div>
          </div>
          <div className="tb-float mt-3.5 flex w-fit items-center gap-2.5 rounded-xl bg-white px-3.5 py-3 text-[13px] font-semibold text-[#15172A]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#19B394]" />Jordan moved to Shortlisted · emailed
          </div>
        </div>
      </div>
    </section>
  );
}

function Promises() {
  const items = [
    [ShieldCheck, "No auto-rejections. Ever.", "AI describes fit. People make every decision."],
    [EyeOff, "Blind by design", "Scoring never sees your name, email, location, or links. We test it for bias regularly."],
    [Download, "Your data, your call", "Download everything or delete your account anytime, from Settings."],
  ];
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-20 sm:px-8 sm:py-24">
      <h2 className="text-center font-display text-3xl font-bold tracking-[-0.02em] sm:text-[40px]">Built on three promises.</h2>
      <div className="mt-11 grid gap-5 md:grid-cols-3">
        {items.map(([Icon, title, text]) => (
          <div key={title} className="rounded-[22px] border border-border/70 bg-card p-7">
            <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
            <h3 className="mt-4 font-display text-[21px] font-bold">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  const { isAuthenticated } = useAuth();
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8 sm:pb-24">
      <div className="rounded-[32px] bg-primary px-6 py-14 text-center text-primary-foreground sm:px-10 sm:py-16">
        <h2 className="font-display text-3xl font-bold leading-[1.06] tracking-[-0.02em] sm:text-[46px]">See your Capability Graph in two minutes.</h2>
        <p className="mx-auto mt-4 max-w-[560px] text-lg leading-relaxed text-white/85">Upload a résumé. We do the rest. Free for job seekers and employers.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={isAuthenticated ? "/dashboard" : "/signup"} className="inline-flex min-h-[48px] items-center rounded-xl bg-white px-6 font-semibold text-[#4F1FB0] hover:bg-white/90">Create free profile</Link>
          <Link to="/post-job" className="inline-flex min-h-[48px] items-center rounded-xl border-[1.5px] border-white/60 px-6 font-semibold text-white hover:border-white">I’m hiring</Link>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      <Hero />
      <HowItWorks />
      <TwoReads />
      <ForEmployers />
      <Promises />
      <FinalCta />
    </div>
  );
}
