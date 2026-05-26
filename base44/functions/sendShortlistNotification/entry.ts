import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { application_id, job_id } = await req.json();

    const application = await base44.entities.JobApplication.read(application_id);
    const job = await base44.entities.Job.read(job_id);

    await base44.integrations.Core.SendEmail({
      to: application.applicant_email,
      subject: `Great News! You've Been Shortlisted for ${job.title}`,
      body: `Hi ${application.applicant_name},\n\nCongratulations! You've been shortlisted for the ${job.title} position at ${job.company}. We're impressed by your qualifications and would like to move forward with your application.\n\nNext steps will be shared shortly.\n\nBest regards,\nThe ${job.company} Team`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});