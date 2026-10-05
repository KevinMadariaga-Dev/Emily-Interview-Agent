"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { ADMIN_COOKIE, createAdminCookieValue } from "@/lib/admin-session";
import { createShareToken } from "@/lib/tokens";
import { db, schema } from "@/server/db/client";
import { requireAdmin } from "./auth";

// DEV ONLY test account. Disabled in production; replaced by magic-link auth (plan step 1.1).
const TEST_USER = { username: "user", password: "user" };

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const secret = env().ADMIN_SESSION_SECRET;
  if (
    env().NODE_ENV === "production" ||
    !secret ||
    username !== TEST_USER.username ||
    password !== TEST_USER.password
  )
    redirect("/login?error=1");
  (await cookies()).set(ADMIN_COOKIE, createAdminCookieValue(username, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/login");
}

const templateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  objective: z.string().trim().min(10).max(2000),
  questions: z.string().trim().min(1), // one question per line
  instructions: z.string().trim().max(4000).optional(),
  defaultLocale: z.enum(["es", "en"]),
  maxDurationMinutes: z.coerce.number().int().min(3).max(60),
});

export async function createTemplateWithLink(formData: FormData) {
  await requireAdmin();
  const data = templateSchema.parse(Object.fromEntries(formData));
  const questions = data.questions
    .split("\n")
    .map((q) => q.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `q${i + 1}`, text }));

  const [template] = await db()
    .insert(schema.interviewTemplates)
    .values({ ...data, questions, instructions: data.instructions || null })
    .returning();
  await db()
    .insert(schema.interviewLinks)
    .values({ templateId: template!.id, token: createShareToken(), label: "Default link" });
  revalidatePath("/admin/templates");
}
