import { Router, type Request, type Response } from "express";
import { db, boardApprovalLinksTable, boardApprovalVotesTable, organizationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

const router = Router();

async function resolveOrg(req: Request, res: Response): Promise<{ id: string; name: string | null; type: string | null } | null> {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, type: organizationsTable.type })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
}

function generateToken(): string {
  return randomBytes(16).toString("hex");
}

// POST /api/board-links — create a new board approval link
router.post("/", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  try {
    const { message } = req.body as { message?: string };
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const [link] = await db.insert(boardApprovalLinksTable).values({
      orgId: org.id,
      token,
      createdByUserId: req.user.id,
      orgName: org.name,
      orgType: org.type ?? null,
      message: message?.trim() || null,
      expiresAt,
    }).returning();

    res.json({ link });
  } catch (err) {
    req.log.error({ err }, "Failed to create board link");
    res.status(500).json({ error: "Failed to create board link" });
  }
});

// GET /api/board-links — list links for current org (with vote counts)
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  try {
    const links = await db
      .select()
      .from(boardApprovalLinksTable)
      .where(eq(boardApprovalLinksTable.orgId, org.id))
      .orderBy(boardApprovalLinksTable.createdAt);

    const linksWithVotes = await Promise.all(
      links.map(async (link) => {
        const votes = await db
          .select()
          .from(boardApprovalVotesTable)
          .where(eq(boardApprovalVotesTable.linkId, link.id));
        const counts = { approve: 0, question: 0, decline: 0 };
        for (const v of votes) {
          if (v.vote === "approve") counts.approve++;
          else if (v.vote === "question") counts.question++;
          else if (v.vote === "decline") counts.decline++;
        }
        return { ...link, votes, voteCounts: counts };
      })
    );

    res.json({ links: linksWithVotes });
  } catch (err) {
    req.log.error({ err }, "Failed to list board links");
    res.status(500).json({ error: "Failed to list board links" });
  }
});

// DELETE /api/board-links/:id — delete a link
router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  try {
    await db
      .delete(boardApprovalLinksTable)
      .where(and(
        eq(boardApprovalLinksTable.id, req.params.id),
        eq(boardApprovalLinksTable.orgId, org.id)
      ));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete board link");
    res.status(500).json({ error: "Failed to delete board link" });
  }
});

// GET /api/board-links/view/:token — public, no auth — returns link details and increments view count
router.get("/view/:token", async (req: Request, res: Response) => {
  try {
    const [link] = await db
      .select()
      .from(boardApprovalLinksTable)
      .where(eq(boardApprovalLinksTable.token, req.params.token))
      .limit(1);

    if (!link) { res.status(404).json({ error: "Link not found" }); return; }
    if (link.expiresAt && new Date() > link.expiresAt) {
      res.status(410).json({ error: "This link has expired" }); return;
    }

    await db
      .update(boardApprovalLinksTable)
      .set({ viewCount: link.viewCount + 1 })
      .where(eq(boardApprovalLinksTable.id, link.id));

    res.json({ link: { ...link, viewCount: link.viewCount + 1 } });
  } catch (err) {
    req.log.error({ err }, "Failed to view board link");
    res.status(500).json({ error: "Failed to load presentation" });
  }
});

// POST /api/board-links/view/:token/vote — public — submit a vote
router.post("/view/:token/vote", async (req: Request, res: Response) => {
  try {
    const [link] = await db
      .select()
      .from(boardApprovalLinksTable)
      .where(eq(boardApprovalLinksTable.token, req.params.token))
      .limit(1);

    if (!link) { res.status(404).json({ error: "Link not found" }); return; }
    if (link.expiresAt && new Date() > link.expiresAt) {
      res.status(410).json({ error: "This link has expired" }); return;
    }

    const { voterName, voterEmail, vote, comment } = req.body as {
      voterName: string;
      voterEmail?: string;
      vote: string;
      comment?: string;
    };

    if (!voterName?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
    if (!["approve", "question", "decline"].includes(vote)) {
      res.status(400).json({ error: "Invalid vote" }); return;
    }

    const [savedVote] = await db.insert(boardApprovalVotesTable).values({
      linkId: link.id,
      voterName: voterName.trim(),
      voterEmail: voterEmail?.trim() || null,
      vote,
      comment: comment?.trim() || null,
    }).returning();

    res.json({ vote: savedVote });
  } catch (err) {
    req.log.error({ err }, "Failed to submit vote");
    res.status(500).json({ error: "Failed to submit response" });
  }
});

export default router;
