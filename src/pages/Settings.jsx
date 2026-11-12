import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { logoutLocally } from "@/lib/auth-redirect";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KeyRound, MonitorSmartphone, Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

function Section({ icon: Icon, title, children, danger }) {
  return (
    <Card className={`p-5 sm:p-6 space-y-4 ${danger ? "border-red-200" : ""}`}>
      <h2 className={`font-semibold flex items-center gap-2 ${danger ? "text-red-700" : ""}`}>
        <Icon className="w-4 h-4" /> {title}
      </h2>
      {children}
    </Card>
  );
}

function PasswordForm({ hasPassword, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 8) return toast.error("Your new password needs at least 8 characters.");
    if (next !== confirm) return toast.error("The new passwords don't match.");
    setBusy(true);
    try {
      await base44.auth.changePassword({ currentPassword: current, newPassword: next });
      toast.success(hasPassword ? "Password changed. Other devices were signed out." : "Password set. You can now also sign in with it.");
      setCurrent(""); setNext(""); setConfirm("");
      onDone?.();
    } catch (err) {
      toast.error(err?.message || "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      {hasPassword ? (
        <div className="space-y-1.5">
          <Label htmlFor="pw-current">Current password</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You sign in with Google. You can also set a password to sign in with your email.</p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="pw-new">New password</Label>
        <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw-confirm">Confirm new password</Label>
        <Input id="pw-confirm" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <Button type="submit" disabled={busy} className="gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {hasPassword ? "Change password" : "Set password"}
      </Button>
    </form>
  );
}

export default function Settings() {
  const { user, checkUserAuth } = useAuth();
  const [busy, setBusy] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const isAdmin = user?.role === "admin";
  const hasPassword = user?.has_password !== false;

  const signOutOthers = async () => {
    setBusy("others");
    try {
      await base44.auth.signOutOtherDevices();
      toast.success("Signed out everywhere else. This device stays signed in.");
    } catch (err) {
      toast.error(err?.message || "Couldn't sign out other devices.");
    } finally {
      setBusy(null);
    }
  };

  const exportData = async () => {
    setBusy("export");
    try {
      await base44.account.downloadExport();
      toast.success("Your data is downloading.");
    } catch (err) {
      toast.error(err?.message || "Couldn't export your data.");
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      await base44.account.deleteAccount(hasPassword ? { password: deletePw } : { confirm: deletePw });
      toast.success("Your account was deleted.");
      logoutLocally("/");
    } catch (err) {
      toast.error(err?.message || "Couldn't delete your account.");
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Account settings</h1>
        <p className="text-muted-foreground break-all">Signed in as {user?.email}</p>
      </div>

      <Section icon={KeyRound} title={hasPassword ? "Change password" : "Set a password"}>
        <PasswordForm hasPassword={hasPassword} onDone={checkUserAuth} />
      </Section>

      <Section icon={MonitorSmartphone} title="Signed-in devices">
        <p className="text-sm text-muted-foreground">
          Lost a phone or used a shared computer? Sign out of TalentBridge everywhere except here.
        </p>
        <Button variant="outline" onClick={signOutOthers} disabled={busy === "others"} className="gap-2">
          {busy === "others" && <Loader2 className="w-4 h-4 animate-spin" />} Sign out other devices
        </Button>
      </Section>

      <Section icon={Download} title="Download your data">
        <p className="text-sm text-muted-foreground">
          A copy of everything we hold about you: your account, profile, applications, roles, messages, and the emails we sent you
          (see the <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>).
        </p>
        <Button variant="outline" onClick={exportData} disabled={busy === "export"} className="gap-2">
          {busy === "export" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download my data (JSON)
        </Button>
      </Section>

      <Section icon={Trash2} title="Delete account" danger>
        {isAdmin ? (
          <p className="text-sm text-muted-foreground">Admin accounts can't be deleted here. Remove admin access first.</p>
        ) : (
          <>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Your profile, resume and uploaded files, and your messages are deleted right away.</li>
              <li>Employers you applied to keep a record that a deleted user applied, without your name, email, resume, or cover letter.</li>
              <li>If you're an employer: roles with applicants are closed; roles without applicants are deleted.</li>
              <li>This can't be undone. Download your data first if you want a copy.</li>
            </ul>
            <Button variant="destructive" onClick={() => { setDeletePw(""); setDeleteOpen(true); }}>Delete my account</Button>
          </>
        )}
      </Section>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => { if (busy !== "delete") setDeleteOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your TalentBridge account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and personal data. {hasPassword ? "Enter your password to confirm." : "Type your email address to confirm."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type={hasPassword ? "password" : "email"}
            autoComplete={hasPassword ? "current-password" : "off"}
            placeholder={hasPassword ? "Password" : user?.email}
            value={deletePw}
            onChange={(e) => setDeletePw(e.target.value)}
            aria-label={hasPassword ? "Password" : "Email address"}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={deleteAccount} disabled={!deletePw || busy === "delete"} className="gap-2">
              {busy === "delete" && <Loader2 className="w-4 h-4 animate-spin" />} Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
