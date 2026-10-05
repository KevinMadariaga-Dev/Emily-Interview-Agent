"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/features/demo/emily-orb";
import { DOMAIN } from "@/features/demo/mock";

// ponytail: form state is local only; persist to a `settings` table + env-backed secrets when integrating.

const input =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-2 focus:outline-accent";

const integrations = [
  { name: "Deepgram", role: "Voz (STT + TTS)", env: "DEEPGRAM_API_KEY", connected: false },
  { name: "OpenAI", role: "Resumen con IA", env: "OPENAI_API_KEY", connected: false },
  { name: "Resend", role: "Envío de emails", env: "RESEND_API_KEY", connected: false },
  { name: "Notion", role: "Guardar resúmenes", env: "NOTION_API_KEY", connected: false },
];

const team = [
  { name: "Carlos Noriega", email: "carlos@neoera.com", role: "Admin" },
  { name: "Kevin Madariaga", email: "kevin@neoera.com", role: "Admin" },
];

/** Global settings: organization, defaults for new Emilys, integrations, team, account. */
export function SettingsForm() {
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="space-y-6"
      onChange={() => setSaved(false)}
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(true);
      }}
    >
      <Section title="Organización" desc="Datos que ven los participantes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la empresa">
            <input className={input} defaultValue="NEOera Systems" />
          </Field>
          <Field label="Dominio de entrevistas" hint="Los links se crean como dominio/slug">
            <input className={`${input} font-mono`} defaultValue={DOMAIN} />
          </Field>
          <Field label="Color de marca">
            <input type="color" defaultValue="#6d28d9" className="h-10 w-full rounded-md" />
          </Field>
          <Field label="Aviso de privacidad (URL)">
            <input className={input} placeholder="https://neoera.com/privacidad" />
          </Field>
        </div>
      </Section>

      <Section
        title="Valores por defecto"
        desc="Se aplican a cada nueva Emily; puedes cambiarlos en cada una."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Idioma">
            <select className={input} defaultValue="es">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Voz">
            <select className={input}>
              <option>Emily (femenina, cálida)</option>
              <option>Sofía (femenina, profesional)</option>
              <option>Mateo (masculina, neutral)</option>
            </select>
          </Field>
          <Field label="Tono">
            <select className={input}>
              <option>Cercano</option>
              <option>Profesional</option>
              <option>Neutral</option>
            </select>
          </Field>
          <Field label="Duración máx. (min)">
            <input type="number" min={3} max={60} defaultValue={15} className={input} />
          </Field>
        </div>
        <Field label="Texto de consentimiento">
          <textarea
            className={input}
            rows={2}
            defaultValue="Acepto que esta conversación se grabe y transcriba para fines de investigación."
          />
        </Field>
      </Section>

      <Section title="Reportes" desc="A dónde llega el resumen de cada entrevista.">
        <Field label="Emails de reporte" hint="Separados por coma">
          <input className={input} defaultValue="carlos@neoera.com" />
        </Field>
        <Check label="Enviar email al completar cada entrevista" defaultChecked />
        <Check label="Resumen semanal con todas las entrevistas" />
        <Check label="Guardar cada resumen en Notion" defaultChecked />
      </Section>

      <Section title="Integraciones" desc="Claves de los servicios externos. Se guardan cifradas.">
        <ul className="divide-border divide-y">
          {integrations.map((i) => (
            <li key={i.name} className="grid items-center gap-3 py-3 sm:grid-cols-[10rem_1fr_auto]">
              <div>
                <p className="text-sm font-medium">{i.name}</p>
                <p className="text-muted text-xs">{i.role}</p>
              </div>
              <input
                type="password"
                className={`${input} font-mono`}
                placeholder={i.env}
                aria-label={`${i.name} API key`}
                autoComplete="off"
              />
              <Badge
                className={
                  i.connected
                    ? "bg-green-500/15 text-green-700 dark:text-green-400"
                    : "text-muted bg-stone-500/15"
                }
              >
                {i.connected ? "Conectado" : "Sin conectar"}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Equipo" desc="Personas con acceso al panel.">
        <ul className="divide-border divide-y">
          {team.map((m) => (
            <li key={m.email} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-muted text-xs">{m.email}</p>
              </div>
              <Badge className="bg-accent/10 text-accent">{m.role}</Badge>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className={input}
            type="email"
            placeholder="email@empresa.com"
            aria-label="Invitar por email"
          />
          <Button type="button" variant="secondary">
            Invitar
          </Button>
        </div>
      </Section>

      <Section title="Cuenta" desc="Tu usuario de acceso.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Usuario">
            <input className={input} defaultValue="user" disabled />
          </Field>
          <Field label="Nueva contraseña">
            <input className={input} type="password" autoComplete="new-password" />
          </Field>
          <Field label="Repetir contraseña">
            <input className={input} type="password" autoComplete="new-password" />
          </Field>
        </div>
      </Section>

      <div className="bg-background/90 sticky bottom-0 flex items-center justify-end gap-3 py-4 backdrop-blur">
        {saved && (
          <span role="status" className="text-sm text-green-600 dark:text-green-400">
            ✓ Cambios guardados
          </span>
        )}
        <Button>Guardar cambios</Button>
      </div>
    </form>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted mt-1 text-sm">{desc}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted block text-xs">{hint}</span>}
    </label>
  );
}

function Check({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <input type="checkbox" role="switch" defaultChecked={defaultChecked} className="h-4 w-4" />
    </label>
  );
}
