import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, XCircle, Calendar, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type ApprovalQueueItem } from "@/lib/api";

export default function ApprovalQueue() {
  const qc = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: () => api.events.approvalQueue(),
  });

  const approveMutation = useMutation({
    mutationFn: ({ eventId, comment }: { eventId: string; comment?: string }) =>
      api.events.approve(eventId, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event-metrics"] });
      toast.success("Event approved and published");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ eventId, comment }: { eventId: string; comment?: string }) =>
      api.events.reject(eventId, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event rejected and returned to draft");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setComment = (id: string, v: string) =>
    setComments(p => ({ ...p, [id]: v }));

  const items = queue as ApprovalQueueItem[];

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Approval Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Events waiting for your approval before publishing</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
          <Inbox className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No events pending approval</p>
          <Link href="/dashboard/events">
            <Button variant="outline" className="mt-4 border-white/10 text-slate-300">Back to Events</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <Card key={item.approval.id} className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="pt-4 pb-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/dashboard/events/${item.event.id}`}>
                      <p className="font-semibold text-white hover:text-primary transition-colors cursor-pointer">{item.event.name}</p>
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                      {item.event.startDate && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.event.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}
                      {item.event.location && (
                        <span className="text-xs text-muted-foreground">{item.event.location}</span>
                      )}
                      {item.event.eventType && (
                        <Badge variant="outline" className="border-white/20 text-slate-400 text-xs capitalize">
                          {item.event.eventType}
                        </Badge>
                      )}
                    </div>
                    {item.event.description && (
                      <p className="text-sm text-slate-300 mt-2 line-clamp-2">{item.event.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Submitted {new Date(item.approval.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Textarea
                    value={comments[item.event.id] ?? ""}
                    onChange={e => setComment(item.event.id, e.target.value)}
                    placeholder="Add a comment (optional)..."
                    rows={2}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate({ eventId: item.event.id, comment: comments[item.event.id] })}
                    disabled={approveMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {approveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                    Approve & Publish
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectMutation.mutate({ eventId: item.event.id, comment: comments[item.event.id] })}
                    disabled={rejectMutation.isPending}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    {rejectMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <XCircle className="w-4 h-4 mr-1.5" />}
                    Reject
                  </Button>
                  <Link href={`/dashboard/events/${item.event.id}`} className="ml-auto">
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                      View Details
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
