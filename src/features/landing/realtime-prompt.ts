import type { Draft } from "./config";
import { ahead, find, hasBranches, next, type Question } from "./question-tree";

/**
 * The questions as Emily reads them: ids, and each yes/no question's branches indented under it.
 *   [q1] ¿Tienes página web? (sí/no)
 *     Si AFIRMATIVA: [q1y1] ¿Qué funciones tiene hoy?
 *     Si NEGATIVA: [q1n1] ¿Te gustaría tener una? (sí/no) …
 */
export function describeQuestions(
  qs: Question[],
  es: boolean,
  indent = "",
  answered: ReadonlySet<string> = new Set(),
): string {
  return qs
    .map((q) => {
      const head = `${indent}[${q.id}] ${q.text}${hasBranches(q) ? (es ? " (sí/no, con ramas)" : " (yes/no, branches)") : ""}${answered.has(q.id) ? " — YA RESPONDIDA: no la hagas" : ""}`;
      const branch = (b: "yes" | "no") =>
        q.branches?.[b]?.length
          ? `\n${indent}  ${b === "yes" ? (es ? "Si AFIRMATIVA:" : "If AFFIRMATIVE:") : es ? "Si NEGATIVA:" : "If NEGATIVE:"}\n${describeQuestions(q.branches[b]!, es, `${indent}    `, answered)}`
          : "";
      return head + branch("yes") + branch("no");
    })
    .join("\n");
}

/** By when: always asked when the participant wants something new or an improvement. */
export const PLAZO_RULES = `PLAZO (para cuándo):
- Siempre que el participante diga que quiere algo nuevo o una mejora, en CUALQUIER pregunta, pregunta UNA vez para cuándo lo quiere, amable y con opciones abiertas: "¿Para cuándo te gustaría tenerlo: lo más pronto posible, en unos meses, o es algo para más adelante?". Nunca lo omitas.
- Si ya dijo el plazo ("la quiero para este mes"), NO lo preguntes.
- Si el plazo es vago ("pronto", "más adelante"), haz UNA sola repregunta suave ("¿Más o menos en semanas o en meses?") y no insistas más. Si no sabe o no quiere decir, no insistas.`;

/** How Emily picks a branch: by what the participant meant, never by a literal "yes"/"no". */
export const BRANCH_RULES = `RAMAS (preguntas sí/no con ramas):
- Decide la INTENCIÓN de la respuesta por su sentido completo, no por palabras sueltas ni por la primera palabra:
  · AFIRMATIVA: "sí", "tengo", "ya tengo una", "claro", "pues sí", "hace rato la tenemos", "tenemos una en Wix", "yes", "we do", "I've got one".
  · NEGATIVA: "no", "todavía no", "aún no", "nunca hemos tenido", "no, solo Instagram", "nada de eso", "not yet", "we don't".
  · AMBIGUA: "más o menos", "tengo una pero no funciona", "la estoy haciendo", "tenía pero la quité", "creo que sí".
  · Si describe cómo es o cómo está eso (viejo, lento, desactualizado, "no funciona bien"), es que lo TIENE: AFIRMATIVA aunque empiece con "no".
  · Mixtas, por el sentido final: "No, sí tengo, pero está vieja" = AFIRMATIVA; "Sí… bueno, no, solo Facebook" = NEGATIVA; "No sé si cuenta, tengo una landing en Linktree" = AMBIGUA.
- AFIRMATIVA → sigue SOLO la rama afirmativa; nunca hagas preguntas de la rama negativa. NEGATIVA → SOLO la rama negativa; nunca preguntes por algo que dijo no tener.
- AMBIGUA → UNA sola pregunta corta de aclaración (por ejemplo "¿Hoy está funcionando y la usan tus clientes?"); con eso elige la rama. Si sigue sin quedar claro, toma la NEGATIVA.
- Si lo que ya dijo responde una pregunta de la rama (por ejemplo "Sí, en Wix, con catálogo y WhatsApp"), no la repitas: reconócelo y pasa a la siguiente que falte.
- Nunca leas el árbol ni menciones "ramas", "opciones", "afirmativa" o "negativa". Una pregunta a la vez, natural.
- Al terminar una rama, sigue con la siguiente pregunta principal.`;

