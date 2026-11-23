// PR ouvertes qui mettent à jour une librairie : un lien par PR, avec la version visée quand on la connaît.
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { css, cx } from "styled-system/css";
import { Badge, badge } from "~/components/ds";
import { prStatusBadges } from "~/features/prs/status";
import { useOpenPrs } from "~/lib/data";
import { m } from "~/lib/i18n";
import { updateKind } from "~/lib/semver";
import { updatePrsFor, type UpdatePr } from "~/lib/update-prs";

/** `prsFor(nom)` : PR ouvertes qui mettent à jour cette librairie ([] tant que les PR ne sont pas lues) */
export function useUpdatePrs() {
  const q = useOpenPrs();
  const prs = q.data?.ok ? q.data.data : undefined;
  const prsFor = useMemo(() => {
    const memo = new Map<string, UpdatePr[]>();
    return (name: string): UpdatePr[] => {
      if (!prs) return [];
      if (!memo.has(name)) memo.set(name, updatePrsFor(name, prs));
      return memo.get(name)!;
    };
  }, [prs]);
  return { query: q, prsFor, ready: Boolean(prs) };
}

// Renovate, Dependabot, « robot » pour un robot maison ; le nom complet reste dans l'infobulle
const who = (pr: UpdatePr) => {
  if (!pr.bot) return pr.author;
  const known = pr.author.match(/^(renovate|dependabot)/i)?.[1];
  return known ? known[0].toUpperCase() + known.slice(1).toLowerCase() : m.libs_bot();
};

export const prTitle = (pr: UpdatePr) =>
  `#${pr.number} ${pr.title} — ${pr.author}${pr.isDraft ? m.libs_draft() : ""}${pr.to ? `\n${m.libs_target_version()} : ${pr.to}` : ""}`;

/** La PR vise-t-elle une version déjà installée ? (PR périmée, ou mise à jour faite ailleurs) */
export const alreadyInstalled = (pr: UpdatePr, installed: string | null | undefined) => Boolean(installed && pr.to && updateKind(installed, pr.to) === "none");

/**
 * Lien vers une PR de mise à jour : « PR #123 → 19.1.0 », qui ouvre la page Pull requests filtrée sur cette PR.
 * Grisé si brouillon, ou si la version visée est déjà installée. `status` : badges d'état dessous (CI, revue, conflits).
 */
export function UpdatePrLink({ pr, lib, installed, compact = false, status = false }: { pr: UpdatePr; lib: string; installed?: string | null; compact?: boolean; status?: boolean }) {
  const done = alreadyInstalled(pr, installed);
  const link = (
    <Link
      to="/pull-requests"
      search={{ pr: pr.number, repo: pr.repo, lib }}
      title={`${prTitle(pr)}${done ? m.libs_already_installed({ installed: installed ?? "" }) : ""}\n${m.libs_view_pull_requests()}`}
      className={cx(badge({ tone: pr.isDraft || done ? "neutral" : "accent" }), css({ textDecoration: "none", _hover: { borderColor: "currentColor" } }))}
    >
      {[compact ? "PR" : `PR #${pr.number}`, pr.to && `→ ${pr.to}`, !compact && pr.bot && `· ${who(pr)}`].filter(Boolean).join(" ")}
    </Link>
  );
  if (!status) return link;
  const badges = prStatusBadges(pr);
  return (
    <div className={css({ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1", mb: "1.5" })}>
      {link}
      {badges.length > 0 && (
        <div className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}>
          {badges.map(([label, tone]) => (
            <Badge key={label} tone={tone}>
              {label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
