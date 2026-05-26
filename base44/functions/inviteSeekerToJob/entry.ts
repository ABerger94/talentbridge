import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'employer') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { seeker_id, job_id } = await req.json();

    // Fetch job and seeker
    const jobs = await base44.entities.Job.filter({ id: job_id });
    if (!jobs || jobs.length === 0) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    const jobData = jobs[0];

    const seekers = await base44.entities.SeekerProfile.filter({ id: seeker_id });
    if (!seekers || seekers.length === 0) {
      return Response.json({ error: 'Seeker not found' }, { status: 404 });
    }
    const seekerData = seekers[0];

    // Get seeker's user email for outreach
    const seekerUser = await base44.asServiceRole.entities.User.list();
    const foundUser = seekerUser.find(u => u.id === seekerData.created_by_id);
    const seekerEmail = foundUser?.email || '';

    // Send invite email
    await base44.integrations.Core.SendEmail({
      to: seekerEmail,
      subject: `You're a great fit for ${jobData.title} at ${jobData.company}`,
      body: `Hi ${seekerData.headline},

We think you'd be a great fit for the ${jobData.title} role at ${jobData.company}. We've reviewed your profile and your skills align well with what we're looking for.

We'd love for you to apply! Check out the job details and submit your application.

Best regards,
The TalentBridge Team`
    });

    // Create a notification/record if needed
    return Response.json({ 
      success: true, 
      message: `Invite sent to ${seekerEmail}` 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});