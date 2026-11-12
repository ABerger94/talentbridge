import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Building2, User, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";
import TalentBridgeLogo from "@/components/TalentBridgeLogo";
import CompanyProfileForm from "@/components/employer/CompanyProfileForm";
import { toast } from "sonner";

export default function Onboarding() {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("role"); // 'role' | 'company'
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { checkUserAuth, user, isAuthenticated, isLoadingAuth } = useAuth();

  // If user already has a proper role, redirect them away
  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      navigate('/login?next=/onboarding', { replace: true });
      return;
    }

    if (!isLoadingAuth && isAuthenticated && user?.role && user.role !== 'user') {
      // Employers finish onboarding with their company profile.
      if (user.role === 'employer' && !user.data?.company?.name) {
        setStep("company");
        return;
      }
      navigate(user.role === 'employer' ? '/employer' : '/dashboard', { replace: true });
    }
  }, [user, isAuthenticated, isLoadingAuth]);

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await base44.functions.invoke('setUserRole', { role: selected });
      await checkUserAuth(); // refresh user in context
      if (selected === "employer") {
        setStep("company");
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      toast.error(err?.message || "Couldn't save your choice. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCompany = async (company) => {
    setSaving(true);
    try {
      await base44.employer.saveProfile(company);
      await checkUserAuth();
      toast.success("Thanks! We'll review your company and email you when you're approved.");
      navigate("/employer", { replace: true });
    } catch (err) {
      toast.error(err?.message || "Couldn't save your company profile.");
    } finally {
      setSaving(false);
    }
  };

  if (step === "company") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
              <TalentBridgeLogo size={32} />
            </div>
            <span className="text-2xl font-bold tracking-tight">TalentBridge</span>
          </div>
          <h1 className="text-3xl font-bold text-center mb-2">Tell us about your company</h1>
          <p className="text-muted-foreground text-center mb-8">
            We review every employer before they can see candidates. That keeps job seekers safe from scams. You can
            draft roles while you wait, and they go live as soon as you're approved.
          </p>
          <Card className="p-6">
            <CompanyProfileForm onSubmit={handleCompany} saving={saving} submitLabel="Submit for review" email={user?.email} />
          </Card>
        </div>
      </div>
    );
  }

  const roles = [
    {
      key: "job_seeker",
      icon: User,
      title: "Job Seeker",
      description: "I'm looking for work. Build your Capability Profile, get matched to roles, apply, and respond to interview and offer invitations.",
    },
    {
      key: "employer",
      icon: Building2,
      title: "Employer / Recruiter",
      description: "I'm hiring. Post roles, review candidates on capability rather than keywords, and invite strong matches to apply.",
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
            <TalentBridgeLogo size={32} />
          </div>
          <span className="text-2xl font-bold tracking-tight">TalentBridge</span>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">Welcome! How are you using TalentBridge?</h1>
        <p className="text-muted-foreground text-center mb-8">
          Pick the account type that matches how you'll use TalentBridge. It sets up your workspace and
          can't be changed after this step, so choose carefully.
        </p>

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