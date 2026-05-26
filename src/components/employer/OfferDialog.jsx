import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function OfferDialog({ application, job, onOfferSent }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offer, setOffer] = useState({
    title: job?.title || "",
    salary: "",
    salary_currency: "USD",
    start_date: "",
    benefits: "",
    notes: "",
  });

  const handleSendOffer = async () => {
    if (!offer.title || !offer.salary || !offer.start_date) {
      toast.error("Please fill in title, salary, and start date");
      return;
    }

    setLoading(true);
    try {
      await base44.functions.invoke("sendOfferEmail", {
        application_id: application.id,
        job_id: job.id,
        offer_details: {
          ...offer,
          salary: Number(offer.salary),
        },
      });
      toast.success("Offer sent!");
      setOpen(false);
      onOfferSent?.();
    } catch (error) {
      toast.error("Failed to send offer");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700">
          <Send className="w-3.5 h-3.5" /> Send Offer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Offer</DialogTitle>
          <DialogDescription>
            Create and send an offer to {application.applicant_name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Position Title</Label>
              <Input
                id="title"
                value={offer.title}
                onChange={(e) => setOffer({ ...offer, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary">Salary</Label>
              <Input
                id="salary"
                type="number"
                placeholder="100000"
                value={offer.salary}
                onChange={(e) => setOffer({ ...offer, salary: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="w-full h-9 px-3 rounded-md border border-input bg-background"
                value={offer.salary_currency}
                onChange={(e) => setOffer({ ...offer, salary_currency: e.target.value })}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={offer.start_date}
                onChange={(e) => setOffer({ ...offer, start_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="benefits">Benefits</Label>
            <Input
              id="benefits"
              placeholder="e.g., Health insurance, 401k, PTO"
              value={offer.benefits}
              onChange={(e) => setOffer({ ...offer, benefits: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any additional details about the offer..."
              value={offer.notes}
              onChange={(e) => setOffer({ ...offer, notes: e.target.value })}
              className="min-h-[100px]"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSendOffer} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Send Offer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}