import { z } from "zod";

/** What Emily extracts from the admin's request (LLM output or local fallback). */
export const planSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z.string().min(1).max(600),
  context: z.string().max(120),
  questions: z
    .array(
      z.object({
        text: z.string().min(3).max(300),
        required: z.boolean(),
        suggested: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
});
export type InterviewPlan = z.infer<typeof planSchema>;

const VERBS =
  /^(tienen|tiene|han|ha|saben|sabe|usan|usa|venden|vende|quieren|quiere|cuentan|manejan|piensan|podrían|van|implementar|implementarían|implementaran|estarían|conocen|utilizan)\b/;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ask = (s: string) => `¿${cap(s.replace(/[¿?.]+/g, "").trim())}?`;

// Context-aware follow-ups: added when the request mentions the keyword.
const extras: [RegExp, string[]][] = [
  [/sitio web|página web|web/, ["¿Quién administra o actualiza hoy su sitio web?"]],
  [/inventario|stock/, ["¿Cómo controlan hoy el stock: papel, Excel o un sistema?"]],
  [
    /internet|online|en línea|digital/,
    [
      "¿Por qué canales venden hoy: tienda física, redes sociales, WhatsApp o marketplaces?",
      "¿Qué les impide hoy vender más por internet?",
      "¿Cómo manejarían los envíos y las devoluciones?",
      "¿Qué medios de pago aceptan actualmente?",
    ],
  ],
  [
    /ropa|moda|prendas|textil/,
    [
      "¿Cuántas prendas o referencias manejan por temporada?",
      "¿Quién es su cliente principal y cómo los encuentra hoy?",
    ],
  ],
];

/**
 * Local, rule-based organizer used when no LLM key is configured.
 * ponytail: handles "necesito preguntar si A, B, C" style requests in Spanish; the LLM path covers the rest.
 */
export function planFromText(input: string): InterviewPlan {
  const text = input.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();

  const end = "(?:[,.;]| y |$)";
  const context = (
    lower.match(new RegExp(`negocio es de ([a-záéíóúñ ]+?)${end}`))?.[1] ??
    lower.match(new RegExp(`negocio de (?!un |una |mi |su |el |la )([a-záéíóúñ ]+?)${end}`))?.[1] ??
    ""
  ).trim();
  const goal = lower.match(/para (conocer|entender|saber|validar|descubrir) ([^,.;]+)/);

  const listPart = lower.split(
    /(?:necesito|quiero|debo|tengo que) (?:preguntar|saber|conocer)(?: si)?/,
  )[1];
  let lastVerb = "tienen";
  const userQuestions = (listPart ?? "")
    .split(/,|;|\.| y (?=si )/)
    .map((s) =>
      s
        .trim()
        .replace(/^(y |si )+/, "")
        .trim(),
    )
    .filter((s) => s.length > 3)
    .map((s) => {
      const verb = s.match(VERBS)?.[1];
      if (verb) lastVerb = verb;
      return ask(verb ? s : `${lastVerb} ${s}`);
    });

  const suggested = [
    "Cuéntame brevemente sobre tu negocio: ¿desde cuándo existe y cuántas personas trabajan en él?",
    ...extras.filter(([re]) => re.test(lower)).flatMap(([, qs]) => qs),
    "¿Qué presupuesto o tiempo podrían dedicar a dar este paso?",
  ];

  const seen = new Set<string>();
  const questions = [
    { text: suggested[0]!, required: true, suggested: true },
    ...userQuestions.map((q) => ({ text: q, required: true, suggested: false })),
    ...suggested.slice(1).map((q) => ({ text: q, required: false, suggested: true })),
  ].filter((q) => !seen.has(q.text.toLowerCase()) && seen.add(q.text.toLowerCase()));

  const topic = goal ? `${goal[1]} ${goal[2]}` : "conocer el modelo de negocio del cliente";
  const onlineGoal = /internet|online|en línea/.test(lower)
    ? " y su preparación para vender por internet"
    : "";

  return planSchema.parse({
    name: context ? `Modelo de negocio · ${cap(context)}` : "Nueva entrevista",
    objective: `${cap(topic)}${context ? ` (negocio de ${context})` : ""}${onlineGoal}.`,
    context,
    questions: questions.slice(0, 20),
  });
}
