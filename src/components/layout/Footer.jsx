import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">TalentBridge</span>
            </div>
            <p className="text-sm opacity-60 leading-relaxed">
              AI that works for people. Connecting talent with opportunity through understanding, not filtering.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider opacity-40">For Seekers</h4>
            <div className="flex flex-col gap-2.5">
              <Link to="/jobs" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Browse Jobs</Link>
              <Link to="/dashboard" className="text-sm opacity-60 hover:opacity-100 transition-opacity">My Dashboard</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider opacity-40">For Employers</h4>
            <div className="flex flex-col gap-2.5">
              <Link to="/post-job" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Post a Job</Link>
              <Link to="/employer" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Employer Dashboard</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider opacity-40">Company</h4>
            <div className="flex flex-col gap-2.5">
              <span className="text-sm opacity-60">About Us</span>
              <span className="text-sm opacity-60">Privacy</span>
              <span className="text-sm opacity-60">Terms</span>
            </div>
          </div>
        </div>
        <div className="border-t border-background/10 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm opacity-40">© 2026 TalentBridge. All rights reserved.</p>
          <p className="text-sm opacity-40 flex items-center gap-1">
            Built with <Heart className="w-3.5 h-3.5 text-accent fill-accent" /> for job seekers everywhere
          </p>
        </div>
      </div>
    </footer>
  );
}