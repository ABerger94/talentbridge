import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MapPin, Clock, DollarSign, Building2, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

const workTypeLabel = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
const employmentLabel = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship", freelance: "Freelance" };
const levelLabel = { entry: "Entry Level", mid: "Mid Level", senior: "Senior", lead: "Lead", executive: "Executive" };

export default function JobCard({ job, matchScore, index = 0 }) {
  const formatSalary = (min, max) => {
    if (!min && !max) return null;
    const fmt = (n) => n >= 1000 ? `${Math.round(n / 1000)}k` : n;
    if (min && max) return `$${fmt(min)} – $${fmt(max)}`;
    if (min) return `From $${fmt(min)}`;
    return `Up to $${fmt(max)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Link to={`/jobs/${job.id}`}>
        <Card className="p-5 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 group cursor-pointer">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
              {job.company_logo_url ? (
                <img src={job.company_logo_url} alt={job.company} className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <Building2 className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">{job.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
                </div>
                {matchScore && (
                  <Badge className="bg-accent/10 text-accent border-accent/20 shrink-0 gap-1">
                    <Zap className="w-3 h-3" />
                    {matchScore}% match
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {job.location && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" /> {job.location}
                  </span>
                )}
                {job.work_type && (
                  <Badge variant="secondary" className="text-xs font-normal">{workTypeLabel[job.work_type]}</Badge>
                )}
                {job.employment_type && (
                  <Badge variant="secondary" className="text-xs font-normal">{employmentLabel[job.employment_type]}</Badge>
                )}
                {job.experience_level && (
                  <Badge variant="outline" className="text-xs font-normal">{levelLabel[job.experience_level]}</Badge>
                )}
                {formatSalary(job.salary_min, job.salary_max) && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <DollarSign className="w-3 h-3" /> {formatSalary(job.salary_min, job.salary_max)}
                  </span>
                )}
              </div>
              {job.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {job.skills.slice(0, 5).map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs font-normal bg-primary/5 border-primary/10 text-primary">
                      {skill}
                    </Badge>
                  ))}
                  {job.skills.length > 5 && (
                    <Badge variant="outline" className="text-xs font-normal">+{job.skills.length - 5}</Badge>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {job.created_date ? formatDistanceToNow(new Date(job.created_date), { addSuffix: true }) : "Recently"}
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}