import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layers, Building2, User, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";

export default function Onboarding() {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { checkUserAuth, user, isAuthenticated, isLoadingAuth } = useAuth();

  // If user already has a proper role, redirect them away
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user?.role && user.role !== 'user') {
      navigate(user.role === 'employer' ? '/employer' : '/dashboard', { replace: true });
    }
  }, [user, isAuthenticated, isLoadingAuth]);

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    await base44.auth.updateMe({ role: selected });
    await checkUserAuth(); // refresh user in context
    navigate(selected === "employer" ? "/employer" : "/dashboard", { replace: true });
  };

  const roles = [
    {
      key: "job_seeker",
      icon: User,
      title: "Job Seeker",
      description: "I'm looking for new opportunities. Build my Capability Profile and find roles that match my true potential.",
    },
    {
      key: "employer",
      icon: Building2,
      title: "Employer / Recruiter",
      description: "I'm hiring. I want to post roles and find candidates based on capability, not just keywords.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-xl"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
            <Layers className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold tracking-tight">TalentBridge</span>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">Welcome! How are you using TalentBridge?</h1>
        <p className="text-muted-foreground text-center mb-8">Choose your account type to get started. You can't change this later.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {roles.map((role) => (
            <Card
              key={role.key}
              onClick={() => setSelected(role.key)}
              className={`p-6 cursor-pointer transition-all duration-200 border-2 hover:shadow-lg ${
                selected === role.key
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                selected === role.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                <role.icon className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold mb-1.5">{role.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{role.description}</p>
            </Card>
          ))}
        </div>

        <Button
          className="w-full h-12 text-base gap-2"
          disabled={!selected || loading}
          onClick={handleContinue}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Continue <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}