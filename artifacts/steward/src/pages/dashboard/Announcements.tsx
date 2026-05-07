import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Loader2, Megaphone, Save, Trash2, X } from "lucide-react";
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
  const [membersOnly, setMembersOnly] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMembersOnly, setEditMembersOnly] = useState(false);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.announcements.list(),
  });

  const create = useMutation({
    mutationFn: () => api.announcements.create({ title, body, visibility: membersOnly ? "members" : "both" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setTitle(""); setBody("");
      setMembersOnly(false);
      toast.success(membersOnly ? "Announcement posted to members portal" : "Announcement posted to the public site and members portal");
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

  const update = useMutation({
    mutationFn: (id: number) => api.announcements.update(id, {
      title: editTitle,
      body: editBody,
      visibility: editMembersOnly ? "members" : "both",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement updated");
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(a: { id: number; title: string; body: string; visibility?: string }) {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditBody(a.body);
    setEditMembersOnly(a.visibility === "members");
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Megaphone className="w-6 h-6" /> Announcements
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Post short messages that appear on your public site and private members portal.
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
            <label className="mb-3 flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={membersOnly}
                onChange={e => setMembersOnly(e.target.checked)}
                className="mt-1"
              />
              <span>
                Members portal only
                <span className="block text-xs text-slate-500">Unchecked announcements show on both the public website and members portal.</span>
              </span>
            </label>
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
            No announcements yet. Post one above to share news with visitors and members.
          </p>
        )}
        {announcements.map(a => (
          <Card key={a.id} className="bg-[hsl(224,30%,14%)] border-white/10">
            <CardContent className="pt-4 pb-3">
              {editingId === a.id ? (
                <div className="space-y-3">
                  <Input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={3}
                    className="bg-white/5 border-white/10 text-white resize-none"
                  />
                  <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={editMembersOnly}
                      onChange={e => setEditMembersOnly(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Members portal only
                      <span className="block text-xs text-slate-500">Unchecked announcements show on both the public website and members portal.</span>
                    </span>
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)} className="border-white/10 text-slate-300">
                      <X className="w-4 h-4 mr-1.5" /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => update.mutate(a.id)} disabled={!editTitle.trim() || !editBody.trim() || update.isPending}>
                      {update.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{a.title}</p>
                  <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{a.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(a.created_at).toLocaleString()} · {a.visibility === "members" ? "Members only" : "Website + members"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(a)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
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
              </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
