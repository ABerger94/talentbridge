import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'employer') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { job_id } = await req.json();

    // Fetch the job
    const job = await base44.entities.Job.filter({ id: job_id });
    if (!job || job.length === 0) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    const jobData = job[0];

    // Fetch all seeker profiles
    const seekers = await base44.entities.SeekerProfile.list();
    if (!seekers || seekers.length === 0) {
      return Response.json({ matches: [] });
    }

    // Use AI to score each seeker against the job
    const seekerMatches = [];
    for (const seeker of seekers) {
      const prompt = `You are an expert recruiter. Score how well this job seeker matches the job role on a scale of 0-100.

Job Title: ${jobData.title}
Job Description: ${jobData.description}
Required Skills: ${jobData.skills?.join(', ') || 'N/A'}
Experience Level: ${jobData.experience_level}

Seeker Profile:
- Headline: ${seeker.headline}
- Skills: ${seeker.skills?.join(', ') || 'N/A'}
- Experience Level: ${seeker.experience_level}
- Experience Years: ${seeker.experience_years || 'N/A'}
- Bio: ${seeker.bio || 'N/A'}
- Industries of Interest: ${seeker.industries_of_interest?.join(', ') || 'N/A'}

Return only a JSON object with:
{
  "match_score": <number 0-100>,
  "match_summary": "<brief explanation of why this is a good/poor match>"
}`;

      const aiResult = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            match_score: { type: 'number' },
            match_summary: { type: 'string' }
          }
        }
      });

      if (aiResult.match_score >= 40) {
        seekerMatches.push({
          seeker_id: seeker.id,
          seeker_headline: seeker.headline,
          seeker_name: seeker.id,
          match_score: aiResult.match_score,
          match_summary: aiResult.match_summary
        });
      }
    }

    // Sort by match score descending
    seekerMatches.sort((a, b) => b.match_score - a.match_score);

    return Response.json({ matches: seekerMatches.slice(0, 20) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});