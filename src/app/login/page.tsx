import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { login } from "@/features/admin/actions";
import { EmilyOrb } from "@/features/demo/emily-orb";

export const metadata: Metadata = { title: "Iniciar sesión", robots: { index: false } };

const input =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-2 focus:outline-accent";

/** TODO(auth): swap the test user for magic-link auth (Better Auth + Resend). */
export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <EmilyOrb speaking={false} />
          <h1 className="mt-4 text-xl font-semibold">Emily · NEOera</h1>
          <p className="text-muted text-sm">Inicia sesión para gestionar tus entrevistas</p>
        </div>

        <form action={login} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Usuario</span>
            <input name="username" required autoComplete="username" autoFocus className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Contraseña</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={input}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Usuario o contraseña incorrectos.
            </p>
          )}
          <Button className="w-full py-2.5">Entrar</Button>
        </form>

        <p className="text-muted border-border rounded-md border border-dashed p-2 text-center text-xs">
          Usuario de prueba: <code>user</code> · Contraseña: <code>user</code>
        </p>
      </Card>
    </main>
  );
}
