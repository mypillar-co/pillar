import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { api, type GalleryAlbum, type AlbumPhoto } from "@/lib/api";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function GalleryList() {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAlbums().then(setAlbums).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div className="container">
          <div className="page-header-inner">
            <div className="breadcrumb">
              <Link href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
              <span>›</span>
              <span>Gallery</span>
            </div>
            <h1>Photo Gallery</h1>
            <p>Moments from our events, projects, and community service throughout the years.</p>
          </div>
        </div>
      </div>
      <section className="section">
        <div className="container">
          {loading ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Loading gallery…</span>
            </div>
          ) : albums.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📸</div>
              <h3>No albums yet</h3>
              <p>Check back soon for photos from our events and community projects!</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {albums.map(album => (
                <Link key={album.id} href={`/gallery/${album.id}`} className="gallery-card">
                  {album.cover_photo_url
                    ? <img src={album.cover_photo_url} alt={album.title} className="gallery-card-img" />
                    : <div className="gallery-card-placeholder">📸</div>
                  }
                  <div className="gallery-card-info">
                    <h3>{album.title}</h3>
                    <p>
                      {album.photo_count ?? 0} photos · {formatDate(album.created_at)}
                    </p>
                    {album.description && (
                      <p style={{ marginTop: "0.25rem" }}>{album.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function GalleryAlbumView() {
  const { albumId } = useParams<{ albumId: string }>();
  const [data, setData] = useState<{ album: GalleryAlbum; photos: AlbumPhoto[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!albumId) return;
    api.getAlbum(albumId).then(setData).finally(() => setLoading(false));
  }, [albumId]);

  if (loading) {
    return (
      <div className="loading-center" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="empty-state-icon">😕</div>
        <h3>Album Not Found</h3>
        <Link href="/gallery" className="btn btn-outline" style={{ marginTop: "1.5rem" }}>← Back to Gallery</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="container">
          <div className="page-header-inner">
            <div className="breadcrumb">
              <Link href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
              <span>›</span>
              <Link href="/gallery" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Gallery</Link>
              <span>›</span>
              <span>{data.album.title}</span>
            </div>
            <h1>{data.album.title}</h1>
            {data.album.description && <p>{data.album.description}</p>}
          </div>
        </div>
      </div>
      <section className="section">
        <div className="container">
          {data.photos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📸</div>
              <h3>No photos in this album yet</h3>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
              {data.photos.map(photo => (
                <div
                  key={photo.id}
                  style={{ borderRadius: 10, overflow: "hidden", cursor: "pointer", border: "1.5px solid var(--border)" }}
                  onClick={() => setLightbox(photo.url)}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption ?? ""}
                    style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
                  />
                  {photo.caption && (
                    <div style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      {photo.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {lightbox && (
            <div
              className="modal-overlay"
              onClick={() => setLightbox(null)}
              style={{ background: "rgba(0,0,0,0.85)", cursor: "pointer" }}
            >
              <img
                src={lightbox}
                alt="Photo"
                style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 10, boxShadow: "0 0 60px rgba(0,0,0,0.5)" }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
