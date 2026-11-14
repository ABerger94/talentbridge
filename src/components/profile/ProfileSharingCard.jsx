import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Camera, Copy, Check, Crop, Eye, Loader2, Link2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/profile/ProfileView";
import PhotoCropDialog from "@/components/profile/PhotoCropDialog";

const SECTIONS = [
  ["proof_stories", "Proof stories", "You can also hide single stories on the Graph tab."],
  ["work_history", "Work experience", null],
  ["education", "Education", null],
  ["links", "Links", "LinkedIn, GitHub, portfolio"],
];

// On the seeker dashboard: photo, profile page preview, who viewed it,
// what employers see, and the public share link.
export default function ProfileSharingCard() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [cropSrc, setCropSrc] = useState(null); // photo being adjusted
  const { data: me, isLoading, error } = useQuery({ queryKey: ["myProfilePage"], queryFn: () => base44.profiles.me(), retry: false });
  const refresh = (next) => {
    if (next) queryClient.setQueryData(["myProfilePage"], (old) => ({ ...(old || {}), ...next }));
    queryClient.invalidateQueries({ queryKey: ["myProfilePage"] });
  };
  const closeCrop = () => {
    if (cropSrc?.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };
  // A chosen file opens the crop window first; nothing uploads until Save.
  const pickFile = (file) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error("Choose a JPG, PNG or WebP image.");
    if (file.size > 20 * 1024 * 1024) return toast.error("That image is over 20 MB. Choose a smaller one.");
    setCropSrc(URL.createObjectURL(file));
  };
  const photo = useMutation({
    mutationFn: (dataUrl) => base44.profiles.setPhoto(dataUrl),
    onSuccess: (p) => { refresh(p); closeCrop(); toast.success("Photo updated."); },
    onError: (e) => toast.error(e?.message || "Couldn’t upload the photo."),
  });
  const removePhoto = useMutation({
    mutationFn: () => base44.profiles.removePhoto(),
    onSuccess: (p) => { refresh(p); toast.success("Photo removed."); },
  });
  const sharing = useMutation({
    mutationFn: (body) => base44.profiles.updateSharing(body),
    onSuccess: (p) => refresh(p),
    onError: (e) => toast.error(e?.message || "Couldn’t save that."),
  });

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (error || !me) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">Save your profile to get your profile page, photo and share link.</Card>
    );
  }
  const s = me.sharing || {};
  const hidden = new Set(s.hidden_sections || []);
  const toggleSection = (id, show) => sharing.mutate({ hidden_sections: show ? [...hidden].filter((x) => x !== id) : [...hidden, id] });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.public_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn’t copy. Select the link and copy it by hand.");
    }
  };

  return (
    <Card className="p-4 sm:p-6 space-y-5" id="profile-page">
      <PhotoCropDialog src={cropSrc} open={!!cropSrc} onOpenChange={(o) => { if (!o) closeCrop(); }} onSave={(dataUrl) => photo.mutate(dataUrl)} saving={photo.isPending} />
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative w-fit">
          <Avatar name={me.full_name} src={me.photo_url} size="h-20 w-20 text-2xl" />
          {photo.isPending && <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-white" /></span>}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm sm:text-base font-semibold">Your profile page</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Your Capability Graph, proof stories and experience on one page for employers. Add a photo so they recognize you.</p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload a profile photo"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickFile(f); }} />
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={photo.isPending}>
              <Camera className="w-4 h-4" /> {me.photo_url ? "Change photo" : "Add photo"}
            </Button>
            {me.photo_url && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setCropSrc(me.photo_url)} disabled={photo.isPending}>
                <Crop className="w-4 h-4" /> Adjust
              </Button>
            )}
            {me.photo_url && (
              <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => removePhoto.mutate()} disabled={removePhoto.isPending}>
                <Trash2 className="w-4 h-4" /> Remove
              </Button>
            )}
            <Button asChild size="sm" className="gap-1.5"><Link to={`/seekers/${me.id}`}><Eye className="w-4 h-4" /> Preview as an employer</Link></Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-secondary/60 p-3 text-sm">
        <p className="font-medium">
          {me.views?.last_7d
            ? `${me.views.last_7d} ${me.views.last_7d === 1 ? "employer" : "employers"} viewed your profile in the last 7 days`
            : "No employer views in the last 7 days yet"}
          {me.views?.last_30d > me.views?.last_7d ? ` (${me.views.last_30d} in 30 days)` : ""}
        </p>
        {me.views?.recent?.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {me.views.recent.slice(0, 4).map((v) => `${v.company} (${formatDistanceToNow(new Date(v.viewed_at), { addSuffix: true })})`).join(" · ")}
          </p>
        )}
        {!me.open_to_opportunities && <p className="text-xs text-amber-800 mt-1">You’re hidden from employers right now, so only employers you’ve applied to can open your page.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">What employers see</p>
        <p className="text-xs text-muted-foreground -mt-1">Your Capability Graph, headline and skills always show. Your email, phone and résumé never do. Employers reach you through TalentBridge messages.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SECTIONS.map(([id, label, hint]) => (
            <div key={id} className="flex items-start justify-between gap-3 rounded-md border p-2.5">
              <Label htmlFor={`show-${id}`} className="text-sm font-normal cursor-pointer">
                {label}
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
              </Label>
              <Switch id={`show-${id}`} checked={!hidden.has(id)} onCheckedChange={(v) => toggleSection(id, v)} disabled={sharing.isPending} />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="public-link" className="cursor-pointer">
            <span className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="w-4 h-4 text-primary" /> Public share link</span>
            <span className="block text-xs text-muted-foreground font-normal mt-0.5">A link you can put on LinkedIn, your résumé or email signature. Anyone with it can see the same page employers do. It’s kept out of Google.</span>
          </Label>
          <Switch id="public-link" checked={!!s.public_enabled} onCheckedChange={(v) => sharing.mutate({ public_enabled: v })} disabled={sharing.isPending} />
        </div>
        {s.public_enabled && s.public_url && (
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 min-w-0 rounded-md border bg-card px-3 py-2 text-xs break-all" data-testid="public-url">{s.public_url}</code>
            <div className="flex gap-2 shrink-0">
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={copy}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? "Copied" : "Copy"}</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground"><RefreshCw className="w-4 h-4" /> New link</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Make a new link?</AlertDialogTitle>
                    <AlertDialogDescription>Your current link stops working right away. Use this if you shared it somewhere you no longer want it.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => sharing.mutate({ public_enabled: true, new_link: true })}>Make a new link</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
