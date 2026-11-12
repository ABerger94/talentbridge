import { base44 } from "@/api/base44Client";

// Moving a candidate to Shortlisted or Passed emails them (the server also
// records the new status); other moves just save the status.
export async function changeApplicationStatus(application, job, status) {
  if (status === "shortlisted") {
    await base44.functions.invoke("sendShortlistNotification", { application_id: application.id, job_id: job?.id });
  } else if (status === "rejected") {
    await base44.functions.invoke("sendRejectionEmail", { application_id: application.id, job_id: job?.id });
  } else {
    await base44.entities.JobApplication.update(application.id, { status });
  }
}

export const PIPELINE_COLUMNS = [
  { status: "applied", label: "New", tone: "border-t-blue-400" },
  { status: "reviewed", label: "Reviewed", tone: "border-t-yellow-400" },
  { status: "shortlisted", label: "Shortlisted", tone: "border-t-green-500" },
  { status: "interview", label: "Interview", tone: "border-t-purple-500" },
  { status: "offered", label: "Offer", tone: "border-t-emerald-500" },
  { status: "rejected", label: "Passed", tone: "border-t-gray-400" },
];
