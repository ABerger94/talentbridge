import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { application_id, job_id } = await req.json();

    const application = await base44.entities.JobApplication.read(application_id);
    const job = await base44.entities.Job.read(job_id);

    await base44.integrations.Core.SendEmail({
      to: application.applicant_email,
      subject: `Update on Your Application for ${job.title}`,
      body: `Hi ${application.applicant_name},\n\nThank you for your interest in the ${job.title} position at ${job.company}. After careful consideration, we've decided to move forward with other candidates whose qualifications were a closer match for this particular role.\n\nWe appreciate the time you invested in our interview process and encourage you to apply for future positions that align with your skills and experience.\n\nBest of luck in your career!\n\nBest regards,\nThe ${job.company} Team`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});