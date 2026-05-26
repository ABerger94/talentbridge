import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'employer' && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Only employers can send invitations' }, { status: 403 });
    }

    const { seeker_profile_id, job_id } = await req.json();

    // Fetch job and verify ownership
    const jobs = await base44.asServiceRole.entities.Job.filter({ id: job_id });
    if (!jobs || jobs.length === 0) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    const job = jobs[0];

    // Verify the employer owns this job (unless admin)
    if (job.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: You can only invite seekers for your own jobs' }, { status: 403 });
    }

    const seekers = await base44.asServiceRole.entities.SeekerProfile.filter({ id: seeker_profile_id });
    if (!seekers || seekers.length === 0) {
      return Response.json({ error: 'Seeker profile not found' }, { status: 404 });
    }
    const seeker = seekers[0];

    // Create invitation record
    await base44.entities.Invitation.create({
      job_id,
      seeker_profile_id,
      employer_id: user.id,
      status: 'pending'
    });

    // Get seeker's email from user record
    const seekerUsers = await base44.asServiceRole.entities.User.filter({ id: seeker.created_by_id });
    if (!seekerUsers || seekerUsers.length === 0) {
      return Response.json({ error: 'Seeker user not found' }, { status: 404 });
    }
    const seekerUser = seekerUsers[0];

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