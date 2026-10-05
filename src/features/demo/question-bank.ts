// Example questions per interview type, used by "Generar preguntas con IA".
// ponytail: static bank; replace with an LLM call that receives { type, name, objective }.

export type InterviewType = {
  id: string;
  label: string;
  icon: string;
  desc: string;
  questions: string[];
};

export const interviewTypes: InterviewType[] = [
  {
    id: "entrevista",
    label: "Entrevista",
    icon: "🎙",
    desc: "Conversación abierta para descubrir problemas y hábitos.",
    questions: [
      "Cuéntame un poco sobre ti y tu rol actual.",
      "¿Cómo resuelves hoy este tema en tu día a día?",
      "¿Cuál fue la última vez que esto te generó un problema? ¿Qué pasó?",
      "¿Qué has intentado para solucionarlo y por qué no funcionó?",
      "Si tuvieras una varita mágica, ¿qué cambiarías?",
    ],
  },
  {
    id: "cuestionario",
    label: "Cuestionario",
    icon: "📋",
    desc: "Preguntas cortas y concretas, fáciles de comparar.",
    questions: [
      "Del 1 al 10, ¿qué tan satisfecho estás con tu solución actual?",
      "¿Con qué frecuencia enfrentas este problema: diario, semanal o mensual?",
      "¿Cuántas personas en tu equipo están involucradas en este proceso?",
      "¿Qué herramienta usas hoy para esto?",
      "¿Recomendarías tu solución actual a un colega? ¿Por qué?",
    ],
  },
  {
    id: "negocio",
    label: "Negocio",
    icon: "💼",
    desc: "Entender procesos, presupuesto y quién decide la compra.",
    questions: [
      "¿Cómo funciona hoy este proceso dentro de tu empresa?",
      "¿Cuánto tiempo o dinero les cuesta al mes?",
      "¿Quién toma la decisión cuando contratan una herramienta nueva?",
      "¿Tienen presupuesto asignado para resolver esto?",
      "¿Qué tendría que pasar para que lo resolvieran en los próximos 3 meses?",
    ],
  },
  {
    id: "producto",
    label: "Validar producto",
    icon: "🧪",
    desc: "Probar si una idea o función resuelve un dolor real.",
    questions: [
      "¿Qué te parece la idea que acabamos de describir?",
      "¿En qué situación concreta la usarías?",
      "¿Qué te haría dudar antes de usarla?",
      "¿Cuánto estarías dispuesto a pagar por algo así?",
      "¿Qué le falta para que la uses desde mañana?",
    ],
  },
  {
    id: "satisfaccion",
    label: "Satisfacción",
    icon: "⭐",
    desc: "Medir experiencia de clientes actuales.",
    questions: [
      "¿Cómo ha sido tu experiencia con nosotros hasta ahora?",
      "¿Qué es lo que más valoras del servicio?",
      "¿Hubo algún momento en que algo no salió como esperabas?",
      "¿Qué mejorarías primero?",
      "Del 0 al 10, ¿qué tan probable es que nos recomiendes?",
    ],
  },
  {
    id: "mercado",
    label: "Investigación de mercado",
    icon: "📊",
    desc: "Conocer competencia, alternativas y tendencias.",
    questions: [
      "¿Qué alternativas conoces para resolver esto?",
      "¿Por qué elegiste la que usas hoy?",
      "¿Qué es lo que más te molesta de las opciones disponibles?",
      "¿Dónde te informas cuando buscas una solución nueva?",
      "¿Cómo imaginas que se resolverá esto en un par de años?",
    ],
  },
];
