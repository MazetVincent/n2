// Liens rapides du lanceur ⌘K : ceux qu'on déduit de la config (dépôts GitHub, tableau Jira, Sentry, consoles AWS)
// et ceux qu'on ajoute soi-même dans `links` (prod, staging, back-office…). Fonctions pures, testables.
import type { Config } from "~/server/config";
import { m } from "~/lib/i18n";

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  /** rubrique affichée dans ⌘K (« Prod », « AWS »…) */
  group: string;
  /** mots cherchés en plus du libellé (« bo admin ») */
  keywords?: string;
}

/** Un lien de la config : seuls les liens https sont gardés (ils s'ouvrent dans Chrome, voir server/open.ts) */
export interface LinkConfig {
  label: string;
  url: string;
  group?: string;
  keywords?: string;
}

export function isHttpsUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

/** Liens ajoutés dans la config, sans ceux qui sont mal formés */
export function customLinks(cfg: Pick<Config, "links">): LinkConfig[] {
  return (cfg.links ?? []).filter((l): l is LinkConfig => !!l && typeof l.label === "string" && l.label.trim() !== "" && isHttpsUrl(l.url));
}

export function buildQuickLinks(cfg: Pick<Config, "github" | "jira" | "sentry" | "aws" | "links">): QuickLink[] {
  const links: QuickLink[] = [];
  const add = (l: Omit<QuickLink, "id">) => links.push({ ...l, id: `link:${l.url}` });

  // d'abord les liens choisis à la main : ce sont les plus utiles (prod, staging, back-office)
  for (const l of customLinks(cfg)) add({ label: l.label.trim(), url: l.url, group: l.group?.trim() || m.links_links(), keywords: l.keywords });

  for (const repo of cfg.github?.repos ?? []) {
    add({ label: repo, url: `https://github.com/${repo}`, group: "GitHub", keywords: m.links_repository_code() });
    add({ label: m.links_open_pull_requests({ repo }), url: `https://github.com/${repo}/pulls`, group: "GitHub", keywords: "pr" });
    add({ label: `${repo} · actions`, url: `https://github.com/${repo}/actions`, group: "GitHub", keywords: "ci workflows" });
  }

  const jira = cfg.jira;
  if (jira?.site && jira.projectKey) {
    add({ label: m.links_jira_board({ projectKey: jira.projectKey }), url: `https://${jira.site}/jira/software/projects/${jira.projectKey}/boards/${jira.boardId}`, group: "Jira", keywords: "sprint board" });
    add({ label: `Backlog ${jira.projectKey}`, url: `https://${jira.site}/jira/software/projects/${jira.projectKey}/boards/${jira.boardId}/backlog`, group: "Jira", keywords: "sprint" });
  }

  const sentry = cfg.sentry;
  if (sentry?.org && sentry.project) {
    add({ label: `Sentry · ${sentry.project}`, url: `https://${sentry.org}.sentry.io/projects/${sentry.project}/`, group: "Sentry", keywords: m.links_errors() });
  }

  const region = cfg.aws?.region;
  if (region && /^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) {
    const awsConsole = (service: string, hash = "") => `https://${region}.console.aws.amazon.com/${service}/home?region=${region}${hash}`;
    add({ label: m.links_cloudwatch_alarms(), url: awsConsole("cloudwatch", "#alarmsV2:"), group: "AWS", keywords: "alarm monitoring" });
    add({ label: m.links_cloudwatch_dashboards(), url: awsConsole("cloudwatch", "#dashboards:"), group: "AWS", keywords: "dashboard monitoring" });
    add({ label: m.links_cloudwatch_logs(), url: awsConsole("cloudwatch", "#logsV2:log-groups"), group: "AWS", keywords: "logs" });
    add({ label: "CodePipeline", url: `https://${region}.console.aws.amazon.com/codesuite/codepipeline/pipelines?region=${region}`, group: "AWS", keywords: m.links_pipelines_deployments() });
  }
  return links;
}
