import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { role } = await req.json();

  if (!['employer', 'job_seeker'].includes(role)) {
    return Response.json({ error: 'Invalid role' }, { status: 400 });
  }

  await base44.asServiceRole.entities.User.update(user.id, { role });

  return Response.json({ success: true });
});