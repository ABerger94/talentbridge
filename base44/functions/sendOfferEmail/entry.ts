import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { application_id, job_id, offer_details } = await req.json();

    const application = await base44.entities.JobApplication.read(application_id);
    const job = await base44.entities.Job.read(job_id);

    const salaryStr = offer_details.salary ? `${offer_details.salary_currency || 'USD'} ${offer_details.salary.toLocaleString()}` : 'To be discussed';
    const benefitsStr = offer_details.benefits || 'As discussed';

    await base44.integrations.Core.SendEmail({
      to: application.applicant_email,
      subject: `Offer Extended: ${job.title} at ${job.company}`,
      body: `Hi ${application.applicant_name},\n\nWe're pleased to extend an offer for the ${job.title} position at ${job.company}.\n\nOffer Details:\nPosition: ${offer_details.title || job.title}\nCompensation: ${salaryStr}\nStart Date: ${offer_details.start_date || 'To be discussed'}\nBenefits: ${benefitsStr}\n\nAdditional Notes:\n${offer_details.notes || 'None'}\n\nPlease respond through your TalentBridge dashboard to accept, decline, or discuss terms.\n\nLooking forward to your response!\n\nBest regards,\nThe ${job.company} Team`
    });

    await base44.entities.JobApplication.update(application_id, {
      offer_details,
      offer_response: "pending"
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});