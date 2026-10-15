"use client";

import { useLang } from "./i18n";
import { ArrowDown, ArrowUp, PlusIcon, XIcon } from "./icons";
import {
  MAX_BRANCH,
  MAX_DEPTH,
  questionId,
  type Branch,
  type Purpose,
  type Question,
} from "./question-tree";
import { field, IconBtn } from "./ui";

export const emptyQuestion = (): Question => ({ id: questionId(), text: "", kind: "abierta" });

/** Drops empty questions (and branches left empty) before saving. */
export function prune(qs: Question[]): Question[] {
  return qs
    .filter((q) => q.text.trim())
    .map(({ branches, ...q }) => {
      const yes = prune(branches?.yes ?? []);
      const no = prune(branches?.no ?? []);
      return yes.length || no.length
        ? { ...q, branches: { ...(yes.length && { yes }), ...(no.length && { no }) } }
        : q;
    });
}

/**
 * The questions of an Emily as an editable tree: each question can be edited, typed, moved and
 * removed; a closed (yes/no) one can branch into different questions for a yes and for a no, up
 * to MAX_DEPTH levels.
 */
export function QuestionTree({
  list,
  onChange,
  highlight = "",
  depth = 1,
}: {
  list: Question[];
  onChange: (list: Question[]) => void;
  highlight?: string;
  depth?: number;
}) {
  const { t } = useLang();
  const update = (id: string, change: (q: Question) => Question) =>
    onChange(list.map((q) => (q.id === id ? change(q) : q)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    onChange(copy);
  };
  const setBranch = (q: Question, b: Branch, qs: Question[]) =>
    update(q.id, (x) => ({ ...x, branches: { ...x.branches, [b]: qs } }));

  return (
    <ol className="space-y-2">
      {list.map((q, i) => {
        const n = depth === 1 ? `${i + 1}` : "•";
        const label = depth === 1 ? i + 1 : `${i + 1}`;
        const branched = !!q.branches;
        return (
          <li key={q.id} className="space-y-2">
            <div
              // Phones: the question gets the full width, its type and actions go below it.
              className="group grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 transition-[opacity,translate] duration-200 ease-out sm:flex starting:-translate-y-1 starting:opacity-0"
            >
              <span className="text-muted w-5 pt-2.5 text-right text-sm tabular-nums">{n}</span>
              {/* Grows with the text so long questions are read whole (field-sizing where
                  supported; rows estimate elsewhere). Enter doesn't add line breaks. */}
              <textarea
                rows={Math.max(1, Math.ceil(q.text.length / 52))}
                className={`${field} field-sizing-content min-h-[2.75rem] resize-none leading-snug ${highlight}`}
                placeholder={t.questionPh}
                aria-label={t.question(Number(label))}
                value={q.text}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                onChange={(e) =>
                  update(q.id, (x) => ({ ...x, text: e.target.value.replace(/\n/g, " ") }))
                }
              />
              <div className="col-start-2 flex flex-wrap items-center justify-between gap-2 sm:contents">
                <button
                  type="button"
                  onClick={() =>
                    // An open question can't branch: switching to it drops the branches.
                    update(q.id, (x) =>
                      x.kind === "abierta"
                        ? { ...x, kind: "cerrada" }
                        : { id: x.id, text: x.text, kind: "abierta", ...(x.purpose && { purpose: x.purpose }) },
                    )
                  }
                  aria-label={t.changeKind(Number(label), q.kind === "abierta" ? t.open : t.closed)}
                  className={`w-20 shrink-0 rounded-full px-2 py-1 text-xs font-medium transition-colors sm:mt-2 ${
                    q.kind === "abierta"
                      ? "bg-accent-soft text-accent"
                      : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  }`}
                >
                  {q.kind === "abierta" ? t.open : t.closed}
                </button>
                {q.purpose && <PurposeTag purpose={q.purpose} />}
                <span className="flex shrink-0 transition group-focus-within:opacity-100 group-hover:opacity-100 sm:mt-0.5 sm:opacity-60">
                  <IconBtn label={t.up(Number(label))} onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    label={t.down(Number(label))}
                    onClick={() => move(i, 1)}
                    disabled={i === list.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    label={t.remove(Number(label))}
                    onClick={() => onChange(list.filter((x) => x.id !== q.id))}
                  >
                    <XIcon className="h-4 w-4" />
                  </IconBtn>
                </span>
              </div>
            </div>

            {q.kind === "cerrada" && depth < MAX_DEPTH && (
              <div className="pl-7">
                <button
                  type="button"
                  title={t.branchHint}
                  className="text-muted hover:text-accent text-xs font-medium underline-offset-2 hover:underline"
                  onClick={() =>
                    update(q.id, ({ branches, ...x }) =>
                      branches ? x : { ...x, branches: { yes: [emptyQuestion()], no: [emptyQuestion()] } },
                    )
                  }
                >
                  {branched ? t.unbranch : `↳ ${t.branch}`}
                </button>
              </div>
            )}

            {branched &&
              (["yes", "no"] as const).map((b) => {
                const qs = q.branches?.[b] ?? [];
                const name = b === "yes" ? t.ifYes : t.ifNo;
                return (
                  <section
                    key={b}
                    aria-label={name}
                    className={`ml-3 space-y-2 border-l-2 pl-3 sm:ml-7 ${
                      b === "yes" ? "border-emerald-500/50" : "border-rose-500/50"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold ${
                        b === "yes"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {name}
                    </p>
                    <QuestionTree
                      list={qs}
                      onChange={(next) => setBranch(q, b, next)}
                      highlight={highlight}
                      depth={depth + 1}
                    />
                    {qs.length < MAX_BRANCH && (
                      <button
                        type="button"
                        onClick={() => setBranch(q, b, [...qs, emptyQuestion()])}
                        className="text-accent inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        <PlusIcon className="h-3.5 w-3.5" /> {t.addTo(name)}
                      </button>
                    )}
                  </section>
                );
              })}
          </li>
        );
      })}
    </ol>
  );
}

/** Read-only: a question's branches under it (review screens), recursively. */
export function BranchesView({ q }: { q: Question }) {
  const { t } = useLang();
  if (!q.branches) return null;
  return (
    <div className="basis-full space-y-2 pl-7">
      {(["yes", "no"] as const).map((b) =>
        q.branches?.[b]?.length ? (
          <div
            key={b}
            className={`space-y-1 border-l-2 pl-3 ${b === "yes" ? "border-emerald-500/50" : "border-rose-500/50"}`}
          >
            <p
              className={`text-xs font-semibold ${
                b === "yes" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
              }`}
            >
              {b === "yes" ? t.ifYes : t.ifNo}
            </p>
            <ul className="space-y-1">
              {q.branches[b]!.map((s) => (
                <li key={s.id} className="text-sm leading-relaxed break-words">
                  {s.text} {s.purpose && <PurposeTag purpose={s.purpose} />}
                  <BranchesView q={s} />
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

/** What a branch question is after (discover, interest, vision, timeline, reason). */
function PurposeTag({ purpose }: { purpose: Purpose }) {
  const { t } = useLang();
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 align-middle text-[11px] font-medium sm:mt-2.5 ${
        purpose === "timeline"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"
      }`}
    >
      {t.purpose[purpose]}
    </span>
  );
}
