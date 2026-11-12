import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function ResumeUploader({ profile, onAutoSave }) {
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [filledCount, setFilledCount] = useState(0);
  const fileRef = useRef();

  const profileSchema = {
    type: "object",
    properties: {
      headline: { type: "string" },
      bio: { type: "string" },
      skills: { type: "array", items: { type: "string" } },
      experience_years: { type: "number" },
      experience_level: { type: "string", enum: ["entry", "mid", "senior", "lead", "executive"] },
      work_history: { type: "string" },
      education: { type: "string" },
      career_goals: { type: "string" },
      preferred_location: { type: "string" },
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!allowed.includes(file.type)) {
      toast.error("Please upload a PDF, Word, or plain text file.");
      return;
    }

    // Step 1 — store the file. This always works, even when AI credits are used up.
    setUploading(true);
    let file_url;
    try {
      const upload = await base44.integrations.Core.UploadFile({ file });
      file_url = upload.file_url;
    } catch (err) {
      setUploading(false);
      toast.error("Could not upload your resume. Please try again.");
      return;
    }
    setUploading(false);

    // Save the resume on the profile right away (it used to wait for "Save Profile").
    await onAutoSave({ resume_url: file_url });

    // Step 2 — AI parsing. If it can't run, the resume is still saved.
    setParsing(true);
    try {
      const data = await parseResume(file_url);
      if (!data) {
        toast.error("Resume saved, but the AI couldn't read any profile details from it — you can fill them in manually.");
      } else {
        // Fill only empty fields (and merge skills), then save — nothing the
        // seeker already wrote is overwritten automatically.
        const updates = fillEmptyFrom(data);
        const count = Object.keys(updates).length;
        if (count) await onAutoSave(updates);
        setParsedData(data);
        setFilledCount(count);
        toast.success(count ? `Filled ${count} field${count === 1 ? "" : "s"} from your resume and saved your profile.` : "Resume saved. Your profile already had these details.");
      }
    } catch (err) {
      console.error("Resume parse failed", err);
      toast.error(`Resume saved, but AI parsing failed: ${err?.message || "please try again later."}`);
    }
    setParsing(false);
  };

  // A usable parse has at least one populated field.
  const hasFields = (obj) =>
    !!obj && typeof obj === "object" &&
    Object.keys(profileSchema.properties).some((k) => {
      const v = obj[k];
      return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
    });

  const parseResume = async (file_url) => {
    // Provider/quota failures surface to the caller; the server already
    // fails over across every configured AI key, so retrying here only
    // doubles the wait.
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: profileSchema
    });

    // The self-hosted server returns the fields directly; keep accepting the
    // legacy Base44 { status, output } envelope too.
    const fields = extracted?.status === "success" && extracted?.output ? extracted.output : extracted;
    if (hasFields(fields)) return fields;

    // Fallback: have InvokeLLM read the uploaded file directly.
    const fallback = await base44.integrations.Core.InvokeLLM({
      prompt: `Parse this resume and extract structured profile information. Be thorough — extract every skill, technology, and detail you can find.`,
      file_urls: [file_url],
      response_json_schema: profileSchema
    });
    return hasFields(fallback) ? fallback : null;
  };

  const TEXT_FIELDS = ["headline", "bio", "work_history", "education", "career_goals", "preferred_location"];

  // Parsed values for fields the profile doesn't have yet; skills are merged.
  const fillEmptyFrom = (data) => {
    const updates = {};
    for (const k of TEXT_FIELDS) if (data[k] && !String(profile[k] || "").trim()) updates[k] = data[k];
    if (data.experience_years > 0 && !(profile.experience_years > 0)) updates.experience_years = data.experience_years;
    if (data.experience_level && !profile.experience_level) updates.experience_level = data.experience_level;
    if (data.skills?.length > 0) {
      const merged = [...new Set([...(profile.skills || []), ...data.skills])];
      if (merged.length > (profile.skills || []).length) updates.skills = merged;
    }
    return updates;
  };

  const replaceAll = async () => {
    if (!parsedData) return;
    const updates = {};
    for (const k of TEXT_FIELDS) if (parsedData[k]) updates[k] = parsedData[k];
    if (parsedData.experience_years > 0) updates.experience_years = parsedData.experience_years;
    if (parsedData.experience_level) updates.experience_level = parsedData.experience_level;
    if (parsedData.skills?.length > 0) updates.skills = parsedData.skills;
    if (await onAutoSave(updates)) {
      toast.success("Profile replaced with your resume's details and saved.");
      setParsedData(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Resume Upload
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your resume and AI will automatically parse it to fill your profile.
        </p>

        {profile.resume_url && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-secondary rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            <span className="text-sm text-muted-foreground flex-1 truncate">Resume on file</span>
            <a href={profile.resume_url} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" className="text-xs h-7">View</Button>
            </a>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={handleFileChange}
        />

        <Button
          variant="outline"
          className="w-full gap-2 h-11 border-dashed"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || parsing}
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
          ) : parsing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> AI is parsing your resume...</>
          ) : (
            <><Upload className="w-4 h-4" /> {profile.resume_url ? "Upload New Resume" : "Upload Resume"} (PDF, Word, TXT)</>
          )}
        </Button>
      </Card>

      {/* Parsed Preview */}
      {parsedData && (
        <Card className="p-6 border-accent/25 bg-accent/5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-sm">
              {filledCount ? `Filled ${filledCount} field${filledCount === 1 ? "" : "s"} from your resume` : "AI read your resume"}
            </h3>
            <Badge className="bg-accent/15 text-accent border-accent/20 text-xs">Saved</Badge>
          </div>

          <div className="space-y-3 text-sm mb-5">
            {parsedData.headline && (
              <div><span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Headline</span><p className="mt-0.5">{parsedData.headline}</p></div>
            )}
            {parsedData.experience_years > 0 && (
              <div><span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Experience</span><p className="mt-0.5">{parsedData.experience_years} years · {parsedData.experience_level}</p></div>
            )}
            {parsedData.skills?.length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Skills Detected ({parsedData.skills.length})</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {parsedData.skills.slice(0, 12).map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                  {parsedData.skills.length > 12 && <Badge variant="outline" className="text-xs">+{parsedData.skills.length - 12} more</Badge>}
                </div>
              </div>
            )}
            {parsedData.education && (
              <div><span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Education</span><p className="mt-0.5 text-muted-foreground line-clamp-2">{parsedData.education}</p></div>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            We only filled fields that were empty, so nothing you wrote was changed. Review them on the Profile tab.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={replaceAll}>
              Replace all fields with my resume
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setParsedData(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}