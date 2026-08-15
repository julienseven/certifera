import { db } from "@/db";
import { pilotCohorts, pilotCohortPartners, pilotPartners, taskTemplates, workOrders } from "@/db/schema";
import { resolveLimit } from "@/app/api/_pagination";
import { requireIdentity, writeAudit } from "@/lib/auth";
import { recordLifecycleEvent } from "@/lib/lifecycle";
import { and, desc, eq } from "drizzle-orm";

const DEFAULT_TEMPLATES = 200;
const MAX_TEMPLATES = 500;

const categories = new Set(["Infrastructure", "Field verification", "Climate data", "Delivery"]);

function value(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

function requirements(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 160)).slice(0, 8) : [];
}

async function validateTemplateContext(cohortId: string, partnerId: string, category: string) {
  const [cohort] = await db.select().from(pilotCohorts).where(eq(pilotCohorts.id, cohortId)).limit(1);
  if (!cohort) return { error: "Cohort not found." } as const;
  if (cohort.taskCategory !== category) return { error: "Template category must match cohort category." } as const;
  const [partner] = await db.select().from(pilotPartners).where(eq(pilotPartners.id, partnerId)).limit(1);
  if (!partner || partner.status !== "active" || partner.contractStatus !== "signed") return { error: "Template partner must be active with a signed agreement." } as const;
  const [membership] = await db.select().from(pilotCohortPartners).where(and(eq(pilotCohortPartners.cohortId, cohortId), eq(pilotCohortPartners.partnerId, partnerId))).limit(1);
  if (!membership) return { error: "Template partner is not enrolled in this cohort." } as const;
  return { cohort, partner } as const;
}

export async function GET(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  const templates = await db
    .select({
      id: taskTemplates.id,
      cohortId: taskTemplates.cohortId,
      partnerId: taskTemplates.partnerId,
      name: taskTemplates.name,
      titleTemplate: taskTemplates.titleTemplate,
      location: taskTemplates.location,
      category: taskTemplates.category,
      rewardCents: taskTemplates.rewardCents,
      proofRequirements: taskTemplates.proofRequirements,
      active: taskTemplates.active,
      createdAt: taskTemplates.createdAt,
      cohortName: pilotCohorts.name,
      partnerName: pilotPartners.name,
    })
    .from(taskTemplates)
    .innerJoin(pilotCohorts, eq(taskTemplates.cohortId, pilotCohorts.id))
    .innerJoin(pilotPartners, eq(taskTemplates.partnerId, pilotPartners.id))
    .orderBy(desc(taskTemplates.createdAt))
    .limit(resolveLimit(request, DEFAULT_TEMPLATES, MAX_TEMPLATES));
  return Response.json({ templates });
}

export async function POST(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const cohortId = value(body, "cohortId", 64);
    const partnerId = value(body, "partnerId", 64);
    const name = value(body, "name", 100);
    const titleTemplate = value(body, "titleTemplate", 160);
    const location = value(body, "location", 120);
    const category = value(body, "category", 80);
    const rewardCents = Math.round(Number(body.reward) * 100);
    const proofRequirements = requirements(body.proofRequirements);
    if (!cohortId || !partnerId || !name || titleTemplate.length < 5 || location.length < 3 || !categories.has(category) || rewardCents < 2500 || rewardCents > 1_000_000 || proofRequirements.length === 0) {
      return Response.json({ error: "Provide cohort, partner, template name/title, location, valid category, reward, and at least one proof requirement." }, { status: 400 });
    }
    const context = await validateTemplateContext(cohortId, partnerId, category);
    if ("error" in context) return Response.json({ error: context.error }, { status: 400 });
    const [template] = await db.insert(taskTemplates).values({ cohortId, partnerId, name, titleTemplate, location, category, rewardCents, proofRequirements, createdByUserId: auth.identity.userId }).returning();
    await writeAudit({ actorId: auth.identity.userId, action: "task_template_created", resourceType: "task_template", resourceId: template.id, request, data: { cohortId, partnerId, rewardCents } });
    return Response.json({ template }, { status: 201 });
  } catch (error) {
    console.error("template create failed", error);
    return Response.json({ error: "Could not create task template." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireIdentity(request, { roles: ["admin", "operator"] });
  if (!auth.identity) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const templateId = value(body, "templateId", 64);
    const count = Number(body.count);
    if (!templateId || !Number.isInteger(count) || count < 1 || count > 25) return Response.json({ error: "Run between 1 and 25 tasks from a valid template." }, { status: 400 });
    const [template] = await db.select().from(taskTemplates).where(eq(taskTemplates.id, templateId)).limit(1);
    if (!template || !template.active) return Response.json({ error: "Active task template not found." }, { status: 404 });
    const context = await validateTemplateContext(template.cohortId, template.partnerId, template.category);
    if ("error" in context) return Response.json({ error: context.error }, { status: 400 });
    if (context.cohort.status !== "active") return Response.json({ error: "Activate the cohort before running batch tasks." }, { status: 409 });
    const created = await db.transaction(async (tx) => {
      const workOrdersCreated = [];
      for (let index = 1; index <= count; index += 1) {
        const [workOrder] = await tx.insert(workOrders).values({
          externalRef: `cert-${crypto.randomUUID().slice(0, 8)}`,
          title: count === 1 ? template.titleTemplate : `${template.titleTemplate} · ${String(index).padStart(2, "0")}`,
          category: template.category,
          location: template.location,
          rewardCents: template.rewardCents,
          requester: `partner/${context.partner.requesterAlias}`,
          pilotPartnerId: template.partnerId,
          pilotCohortId: template.cohortId,
          status: "open",
          proofRequirements: template.proofRequirements,
        }).returning();
        await recordLifecycleEvent(tx, { workOrderId: workOrder.id, type: "cohort_task_funded", actor: `operator/${auth.identity.email}`, summary: `Funded from template ${template.name}.`, data: { cohortId: template.cohortId, templateId: template.id, rewardCents: workOrder.rewardCents } });
        workOrdersCreated.push(workOrder);
      }
      return workOrdersCreated;
    });
    await writeAudit({ actorId: auth.identity.userId, action: "task_template_batch_run", resourceType: "task_template", resourceId: template.id, request, data: { count, cohortId: template.cohortId } });
    return Response.json({ tasks: created }, { status: 201 });
  } catch (error) {
    console.error("template batch failed", error);
    return Response.json({ error: "Could not run the task template batch." }, { status: 500 });
  }
}
