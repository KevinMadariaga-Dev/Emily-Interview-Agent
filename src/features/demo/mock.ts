// Demo data. Replace each export with a DB query / API call when integrating.

export type SessionStatus = "completed" | "in_progress" | "paused" | "abandoned";
export type Delivery = "sent" | "pending" | "failed";

export const DOMAIN = "emily.neoera";

export type Question = { id: string; text: string; required: boolean };

/** Everything the creation wizard edits. */
export type EmilyConfig = {
  slug: string;
  name: string;
  objective: string;
  locale: "es" | "en";
  voiceId: string;
  questions: Question[];
  participant: { name: string; company: string; email: string };
  activeFrom: string;
  activeUntil: string;
  noExpiry: boolean;
  connections: { gmail: boolean; notion: boolean };
};

export type Emily = EmilyConfig & {
  sessions: number;
  completed: number;
  active: boolean;
  createdAt: string;
};

const qs = (...texts: string[]): Question[] =>
  texts.map((text, i) => ({ id: `q${i + 1}`, text, required: i < 2 }));

const noParticipant = { name: "", company: "", email: "" };

export const emilys: Emily[] = [
  {
    slug: "prueba",
    name: "Entrevista de prueba",
    objective: "Entender cómo los dueños de clínicas gestionan hoy sus citas.",
    locale: "es",
    voiceId: "emily",
    questions: qs(
      "¿Cómo gestionas hoy las citas de tus pacientes?",
      "¿Qué es lo que más tiempo te quita de ese proceso?",
      "Si pudieras cambiar una sola cosa, ¿cuál sería?",
    ),
    participant: noParticipant,
    activeFrom: "",
    activeUntil: "",
    noExpiry: true,
    connections: { gmail: true, notion: false },
    sessions: 12,
    completed: 9,
    active: true,
    createdAt: "2026-09-28",
  },
  {
    slug: "clinicas-discovery",
    name: "Discovery clínicas dentales",
    objective: "Validar dolor de no-shows y recordatorios manuales.",
    locale: "es",
    voiceId: "sofia",
    questions: qs(
      "Cuéntame sobre tu clínica: ¿cuántos sillones y cuántas personas trabajan?",
      "¿Cómo confirman hoy las citas del día siguiente?",
      "¿Qué porcentaje de pacientes no llega a su cita?",
      "¿Qué han intentado para reducir las inasistencias?",
      "¿Cuánto les cuesta al mes una silla vacía?",
      "¿Quién decide cuando contratan una herramienta nueva?",
    ),
    participant: { name: "Laura Gómez", company: "Clínica Sonrisas", email: "laura@sonrisas.com" },
    activeFrom: "2026-09-15T09:00",
    activeUntil: "2026-10-31T18:00",
    noExpiry: false,
    connections: { gmail: true, notion: true },
    sessions: 31,
    completed: 27,
    active: true,
    createdAt: "2026-09-15",
  },
  {
    slug: "retail-us",
    name: "Retail owners (US)",
    objective: "Understand inventory reordering workflows.",
    locale: "en",
    voiceId: "olivia",
    questions: qs(
      "How do you decide when to reorder stock?",
      "What tools do you use to track inventory?",
      "When did you last run out of a best-seller?",
      "How much time per week goes into ordering?",
      "What would make this process painless?",
    ),
    participant: noParticipant,
    activeFrom: "2026-09-02T08:00",
    activeUntil: "2026-09-25T18:00",
    noExpiry: false,
    connections: { gmail: false, notion: true },
    sessions: 8,
    completed: 5,
    active: false,
    createdAt: "2026-09-02",
  },
];

export const sessions = [
  {
    id: "s-1042",
    emily: "Discovery clínicas dentales",
    participant: "Laura Gómez",
    status: "completed" as SessionStatus,
    startedAt: "30 sep · 10:12",
    durationMin: 14,
    sentiment: "Positivo",
    email: "sent" as Delivery,
    notion: "sent" as Delivery,
  },
  {
    id: "s-1041",
    emily: "Entrevista de prueba",
    participant: "Anónimo",
    status: "in_progress" as SessionStatus,
    startedAt: "30 sep · 09:58",
    durationMin: 6,
    sentiment: "—",
    email: "pending" as Delivery,
    notion: "pending" as Delivery,
  },
  {
    id: "s-1040",
    emily: "Discovery clínicas dentales",
    participant: "Dr. Martín Ruiz",
    status: "completed" as SessionStatus,
    startedAt: "29 sep · 17:40",
    durationMin: 18,
    sentiment: "Mixto",
    email: "sent" as Delivery,
    notion: "failed" as Delivery,
  },
  {
    id: "s-1039",
    emily: "Retail owners (US)",
    participant: "Mike T.",
    status: "paused" as SessionStatus,
    startedAt: "29 sep · 15:03",
    durationMin: 4,
    sentiment: "—",
    email: "pending" as Delivery,
    notion: "pending" as Delivery,
  },
  {
    id: "s-1038",
    emily: "Entrevista de prueba",
    participant: "Anónimo",
    status: "abandoned" as SessionStatus,
    startedAt: "28 sep · 12:21",
    durationMin: 1,
    sentiment: "—",
    email: "pending" as Delivery,
    notion: "pending" as Delivery,
  },
];

