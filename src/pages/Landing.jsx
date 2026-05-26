import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, ArrowRight, Heart, Brain, Users, TrendingUp, Shield, Zap, Search, Building2 } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay },
});

const features = [
  {
    icon: Brain,
    title: "Holistic AI Matching",
    description: "Our AI sees the whole person — transferable skills, potential, and values — not just keyword matches.",
  },
  {
    icon: Heart,
    title: "People-First Approach",
    description: "No harsh screening. We surface hidden potential and give every candidate a fair chance to shine.",
  },
  {
    icon: TrendingUp,
    title: "Growth-Oriented",
    description: "We match based on where you're going, not just where you've been. Your potential matters here.",
  },
  {
    icon: Shield,
    title: "Bias-Aware",
    description: "Built with fairness at its core. Our AI is designed to reduce hiring bias, not amplify it.",
  },
  {
    icon: Users,
    title: "Culture Fit",
    description: "Match on values and work style. Find teams where you truly belong and thrive.",
  },
  {
    icon: Zap,
    title: "Smart Insights",
    description: "Get personalized feedback and suggestions to improve your profile and find better matches.",
  },
];

export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-36">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div {...fadeUp(0)}>
              <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 px-4 py-1.5 text-sm">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                AI That Works For People
              </Badge>
            </motion.div>

            <motion.h1 {...fadeUp(0.1)} className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              Find where you{" "}
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                truly belong
              </span>
            </motion.h1>

            <motion.p {...fadeUp(0.2)} className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              TalentBridge uses AI to understand your unique strengths, values, and potential — 
              matching you with opportunities where you'll actually thrive. No harsh filters. No black boxes. Just better connections.
            </motion.p>

            <motion.div {...fadeUp(0.3)} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/jobs">
                <Button size="lg" className="text-base px-8 gap-2 shadow-lg shadow-primary/20 h-12">
                  <Search className="w-4 h-4" />
                  Find Your Match
                </Button>
              </Link>
              <Link to="/post-job">
                <Button size="lg" variant="outline" className="text-base px-8 gap-2 h-12">
                  <Building2 className="w-4 h-4" />
                  I'm Hiring
                </Button>
              </Link>
            </motion.div>

            <motion.div {...fadeUp(0.4)} className="mt-12 flex items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>1,000+ Active Jobs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>AI-Powered Matching</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span>Free for Seekers</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-secondary/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold">How TalentBridge is different</h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Traditional job sites filter people out. We work to bring the right people in.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div key={feature.title} {...fadeUp(i * 0.08)}>
                <Card className="p-6 h-full hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/50">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-12 sm:p-16 text-primary-foreground relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to find your place?</h2>
              <p className="text-lg opacity-80 mb-8 max-w-xl mx-auto">
                Join thousands of job seekers and employers who believe hiring should be about people, not just paper.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/jobs">
                  <Button size="lg" variant="secondary" className="text-base px-8 gap-2 h-12">
                    Start Exploring <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}