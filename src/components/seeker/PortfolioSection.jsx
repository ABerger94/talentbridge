import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Github, Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function PortfolioSection({ seeker, onUpdate }) {
  const [githubUrl, setGithubUrl] = useState(seeker?.github_url || "");
  const [portfolioUrl, setPortfolioUrl] = useState(seeker?.portfolio_url || "");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleSaveUrls = async () => {
    setLoading(true);
    try {
      await base44.entities.SeekerProfile.update(seeker.id, {
        github_url: githubUrl || undefined,
        portfolio_url: portfolioUrl || undefined
      });
      toast.success("Portfolio URLs saved!");
      onUpdate?.();
    } catch (error) {
      toast.error("Failed to save URLs");
    }
    setLoading(false);
  };

  const handleAnalyze = async () => {
    if (!githubUrl && !portfolioUrl) {
      toast.error("Please add at least one portfolio URL");
      return;
    }

    setAnalyzing(true);
    try {
      await base44.functions.invoke("analyzePortfolio", {
        seeker_profile_id: seeker.id,
        github_url: githubUrl,
        portfolio_url: portfolioUrl
      });
      toast.success("Portfolio analyzed! Employers can now see your strengths.");
      onUpdate?.();
    } catch (error) {
      toast.error("Failed to analyze portfolio");
    }
    setAnalyzing(false);
  };

  const analysis = seeker?.portfolio_analysis;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5" /> Your Portfolio
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Connect your GitHub and portfolio so employers see your real capabilities beyond the resume.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* URL Inputs */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="github" className="text-sm flex items-center gap-2 mb-2">
              <Github className="w-4 h-4" /> GitHub Profile
            </Label>
            <Input
              id="github"
              placeholder="https://github.com/yourname"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="text-sm"
            />
          </div>

          <div>
            <Label htmlFor="portfolio" className="text-sm flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4" /> Portfolio Website
            </Label>
            <Input
              id="portfolio"
              placeholder="https://yourportfolio.com"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        {/* Save & Analyze */}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveUrls}
            disabled={loading}
            className="text-xs"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Save URLs
          </Button>
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing || (!githubUrl && !portfolioUrl)}
            className="text-xs gap-1"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Globe className="w-3 h-3" /> Analyze Portfolio
              </>
            )}
          </Button>
        </div>

        {/* Analysis Results */}
        {analysis && (
          <div className="rounded-lg bg-accent/5 border border-accent/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-accent">Portfolio Analyzed</span>
              {analysis.last_analyzed && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(analysis.last_analyzed).toLocaleDateString()}
                </span>
              )}
            </div>

            {analysis.technical_strengths && analysis.technical_strengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Key Strengths</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.technical_strengths.map((strength, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {strength}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {analysis.github_analysis && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">GitHub Profile</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{analysis.github_analysis}</p>
              </div>
            )}

            {analysis.collaboration_signals && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Collaboration</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{analysis.collaboration_signals}</p>
              </div>
            )}

            {analysis.architectural_patterns && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Architecture & Design</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{analysis.architectural_patterns}</p>
              </div>
            )}

            {analysis.project_highlights && analysis.project_highlights.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Notable Projects</p>
                <div className="space-y-2">
                  {analysis.project_highlights.slice(0, 3).map((proj, idx) => (
                    <div key={idx} className="text-xs p-2 rounded bg-background/50 border border-border/40">
                      <p className="font-medium text-foreground">{proj.name}</p>
                      {proj.tech_stack && proj.tech_stack.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {proj.tech_stack.map((tech, i) => (
                            <Badge key={i} variant="outline" className="text-xs h-5 px-1">
                              {tech}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {proj.impact && (
                        <p className="text-muted-foreground mt-1 italic">{proj.impact}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!analysis && (githubUrl || portfolioUrl) && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700">
              Click "Analyze Portfolio" to let employers see your real capabilities and project quality.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}