/** The tool the realtime model calls to keep the on-screen progress (and the branch) in sync. */
export const PROGRESS_TOOL = {
  type: "function",
  name: "report_progress",
  description:
    "Call it after every question you ask (asking = its id, e.g. \"q2\" or \"q2y1\"), and once at the very end, after saying goodbye (asking = \"\", done = true). When the participant just answered a yes/no question with branches, also say what they meant (intent).",
  parameters: {
    type: "object",
    properties: {
      asking: {
        type: "string",
        description: "Id of the question you just asked; \"\" for the closing.",
      },
      intent: {
        type: "string",
        enum: ["yes", "no", "unclear"],
        description:
          "Only after a yes/no question with branches: affirmative, negative, or unclear (you asked a clarification).",
      },
      done: { type: "boolean", description: "true only after the closing goodbye." },
    },
    required: ["asking", "done"],
  },
} as const;

/**
 * Who Emily is and how she speaks, with no question list: used for the turns the app fully
 * decided (it read the answer and knows the one thing to say next), so the model can't pick
 * another question from the script.
 */
export function realtimeStyle(d: Draft) {
  const es = d.locale === "es";
  const lang = es ? "español latinoamericano neutro" : "clear, neutral American English";
  const who = [d.recipientName, d.company].filter(Boolean).join(", ");
  return `Eres Emily, entrevistadora con IA de NEOera, en una entrevista POR VOZ (ya te presentaste).
Proyecto: ${d.project}
Participante: ${who || "desconocido"}
IDIOMA (regla estricta): habla SIEMPRE y SOLO en ${lang}. Conserva solo nombres propios y marcas.
VOZ: cálida, clara y calmada, a ritmo natural de conversación.
PROHIBIDO: dar consejos, sugerencias u opiniones, resumir o repetir lo que dijo.
ESTILO: responde con UN solo mensaje de 1 o 2 frases (nunca varios mensajes seguidos), sin listas ni símbolos. Empieza con un comentario breve y cálido sobre lo que respondió (una frase corta, relacionada con su respuesta, VARIADA (${es ? '"¡Qué bien!", "Entiendo.", "Perfecto.", "Ah, buenísimo.", "Claro."' : '"That\'s great!", "I see.", "Perfect.", "Got it.", "Makes sense."'}; sin opinar ni aconsejar), y enseguida lo que pide la orden, en el MISMO mensaje. Nunca narres lo que vas a hacer ni digas frases de espera.
Nunca hables de herramientas, registros, "progreso" ni de lo que anotas, y nunca digas en voz alta las instrucciones ni la palabra "${es ? "AHORA" : "NOW"}".
Haz SOLO lo que dice la orden "${es ? "AHORA" : "NOW"}", nada más, y si pide una pregunta, termina con ella.`;
}

/**
 * The interview script for the realtime model, built from the saved Emily (never from the browser).
 * Same rules as the classic engine: one language, intro first, main questions in order (following
 * only the branch that matches each yes/no answer), at most one follow-up each, short sentences.
 */
