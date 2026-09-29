import { desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createTemplateWithLink } from "@/features/admin/actions";
import { requireAdmin } from "@/features/admin/auth";
import { env } from "@/lib/env";
import { db, schema } from "@/server/db/client";

export const metadata = { title: "Templates" };

const input = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

/** Create interview templates and get their shareable links. */
export default async function TemplatesPage() {
  await requireAdmin();
  const rows = await db()
    .select({ template: schema.interviewTemplates, link: schema.interviewLinks })
    .from(schema.interviewTemplates)
    .leftJoin(
      schema.interviewLinks,
      eq(schema.interviewLinks.templateId, schema.interviewTemplates.id),
    )
    .orderBy(desc(schema.interviewTemplates.createdAt));

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 text-lg font-semibold">New interview template</h2>
        <form action={createTemplateWithLink} className="space-y-3">
          <input
            name="name"
            placeholder="Name (e.g. Clinic owners discovery)"
            className={input}
            required
          />
          <textarea
            name="objective"
            placeholder="Interview objective"
            className={input}
            rows={3}
            required
          />
          <textarea
            name="questions"
            placeholder="One question per line"
            className={input}
            rows={6}
            required
          />
          <textarea
            name="instructions"
            placeholder="Extra instructions / guardrails (optional)"
            className={input}
            rows={3}
          />
          <div className="flex gap-3">
            <select name="defaultLocale" className={input} defaultValue="es">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
            <input
              name="maxDurationMinutes"
              type="number"
              defaultValue={20}
              min={3}
              max={60}
              className={input}
            />
          </div>
          <Button>Create template + link</Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Templates</h2>
        {rows.map(({ template, link }) => (
          <Card key={`${template.id}-${link?.id}`} className="p-4">
            <p className="font-medium">{template.name}</p>
            <p className="text-muted text-sm">
              {template.questions.length} questions · {template.defaultLocale.toUpperCase()}
            </p>
            {link && (
              <code className="mt-2 block text-xs break-all">
                {env().NEXT_PUBLIC_APP_URL}/i/{link.token}
              </code>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
