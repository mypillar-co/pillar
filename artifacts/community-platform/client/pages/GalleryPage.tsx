import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useState } from "react";

interface Album { id: number; title: string; description: string | null; coverPhotoUrl: string | null; }
interface Photo { id: number; url: string; caption: string | null; }

export default function GalleryPage() {
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const { data: albums, isLoading } = useQuery<Album[]>({ queryKey: ["/api/photo-albums"] });
  const { data: photos } = useQuery<Photo[]>({
    queryKey: ["/api/photo-albums", selectedAlbum?.id, "photos"],
    queryFn: async () => {
      const res = await apiFetch(`/api/photo-albums/${selectedAlbum!.id}/photos`);
      return res.json();
    },
    enabled: !!selectedAlbum,
  });

  const openLightbox = (photo: Photo, idx: number) => { setLightboxPhoto(photo); setLightboxIndex(idx); };
  const prevPhoto = () => { if (!photos) return; const idx = (lightboxIndex - 1 + photos.length) % photos.length; setLightboxPhoto(photos[idx]); setLightboxIndex(idx); };
  const nextPhoto = () => { if (!photos) return; const idx = (lightboxIndex + 1) % photos.length; setLightboxPhoto(photos[idx]); setLightboxIndex(idx); };

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold font-serif mb-2">Photo Gallery</h1>
        <p className="text-gray-500">Memories from our community events</p>
      </div>

      {selectedAlbum ? (
        <div>
          <button className="flex items-center gap-2 text-sm text-gray-500 mb-6 hover:text-gray-800" onClick={() => setSelectedAlbum(null)}>← Back to Albums</button>
          <h2 className="text-2xl font-bold font-serif mb-6">{selectedAlbum.title}</h2>
          {!photos || photos.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg">
              <p className="text-gray-400">No photos in this album yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="aspect-square overflow-hidden rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => openLightbox(photo, idx)}>
                  <img src={photo.url} alt={photo.caption || ""} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {isLoading && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{[1,2,3].map(i => <div key={i} className="h-52 bg-gray-100 animate-pulse rounded-lg" />)}</div>}
          {!isLoading && albums && albums.length === 0 && (
            <div className="text-center py-20 border border-dashed border-gray-200 rounded-lg">
              <p className="text-gray-400">No photo albums yet. Check back soon!</p>
            </div>
          )}
          {!isLoading && albums && albums.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {albums.map(album => (
                <div key={album.id} className="border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAlbum(album)}>
                  {album.coverPhotoUrl ? (
                    <div className="relative">
                      <img src={album.coverPhotoUrl} alt={album.title} className="w-full h-52 object-cover" />
                      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }} />
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="font-semibold text-lg text-white">{album.title}</h3>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-gray-50">
                      <div className="w-12 h-12 rounded-lg mb-3 flex items-center justify-center" style={{ backgroundColor: "var(--primary-hex)" }}>
                        <span className="text-white text-xl">📷</span>
                      </div>
                      <h3 className="font-semibold text-lg">{album.title}</h3>
                      {album.description && <p className="text-sm text-gray-500 mt-1">{album.description}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lightboxPhoto && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={() => setLightboxPhoto(null)}>
          <button className="absolute top-4 right-4 text-white text-2xl" onClick={() => setLightboxPhoto(null)}>✕</button>
          <button className="absolute left-4 text-white text-3xl p-2" onClick={(e) => { e.stopPropagation(); prevPhoto(); }}>‹</button>
          <img src={lightboxPhoto.url} alt={lightboxPhoto.caption || ""} className="max-h-[85vh] max-w-[85vw] object-contain" onClick={e => e.stopPropagation()} />
          <button className="absolute right-4 text-white text-3xl p-2" onClick={(e) => { e.stopPropagation(); nextPhoto(); }}>›</button>
          {lightboxPhoto.caption && <p className="absolute bottom-4 text-white text-sm text-center w-full">{lightboxPhoto.caption}</p>}
        </div>
      )}
    </div>
  );
}
