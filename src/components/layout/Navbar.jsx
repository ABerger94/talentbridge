import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Briefcase, User, Building2, Search, LogIn, LogOut, MessageSquare, ShieldCheck, Settings as SettingsIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { redirectToLogin, logoutLocally } from "@/lib/auth-redirect";
import TalentBridgeLogo from "@/components/TalentBridgeLogo";

export default function Navbar() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();

  const role = user?.role;
  const canMessage = isAuthenticated && ["job_seeker", "employer", "admin"].includes(role);

  const { data: unread = 0 } = useQuery({
    queryKey: ["unreadCount"],
    queryFn: () => base44.messages.unreadCount(),
    enabled: canMessage,
    refetchInterval: 60000,
    retry: false,
  });

  // Build nav links based on role
  const navLinks = [
    { path: "/jobs", label: "Explore Roles", icon: Search, show: true },
    { path: "/dashboard", label: "My Profile", icon: User, show: !isAuthenticated || role === 'job_seeker' || role === 'admin' },
    { path: "/employer", label: "Employer Dashboard", icon: Building2, show: role === 'employer' || role === 'admin' },
    { path: "/messages", label: "Messages", icon: MessageSquare, show: canMessage, badge: unread },
    { path: "/admin", label: "Admin", icon: ShieldCheck, show: role === 'admin' },
  ].filter(l => l.show);

  const handleLogin = () => redirectToLogin(window.location.href);
  const handleLogout = () => logoutLocally('/');

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-primary/30 text-primary-foreground">
              <TalentBridgeLogo size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">TalentBridge</span>
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
                  {link.badge > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[11px] leading-none px-1.5 py-1" aria-label={`${link.badge} unread`}>
                      {link.badge > 99 ? "99+" : link.badge}
                    </span>
                  )}
                </Button>
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {!isAuthenticated ? (
              <Button variant="ghost" className="gap-2" onClick={handleLogin}>
                <LogIn className="w-4 h-4" />
                Sign In
              </Button>
            ) : null}
            {(!isAuthenticated || role === 'employer' || role === 'admin') && (
              <Link to="/post-job">
                <Button className="gap-2 bg-primary hover:bg-primary/90 shadow-md shadow-primary/25">
                  <Briefcase className="w-4 h-4" />
                  Post a Role
                </Button>
              </Link>
            )}
            {isAuthenticated && (
              <Link to="/settings" aria-label="Account settings" title="Account settings">
                <Button variant={location.pathname.startsWith("/settings") ? "secondary" : "ghost"} size="icon" className="text-muted-foreground">
                  <SettingsIcon className="w-4 h-4" />
                </Button>
              </Link>
            )}
            {isAuthenticated && (
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            )}
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Menu, ${unread} unread messages` : "Menu"}>
                <Menu className="w-5 h-5" />
                {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-background" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="flex items-center gap-2.5 mb-8 pt-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
                  <TalentBridgeLogo size={16} />
                </div>
                <span className="font-bold">TalentBridge</span>
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
                      {link.badge > 0 && (
                        <span className="ml-auto rounded-full bg-primary text-primary-foreground text-[11px] leading-none px-1.5 py-1">
                          {link.badge > 99 ? "99+" : link.badge}
                        </span>
                      )}
                    </Button>
                  </Link>
                ))}
                <div className="border-t my-4" />
                {(!isAuthenticated || role === 'employer' || role === 'admin') && (
                  <Link to="/post-job" onClick={() => setOpen(false)}>
                    <Button className="w-full gap-2">
                      <Briefcase className="w-4 h-4" />
                      Post a Role
                    </Button>
                  </Link>
                )}
                {!isAuthenticated ? (
                  <Button variant="outline" className="w-full gap-2" onClick={handleLogin}>
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </Button>
                ) : (
                  <>
                  <Link to="/settings" onClick={() => setOpen(false)}>
                    <Button variant={location.pathname.startsWith("/settings") ? "secondary" : "ghost"} className="w-full justify-start gap-3">
                      <SettingsIcon className="w-4 h-4" />
                      Account settings
                    </Button>
                  </Link>
                  <Button variant="ghost" className="w-full gap-2 text-muted-foreground" onClick={handleLogout}>
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
