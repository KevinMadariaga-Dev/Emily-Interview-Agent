/**
 * Seeds a demo template + link so you can open /i/demo-link locally.
 * Run: pnpm db:seed   (requires DATABASE_URL; Node >= 22.6 for --experimental-strip-types)
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://emily:emily@localhost:5432/emily");

const questions = [
  { id: "q1", text: "¿Cuál es tu rol y cómo es un día típico de trabajo?" },
  { id: "q2", text: "¿Cuál es el mayor problema que enfrentas hoy con este proceso?" },
  { id: "q3", text: "¿Cómo lo resuelves actualmente y cuánto te cuesta?" },
  { id: "q4", text: "Si tuvieras una varita mágica, ¿qué cambiarías?" },
];

const [template] = await sql`
  insert into interview_templates (name, objective, questions, default_locale)
  values ('Demo discovery', 'Understand the main pain points of small business owners with their current tools.',
          ${sql.json(questions)}, 'es')
  returning id`;
await sql`insert into interview_links (template_id, token, label) values (${template!.id}, 'demo-link', 'Demo')
          on conflict (token) do nothing`;
console.log("Seeded. Open http://localhost:3000/i/demo-link");
await sql.end();
