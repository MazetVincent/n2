// Éléments d'affichage des déploiements, partagés par l'onglet Déploiements, « Ma branche » et la page Pull requests.
import { css } from "styled-system/css";
import { Badge, ExtLink, type Tone } from "~/components/ds";
import { hoursMinutes } from "~/lib/format";
import { m } from "~/lib/i18n";
import type { DeployCommit, DeployData } from "~/server/types";

/** « 7 min », « 1 h 05 » */
export function duration(ms: number): string {
  return hoursMinutes(Math.max(0, Math.round(ms / 60_000)));
}

/** Nom d'étape lisible : « Approval » → « Validation manuelle » */
export const stageLabel = (name: string) => (/approv|validation/i.test(name) ? m.deploy_manual_approval() : name.replace(/_/g, " "));

/** [libellé, ton] de l'état d'une étape ou d'une exécution CodePipeline */
export function statusBadge(status: string | null, approval = false): [string, Tone] {
  switch (status) {
    case "Succeeded":
      return [m.deploy_succeeded(), "ok"];
    case "InProgress":
      return approval ? [m.deploy_waiting(), "warn"] : [m.common_progress(), "info"];
    case "Failed":
      return [m.deploy_failed(), "bad"];
    case "Stopped":
    case "Stopping":
      return [m.deploy_stopped(), "neutral"];
    case "Superseded":
      return [m.deploy_superseded(), "neutral"];
    case "Cancelled":
      return [m.deploy_cancelled(), "neutral"];
    default:
      return ["—", "neutral"];
  }
}

/** PR et tickets d'un commit, en pastilles cliquables */
export function CommitChips({ c, links }: { c: DeployCommit; links: DeployData["links"] }) {
  return (
    <>
      {c.pr !== null && (
        <ExtLink href={`${links.pr}${c.pr}`} tone="accent" title={c.message}>
          #{c.pr}
        </ExtLink>
      )}
      {c.jira.map((k) => (
        <ExtLink key={k} href={`${links.jira}${k}`} tone="info">
          {k}
        </ExtLink>
      ))}
      {c.pr === null && c.sha && <Badge>{c.sha.slice(0, 7)}</Badge>}
    </>
  );
}

/** Message de commit sans la clé Jira ni le numéro de PR (déjà en pastilles) */
export const cleanMessage = (m: string) =>
  m
    .replace(/^\(?[A-Z][A-Z0-9]+-\d+\)?[:\s-]*/, "")
    .replace(/\s*\(#\d+\)\s*$/, "")
    .trim() || m;

export const commitLine = css({ fontSize: "md", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minW: 0 });
