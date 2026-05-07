import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { csrfHeaders } from "@/lib/api";
import { ACCEPTED_IMAGE_TYPES, isImageFile, MAX_IMAGE_SIZE_MB, uploadImage } from "@/lib/uploadImage";

type Album = {
  id: string;
  title: string;
  description: string | null;
  coverPhotoId: string | null;
  createdAt: string;
};

type AlbumPhoto = {
  id: string;
  albumId: string;
  url: string;
  caption: string | null;
  createdAt: string;
};

async function fetchAlbums(): Promise<Album[]> {
  const res = await fetch("/api/photo-albums", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load albums");
  return res.json();
}

async function fetchPhotos(albumId: string): Promise<AlbumPhoto[]> {
  const res = await fetch(`/api/photo-albums/${albumId}/photos`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load photos");
  return res.json();
}

async function createAlbum(input: { title: string; description?: string }) {
  const res = await fetch("/api/photo-albums", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...csrfHeaders("POST") },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to create album");
  return data as Album;
}

async function addPhoto(albumId: string, input: { url: string; caption?: string }) {
  const res = await fetch(`/api/photo-albums/${albumId}/photos`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...csrfHeaders("POST") },
    body: JSON.stringify({ photos: [input] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to add photo");
  return data as AlbumPhoto[];
}

export default function Gallery() {
  const queryClient = useQueryClient();
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const { data: albums = [], isLoading: albumsLoading } = useQuery({
    queryKey: ["photo-albums"],
    queryFn: fetchAlbums,
  });

  const activeAlbumId = selectedAlbumId ?? albums[0]?.id ?? null;
  const { data: photos = [], isLoading: photosLoading } = useQuery({
    queryKey: ["photo-album-photos", activeAlbumId],
    queryFn: () => fetchPhotos(activeAlbumId!),
    enabled: !!activeAlbumId,
  });

  const createMutation = useMutation({
    mutationFn: createAlbum,
    onSuccess: (album) => {
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      setSelectedAlbumId(album.id);
      setTitle("");
      setDescription("");
      toast.success("Gallery album created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create album"),
  });

  const handleCreateAlbum = () => {
    if (!title.trim()) {
      toast.error("Album title is required");
      return;
    }
    createMutation.mutate({ title: title.trim(), description: description.trim() || undefined });
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file || !activeAlbumId) return;
    if (!isImageFile(file)) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be ${MAX_IMAGE_SIZE_MB}MB or smaller`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      await addPhoto(activeAlbumId, { url, caption: caption.trim() || undefined });
      queryClient.invalidateQueries({ queryKey: ["photo-album-photos", activeAlbumId] });
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      setCaption("");
      toast.success("Photo uploaded to gallery");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gallery upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await uploadPhoto(file);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Camera className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Gallery</h1>
            <p className="text-sm text-slate-400">Albums and photos shown on your public Gallery page.</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/dashboard/site">Open Website Builder</a>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-white/8 bg-card/40 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Create Album</h2>
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm">Album title</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Community Day"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm">Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Photos from our latest event"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none"
                rows={3}
              />
            </div>
            <Button
              onClick={handleCreateAlbum}
              disabled={createMutation.isPending}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create album
            </Button>
          </div>

          <div className="rounded-xl border border-white/8 bg-card/40 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-white">Albums</h2>
            {albumsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : albums.length === 0 ? (
              <p className="text-sm text-slate-500">No albums yet.</p>
            ) : (
              albums.map(album => (
                <button
                  key={album.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    activeAlbumId === album.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{album.title}</p>
                  {album.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{album.description}</p>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-card/40 p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {albums.find(album => album.id === activeAlbumId)?.title ?? "Select an album"}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Uploaded photos mirror to the public community site automatically.
              </p>
            </div>
            {activeAlbumId && (
              <label className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Upload photo
                <input
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          {activeAlbumId && (
            <div
              className={`space-y-2 rounded-xl border border-dashed p-4 transition ${
                dragActive ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.02]"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                uploadPhoto(event.dataTransfer.files?.[0]);
              }}
            >
              <Label className="text-slate-300 text-sm">Caption for next upload</Label>
              <Input
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Optional caption"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              />
              <p className="text-xs text-slate-500">
                Drag an image here, or use Upload photo.
              </p>
            </div>
          )}

          {!activeAlbumId ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <Camera className="w-10 h-10 opacity-30 mb-3" />
              <p className="text-sm">Create an album to start adding photos.</p>
            </div>
          ) : photosLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <Camera className="w-10 h-10 opacity-30 mb-3" />
              <p className="text-sm">No photos in this album yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map(photo => (
                <div key={photo.id} className="rounded-lg border border-white/8 bg-black/20 overflow-hidden">
                  <div className="aspect-[4/3] bg-slate-950">
                    <img src={photo.url} alt={photo.caption ?? "Gallery photo"} className="w-full h-full object-cover" />
                  </div>
                  {photo.caption && <p className="text-xs text-slate-400 p-2 line-clamp-2">{photo.caption}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
