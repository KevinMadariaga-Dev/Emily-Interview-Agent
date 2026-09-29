import Link from "next/link";
import { requireAdmin } from "@/features/admin/auth";
import { interviewRepository } from "@/server/repositories/interview.repository";

export const metadata = { title: "Sessions" };

/** Admin dashboard: latest interview sessions and their pipeline status. */
export default async function AdminHome() {
  await requireAdmin();
  const rows = await interviewRepository.listRecentSessions();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Interview sessions</h1>
      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="py-2">Participant</th>
            <th>Template</th>
            <th>Status</th>
            <th>Lang</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ session, template }) => (
            <tr key={session.id} className="border-border border-t">
              <td className="py-2">
                <Link className="underline" href={`/admin/sessions/${session.id}`}>
                  {session.participantName ?? "Anonymous"}
                </Link>
              </td>
              <td>{template.name}</td>
              <td>{session.status}</td>
              <td>{session.locale.toUpperCase()}</td>
              <td>{session.createdAt.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="text-muted py-6">
                No sessions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
