import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
const EMPTY = { name: "", website: "", contact_title: "", size: "", location: "", linkedin: "", about: "" };

// Company profile used in onboarding and on the Company Profile page. The
// same details appear publicly with the employer's job postings.
export default function CompanyProfileForm({ initial, onSubmit, submitLabel = "Save", saving = false, email }) {
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}) });
  useEffect(() => {
    if (initial) setForm({ ...EMPTY, ...initial });
  }, [initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const emailDomain = (email || "").split("@")[1] || "";
  const freeEmail = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail)\./i.test(emailDomain);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="company-name">Company name *</Label>
          <Input id="company-name" value={form.name} onChange={set("name")} placeholder="e.g. Northwind Foods" required maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company-website">Company website</Label>
          <Input id="company-website" value={form.website} onChange={set("website")} placeholder="northwind.com" inputMode="url" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-title">Your job title</Label>
          <Input id="contact-title" value={form.contact_title} onChange={set("contact_title")} placeholder="e.g. HR Manager" maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label>Company size</Label>
          <Select value={form.size || undefined} onValueChange={set("size")}>
            <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="company-location">Headquarters</Label>
          <Input id="company-location" value={form.location} onChange={set("location")} placeholder="e.g. Baltimore, MD" maxLength={120} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="company-linkedin">LinkedIn page (optional)</Label>
          <Input id="company-linkedin" value={form.linkedin} onChange={set("linkedin")} placeholder="linkedin.com/company/…" inputMode="url" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="company-about">About the company</Label>
          <Textarea id="company-about" value={form.about} onChange={set("about")} placeholder="What you do, who you serve, and what it's like to work with you." maxLength={1500} className="min-h-[100px]" />
          <p className="text-xs text-muted-foreground">Shown to candidates on your job postings.</p>
        </div>
      </div>

      {freeEmail && (
        <p className="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
          Tip: you’re signed in with a personal email address. Adding your company website (and, ideally, signing up with a
          work email on that domain) helps us verify you faster.
        </p>
      )}

      <Button type="submit" className="w-full sm:w-auto gap-2" disabled={saving || !form.name.trim()}>
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
