import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict, format, isToday, isYesterday } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Ban, Flag, Loader2, MessageSquare, MoreVertical, Send } from "lucide-react";
import { toast } from "sonner";

const MAX = 2000;

function when(iso) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function ConversationList({ conversations, selected, loading }) {
  if (loading) {
    return <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }
  if (!conversations.length) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
        No conversations yet. Use the <strong>Message</strong> button on an application to start one.
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {conversations.map((c) => (
        <li key={c.application_id}>
          <Link
            to={`/messages?c=${c.application_id}`}
            className={`block px-4 py-3 hover:bg-secondary/60 transition-colors ${selected === c.application_id ? "bg-secondary" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.other.name}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {formatDistanceToNowStrict(new Date(c.last_message.created_date), { addSuffix: false })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">{c.job?.title || "Application"}</div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className={`text-xs truncate ${c.unread ? "text-foreground" : "text-muted-foreground"}`}>
                {c.last_message.mine ? "You: " : ""}{c.last_message.body}
              </span>
              {c.unread > 0 && <Badge className="h-5 min-w-5 px-1.5 text-[11px] shrink-0">{c.unread}</Badge>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({ applicationId }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const bottomRef = useRef(null);
  const coarse = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches, []);

  const { data: thread, isLoading, error } = useQuery({
    queryKey: ["thread", applicationId],
    queryFn: () => base44.messages.thread(applicationId),
    refetchInterval: 15000,
    retry: false,
  });

  // Opening a thread marks it read: refresh badges.
  useEffect(() => {
    if (thread) {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
    }
  }, [thread?.messages?.length, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages?.length]);

  const send = useMutation({
    mutationFn: (body) => base44.messages.send(applicationId, body),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["thread", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (err) => toast.error(err?.message || "Couldn't send your message."),
  });

  const block = useMutation({
    mutationFn: (blocked) => base44.messages.setBlocked(applicationId, blocked),
    onSuccess: (res) => {
      toast.success(res.blocked ? "Conversation blocked. They can't message you here." : "Conversation unblocked.");
      queryClient.invalidateQueries({ queryKey: ["thread", applicationId] });
    },
    onError: (err) => toast.error(err?.message || "Couldn't update the conversation."),
  });

  const report = useMutation({
    mutationFn: () => base44.messages.report(applicationId, reportReason),
    onSuccess: () => {
      setReportOpen(false);
      setReportReason("");
      toast.success("Thanks — we'll review this conversation.");
    },
    onError: (err) => toast.error(err?.message || "Couldn't send the report."),
  });

  if (isLoading) return <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  if (error || !thread) {
    return <div className="p-8 text-center text-sm text-muted-foreground">This conversation isn't available.</div>;
  }

  const text = draft.trim();
  const canSend = !thread.read_only_reason && text.length > 0 && text.length <= MAX && !send.isPending;
  const submit = () => canSend && send.mutate(text);
  const lastMine = [...thread.messages].reverse().find((m) => m.mine);
  const seen = lastMine && thread.other_last_read_at && thread.other_last_read_at >= lastMine.created_date;
  const participant = thread.viewer_role !== "admin";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Link to="/messages" className="md:hidden -ml-1 p-1 rounded hover:bg-secondary" aria-label="Back to conversations">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{thread.other.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {thread.other.role === "employer" ? "Employer" : "Candidate"} · {thread.job?.title || "Application"}
          </div>
        </div>
        {participant && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Conversation options"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => block.mutate(!thread.blocked_by_me)}>
                <Ban className="w-4 h-4 mr-2" /> {thread.blocked_by_me ? "Unblock" : "Block"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReportOpen(true)}>
                <Flag className="w-4 h-4 mr-2" /> Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-secondary/20">
        {thread.messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            No messages yet. Say hello to {thread.other.name}.
          </div>
        )}
        {thread.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%]">
              <div
                className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border rounded-bl-md"
                }`}
              >
                {m.body}
              </div>
              <div className={`text-[11px] text-muted-foreground mt-1 ${m.mine ? "text-right" : ""}`}>
                {when(m.created_date)}
                {m === lastMine && seen ? " · Seen" : ""}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {thread.read_only_reason ? (
        <div className="border-t px-4 py-3 text-sm text-muted-foreground bg-secondary/40">
          {thread.read_only_reason}
          {thread.blocked_by_me && (
            <Button variant="link" size="sm" className="px-1" onClick={() => block.mutate(false)}>Unblock</Button>
          )}
        </div>
      ) : (
        <form
          className="border-t p-3 flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <div className="flex-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !coarse) { e.preventDefault(); submit(); }
              }}
              placeholder={`Message ${thread.other.name}…`}
              className="min-h-[44px] max-h-40 resize-none"
              rows={1}
              aria-label="Message"
            />
            {draft.length > MAX - 200 && (
              <div className={`text-[11px] mt-1 ${draft.length > MAX ? "text-destructive" : "text-muted-foreground"}`}>
                {draft.length}/{MAX}
              </div>
            )}
          </div>
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!canSend} aria-label="Send">
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      )}

      <AlertDialog open={reportOpen} onOpenChange={setReportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Tell us what happened (for example, a request for payment or personal financial details). The site owner will review the conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="What's wrong? (optional)" maxLength={1000} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); report.mutate(); }} disabled={report.isPending}>
              Send report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Messages() {
  const [searchParams] = useSearchParams();
  const selected = searchParams.get("c");

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => base44.messages.inbox(),
    refetchInterval: 30000,
  });

  return (
    <div className="max-w-5xl mx-auto px-0 sm:px-6 lg:px-8 py-0 sm:py-8">
      <h1 className="hidden sm:block text-2xl font-bold mb-4">Messages</h1>
      <Card className="overflow-hidden rounded-none sm:rounded-xl h-[calc(100dvh-4rem)] sm:h-[70vh] min-h-[480px] grid md:grid-cols-[300px_1fr]">
        <div className={`border-r min-h-0 overflow-y-auto ${selected ? "hidden md:block" : "block"}`}>
          <div className="sm:hidden px-4 pt-4 pb-2 text-lg font-bold">Messages</div>
          <ConversationList conversations={conversations} selected={selected} loading={isLoading} />
        </div>
        <div className={`min-h-0 ${selected ? "flex flex-col" : "hidden md:flex md:flex-col"}`}>
          {selected ? (
            <Thread key={selected} applicationId={selected} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
              Select a conversation, or use <strong className="mx-1">Message</strong> on an application to start one.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