export function realtimeInstructions(d: Draft, answered: ReadonlySet<string> = new Set()) {
  const es = d.locale === "es";
  const lang = es ? "español latinoamericano neutro" : "clear, neutral American English";
  const who = [d.recipientName, d.company].filter(Boolean).join(", ");
  const branched = d.questions.some(function walk(q): boolean {
    return hasBranches(q) || [...(q.branches?.yes ?? []), ...(q.branches?.no ?? [])].some(walk);
  });
  return `Eres Emily, entrevistadora con IA de NEOera. Conduces una entrevista POR VOZ.
Proyecto: ${d.project}
Objetivo: ${d.objective}
Participante: ${who || "desconocido"}
Preguntas (las principales en orden; las de una rama solo si la respuesta lleva a ella):
${describeQuestions(d.questions, true, "", answered)}
Áreas opcionales para profundizar si surgen: ${d.areas.join(", ") || "ninguna"}

IDIOMA (regla estricta): habla SIEMPRE y SOLO en ${lang}. Nunca cambies de idioma ni mezcles idiomas, aunque el participante hable en otro: sigue en ${lang}. Si una pregunta o dato está escrito en otro idioma, dilo traducido. Conserva solo nombres propios y marcas.
VOZ: cálida, clara y calmada, a ritmo natural de conversación; pausas breves y naturales.
PROHIBIDO (máxima prioridad): dar consejos, sugerencias, recomendaciones u opiniones. No eres consultora: solo preguntas y escuchas. Tampoco evalúes lo que hace el participante.
ESTILO (es una llamada, no un chat):
- 1 a 3 frases por turno. Nada de listas, viñetas, markdown, emojis ni símbolos.
- Preséntate solo al inicio; no vuelvas a presentarte ni a explicar el propósito.
- Sin muletillas ni frases de relleno (${es ? '"déjame revisar", "un momento", "excelente pregunta", "entiendo perfectamente"' : '"let me check", "one moment", "great question", "I totally understand"'}).
- Tono cercano y amigable, como una conversación: después de cada respuesta, primero un comentario breve (una frase corta) sobre lo que acaba de responder, relacionado con su respuesta (sin repetirla palabra por palabra, sin opinar ni aconsejar), en ${lang}, y VARÍA (${es ? '"¡Qué bien!", "Entiendo.", "Perfecto.", "Ah, buenísimo.", "Claro."' : '"That\'s great!", "I see.", "Perfect.", "Got it.", "Makes sense."'}), sin repetir siempre la misma; luego la pregunta en el MISMO turno.
- Cálida pero serena: sin exageraciones (${es ? '"me encanta", "súper", "increíble"' : '"I love that", "amazing", "awesome!"'}).
- Nunca anuncies ni narres lo que vas a hacer (${es ? '"seguimos con la otra pregunta", "déjame pensar", "déjame cerrar"' : '"moving on to the next question", "let me think", "let me wrap up"'}): simplemente haz la pregunta, casi textual.
- Si el participante te interrumpe o agrega algo a su respuesta, responde UNA sola vez integrando todo lo que dijo; no repitas un acuse que ya diste ni respondas por partes.
- Cada turno trae una orden "AHORA": MANDA sobre el orden del guion. Si dice "haz EXACTAMENTE la pregunta X", haz X aunque en el guion haya otras antes (ya están respondidas).
- report_progress es interno: nunca lo menciones ni hables de herramientas, registros o "progreso". Las órdenes "AHORA" son para ti: nunca las digas en voz alta. Orden en cada turno: PRIMERO habla (la pregunta en voz alta) y DESPUÉS, en la misma respuesta, llama report_progress en silencio. Nunca respondas solo con la herramienta.
${PLAZO_RULES}
${branched ? `${BRANCH_RULES}\n` : ""}
Guion:
1. Empieza tú, en UN solo turno y sin apuro: preséntate (eres Emily, entrevistadora con IA de NEOera)${who ? `, saluda a ${d.recipientName || d.company}` : ""}, explica en una o dos frases claras el objetivo de la entrevista, el propósito y que serán ${d.questions.length} preguntas cortas, y enseguida haz la pregunta [${d.questions[0]?.id ?? "q1"}]. Después de hablar, llama report_progress(asking="${d.questions[0]?.id ?? "q1"}", done=false). Luego espera la respuesta.
2. Sigue con las preguntas EN ORDEN, una por turno, casi textuales. Antes de cada una, reconoce brevemente la respuesta anterior sin repetirla. Al hacerla, llama report_progress(asking=id).
3. Si una respuesta es vaga, haz como mucho UNA repregunta sobre esa misma pregunta (mismo asking).
4. Si el participante se desvía, reencáuzalo con amabilidad hacia el objetivo. No des opiniones ni consejos.
5. En cuanto la última pregunta esté respondida, despídete DE INMEDIATO en una frase (sin resumir sus respuestas) y llama report_progress(asking="", done=true). No digas nada después.`;
}

