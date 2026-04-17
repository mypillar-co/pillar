import { describe, it, expect } from "vitest";

function swapBasePath(html: string, realSlug: string): string {
  return html.replace(/\/sites\/placeholder\//g, `/sites/${realSlug}/`);
}

describe("base URL swap", () => {
  it("replaces placeholder with real slug", () => {
    const html = '<script src="/sites/placeholder/assets/index.js"></script>';
    const result = swapBasePath(html, "norwin-rotary");
    expect(result).toBe('<script src="/sites/norwin-rotary/assets/index.js"></script>');
  });

  it("replaces multiple occurrences", () => {
    const html =
      '<link href="/sites/placeholder/assets/main.css"><script src="/sites/placeholder/assets/index.js"></script>';
    const result = swapBasePath(html, "my-org");
    expect(result).toBe(
      '<link href="/sites/my-org/assets/main.css"><script src="/sites/my-org/assets/index.js"></script>',
    );
  });

  it("leaves html without placeholder unchanged", () => {
    const html = '<script src="/sites/real-org/assets/index.js"></script>';
    const result = swapBasePath(html, "other-org");
    expect(result).toBe(html);
  });
});
