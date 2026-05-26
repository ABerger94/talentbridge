import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, X, Plus, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function PostJob() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "", company: "", location: "", work_type: "remote", employment_type: "full_time",
    salary_min: "", salary_max: "", description: "", responsibilities: "", qualifications: "",
    nice_to_haves: "", benefits: "", skills: [], experience_level: "mid", industry: "",
    culture_values: [], growth_opportunities: "", status: "active",
  });
  const [skillInput, setSkillInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const addSkill = () => {
    if (skillInput.trim() && !form.skills.includes(skillInput.trim())) {
      update("skills", [...form.skills, skillInput.trim()]);
      setSkillInput("");
    }
  };

  const addValue = () => {
    if (valueInput.trim() && !form.culture_values.includes(valueInput.trim())) {
      update("culture_values", [...form.culture_values, valueInput.trim()]);
      setValueInput("");
    }
  };

  const enhanceWithAI = async () => {
    if (!form.title || !form.description) {
      toast.error("Please fill in at least the title and description first.");
      return;
    }
    setAiLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a hiring expert. Enhance this job posting to be more inclusive, people-first, and appealing. 
Improve the description to be welcoming and growth-oriented. 
Add nice-to-haves (clearly labeled as not required). 
Suggest responsibilities if missing.
Make sure the tone is warm and encouraging, not intimidating.
Don't use corporate jargon.

Current posting:
Title: ${form.title}
Company: ${form.company}
Description: ${form.description}
Qualifications: ${form.qualifications}

Return ONLY a JSON object.`,
      response_json_schema: {
        type: "object",
        properties: {
          description: { type: "string" },
          responsibilities: { type: "string" },
          qualifications: { type: "string" },
          nice_to_haves: { type: "string" },
          benefits: { type: "string" },
          suggested_skills: { type: "array", items: { type: "string" } },
          suggested_values: { type: "array", items: { type: "string" } },
          growth_opportunities: { type: "string" },
        },
      },
    });
    setForm((p) => ({
      ...p,
      description: result.description || p.description,
      responsibilities: result.responsibilities || p.responsibilities,
      qualifications: result.qualifications || p.qualifications,
      nice_to_haves: result.nice_to_haves || p.nice_to_haves,
      benefits: result.benefits || p.benefits,
      skills: result.suggested_skills?.length > 0 ? [...new Set([...p.skills, ...result.suggested_skills])] : p.skills,
      culture_values: result.suggested_values?.length > 0 ? [...new Set([...p.culture_values, ...result.suggested_values])] : p.culture_values,
      growth_opportunities: result.growth_opportunities || p.growth_opportunities,
    }));
    setAiLoading(false);
    toast.success("Job posting enhanced with AI! Review the changes.");
  };

  const postMutation = useMutation({
    mutationFn: async () => {
      const data = { ...form };
      if (data.salary_min) data.salary_min = Number(data.salary_min);
      if (data.salary_max) data.salary_max = Number(data.salary_max);
      return base44.entities.Job.create(data);
    },
    onSuccess: () => {
      toast.success("Job posted successfully!");
      navigate("/employer");
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Briefcase className="w-8 h-8 text-primary" />
          Post a Role
        </h1>
        <p className="text-muted-foreground">
          Write a capability-first job posting. Our AI helps you describe the <strong>problems to be solved</strong>, not just a checklist of credentials.
        </p>
      </div>

      <div className="space-y-6">
        <Card className="p-6 space-y-5">
          <h2 className="font-semibold text-lg">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Job Title *</Label>
              <Input placeholder="e.g. Product Designer" value={form.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Company *</Label>
              <Input placeholder="Your company name" value={form.company} onChange={(e) => update("company", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input placeholder="e.g. New York, NY" value={form.location} onChange={(e) => update("location", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input placeholder="e.g. Technology" value={form.industry} onChange={(e) => update("industry", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Work Type</Label>
              <Select value={form.work_type} onValueChange={(v) => update("work_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="onsite">On-site</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Employment Type</Label>
              <Select value={form.employment_type} onValueChange={(v) => update("employment_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="internship">Internship</SelectItem>
                  <SelectItem value="freelance">Freelance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Experience Level</Label>
              <Select value={form.experience_level} onValueChange={(v) => update("experience_level", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entry Level</SelectItem>
                  <SelectItem value="mid">Mid Level</SelectItem>
                  <SelectItem value="senior">Senior</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Salary Min (USD)</Label>
              <Input type="number" placeholder="50000" value={form.salary_min} onChange={(e) => update("salary_min", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Salary Max (USD)</Label>
              <Input type="number" placeholder="80000" value={form.salary_max} onChange={(e) => update("salary_max", e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Description & Details</h2>
            <Button variant="outline" size="sm" className="gap-2" onClick={enhanceWithAI} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-accent" />}
              Enhance with AI
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Job Description *</Label>
            <Textarea placeholder="Describe the role, team, and what makes it exciting..." value={form.description} onChange={(e) => update("description", e.target.value)} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <Label>Responsibilities</Label>
            <Textarea placeholder="What will this person do day-to-day?" value={form.responsibilities} onChange={(e) => update("responsibilities", e.target.value)} className="min-h-[100px]" />
          </div>
          <div className="space-y-2">
            <Label>Qualifications</Label>
            <Textarea placeholder="What skills and experience are you looking for?" value={form.qualifications} onChange={(e) => update("qualifications", e.target.value)} className="min-h-[100px]" />
          </div>
          <div className="space-y-2">
            <Label>Nice-to-Haves (not required)</Label>
            <Textarea placeholder="Bonus skills that would be great but aren't required..." value={form.nice_to_haves} onChange={(e) => update("nice_to_haves", e.target.value)} className="min-h-[80px]" />
          </div>
          <div className="space-y-2">
            <Label>Benefits & Perks</Label>
            <Textarea placeholder="Health insurance, PTO, learning budget, etc." value={form.benefits} onChange={(e) => update("benefits", e.target.value)} className="min-h-[80px]" />
          </div>
          <div className="space-y-2">
            <Label>Growth Opportunities</Label>
            <Textarea placeholder="How can someone grow in this role?" value={form.growth_opportunities} onChange={(e) => update("growth_opportunities", e.target.value)} className="min-h-[60px]" />
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <h2 className="font-semibold text-lg">Skills & Culture</h2>
          <div className="space-y-2">
            <Label>Skills</Label>
            <div className="flex gap-2">
              <Input placeholder="Add a skill" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
              <Button variant="outline" size="icon" onClick={addSkill}><Plus className="w-4 h-4" /></Button>
            </div>
            {form.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.skills.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1 pr-1">
                    {s}
                    <button onClick={() => update("skills", form.skills.filter((sk) => sk !== s))} className="ml-1 hover:bg-foreground/10 rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Culture Values</Label>
            <div className="flex gap-2">
              <Input placeholder="e.g. Work-life balance" value={valueInput} onChange={(e) => setValueInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValue())} />
              <Button variant="outline" size="icon" onClick={addValue}><Plus className="w-4 h-4" /></Button>
            </div>
            {form.culture_values.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.culture_values.map((v) => (
                  <Badge key={v} variant="outline" className="gap-1 pr-1 bg-accent/5 border-accent/20 text-accent">
                    {v}
                    <button onClick={() => update("culture_values", form.culture_values.filter((cv) => cv !== v))} className="ml-1 hover:bg-foreground/10 rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/jobs")}>Cancel</Button>
          <Button
            className="gap-2 px-8 shadow-lg shadow-primary/20"
            onClick={() => postMutation.mutate()}
            disabled={postMutation.isPending || !form.title || !form.company || !form.description}
          >
            {postMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
            Post Job
          </Button>
        </div>
      </div>
    </div>
  );
}