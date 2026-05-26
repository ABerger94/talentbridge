import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { application_id, job_id, seeker_profile_id } = await req.json();

    const application = await base44.asServiceRole.entities.JobApplication.read(application_id);
    const job = await base44.asServiceRole.entities.Job.read(job_id);

    // Verify user owns this job or is admin
    if (job.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: You can only send rejections for your own jobs' }, { status: 403 });
    }
    const seeker = seeker_profile_id 
      ? await base44.asServiceRole.entities.SeekerProfile.read(seeker_profile_id)
      : null;

    // Build adaptability report if we have match data and portfolio analysis
    let adaptabilityReport = '';
    if (application.ai_match_summary || application.ai_growth_potential || seeker?.portfolio_analysis) {
      adaptabilityReport = '\n\n--- Your Adaptability & Match Report ---\n\n';
      
      if (seeker?.portfolio_analysis) {
        const analysis = seeker.portfolio_analysis;
        adaptabilityReport += `Your Portfolio Strengths:\n`;
        if (analysis.technical_strengths?.length > 0) {
          adaptabilityReport += `• Technical: ${analysis.technical_strengths.join(', ')}\n`;
        }
        if (analysis.collaboration_signals) {
          adaptabilityReport += `• Collaboration: ${analysis.collaboration_signals}\n`;
        }
        if (analysis.architectural_patterns) {
          adaptabilityReport += `• Architecture: ${analysis.architectural_patterns}\n`;
        }
        adaptabilityReport += '\n';
      }

      if (application.ai_growth_potential) {
        adaptabilityReport += `Growth Potential for Roles Like This:\n${application.ai_growth_potential}\n\n`;
      }

      adaptabilityReport += `Next Steps:\nWhile you weren't the best fit for this specific role, your skills and experience position you well for related opportunities. We encourage you to:\n• Keep your portfolio and GitHub updated\n• Apply for roles that emphasize your core strengths\n• Check back for future openings that align with your background\n\nYou'll always receive transparent feedback on your potential — never a silent no.`;
    }

    const emailBody = `Hi ${application.applicant_name},\n\nThank you for your interest in the ${job.title} position at ${job.company}. After careful consideration of your background and our team's needs, we've decided to move forward with other candidates for this particular role.\n\nWe genuinely valued your application and believe your skills have strong market value.${adaptabilityReport}\n\nBest of luck in your career!\n\nBest regards,\nThe ${job.company} Team`;

    await base44.integrations.Core.SendEmail({
      to: application.applicant_email,
      subject: `Your Application for ${job.title} at ${job.company} — Feedback Included`,
      body: emailBody
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});