import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles, Menu, X, Briefcase, User, Building2, Search } from "lucide-react";

const navLinks = [
  { path: "/jobs", label: "Find Jobs", icon: Search },
  { path: "/dashboard", label: "My Dashboard", icon: User },
  { path: "/employer", label: "For Employers", icon: Building2 },
];

export default function Navbar() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">TalentBridge</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.path} to={link.path}>
                <Button
                  variant={location.pathname === link.path ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 font-medium"
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/post-job">
              <Button className="gap-2 bg-primary hover:bg-primary/90 shadow-md shadow-primary/20">
                <Briefcase className="w-4 h-4" />
                Post a Job
              </Button>
            </Link>
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="flex flex-col gap-2 mt-8">
                {navLinks.map((link) => (
                  <Link key={link.path} to={link.path} onClick={() => setOpen(false)}>
                    <Button
                      variant={location.pathname === link.path ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3"
                    >
                      <link.icon className="w-4 h-4" />
                      {link.label}
                    </Button>
                  </Link>
                ))}
                <div className="border-t my-4" />
                <Link to="/post-job" onClick={() => setOpen(false)}>
                  <Button className="w-full gap-2">
                    <Briefcase className="w-4 h-4" />
                    Post a Job
                  </Button>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}