// Liens croisés entre sections : ticket Jira ↔ PR.
import { css } from "styled-system/css";
import { m } from "~/lib/i18n";
import type { JiraIssue, PullRequest } from "~/server/types";
import { ExtLink, type Tone } from "./ds";

const CI: Record<string, [string, Tone]> = { SUCCESS: ["✓", "ok"], FAILURE: ["✗", "bad"], ERROR: ["✗", "bad"], PENDING: ["…", "warn"], EXPECTED: ["…", "warn"] };
export const statusTone = (cat: JiraIssue["category"]): Tone => ({ new: "neutral", indeterminate: "info", done: "ok" } as const)[cat] ?? "neutral";

/** Les tickets Jira cités par une PR, avec leur statut s'ils sont dans le sprint */
export function JiraChips({ pr, issues }: { pr: PullRequest; issues: Map<string, JiraIssue> }) {
  return (
    <>
      {pr.jira.map((j) => {
        const issue = issues.get(j.key);
        return (
          <ExtLink key={j.key} href={j.url} tone={issue ? statusTone(issue.category) : "info"} title={issue ? `${issue.key} : ${issue.status}` : m.links_ticket_outside_current_sprint()}>
            {j.key}
            {issue && <span className={css({ fontWeight: "normal", opacity: 0.85 })}>· {issue.status}</span>}
          </ExtLink>
        );
      })}
    </>
  );
}

/** Les PR qui citent un ticket, avec l'état de leur CI */
export function PrChips({ prs }: { prs: PullRequest[] }) {
  return (
    <>
      {prs.map((p) => {
        const [ci, tone] = p.state === "MERGED" ? [m.common_merged(), "accent" as Tone] : p.state === "CLOSED" ? [m.links_closed(), "neutral" as Tone] : (CI[p.ci ?? ""] ?? ["", "neutral" as Tone]);
        return (
          <ExtLink key={p.url} href={p.url} tone={tone} title={p.title}>
            #{p.number}
            {ci && ` ${ci}`}
          </ExtLink>
        );
      })}
    </>
  );
}
