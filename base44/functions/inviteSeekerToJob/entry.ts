import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'employer') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { seeker_profile_id, job_id } = await req.json();

    // Fetch job and seeker profile
    const jobs = await base44.entities.Job.filter({ id: job_id });
    const seekers = await base44.entities.SeekerProfile.filter({ id: seeker_profile_id });

    if (!jobs || jobs.length === 0) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    if (!seekers || seekers.length === 0) {
      return Response.json({ error: 'Seeker profile not found' }, { status: 404 });
    }

    const job = jobs[0];
    const seeker = seekers[0];

    // Create invitation record
    await base44.entities.Invitation.create({
      job_id,
      seeker_profile_id,
      employer_id: user.id,
      status: 'pending'
    });

    // Get seeker's email from user record
    const users = await base44.asServiceRole.entities.User.filter({ id: seeker.created_by_id });
    if (!users || users.length === 0) {
      return Response.json({ error: 'Seeker user not found' }, { status: 404 });
    }
    const seekerUser = users[0];

    // Send invitation email
    await base44.integrations.Core.SendEmail({
      to: seekerUser.email,
      subject: `You're invited to apply for ${job.title} at ${job.company}`,
      body: `Hi ${seekerUser.full_name},\n\n${job.company} thinks you'd be a great fit for the ${job.title} role.\n\nCheck it out and apply here!\n\nBest,\nTalentBridge`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});