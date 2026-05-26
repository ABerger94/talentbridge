import React from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import TalentBridgeLogo from "@/components/TalentBridgeLogo";

export default function Footer() {
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                <TalentBridgeLogo size={20} />
              </div>
              <span className="text-xl font-bold">TalentBridge</span>
            </div>
            <p className="text-sm opacity-60 leading-relaxed">
              AI that advocates for people. We match on capability, potential, and character — not keywords and arbitrary filters.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider opacity-40">For Talent</h4>
            <div className="flex flex-col gap-2.5">
              <Link to="/jobs" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Explore Roles</Link>
              <Link to="/dashboard" className="text-sm opacity-60 hover:opacity-100 transition-opacity">My Profile</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider opacity-40">For Employers</h4>
            <div className="flex flex-col gap-2.5">
              <Link to="/post-job" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Post a Role</Link>
              <Link to="/employer" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Employer Dashboard</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider opacity-40">Philosophy</h4>
            <div className="flex flex-col gap-2.5">
              <span className="text-sm opacity-60">No Auto-Rejections</span>
              <span className="text-sm opacity-60">Capability-First Matching</span>
              <span className="text-sm opacity-60">Bi-Directional Fit</span>
            </div>
          </div>
        </div>
        <div className="border-t border-background/10 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm opacity-40">© 2026 TalentBridge. All rights reserved.</p>
          <p className="text-sm opacity-40 flex items-center gap-1">
            Built with <Heart className="w-3.5 h-3.5 text-accent fill-accent" /> for humans who deserve better hiring
          </p>
        </div>
      </div>
    </footer>
  );
}