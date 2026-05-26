import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Briefcase, User, Building2, Search, Layers } from "lucide-react";

const navLinks = [
  { path: "/jobs", label: "Explore Roles", icon: Search },
  { path: "/dashboard", label: "My Profile", icon: User },
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
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-primary/30">
              <Layers className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">Symbiot</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.path} to={link.path}>
                <Button
                  variant={location.pathname.startsWith(link.path) ? "secondary" : "ghost"}
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
              <Button className="gap-2 bg-primary hover:bg-primary/90 shadow-md shadow-primary/25">
                <Briefcase className="w-4 h-4" />
                Post a Role
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
              <div className="flex items-center gap-2.5 mb-8 pt-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Layers className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-bold">Symbiot</span>
              </div>
              <div className="flex flex-col gap-2">
                {navLinks.map((link) => (
                  <Link key={link.path} to={link.path} onClick={() => setOpen(false)}>
                    <Button
                      variant={location.pathname.startsWith(link.path) ? "secondary" : "ghost"}
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
                    Post a Role
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