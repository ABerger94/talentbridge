import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowRight, Network, GitBranch, ShieldCheck, Cpu,
  BarChart3, Zap, Search, Building2, CheckCircle2, XCircle } from
"lucide-react";
import { motion } from "framer-motion";
import TalentBridgeLogo from "@/components/TalentBridgeLogo";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay }
});

const oldVsNew = [
{ old: "Keyword filtering rejects 75% of qualified applicants", talentbridge: "Semantic capability graph maps your transferable logic to role problems" },
{ old: "Years-of-experience requirements filter out proven builders", talentbridge: "Artifact analysis scores deployed projects, code quality & system architecture" },
{ old: "Black-box ATS scoring with zero transparency", talentbridge: "Hidden Vectors panel shows candidates exactly how they map to each role" },
{ old: "Auto-rejections with no explanation or path forward", talentbridge: "Every candidate receives an Adaptability & Match Report — never a silent no" },
{ old: "Resumes penalized for formatting, not substance", talentbridge: "Portfolio ingestion analyzes GitHub repos, live apps, and case studies" }];


const pillars = [
{
  icon: Network,
  title: "Capability Graph Engine",
  description: "Your profile becomes a high-dimensional semantic vector — capturing what you can build, solve, and execute. Not just titles and bullet points."
},
{
  icon: GitBranch,
  title: "Artifact Ingestion",
  description: "Connect your GitHub, portfolio, or past projects. Our engine analyzes architecture, code quality, testing rigor, and system-level logic."
},
{
  icon: Cpu,
  title: "Bi-Directional Matching",
  description: "Jobs are also encoded as capability vectors. We find the intersection of problems to be solved and proven problem-solving methodologies."
},
{
  icon: ShieldCheck,
  title: "No Auto-Rejections",
  description: "The AI never rejects a human. It produces an Adaptability & Match Report for the employer — surfacing every possible bridge between candidate and role."
},
{
  icon: BarChart3,
  title: "Hidden Vectors Panel",
  description: "Candidates see a live map of exactly how their underlying skills connect to a role's core problems — with specific portfolio highlights to surface."
},
{
  icon: Zap,
  title: "Interview Prep Engine",
  description: "Personalized prep guides tell you exactly which projects to talk about and which capabilities to emphasize for each specific employer."
}];


export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/8" />
        <div className="absolute top-10 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-40">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div {...fadeUp(0)}>
              <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 px-4 py-1.5 text-sm gap-2">
                <TalentBridgeLogo size={14} />
                The People-First Platform
              </Badge>
            </motion.div>

            <motion.h1 {...fadeUp(0.08)} className="text-4xl sm:text-5xl lg:text-[4.5rem] font-bold tracking-tight leading-[1.08]">
              Hiring that sees{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                your whole capability
              </span>
              , not just your keywords.
            </motion.h1>

            <motion.p {...fadeUp(0.16)} className="mt-7 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              TalentBridge inverts the logic of modern ATS systems. Instead of filtering people out, our AI builds a
              <strong className="text-foreground"> Capability Graph</strong> around every candidate — mapping latent potential,
              adjacent adaptability, and deep cultural alignment to the roles that need exactly what you offer.
            </motion.p>

            <motion.div {...fadeUp(0.24)} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/dashboard">
                <Button size="lg" className="text-base px-8 gap-2 shadow-lg shadow-primary/25 h-12">
                  Build My Capability Profile
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/post-job">
                <Button size="lg" variant="outline" className="text-base px-8 gap-2 h-12">
                  <Building2 className="w-4 h-4" />
                  I'm Hiring Differently
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Old Way vs TalentBridge */}
      <section className="py-24 bg-secondary/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold">The hiring system is broken. We rebuilt it.</h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">Current ATS platforms use AI as a rejection machine.</p>
            <p className="mt-2 text-lg text-muted-foreground max-w-xl mx-auto">TalentBridge uses AI as an advocate for candidates.</p>
          </div>
          <div className="rounded-2xl overflow-hidden border border-border/60 shadow-xl">
            <div className="grid grid-cols-2 text-sm">
              <div className="bg-destructive/8 px-5 py-3 font-semibold text-destructive flex items-center gap-2 border-b border-border/60">
                <XCircle className="w-4 h-4" /> Legacy ATS
              </div>
              <div className="bg-accent/10 px-5 py-3 font-semibold text-accent flex items-center gap-2 border-b border-border/60">
               <CheckCircle2 className="w-4 h-4" /> TalentBridge
              </div>
              {oldVsNew.map((row, i) =>
              <React.Fragment key={i}>
                  <div className={`px-5 py-4 text-sm text-muted-foreground border-border/40 ${i < oldVsNew.length - 1 ? "border-b" : ""} bg-background/50`}>
                    {row.old}
                  </div>
                  <div className={`px-5 py-4 text-sm text-foreground border-border/40 ${i < oldVsNew.length - 1 ? "border-b" : ""} bg-accent/5`}>
                    {row.talentbridge}
                  </div>
                </React.Fragment>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold">How TalentBridge works</h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              Six systems working together so talent is never overlooked again.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pillars.map((p, i) =>
            <motion.div key={p.title} {...fadeUp(i * 0.07)}>
                <Card className="p-6 h-full hover:shadow-lg hover:shadow-primary/8 transition-all duration-300 border-border/60 group">
                  <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                    <p.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-primary to-primary/75 rounded-3xl p-12 sm:p-16 text-primary-foreground relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 right-8 w-48 h-48 rounded-full bg-white blur-3xl" />
              <div className="absolute bottom-4 left-8 w-32 h-32 rounded-full bg-accent blur-3xl" />
            </div>
            <div className="relative">
              <Badge className="mb-6 bg-white/15 text-white border-white/20 px-4 py-1.5">
                No auto-rejections. Ever.
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready for hiring that works for humans?</h2>
              <p className="text-lg opacity-80 mb-8 max-w-xl mx-auto">
                Build your Capability Graph. Let our AI show employers what you're truly capable of — not just what your resume says.
              </p>
              <Link to="/dashboard">
                <Button size="lg" variant="secondary" className="text-base px-8 gap-2 h-12 text-primary font-semibold">
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>);

}