import { Router, type Request, type Response } from "express";
import { db, membersTable } from "@workspace/db";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";

const router = Router();

const ALLOWED_TYPES = new Set(["general", "board", "honorary", "staff"]);
const ALLOWED_STATUS = new Set(["active", "inactive", "pending"]);

type MemberInput = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  memberType?: unknown;
  status?: unknown;
  joinDate?: unknown;
  renewalDate?: unknown;
  notes?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeInput(body: MemberInput, partial = false) {
  const out: Record<string, unknown> = {};

  const setStr = (
    key: string,
    value: unknown,
    opts: { required?: boolean; format?: RegExp; formatMsg?: string } = {},
  ) => {
    if (value === undefined || value === null || value === "") {
      if (opts.required && !partial) return `${key} is required`;
      if (!opts.required && !partial) out[key] = null;
      return null;
    }
    if (typeof value !== "string") return `${key} must be a string`;
    const trimmed = value.trim();
    if (opts.required && trimmed.length === 0) return `${key} is required`;
    if (trimmed.length === 0) {
      if (!partial) out[key] = null;
      return null;
    }
    if (opts.format && !opts.format.test(trimmed)) {
      return opts.formatMsg ?? `${key} has an invalid format`;
    }
    out[key] = trimmed;
    return null;
  };

  let err: string | null;
  err = setStr("firstName", body.firstName, { required: true });
  if (err) return { error: err };
  err = setStr("lastName", body.lastName);
  if (err) return { error: err };
  err = setStr("email", body.email, { format: EMAIL_RE, formatMsg: "email must be a valid address" });
  if (err) return { error: err };
  err = setStr("phone", body.phone);
  if (err) return { error: err };
  err = setStr("joinDate", body.joinDate, { format: DATE_RE, formatMsg: "joinDate must be YYYY-MM-DD" });
  if (err) return { error: err };
  err = setStr("renewalDate", body.renewalDate, { format: DATE_RE, formatMsg: "renewalDate must be YYYY-MM-DD" });
  if (err) return { error: err };
  err = setStr("notes", body.notes);
  if (err) return { error: err };

  if (body.memberType !== undefined && body.memberType !== null && body.memberType !== "") {
    const t = String(body.memberType);
    if (!ALLOWED_TYPES.has(t)) return { error: `memberType must be one of ${[...ALLOWED_TYPES].join(", ")}` };
    out.memberType = t;
  }
  if (body.status !== undefined && body.status !== null && body.status !== "") {
    const s = String(body.status);
    if (!ALLOWED_STATUS.has(s)) return { error: `status must be one of ${[...ALLOWED_STATUS].join(", ")}` };
    out.status = s;
  }
  return { values: out };
}

// GET /api/members?status=active&search=jane
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const { status, search } = req.query;
  const conds = [eq(membersTable.orgId, orgId)];
  if (status && typeof status === "string" && ALLOWED_STATUS.has(status)) {
    conds.push(eq(membersTable.status, status));
  }
  if (search && typeof search === "string" && search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push(
      or(
        ilike(membersTable.firstName, q),
        ilike(membersTable.lastName, q),
        ilike(membersTable.email, q),
      )!,
    );
  }
  const rows = await db.select().from(membersTable).where(and(...conds)).orderBy(desc(membersTable.createdAt));
  res.json(rows);
});

// GET /api/members/stats — counts by status
router.get("/stats", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const rows = await db
    .select({ status: membersTable.status, count: sql<number>`count(*)::int` })
    .from(membersTable)
    .where(eq(membersTable.orgId, orgId))
    .groupBy(membersTable.status);
  const stats = { total: 0, active: 0, inactive: 0, pending: 0 };
  for (const r of rows) {
    stats.total += Number(r.count);
    if (r.status in stats) (stats as Record<string, number>)[r.status] = Number(r.count);
  }
  res.json(stats);
});

// GET /api/members/:id
router.get("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const [row] = await db.select().from(membersTable)
    .where(and(eq(membersTable.id, req.params.id), eq(membersTable.orgId, orgId)));
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

// POST /api/members
router.post("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const result = sanitizeInput(req.body as MemberInput);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  const [row] = await db.insert(membersTable).values({ orgId, ...result.values } as typeof membersTable.$inferInsert).returning();
  res.status(201).json(row);
});

// PUT /api/members/:id
router.put("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const result = sanitizeInput(req.body as MemberInput, true);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  const [row] = await db.update(membersTable)
    .set({ ...result.values, updatedAt: new Date() })
    .where(and(eq(membersTable.id, req.params.id), eq(membersTable.orgId, orgId)))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

// DELETE /api/members/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const [row] = await db.delete(membersTable)
    .where(and(eq(membersTable.id, req.params.id), eq(membersTable.orgId, orgId)))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.status(204).end();
});

// POST /api/members/import — bulk CSV import
// Body: { members: [{ firstName, lastName, email, phone, memberType, status, joinDate, renewalDate, notes }] }
router.post("/import", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const body = req.body as { members?: unknown };
  if (!Array.isArray(body.members)) { res.status(400).json({ error: "members array required" }); return; }
  const valid: (typeof membersTable.$inferInsert)[] = [];
  const errors: { row: number; error: string }[] = [];
  body.members.forEach((m, i) => {
    const r = sanitizeInput(m as MemberInput);
    if ("error" in r) errors.push({ row: i + 1, error: r.error! });
    else valid.push({ orgId, ...r.values } as typeof membersTable.$inferInsert);
  });
  let inserted = 0;
  if (valid.length) {
    const rows = await db.insert(membersTable).values(valid).returning({ id: membersTable.id });
    inserted = rows.length;
  }
  res.json({ inserted, skipped: errors.length, errors });
});

export default router;
