import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { api, type BlogPost as BlogPostType } from "@/lib/api";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api.getBlogPost(slug)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="loading-center" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
        <span>Loading article…</span>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="empty-state" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="empty-state-icon">😕</div>
        <h3>Article Not Found</h3>
        <p>This article may have been removed or the link is incorrect.</p>
        <Link href="/blog" className="btn btn-outline" style={{ marginTop: "1.5rem" }}>← Back to News</Link>
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
              <Link href="/blog" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>News</Link>
              <span>›</span>
              <span>{post.title}</span>
            </div>
            <h1>{post.title}</h1>
            <p>
              By {post.author}
              {post.published_at ? ` · ${formatDate(post.published_at)}` : ""}
            </p>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="blog-detail-content">
            {post.cover_image_url && (
              <img
                src={post.cover_image_url}
                alt={post.title}
                style={{ width: "100%", borderRadius: 12, marginBottom: "2rem", maxHeight: 480, objectFit: "cover" }}
              />
            )}
            {post.tags && (
              <div className="chip-row" style={{ marginBottom: "1.5rem" }}>
                {post.tags.split(",").map(t => (
                  <span key={t} className="chip">{t.trim()}</span>
                ))}
              </div>
            )}
            <div className="prose">
              {post.body
                ? post.body.split("\n\n").map((p, i) => (
                    p.startsWith("##") ? (
                      <h2 key={i}>{p.replace(/^##\s*/, "")}</h2>
                    ) : p.startsWith("#") ? (
                      <h2 key={i}>{p.replace(/^#\s*/, "")}</h2>
                    ) : (
                      <p key={i}>{p}</p>
                    )
                  ))
                : post.excerpt && <p>{post.excerpt}</p>
              }
            </div>
            <hr className="divider" />
            <Link href="/blog" className="btn btn-outline">← Back to All News</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
