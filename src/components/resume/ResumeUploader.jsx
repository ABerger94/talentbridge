import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function ResumeUploader({ profile, onProfileUpdate, onSave }) {
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const fileRef = useRef();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!allowed.includes(file.type)) {
      toast.error("Please upload a PDF, Word, or plain text file.");
      return;
    }

    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploading(false);

    // Update resume_url on profile immediately
    onProfileUpdate("resume_url", file_url);

    // Now parse it with AI
    setParsing(true);
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
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
      }
    });

    if (extracted.status === "success" && extracted.output) {
      const data = extracted.output;
      setParsedData(data);
      setParsing(false);
    } else {
      // Fallback: use InvokeLLM to parse the file text
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this resume and extract structured profile information. Be thorough — extract every skill, technology, and detail you can find.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            headline: { type: "string" },
            bio: { type: "string" },
            skills: { type: "array", items: { type: "string" } },
            experience_years: { type: "number" },
            experience_level: { type: "string" },
            work_history: { type: "string" },
            education: { type: "string" },
            career_goals: { type: "string" },
            preferred_location: { type: "string" },
          }
        }
      });
      setParsedData(result);
      setParsing(false);
    }
  };

  const applyParsed = () => {
    if (!parsedData) return;
    // Merge parsed data into profile — only fill in empty fields
    const updates = {};
    if (parsedData.headline && !profile.headline) updates.headline = parsedData.headline;
    if (parsedData.bio && !profile.bio) updates.bio = parsedData.bio;
    if (parsedData.work_history && !profile.work_history) updates.work_history = parsedData.work_history;
    if (parsedData.education && !profile.education) updates.education = parsedData.education;
    if (parsedData.career_goals && !profile.career_goals) updates.career_goals = parsedData.career_goals;
    if (parsedData.preferred_location && !profile.preferred_location) updates.preferred_location = parsedData.preferred_location;
    if (parsedData.experience_years > 0) updates.experience_years = parsedData.experience_years;
    if (parsedData.experience_level) updates.experience_level = parsedData.experience_level;
    // Merge skills without duplicates
    if (parsedData.skills?.length > 0) {
      const merged = [...new Set([...(profile.skills || []), ...parsedData.skills])];
      updates.skills = merged;
    }
    Object.entries(updates).forEach(([k, v]) => onProfileUpdate(k, v));
    toast.success("Profile filled from your resume! Review and save.");
    setParsedData(null);
  };

  const applyAll = () => {
    if (!parsedData) return;
    // Overwrite everything with parsed data
    if (parsedData.headline) onProfileUpdate("headline", parsedData.headline);
    if (parsedData.bio) onProfileUpdate("bio", parsedData.bio);
    if (parsedData.work_history) onProfileUpdate("work_history", parsedData.work_history);
    if (parsedData.education) onProfileUpdate("education", parsedData.education);
    if (parsedData.career_goals) onProfileUpdate("career_goals", parsedData.career_goals);
    if (parsedData.preferred_location) onProfileUpdate("preferred_location", parsedData.preferred_location);
    if (parsedData.experience_years > 0) onProfileUpdate("experience_years", parsedData.experience_years);
    if (parsedData.experience_level) onProfileUpdate("experience_level", parsedData.experience_level);
    if (parsedData.skills?.length > 0) onProfileUpdate("skills", parsedData.skills);
    toast.success("Profile fully replaced with resume data. Review and save.");
    setParsedData(null);
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
            <h3 className="font-semibold text-sm">AI Parsed Your Resume</h3>
            <Badge className="bg-accent/15 text-accent border-accent/20 text-xs">Preview</Badge>
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

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="gap-1.5" onClick={applyParsed}>
              <Sparkles className="w-3.5 h-3.5" /> Fill Empty Fields
            </Button>
            <Button size="sm" variant="outline" onClick={applyAll}>
              Replace All Fields
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