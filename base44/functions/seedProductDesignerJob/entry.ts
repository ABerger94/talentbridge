import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth check: only admins can seed data
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const job = await base44.asServiceRole.entities.Job.create({
      title: "Product Designer",
      company: "TalentBridge",
      company_logo_url: "",
      location: "San Francisco, CA",
      work_type: "hybrid",
      employment_type: "full_time",
      salary_min: 120000,
      salary_max: 160000,
      salary_currency: "USD",
      description: "We're looking for a talented Product Designer to join our team and help shape the future of how talent is discovered and matched. You'll work on creating intuitive, beautiful interfaces that help candidates showcase their true capabilities and help employers see beyond resumes.",
      responsibilities: "Design user experiences and interfaces for candidate profiles, job discovery, and employer dashboards.\nConduct user research and usability testing to validate design decisions.\nCollaborate with engineers and product managers to ship features.\nMaintain design consistency across the platform.\nIterate rapidly based on user feedback.",
      qualifications: "3+ years of product design experience.\nStrong portfolio demonstrating UX/UI work.\nProficiency in design tools (Figma preferred).\nExperience designing for web and mobile applications.\nExcellent communication and collaboration skills.",
      nice_to_haves: "Experience with design systems and component libraries.\nKnowledge of accessibility standards (WCAG).\nBackground in HR tech or talent platforms.\nExperience with user research methods.\nFamiliarity with design-to-code workflows.",
      benefits: "Competitive salary and equity.\nHealth, dental, and vision insurance.\nUnlimited PTO.\n$1,000 annual learning budget.\nFlexible work arrangements.\nModern equipment and tools.",
      skills: ["Figma", "UX Design", "UI Design", "User Research", "Prototyping", "Wireframing", "Design Systems"],
      experience_level: "mid",
      industry: "Technology",
      culture_values: ["Innovation", "Collaboration", "People-First", "Transparency", "Growth Mindset"],
      growth_opportunities: "Lead design for new product initiatives. Mentor junior designers. Influence product strategy. Grow into senior design roles or design leadership.",
      status: "active",
      application_count: 0
    });

    return Response.json({ success: true, job });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});