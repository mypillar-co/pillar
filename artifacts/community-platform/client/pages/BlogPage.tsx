import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface Post {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  category: string | null;
  author: string | null;
  publishedAt: string | null;
}

export default function BlogPage() {
  const { data: posts, isLoading } = useQuery<Post[]>({ queryKey: ["/api/blog"] });

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold font-serif mb-2">News & Updates</h1>
        <p className="text-gray-500">Latest announcements, event recaps, and community stories.</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="h-48 bg-gray-100 animate-pulse" />
              <div className="p-5 space-y-2">
                <div className="h-5 w-2/3 bg-gray-100 animate-pulse rounded" />
                <div className="h-4 w-full bg-gray-100 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (!posts || posts.length === 0) && (
        <div className="text-center py-20 border border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No posts yet. Check back soon!</p>
        </div>
      )}

      {!isLoading && posts && posts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map(post => (
            <Link key={post.id} href={`/blog/${post.slug}`}>
              <div className="border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow bg-white h-full">
                {post.coverImageUrl && <img src={post.coverImageUrl} alt={post.title} className="w-full h-48 object-cover" />}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    {post.category && <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">{post.category}</span>}
                    {post.publishedAt && <span className="text-xs text-gray-400">{new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>}
                  </div>
                  <h2 className="font-semibold text-lg mb-2">{post.title}</h2>
                  {post.excerpt && <p className="text-sm text-gray-500 line-clamp-3">{post.excerpt}</p>}
                  {post.author && <p className="text-xs text-gray-400 mt-3">By {post.author}</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