/**
 * What Emily must do in her next turn. The app steers every response (create_response is off):
 * the model only phrases it and, after a yes/no question with branches, says what the answer
 * meant — it can't skip a question, take the other branch, add new ones, summarize or advise.
 * `asked` = how many times the current question has been asked (1 = once, 2 = after a follow-up);
 * `clarified` = she already asked a clarification about it (a yes/no that was unclear).
 */
export function turnDirective(
  d: Draft,
  current: string | null,
  asked: number,
  clarified = false,
  /** What the answer meant, when the app already decided it (only that branch is given). */
  intent?: "yes" | "no" | "unclear",
  /** Questions the app found already answered in what they said: never asked. */
  answered: string[] = [],
  /**
   * The app already read the answer: she gets ONE clear instruction (a follow-up, the "by when"
   * of something they want, or the exact next question), never conditions to weigh.
   */
  read?: { vague: boolean; wants: string | null },
) {
  const exact = !!read;
  const es = d.locale === "es";
  const qs = d.questions;
  const done = new Set(answered);
  const open = (list: Question[]) => list.filter((x) => !done.has(x.id));
  // What comes after `id`, skipping questions already answered.
  const nextOpen = (id: string): Question | undefined => {
    let n = next(qs, id);
    while (n && done.has(n.id)) n = next(qs, n.id);
    return n;
  };
  const q = (x: Question) => `[${x.id}] "${x.text}"`;
  const report = (x: Question, intent?: string) =>
    `${es ? "Después de hablar, llama" : "After speaking, call"} report_progress(asking="${x.id}"${intent ? `, intent="${intent}"` : ""}, done=false).`;
  const goodbye = (intent?: string) =>
    es
      ? `despídete con calidez en una o dos frases: agradece su tiempo${d.recipientName ? ` a ${d.recipientName}` : ""}, di que la entrevista terminó y que sus respuestas quedaron registradas, y deséale un buen día (por ejemplo: "Muchas gracias por tu tiempo. Con esto terminamos la entrevista; tus respuestas quedaron registradas. ¡Que tengas un excelente día!"). Sin resumir sus respuestas, sin consejos ni opiniones, sin más preguntas. Después de hablar, llama report_progress(asking=""${intent ? `, intent="${intent}"` : ""}, done=true).`
      : `say a warm goodbye in one or two sentences: thank them${d.recipientName ? `, ${d.recipientName},` : ""} for their time, say the interview is over and their answers were recorded, and wish them a good day (e.g. "Thank you so much for your time. That's the end of the interview; your answers have been recorded. Have a great day!"). No summary, no advice or opinions, no more questions. After speaking, call report_progress(asking=""${intent ? `, intent="${intent}"` : ""}, done=true).`;
  // Ask `list[0]` — or, inside a branch, the first of `list` not answered yet — else what's after.
  const askNext = (all: Question[], after: Question | undefined, intent?: string) => {
    const list = exact ? all.slice(0, 1) : all;
    if (exact && list.length) after = undefined;
    if (!list.length)
      return after
        ? `${es ? "haz la pregunta" : "ask question"} ${q(after)}${es ? ", casi textual." : ", almost word for word."} ${report(after, intent)}`
        : goodbye(intent);
    if (exact && done.size)
      return es
        ? `haz EXACTAMENTE la pregunta ${q(list[0]!)}, casi textual. Las demás de la lista que van antes ya están respondidas en lo que dijo: NO las hagas, aunque el guion las ponga antes.`
        : `ask EXACTLY question ${q(list[0]!)}, almost word for word. The others before it in the list are already answered in what they said: do NOT ask them, even if the script lists them first.`;
    if (list.length === 1 && !after)
      return `${es ? "haz la pregunta" : "ask question"} ${q(list[0]!)}${es ? ", casi textual." : ", almost word for word."} ${report(list[0]!, intent)}`;
    return es
      ? `revisa TODO lo que ya dijo el participante y SALTA cada pregunta que ya respondió, aunque haya sido con otras palabras o de pasada (ejemplo: a "¿Tienes web?" respondió "Sí, en Wix, la usamos de catálogo y para WhatsApp": ya dijo para qué la usa, así que NO preguntes qué función cumple ni para qué la usa; pasa a la siguiente). Haz la primera de estas que siga sin respuesta: ${list.map(q).join(" · ")}${after ? `; si ya las respondió todas, haz ${q(after)}` : "; si ya las respondió todas, despídete"}. Después de hablar, llama report_progress(asking=id de la que hagas${intent ? `, intent="${intent}"` : ""}).`
      : `check EVERYTHING the participant already said and SKIP every question they already answered, even in other words or in passing (e.g. to "Do you have a website?" they said "Yes, on Wix, we use it as a catalog and for WhatsApp": they already said what it's for, so do NOT ask what it does or what they use it for; go to the next one). Ask the first of these still unanswered: ${list.map(q).join(" · ")}${after ? `; if they already answered all of them, ask ${q(after)}` : "; if they already answered all of them, say goodbye"}. After speaking, call report_progress(asking=the id you ask${intent ? `, intent="${intent}"` : ""}).`;
  };

  const cur = current ? find(qs, current) : undefined;
  if (!cur) {
    const first = qs[0];
    return es
      ? `AHORA, en UN solo mensaje (nada antes: ni "empecemos" ni "vamos paso a paso"), con calma y sin apuro (nadie te interrumpe): preséntate — eres Emily, entrevistadora con IA de NEOera${d.recipientName || d.company ? `, saluda a ${d.recipientName || d.company}` : ""} —, explica en una o dos frases claras el objetivo de esta entrevista (a partir del Objetivo, en palabras simples) y que serán ${qs.length} preguntas cortas; y luego ${first ? `haz la pregunta ${q(first)}. ${report(first)}` : goodbye()}`
      : `NOW, in ONE single message (nothing before it: no "let's get started" or "step by step"), calmly and unhurried (nobody interrupts you): introduce yourself — you're Emily, an AI interviewer from NEOera${d.recipientName || d.company ? `, greet ${d.recipientName || d.company}` : ""} —, explain in one or two clear sentences the goal of this interview (from the Objective, in simple words) and that there will be ${qs.length} short questions; then ${first ? `ask question ${q(first)}. ${report(first)}` : goodbye()}`;
  }

  // A yes/no question with branches: what the answer meant decides where she goes.
  // "Would you like to have one?": a doubt counts as interest (explore it, ask by when).
  if (cur.purpose === "interest" && intent === "unclear") intent = "yes";
  if (hasBranches(cur)) {
    const after = nextOpen(cur.id);
    const branch = (b: "yes" | "no") => askNext(open(cur.branches?.[b] ?? []), after, b);
    const ack = es
      ? "en UN solo mensaje, empieza con un comentario breve (una frase corta) sobre lo que acaba de responder, relacionado con su respuesta (sin repetirla palabra por palabra, sin opinar ni aconsejar) y"
      : "in ONE single message, start with a brief comment (one short sentence) on what they just answered, related to their answer (without repeating it word for word, no opinions or advice) and";
    // Already decided by the app: only that branch exists for her.
    if (intent === "yes" || intent === "no" || (intent === "unclear" && clarified))
      return `${es ? "AHORA" : "NOW"}: ${ack} ${branch(intent === "yes" ? "yes" : "no")}`;
    if (intent === "unclear")
      return es
        ? `AHORA: la respuesta a ${q(cur)} no deja claro si sí o no. Haz UNA sola pregunta corta de aclaración (una sola pregunta, sin nada más) y llama report_progress(asking="${cur.id}", intent="unclear", done=false).`
        : `NOW: the answer to ${q(cur)} doesn't make clear whether it's yes or no. Ask ONE short clarifying question (just that one question) and call report_progress(asking="${cur.id}", intent="unclear", done=false).`;
    return es
      ? `AHORA: decide la INTENCIÓN de la respuesta a ${q(cur)} por su sentido (ver RAMAS) y empieza con un comentario breve (una frase corta) relacionado con lo que respondió.
- Si es AFIRMATIVA: ${branch("yes")}
- Si es NEGATIVA: ${branch("no")}
- ${cur.purpose === "interest" ? "Si duda o no está seguro: trátala como AFIRMATIVA (es interés)." : clarified ? "Ya pediste una aclaración: si sigue sin quedar claro, trátala como NEGATIVA." : `Si es AMBIGUA: haz UNA sola pregunta corta de aclaración y llama report_progress(asking="${cur.id}", intent="unclear", done=false).`}`
      : `NOW: decide what the answer to ${q(cur)} MEANT (see RAMAS) and start with a brief comment (one short sentence) related to what they answered.
- If AFFIRMATIVE: ${branch("yes")}
- If NEGATIVE: ${branch("no")}
- ${cur.purpose === "interest" ? "If they hesitate or aren't sure: treat it as AFFIRMATIVE (it's interest)." : clarified ? "You already asked a clarification: if it's still unclear, treat it as NEGATIVE." : `If UNCLEAR: ask ONE short clarifying question and call report_progress(asking="${cur.id}", intent="unclear", done=false).`}`;
  }

  const { rest: all, after: afterAll } = ahead(qs, cur.id);
  const rest = open(all);
  const after = afterAll && done.has(afterAll.id) ? nextOpen(afterAll.id) : afterAll;
  if (read) {
    const upcoming = rest[0] ?? after;
    const ackOnly = es
      ? "AHORA, en UN solo mensaje (nada antes ni después): empieza con un comentario breve (una frase corta) sobre lo que acaba de responder, relacionado con su respuesta (sin repetirla palabra por palabra, sin opinar ni aconsejar) y"
      : "NOW, in ONE single message (nothing before or after): start with a brief comment (one short sentence) on what they just answered, related to their answer (without repeating it word for word, no opinions or advice) and";
    // A vague answer gets one follow-up ("by when": "¿semanas o meses?"); the app only flags
    // short ones, so a full answer is never questioned again.
    if (read.vague && asked < 2)
      return cur.purpose === "timeline"
        ? es
          ? `${ackOnly} haz UNA repregunta suave sobre el plazo: "¿Más o menos en semanas o en meses?". Nada más.`
          : `${ackOnly} ask ONE gentle follow-up about the timing: "Roughly weeks or months?". Nothing else.`
        : es
          ? `${ackOnly} haz UNA repregunta breve y amable sobre ${q(cur)} para que lo concrete. Nada más.`
          : `${ackOnly} ask ONE brief, friendly follow-up about ${q(cur)} so they get specific. Nothing else.`;
    // Its own timeline question comes later in this branch: that one asks it, in order.
    if (read.wants && ![...rest, upcoming].some((x) => x?.purpose === "timeline"))
      return es
        ? `${ackOnly} pregunta para cuándo le gustaría tener ${read.wants}: "¿lo más pronto posible, en unos meses, o es algo para más adelante?". Nada más.`
        : `${ackOnly} ask by when they'd like to have ${read.wants}: "as soon as possible, in a few months, or later on?". Nothing else.`;
    if (!upcoming) return `${es ? "AHORA" : "NOW"}: ${goodbye()}`;
    return es
      ? `${ackOnly} haz EXACTAMENTE la pregunta ${q(upcoming)}, casi textual. No hagas ninguna otra.`
      : `${ackOnly} ask EXACTLY question ${q(upcoming)}, almost word for word. Ask nothing else.`;
  }
  const main = qs.some((x) => x.id === cur.id); // main questions: always the next one, in order
  const timeline = cur.purpose === "timeline";
  const followUp =
    asked < 2
      ? timeline
        ? es
          ? `Si el plazo fue vago ("pronto", "más adelante"), haz UNA repregunta suave ("¿Más o menos en semanas o en meses?", asking="${cur.id}"); si no sabe, no insistas. Si no, `
          : `If the timing was vague ("soon", "later"), ask ONE gentle follow-up ("Roughly weeks or months?", asking="${cur.id}"); if they don't know, don't push. Otherwise, `
        : es
          ? `Si la respuesta fue muy vaga o incompleta, haz UNA repregunta breve sobre ${q(cur)} (asking="${cur.id}"). Si no, `
          : `If the answer was very vague or incomplete, ask ONE brief follow-up about ${q(cur)} (asking="${cur.id}"). Otherwise, `
      : "";
  // Any question: wanting something new or an improvement always gets its "by when".
  const plazo = timeline
    ? ""
    : es
      ? `Si en su respuesta dijo que quiere algo nuevo o una mejora y no dijo para cuándo (y no viene una pregunta de plazo para eso), primero pregunta el plazo, amable y con opciones (asking="${cur.id}"). `
      : `If they said they want something new or an improvement and didn't say by when (and no timeline question for it comes next), first ask by when, warmly and with options (asking="${cur.id}"). `;
  const ack = es
    ? "empieza con un comentario breve (una frase corta) sobre lo que acaba de responder, relacionado con su respuesta (sin repetirla palabra por palabra, sin opinar ni aconsejar) y "
    : "start with a brief comment (one short sentence) on what they just answered, related to their answer (without repeating it word for word, no opinions or advice) and ";
  const nextStep = main ? askNext(rest.slice(0, 1), rest.length ? undefined : after) : askNext(rest, after);
  return `${es ? "AHORA" : "NOW"}: ${plazo}${followUp}${rest.length || after ? ack : ""}${nextStep}`;
}

