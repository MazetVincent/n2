// « Ma branche » vue depuis les autres onglets : PR et tickets Jira de la branche choisie dans le sélecteur
// (?branche=, gardé sur tous les onglets ; la branche actuelle du projet par défaut).
// Partagé par Dashboard › Ma branche et par le filtre « Ma branche » (interrupteur de la barre du haut).
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { fromOpenPr } from "~/features/prs/status";
import { ok, useBranch, useOpenPrs, usePullRequests } from "~/lib/data";
import { m } from "~/lib/i18n";
import type { BranchData, PullRequest } from "~/server/types";
import { setBranchFilter } from "./filter";
import { prsOfBranch } from "./logic";

export interface BranchScope {
  /** branche résolue par le serveur (undefined tant qu'elle charge ou si elle est introuvable) */
  branch: BranchData | undefined;
  /** PR de la branche : les ouvertes d'abord, puis les plus récentes */
  prs: PullRequest[];
  /** tickets Jira cités dans le nom de la branche ou dans ses PR */
  jira: { key: string; url: string }[];
  loading: boolean;
  /** la branche n'a pas pu être lue (dépôt absent, branche inconnue…) */
  failed: boolean;
}

/** PR et tickets Jira de la branche `branche` (undefined : la branche actuelle). `enabled` : sans requête quand le filtre est coupé */
export function useBranchScope(branche: string | undefined, enabled = true): BranchScope {
  const branchQ = useBranch(branche, enabled);
  const mineQ = usePullRequests();
  const openQ = useOpenPrs(enabled);
  const branch = ok(branchQ);
  const mine = ok(mineQ);
  const open = ok(openQ);
  // les listes de la page Pull requests d'abord (elles portent ma revue et les tickets Jira), puis toutes les PR ouvertes
  const prs = branch ? prsOfBranch(branch.branch, [mine?.mine, mine?.reviewRequested, mine?.approved, mine?.commented, open?.map(fromOpenPr)]) : [];
  const jira = branch ? [...new Map([...branch.jira, ...prs.flatMap((p) => p.jira)].map((j) => [j.key, j])).values()] : [];
  const loading = branchQ.isPending || (!prs.length && (mineQ.isPending || openQ.isPending));
  return { branch, prs, jira, loading, failed: !!branchQ.data && !branchQ.data.ok };
}

/** Bandeau du filtre « Ma branche » (interrupteur de la barre du haut) : la branche, un résumé et de quoi revenir à tout */
export function BranchFilterBar({ branch, children }: { branch: string | undefined; children?: ReactNode }) {
  return (
    <div className={css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2", mt: "3", px: "3", py: "2", borderRadius: "lg", bg: "accent.soft", fontSize: "md" })}>
      <span>{m.branches_filtered()}</span>
      <strong className={css({ fontFamily: "mono", fontSize: "sm", overflow: "hidden", textOverflow: "ellipsis", maxW: "40ch" })}>{branch ?? "…"}</strong>
      {children}
      <button
        type="button"
        onClick={() => setBranchFilter(false)}
        className={css({ ml: "auto", bg: "transparent", border: "none", p: 0, cursor: "pointer", color: "accent", fontSize: "sm", fontWeight: "semibold", _hover: { textDecoration: "underline" } })}
      >
        {m.branches_show_all()}
      </button>
    </div>
  );
}

/** Liens de Dashboard › Ma branche vers les onglets : ils allument le filtre « Ma branche » */
export function BranchTabLink({ to, children }: { to: "/pull-requests" | "/sprint" | "/carte"; children: ReactNode }) {
  return (
    <Link to={to} onClick={() => setBranchFilter(true)} className={css({ ml: "auto", textTransform: "none", letterSpacing: "normal", fontWeight: "semibold" })}>
      {children}
    </Link>
  );
}
