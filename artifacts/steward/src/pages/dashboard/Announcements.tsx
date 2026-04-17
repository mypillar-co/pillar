import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function Announcements() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.announcements.list(),
  });

  const create = useMutation({
    mutationFn: () => api.announcements.create({ title, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setTitle(""); setBody("");
      toast.success("Announcement posted to your community site");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.announcements.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Megaphone className="w-6 h-6" /> Announcements
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Post short messages that appear on your community site for members and visitors.
        </p>
      </div>

      <Card className="bg-[hsl(224,30%,14%)] border-white/10">
        <CardHeader>
          <CardTitle className="text-base text-white">New announcement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Office closed Friday"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">Message</Label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="Write a short announcement…"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
            />
          </div>
          <div>
            <Button
              onClick={() => create.mutate()}
              disabled={!title.trim() || !body.trim() || create.isPending}
            >
              {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Post announcement
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
          Recent ({announcements.length})
        </h2>
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
        {!isLoading && announcements.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No announcements yet. Post one above to share news with your community.
          </p>
        )}
        {announcements.map(a => (
          <Card key={a.id} className="bg-[hsl(224,30%,14%)] border-white/10">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{a.title}</p>
                  <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{a.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (confirm("Delete this announcement?")) remove.mutate(a.id); }}
                  className="text-slate-400 hover:text-red-400"
                  disabled={remove.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