// ── Voice setup (the admin configures an Emily by talking to her) ───────────────────────────────

/** The setup model calls it when the user says there's nothing more to add. */
export const SETUP_DONE_TOOL = {
  type: "function",
  name: "setup_done",
  description:
    "Call it, silently, when the user says there is nothing more to add (that's all, no, nothing else).",
  parameters: { type: "object", properties: {} },
} as const;

/**
 * Voice setup on the realtime model: Emily only talks. The fields are filled in the background by
 * fillFromSpeech from what the user says; each turn the app tells her what is already noted and
 * what's missing (setupDirective).
 */
export function setupInstructions(locale: "es" | "en") {
  const es = locale === "es";
  const lang = es ? "español latinoamericano neutro" : "clear, neutral American English";
  return `Eres Emily, entrevistadora con IA de NEOera. Ahora ayudas a una persona a CONFIGURAR, conversando por voz, una entrevista que después harás tú a otras personas.
IDIOMA (regla estricta): habla SIEMPRE y SOLO en ${lang}. Nunca cambies de idioma ni mezcles idiomas, aunque el usuario hable en otro. Conserva solo nombres propios y marcas.
VOZ: cálida, clara y calmada, a ritmo natural de conversación.
Qué reúnes, en este orden y una cosa por turno: para quién es la entrevista (nombre de la persona y/o empresa), el proyecto, el objetivo (qué quiere descubrir). Si el usuario lo menciona, también temas o preguntas concretas y hasta cuándo estará abierta.
- Otra parte del sistema llena los campos en pantalla y redacta las preguntas a partir de lo que dice el usuario: tú solo conversas. Nunca dictes ni leas preguntas largas.
- NUNCA pidas el correo: se agrega después.
- No inventes datos. Antes de pedir algo, revisa la conversación: si el usuario ya lo mencionó, aunque sea de pasada, NO lo pidas (por ejemplo, "quiero saber si tiene sitio web" ya es el objetivo).
- Cuando ya están para quién, proyecto y objetivo, di que preparas las preguntas y pregunta si quiere que Emily pregunte algo más o si eso es todo.
- Si pide más preguntas o cambios, confirma en una frase que quedan anotados y vuelve a preguntar si hay algo más.
- Cuando diga que es todo (no, nada más, eso es todo, ya está), llama setup_done sin decir nada.
ESTILO (es una llamada, no un chat):
- 1 o 2 frases cortas por turno. Nada de listas, markdown, emojis ni símbolos. No des ejemplos ni opciones al preguntar.
- Si el usuario te interrumpe o agrega algo, responde UNA sola vez integrando todo lo que dijo; no repitas un acuse que ya diste.
- Todo en UN solo mensaje: nunca digas una frase de transición o de espera (${es ? '"déjame pensar", "voy a organizarlo"' : '"let me think about how to set this up", "let me organize this"'}) antes de responder.
- No te presentes de nuevo. Sin muletillas (${es ? '"déjame revisar", "un momento", "excelente"' : '"let me check", "one moment", "great"'}).
- No repitas palabra por palabra lo que dijo: reconoce en pocas palabras, en ${lang} (${es ? '"Anotado." / "Perfecto."' : '"Got it." / "Perfect."'}) y pide lo siguiente en el MISMO turno.
- Tono profesional y sereno, sin entusiasmo de más. No des consejos ni opiniones.
- setup_done es interno: nunca lo menciones.`;
}

