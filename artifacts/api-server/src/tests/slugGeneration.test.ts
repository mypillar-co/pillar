import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
  organizationsTable: { id: "id", slug: "slug" },
}));

import { generateCleanOrgSlug } from "../lib/slugUtils";

describe("generateCleanOrgSlug", () => {
  it("generates clean slug from org name", async () => {
    const slug = await generateCleanOrgSlug("Norwin Rotary Club");
    expect(slug).toBe("norwin-rotary-club");
  });

  it("strips special characters", async () => {
    const slug = await generateCleanOrgSlug("Org!@#$%^&*()Name");
    expect(slug).toBe("orgname");
  });

  it("collapses multiple spaces and dashes", async () => {
    const slug = await generateCleanOrgSlug("Foo   Bar---Baz");
    expect(slug).toBe("foo-bar-baz");
  });

  it("falls back to 'org' when name has no usable characters", async () => {
    const slug = await generateCleanOrgSlug("!!!");
    expect(slug).toBe("org");
  });

  it("truncates to 40 characters", async () => {
    const long = "a".repeat(100);
    const slug = await generateCleanOrgSlug(long);
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});
