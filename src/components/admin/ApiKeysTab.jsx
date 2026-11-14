import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Copy, KeyRound, Loader2, Plus, ShieldAlert, Check } from "lucide-react";
import { toast } from "sonner";

const ago = (d) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "never");
const STATUS = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  revoked: "bg-red-50 text-red-800 border-red-200",
  expired: "bg-secondary text-muted-foreground",
};

// The new key, shown once with a copy button.
function NewKey({ created, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      toast.error("Couldn’t copy. Select the key and copy it by hand.");
    }
  };
  return (
    <Card className="p-5 space-y-3 border-emerald-300 bg-emerald-50/50">
      <h3 className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" /> “{created.name}” is ready</h3>
      <p className="text-sm text-amber-900 flex items-start gap-1.5">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> Copy it now. This is the only time it’s shown. Store it like a password, in your agent’s secret settings.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <code className="flex-1 min-w-0 rounded-md border bg-card px-3 py-2 text-xs break-all select-all" data-testid="new-key">{created.key}</code>
        <Button type="button" variant="outline" className="gap-1.5 shrink-0" onClick={copy}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Your agent sends it as <code>Authorization: Bearer tb_admin_…</code>. It can read what it’s allowed to do at <code>/api/admin/openapi.json</code>.
      </p>
      <Button type="button" size="sm" onClick={onDone}>I’ve saved it</Button>
    </Card>
  );
}

function CreateKey({ scopes, onCreated }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(["read"]);
  const [expiry, setExpiry] = useState("90");
  const create = useMutation({
    mutationFn: () => base44.admin.createApiKey({ name, scopes: picked, expires_in_days: expiry === "never" ? null : Number(expiry) }),
    onSuccess: (k) => { setName(""); setPicked(["read"]); onCreated(k); },
    onError: (e) => toast.error(e?.message || "Couldn’t create the key."),
  });
  const toggle = (s) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Create an API key</h3>
        <p className="text-sm text-muted-foreground mt-1">For an AI agent or script that manages the site. Give each agent its own key, with only the permissions it needs.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <div className="space-y-1.5">
          <Label htmlFor="key-name">Name</Label>
          <Input id="key-name" placeholder="e.g. Ops agent" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key-expiry">Expires</Label>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger id="key-expiry"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">In 30 days</SelectItem>
              <SelectItem value="90">In 90 days</SelectItem>
              <SelectItem value="365">In a year</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1">Permissions</legend>
        {Object.entries(scopes).map(([id, s]) => (
          <label key={id} htmlFor={`scope-${id}`} className="flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer hover:bg-secondary/40">
            <Checkbox id={`scope-${id}`} checked={picked.includes(id)} onCheckedChange={() => toggle(id)} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">{s.label}</span>
              {id === "personal_data" && <Badge variant="outline" className="ml-2 text-[10px] bg-amber-50 text-amber-900 border-amber-200">Sensitive</Badge>}
              <span className="block text-xs text-muted-foreground">{s.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="button" className="gap-1.5" disabled={!name.trim() || !picked.length || create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create key
      </Button>
    </Card>
  );
}

export default function ApiKeysTab() {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["apiKeys"], queryFn: () => base44.admin.apiKeys() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
  const revoke = useMutation({
    mutationFn: (id) => base44.admin.revokeApiKey(id),
    onSuccess: (k) => { toast.success(`Revoked “${k.name}”. It stops working immediately.`); refresh(); },
    onError: (e) => toast.error(e?.message || "Couldn’t revoke the key."),
  });

  if (isLoading || !data) return <Skeleton className="h-64 rounded-xl" />;
  const { keys, scopes } = data;
  return (
    <div className="space-y-5">
      {created ? <NewKey created={created} onDone={() => setCreated(null)} /> : <CreateKey scopes={scopes} onCreated={(k) => { setCreated(k); refresh(); }} />}

      <Card className="p-5">
        <h3 className="font-semibold">Keys ({keys.length})</h3>
        <p className="text-xs text-muted-foreground mt-1">Everything a key changes is recorded in the audit log (System tab) under the key’s name.</p>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">No keys yet.</p>
        ) : (
          <ul className="divide-y mt-2">
            {keys.map((k) => (
              <li key={k.id} className="py-3 flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{k.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${STATUS[k.status]}`}>{k.status}</Badge>
                    <code className="text-[11px] text-muted-foreground">{k.prefix}…</code>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {k.scopes.map((s) => <Badge key={s} variant="secondary" className="text-[10px] font-normal">{scopes[s]?.label || s}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Created {ago(k.created_date)} · last used {ago(k.last_used_at)}
                    {k.status === "active" && (k.expires_at ? ` · expires ${ago(k.expires_at)}` : " · never expires")}
                    {k.revoked_at && ` · revoked ${ago(k.revoked_at)}`}
                  </p>
                </div>
                {k.status === "active" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 text-red-700">Revoke</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke “{k.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>Anything using this key stops working immediately. This can’t be undone; you can create a new key.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => revoke.mutate(k.id)}>Revoke</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