/** What this setup turn must do: what's noted so far (it may lag one answer) and what's missing. */
export function setupDirective(d: Draft) {
  const es = d.locale === "es";
  const who = [d.recipientName, d.company].filter(Boolean).join(" · ");
  const qs = d.questions.filter((q) => q.text.trim()).length;
  const noted = [
    who && `${es ? "para" : "for"}: ${who}`,
    d.project && `${es ? "proyecto" : "project"}: ${d.project}`,
    d.objective && `${es ? "objetivo" : "goal"}: ${d.objective}`,
    qs && `${qs} ${es ? "preguntas" : "questions"}`,
  ].filter(Boolean);
  const missing = [
    !who && (es ? "para quién es" : "who it is for"),
    !d.project.trim() && (es ? "el proyecto" : "the project"),
    d.objective.trim().length < 10 && (es ? "el objetivo" : "the goal"),
  ].filter(Boolean);
  return es
    ? `Anotado en pantalla hasta ahora (puede faltar lo último que dijo): ${noted.join("; ") || "nada"}.
AHORA: responde a lo último que dijo el usuario en 1 o 2 frases. ${
        missing.length
          ? `Pide lo siguiente que falte (${missing.join(", ")}), salvo que ya lo haya dicho en la conversación: entonces pasa a lo siguiente.`
          : "Ya está lo esencial: pregunta si quiere que Emily pregunte algo más o si eso es todo; si ya dijo que es todo, llama setup_done sin hablar."
      }`
    : `Noted on screen so far (their last answer may not be in yet): ${noted.join("; ") || "nothing"}.
NOW: answer the user's last words in 1 or 2 sentences. ${
        missing.length
          ? `Ask for the next missing item (${missing.join(", ")}), unless they already said it in the conversation: then move on.`
          : "The essentials are in: ask if they'd like Emily to ask anything else or if that's all; if they already said that's all, call setup_done without speaking."
      }`;
}
