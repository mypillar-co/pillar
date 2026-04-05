import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api, type BlogPost } from "@/lib/api";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getBlogPosts().then(setPosts).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div className="container">
          <div className="page-header-inner">
            <div className="breadcrumb">
              <Link href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
              <span>›</span>
              <span>Community News</span>
            </div>
            <h1>Community News &amp; Updates</h1>
            <p>Stories, announcements, and spotlights from the Norwin Rotary Club.</p>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          {loading ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Loading articles…</span>
            </div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📰</div>
              <h3>No posts yet</h3>
              <p>Check back soon for news and updates from the club!</p>
            </div>
          ) : (
            <div className="cards-grid">
              {posts.map(post => (
                <Link key={post.id} href={`/blog/${post.slug}`} style={{ textDecoration: "none" }}>
                  <div className="card">
                    {post.cover_image_url
                      ? <img src={post.cover_image_url} alt={post.title} className="card-image" />
                      : <div className="card-image-placeholder">📰</div>
                    }
                    <div className="card-body">
                      <div className="card-tag">Community News</div>
                      <h3>{post.title}</h3>
                      {post.excerpt && <p>{post.excerpt}</p>}
                      <div className="card-meta">
                        <span className="card-meta-item">✍️ {post.author}</span>
                        {post.published_at && (
                          <span className="card-meta-item">{formatDate(post.published_at)}</span>
                        )}
                      </div>
                    </div>
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
