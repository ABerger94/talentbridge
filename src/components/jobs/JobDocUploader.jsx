import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUp, Loader2 } from "lucide-react";
import { JOB_SCHEMA, LABELS, planJobFill } from "@/lib/jobDocFill";

// Upload an existing job posting (PDF / DOCX / TXT) and let AI fill the
// Post a Role form. Empty fields are filled directly; fields the employer
// already typed in are only replaced if they confirm.

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export default function JobDocUploader({ form, setForm }) {
  const [busy, setBusy] = useState(null); // 'upload' | 'parse' | null
  const fileRef = useRef();
  // Read the latest form inside async handlers.
  const formRef = useRef(form);
  formRef.current = form;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const name = file.name.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !/\.(pdf|docx|txt)$/.test(name)) {
      toast.error("Please upload a PDF, Word (.docx), or plain text file.");
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      toast.error("That file is over 4 MB. Try a smaller export of the document.");
      return;
    }
    setBusy("upload");
    let file_url;
    try {
      ({ file_url } = await base44.integrations.Core.UploadFile({ file }));
    } catch (err) {
      setBusy(null);
      toast.error(`Couldn't upload the document: ${err?.message || "please try again."}`);
      return;
    }

    setBusy("parse");
    try {
      const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: JOB_SCHEMA,
      });
      const { fills, conflicts } = planJobFill(extracted, formRef.current);
      const filled = Object.keys(fills).length;
      const conflictKeys = Object.keys(conflicts);

      if (!filled && !conflictKeys.length) {
        toast.error("The AI couldn't find job details in that document. You can fill in the form manually.");
        return;
      }
      if (filled) setForm((p) => ({ ...p, ...fills }));

      const kept = conflictKeys.map((k) => LABELS[k] || k).join(", ");
      const message = filled
        ? `Filled ${filled} field${filled === 1 ? "" : "s"} from your document. Review before posting.`
        : "Your document matched fields you've already filled in.";
      toast.success(message, {
        description: conflictKeys.length ? `Kept what you'd already entered for: ${kept}.` : undefined,
        duration: conflictKeys.length ? 12000 : 5000,
        action: conflictKeys.length
          ? {
              label: "Replace",
              onClick: () => {
                setForm((p) => ({ ...p, ...conflicts }));
                toast.success("Replaced with the document's version.");
              },
            }
          : undefined,
      });
    } catch (err) {
      console.error("Job document parse failed", err);
      toast.error(`Couldn't read the document with AI: ${err?.message || "please try again later."}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-6 border-dashed">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h2 className="font-semibold flex items-center gap-2">
            <FileUp className="w-4 h-4 text-primary" /> Already have a job description?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload it (PDF, Word, or TXT) and AI will fill in this form for you to review.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          type="button"
          variant="outline"
          className="gap-2 shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
        >
          {busy === "upload" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
          ) : busy === "parse" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Reading document...</>
          ) : (
            <><FileUp className="w-4 h-4" /> Upload document</>
          )}
        </Button>
      </div>
    </Card>
  );
}
