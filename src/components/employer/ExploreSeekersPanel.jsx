import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ExploreSeekersPanel({ jobId }) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [inviting, setInviting] = useState({});

  const handleExplore = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('findMatchingSeekers', { job_id: jobId });
      setMatches(res.data.matches || []);
      if (!res.data.matches?.length) {
        toast.info('No matching seekers found for this role');
      }
    } catch (error) {
      toast.error('Failed to find matching seekers');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (seekerId) => {
    setInviting(prev => ({ ...prev, [seekerId]: true }));
    try {
      await base44.functions.invoke('inviteSeekerToJob', { 
        seeker_id: seekerId, 
        job_id: jobId 
      });
      toast.success('Invite sent!');
      setMatches(prev => prev.filter(m => m.seeker_id !== seekerId));
    } catch (error) {
      toast.error('Failed to send invite');
      console.error(error);
    } finally {
      setInviting(prev => ({ ...prev, [seekerId]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button 
          onClick={handleExplore} 
          disabled={loading}
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Find Matching Seekers
        </Button>
      </div>

      {matches.length === 0 && !loading && (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-50" />
          <p>Click "Find Matching Seekers" to discover candidates</p>
        </div>
      )}

      <div className="grid gap-3">
        {matches.map(match => (
          <Card key={match.seeker_id} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-semibold text-sm">{match.seeker_headline}</h4>
                <p className="text-xs text-muted-foreground mt-1">{match.match_summary}</p>
              </div>
              <Badge className="ml-2" variant="secondary">
                {Math.round(match.match_score)}%
              </Badge>
            </div>
            <Button 
              size="sm" 
              onClick={() => handleInvite(match.seeker_id)}
              disabled={inviting[match.seeker_id]}
              className="gap-2 mt-3 w-full"
            >
              {inviting[match.seeker_id] ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Send Invite
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}