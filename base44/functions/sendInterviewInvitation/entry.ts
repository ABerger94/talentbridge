import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { application_id, job_id, proposed_time } = await req.json();

    const application = await base44.asServiceRole.entities.JobApplication.get(application_id);
    const job = await base44.asServiceRole.entities.Job.get(job_id);

    const formattedTime = new Date(proposed_time).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    await base44.integrations.Core.SendEmail({
      to: application.applicant_email,
      subject: `Interview Invitation: ${job.title} at ${job.company}`,
      body: `Hi ${application.applicant_name},\n\nWe're excited to invite you to interview for the ${job.title} position at ${job.company}.\n\nProposed Interview Time: ${formattedTime} (EST)\n\nPlease reply to confirm this time or propose an alternative. You can do this directly in your TalentBridge dashboard.\n\nLooking forward to hearing from you!\n\nBest regards,\nThe ${job.company} Team`
    });

    await base44.asServiceRole.entities.JobApplication.update(application_id, {
      interview_proposed_time: proposed_time,
      interview_response: "pending"
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});