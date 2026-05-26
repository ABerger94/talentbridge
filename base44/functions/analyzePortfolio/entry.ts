import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { seeker_profile_id, github_url, portfolio_url } = await req.json();

    if (!github_url && !portfolio_url) {
      return Response.json({ error: 'At least one portfolio URL required' }, { status: 400 });
    }

    // Build analysis prompt
    let analysisPrompt = `Analyze this candidate's portfolio and provide structured insights:\n\n`;
    if (github_url) analysisPrompt += `GitHub Profile: ${github_url}\n`;
    if (portfolio_url) analysisPrompt += `Portfolio Website: ${portfolio_url}\n`;

    analysisPrompt += `
Please analyze and return a JSON object with:
{
  "github_analysis": "Summary of coding patterns, quality, and project types (2-3 sentences)",
  "project_highlights": [
    {
      "name": "Project name",
      "tech_stack": ["tech1", "tech2"],
      "impact": "What this project demonstrates about capability"
    }
  ],
  "technical_strengths": ["strength1", "strength2", "strength3"],
  "architectural_patterns": "Notable architectural or design patterns observed",
  "collaboration_signals": "Evidence of collaboration, code review, or team contribution"
}

Be specific and evidence-based. If a URL is inaccessible, note that in the analysis.`;

    const analysisResult = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          github_analysis: { type: 'string' },
          project_highlights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                tech_stack: { type: 'array', items: { type: 'string' } },
                impact: { type: 'string' }
              }
            }
          },
          technical_strengths: { type: 'array', items: { type: 'string' } },
          architectural_patterns: { type: 'string' },
          collaboration_signals: { type: 'string' }
        }
      }
    });

    const portfolioAnalysis = {
      ...analysisResult,
      last_analyzed: new Date().toISOString()
    };

    // Update seeker profile with analysis
    await base44.asServiceRole.entities.SeekerProfile.update(seeker_profile_id, {
      portfolio_analysis: portfolioAnalysis
    });

    return Response.json({ success: true, analysis: portfolioAnalysis });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});