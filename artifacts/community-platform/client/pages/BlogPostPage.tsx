import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";

interface Post {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  category: string | null;
  author: string | null;
  publishedAt: string | null;
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading } = useQuery<Post>({
    queryKey: ["/api/blog", slug],
    queryFn: async () => {
      const res = await fetch(`/api/blog/${slug}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
    enabled: !!slug,
  });

  if (isLoading) return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />)}
    </div>
  );

  if (!post) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-4">Post Not Found</h1>
      <Link href="/blog"><button className="px-4 py-2 border border-gray-300 rounded-md text-sm">Back to News</button></Link>
    </div>
  );

  return (
    <article className="max-w-3xl mx-auto px-4 py-16">
      <Link href="/blog">
        <button className="text-sm text-gray-400 mb-6 hover:text-gray-700 block">← Back to News</button>
      </Link>

      <div className="flex items-center gap-3 mb-4">
        {post.category && <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100">{post.category}</span>}
        {post.publishedAt && <span className="text-sm text-gray-400">{new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>}
      </div>

      <h1 className="text-3xl md:text-4xl font-bold font-serif mb-4">{post.title}</h1>
      {post.author && <p className="text-sm text-gray-400 mb-6">By {post.author}</p>}
      {post.coverImageUrl && <img src={post.coverImageUrl} alt={post.title} className="w-full h-64 object-cover rounded-lg mb-8" />}

      <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
        {post.content}
      </div>

      <div className="mt-12 pt-8 border-t border-gray-200">
        <Link href="/blog">
          <button className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">← Back to News</button>
        </Link>
      </div>
    </article>
  );
}
