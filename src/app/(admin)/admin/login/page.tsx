import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { devLogin } from "@/features/admin/actions";

export const metadata = { title: "Admin login" };

/** TODO(auth): replace the dev form with a magic-link form (Better Auth + Resend). */
export default async function LoginPage(props: PageProps<"/admin/login">) {
  const { error } = await props.searchParams;
  return (
    <Card className="mx-auto mt-20 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="text-muted text-sm">Development login — allow-listed emails only.</p>
      <form action={devLogin} className="space-y-3">
        <input
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          className="border-border bg-card w-full rounded-md border px-3 py-2 text-sm"
        />
        <Button className="w-full">Continue</Button>
      </form>
      {error && <p className="text-sm text-red-600">Not allowed.</p>}
    </Card>
  );
}
