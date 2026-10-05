import type { Metadata } from "next";
import { SettingsForm } from "@/features/admin/settings-form";

export const metadata: Metadata = { title: "Configuración" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-muted text-sm">Ajustes generales de tu espacio en Emily.</p>
      </header>
      <SettingsForm />
    </div>
  );
}