export const sessionDetail = {
  ...sessions[0]!,
  locale: "es",
  summary:
    "Laura administra una clínica dental con 3 sillones. Gestiona citas con agenda en papel y WhatsApp. Su mayor dolor son los pacientes que no asisten (≈15% semanal) y el tiempo que su recepcionista dedica a confirmar citas por teléfono.",
  painPoints: [
    { text: "No-shows frecuentes (≈15% semanal)", severity: "Alta" },
    { text: "Confirmación manual de citas por teléfono (2 h/día)", severity: "Alta" },
    { text: "Doble agenda papel + WhatsApp genera errores", severity: "Media" },
  ],
  insights: [
    "Pagaría por recordatorios automáticos si se integran con WhatsApp.",
    "Desconfía de software complejo: prioriza algo que su recepcionista aprenda en un día.",
    "El dueño decide la compra; la recepcionista es la usuaria principal.",
  ],
  quotes: [
    "“Los lunes perdemos casi la mitad de la mañana llamando pacientes.”",
    "“Si me avisa por WhatsApp, lo uso mañana mismo.”",
  ],
  answers: [
    {
      q: "¿Cómo gestionas hoy las citas de tus pacientes?",
      a: "Agenda en papel y WhatsApp personal de la recepcionista.",
    },
    {
      q: "¿Qué es lo que más tiempo te quita de ese proceso?",
      a: "Confirmar citas el día anterior, unas 2 horas diarias.",
    },
    {
      q: "Si pudieras cambiar una sola cosa, ¿cuál sería?",
      a: "Recordatorios automáticos que reduzcan inasistencias.",
    },
  ],
};

export const transcript: { role: "agent" | "user"; text: string; at: string }[] = [
  {
    role: "agent",
    at: "00:00",
    text: "¡Hola! Soy Emily, la asistente de entrevistas de NEOera. Gracias por tu tiempo. ¿Empezamos?",
  },
  { role: "user", at: "00:07", text: "Sí, claro, adelante." },
  { role: "agent", at: "00:10", text: "¿Cómo gestionas hoy las citas de tus pacientes?" },
  {
    role: "user",
    at: "00:14",
    text: "Tenemos una agenda en papel y la recepcionista usa su WhatsApp para confirmar.",
  },
  {
    role: "agent",
    at: "00:31",
    text: "Entiendo. ¿Qué es lo que más tiempo les quita de ese proceso?",
  },
  {
    role: "user",
    at: "00:36",
    text: "Confirmar las citas del día siguiente. Los lunes perdemos casi la mitad de la mañana llamando pacientes.",
  },
  {
    role: "agent",
    at: "00:58",
    text: "Eso suena agotador. Si pudieras cambiar una sola cosa, ¿cuál sería?",
  },
  {
    role: "user",
    at: "01:04",
    text: "Que se les recuerde solo. Si me avisa por WhatsApp, lo uso mañana mismo.",
  },
  {
    role: "agent",
    at: "01:20",
    text: "Muchas gracias, Laura. Eso es todo por hoy. ¡Que tengas un gran día!",
  },
];

export const statusLabel: Record<SessionStatus, { label: string; className: string }> = {
  completed: {
    label: "Completada",
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
  },
  in_progress: { label: "En curso", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  paused: { label: "Pausada", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  abandoned: { label: "Abandonada", className: "bg-stone-500/15 text-muted" },
};

export const deliveryLabel: Record<Delivery, { label: string; className: string }> = {
  sent: { label: "Enviado", className: "text-green-600 dark:text-green-400" },
  pending: { label: "Pendiente", className: "text-muted" },
  failed: { label: "Falló", className: "text-red-600 dark:text-red-400" },
};
