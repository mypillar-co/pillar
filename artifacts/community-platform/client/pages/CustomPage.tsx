import { Link, useRoute } from "wouter";
import { useConfig } from "../config-context";

export default function CustomPage() {
  const config = useConfig();
  const [, params] = useRoute("/:slug");
  const slug = params?.slug ?? "";
  const page = config?.features?.customPages?.find(p => p.slug === slug);

  if (!config || !page) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-4xl font-bold font-serif mb-4">404</h1>
        <p className="text-gray-500 mb-6">Page not found.</p>
        <Link href="/">
          <span className="inline-flex px-5 py-2 rounded-md text-white text-sm cursor-pointer" style={{ backgroundColor: "var(--primary-hex)" }}>Go Home</span>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, var(--primary-hex) 0%, var(--accent-hex) 100%)` }} />
        <div className="relative max-w-4xl mx-auto px-4 text-center text-white">
          <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4">{page.title}</h1>
          {page.intro && <p className="text-lg text-white/90 leading-relaxed">{page.intro}</p>}
        </div>
      </section>

      {page.sections && page.sections.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {page.sections.map(section => (
              <article key={section.title} className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
                <h2 className="text-xl font-bold font-serif mb-3">{section.title}</h2>
                <p className="text-gray-600 leading-relaxed">{section.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {page.cta && (
        <section className="pb-16">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <Link href={page.cta.href}>
              <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>
                {page.cta.label}
              </button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
