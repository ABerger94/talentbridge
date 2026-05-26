import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role } = await req.json();

    if (!['employer', 'job_seeker'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Prevent role change if user already has a real role assigned
    if (user.role && user.role !== 'user') {
      return Response.json({ error: 'Forbidden: Role already set' }, { status: 403 });
    }

    await base44.asServiceRole.entities.User.update(user.id, { role });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});