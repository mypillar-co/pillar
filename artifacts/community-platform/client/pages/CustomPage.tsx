import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useConfig } from "../config-context";
import type { CustomPageConfig, HomepageSectionBlock } from "../config-context";
import { configuredPageSections, customPageSectionKey, editAttrs, textOr } from "../lib/pageSections";

export default function CustomPage() {
  const config = useConfig();
  const [, params] = useRoute("/:slug");
  const [submitted, setSubmitted] = useState(false);
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
  const pageSections = configuredPageSections(config, customPageSectionKey(page.slug), customPageDefaults(page));

  return (
    <div className="flex flex-col">
      {pageSections.filter(section => section.visible !== false).map((section, index) => {
        if (section.type === "page_hero") {
          return (
            <section key={section.id} data-testid="page-section-custom-page_hero" style={{ order: index }} className="relative overflow-hidden py-20">
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, var(--primary-hex) 0%, var(--accent-hex) 100%)` }} />
              <div className="relative max-w-4xl mx-auto px-4 text-center text-white">
                <h1 {...editAttrs(customPageSectionKey(page.slug), section.id, "title")} className="text-4xl md:text-5xl font-bold font-serif mb-4">{textOr(section.title) || page.title}</h1>
                {(textOr(section.body) || page.intro) && <p {...editAttrs(customPageSectionKey(page.slug), section.id, "body")} className="text-lg text-white/90 leading-relaxed">{textOr(section.body) || page.intro}</p>}
              </div>
            </section>
          );
        }

        if (section.type === "media" && page.media) {
          return (
            <section key={section.id} data-testid="page-section-custom-media" style={{ order: index }} className="max-w-5xl mx-auto px-4 pt-16">
              {page.media.url ? (
                <figure>
                  <img src={section.imageUrl || page.media.url} alt={page.media.alt || page.title} className="w-full max-h-[520px] object-cover rounded-lg" />
                  {(section.body || page.media.caption) && <figcaption {...editAttrs(customPageSectionKey(page.slug), section.id, "body")} className="mt-2 text-sm text-gray-500 text-center">{section.body || page.media.caption}</figcaption>}
                </figure>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-gray-500">
                  <span {...editAttrs(customPageSectionKey(page.slug), section.id, "body")}>{section.body || page.media.caption || "Photo coming soon"}</span>
                </div>
              )}
            </section>
          );
        }

        if (section.type === "form" && page.form) {
          return (
            <section key={section.id} data-testid="page-section-custom-form" style={{ order: index }} className="max-w-3xl mx-auto px-4 pb-16">
              <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
                <h2 {...editAttrs(customPageSectionKey(page.slug), section.id, "title")} className="text-2xl font-bold font-serif mb-2">{section.title || page.form.title}</h2>
                {(section.body || page.form.description) && <p {...editAttrs(customPageSectionKey(page.slug), section.id, "body")} className="text-gray-600 mb-6">{section.body || page.form.description}</p>}
                {submitted ? (
                  <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-800">
                    Thanks. Your request has been captured and someone will follow up.
                  </div>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setSubmitted(true);
                    }}
                  >
                    {page.form.fields.map(field => (
                      <label key={field.name} className="block">
                        <span className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}{field.required ? " *" : ""}
                        </span>
                        {field.type === "textarea" ? (
                          <textarea name={field.name} required={field.required} rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-hex)]" />
                        ) : field.type === "select" ? (
                          <select name={field.name} required={field.required} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-hex)]">
                            <option value="">Select an option</option>
                            {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input name={field.name} type={field.type} required={field.required} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-hex)]" />
                        )}
                      </label>
                    ))}
                    <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>
                      {page.form.submitLabel || "Submit"}
                    </button>
                  </form>
                )}
              </div>
            </section>
          );
        }

        if (section.type === "cta" && page.cta) {
          return (
            <section key={section.id} data-testid="page-section-custom-cta" style={{ order: index }} className="pb-16">
              <div className="max-w-3xl mx-auto px-4 text-center">
                {section.title && <h2 {...editAttrs(customPageSectionKey(page.slug), section.id, "title")} className="text-2xl font-bold font-serif mb-4">{section.title}</h2>}
                {section.body && <p {...editAttrs(customPageSectionKey(page.slug), section.id, "body")} className="text-gray-500 mb-6">{section.body}</p>}
                <Link href={page.cta.href}>
                  <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>
                    {page.cta.label}
                  </button>
                </Link>
              </div>
            </section>
          );
        }

        return (
          <section key={section.id || `${section.type}-${index}`} data-testid={`page-section-custom-${section.type}`} style={{ order: index }} className="max-w-7xl mx-auto px-4 py-12">
            <article className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
              {section.title && <h2 {...editAttrs(customPageSectionKey(page.slug), section.id, "title")} className="text-xl font-bold font-serif mb-3">{section.title}</h2>}
              {section.body && <p {...editAttrs(customPageSectionKey(page.slug), section.id, "body")} className="text-gray-600 leading-relaxed whitespace-pre-line">{section.body}</p>}
            </article>
          </section>
        );
      })}
    </div>
  );
}

function customPageDefaults(page: CustomPageConfig): HomepageSectionBlock[] {
  const sections: HomepageSectionBlock[] = [
    { id: `${page.slug}-hero`, type: "page_hero", title: page.title, body: page.intro ?? "", visible: true },
  ];
  if (page.media) {
    sections.push({
      id: `${page.slug}-media`,
      type: "media",
      title: page.media.caption ?? "Featured image",
      body: page.media.caption ?? "",
      imageUrl: page.media.url ?? null,
      visible: true,
    });
  }
  for (const [index, section] of (page.sections ?? []).entries()) {
    sections.push({
      id: `${page.slug}-section-${index + 1}`,
      type: "copy",
      title: section.title,
      body: section.body,
      visible: true,
    });
  }
  if (page.form) {
    sections.push({
      id: `${page.slug}-form`,
      type: "form",
      title: page.form.title,
      body: page.form.description ?? "",
      visible: true,
    });
  }
  if (page.cta) {
    sections.push({
      id: `${page.slug}-cta`,
      type: "cta",
      title: page.cta.label,
      visible: true,
    });
  }
  return sections;
}
