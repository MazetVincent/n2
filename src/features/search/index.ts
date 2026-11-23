// Recherche globale (⌘K) : construit la liste des résultats à partir des données déjà chargées.
// Fonctions pures, testables.
import type { CodeMapData, DeployData, GuideIndex, JiraSprintData, PullRequestsData, SentryData } from "~/server/types";
import { guideTarget } from "~/features/guide/logic";
import type { QuickLink } from "~/features/links/logic";
import { getLang, m, trPart } from "~/lib/i18n";

export type SearchAction = { kind: "route"; to: string; search?: Record<string, string> } | { kind: "url"; url: string };

export interface SearchItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  /** mots cherchés sans être affichés (rubrique d'un lien, synonymes) */
  keywords?: string;
  action: SearchAction;
}

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function buildIndex(input: {
  tabs: { to: string; label: string }[];
  links?: QuickLink[];
  deploy?: DeployData;
  prs?: PullRequestsData;
  sprint?: JiraSprintData;
  sentry?: SentryData;
  map?: CodeMapData;
  guide?: GuideIndex;
}): SearchItem[] {
  const items: SearchItem[] = [];
  for (const t of input.tabs) items.push({ id: `tab:${t.to}`, group: m.search_tabs(), label: t.label, action: { kind: "route", to: t.to } });
  // Onglet caché : la galerie des composants (seulement quand on la cherche)
  items.push({ id: "page:design-system", group: m.search_tabs(), label: "Design system", keywords: m.search_components_styles_colours_buttons(), action: { kind: "route", to: "/design-system" } });
  // Onglet caché : l'état des sources de N2 (dernière lecture, durée, erreurs)
  items.push({ id: "page:sources", group: m.search_tabs(), label: m.sources_title(), keywords: m.search_sources_keywords(), action: { kind: "route", to: "/sources" } });

  // Liens rapides : config + liens déduits ; « lien » et la rubrique sont cherchables (« lien prod », « aws »)
  const linkWords = m.search_link_links_launcher();
  for (const l of input.links ?? []) {
    items.push({ id: l.id, group: l.group, label: l.label, hint: host(l.url), keywords: `${l.group} ${l.keywords ?? ""} ${linkWords}`, action: { kind: "url", url: l.url } });
  }
  // Environnements : pipeline de prod et environnements dynamiques des branches (onglet Déploiements)
  const deploy = input.deploy;
  if (deploy) {
    const envGroup = m.search_environments();
    const envWords = `${m.search_environment_env_staging()} ${linkWords}`;
    if (deploy.main) items.push({ id: `env:main`, group: envGroup, label: m.search_production_pipeline(), hint: deploy.main.name, keywords: `prod production pipeline ${envWords}`, action: { kind: "url", url: deploy.main.consoleUrl } });
    for (const e of deploy.envs) {
      // l'environnement lui-même, si son adresse est connue (deploy.envUrl)
      if (e.url) items.push({ id: `env:${e.slug}`, group: envGroup, label: m.search_environment({ slug: e.slug }), hint: host(e.url), keywords: `${e.slug} ${e.last?.message ?? ""} ${envWords}`, action: { kind: "url", url: e.url } });
      items.push({ id: `env-pipeline:${e.slug}`, group: envGroup, label: m.search_pipeline({ slug: e.slug }), hint: e.pipeline, keywords: `${e.slug} pipeline ${envWords}`, action: { kind: "url", url: e.consoleUrl } });
    }
  }

  const prs = input.prs;
  if (prs) {
    const seen = new Set<string>();
    for (const [list, why] of [
      [prs.reviewRequested, m.search_review_requested()],
      [prs.mine, m.search_my_pr()],
      [prs.approved, m.search_approved_by_me()],
      [prs.commented, m.search_commented()],
    ] as const) {
      for (const p of list) {
        if (seen.has(p.url)) continue;
        seen.add(p.url);
        items.push({ id: `pr:${p.url}`, group: "Pull requests", label: p.title, hint: `#${p.number} · ${why} · ${p.author}`, action: { kind: "url", url: p.url } });
      }
    }
  }
  for (const i of input.sprint?.issues ?? []) {
    items.push({ id: `jira:${i.key}`, group: "Sprint", label: i.summary, hint: `${i.key} · ${i.status}`, action: { kind: "url", url: i.url } });
  }
  const sentry = input.sentry;
  if (sentry) {
    const seen = new Set<string>();
    for (const i of [...sentry.fresh, ...sentry.top]) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      items.push({ id: `sentry:${i.id}`, group: m.common_sentry_errors(), label: i.title, hint: `${i.shortId} · ${i.culprit}`, action: { kind: "url", url: i.url } });
    }
  }
  const map = input.map;
  if (map) {
    for (const n of map.nodes.filter((x) => x.files > 0)) {
      items.push({ id: `node:${n.id}`, group: m.search_map_parts(), label: trPart(n.label), hint: n.path, action: { kind: "route", to: "/carte", search: { node: n.id } } });
      for (const s of n.contains) {
        items.push({ id: `sub:${n.id}:${s.name}`, group: m.search_map_subfolders(), label: `${trPart(n.label)} › ${trPart(s.name)}`, hint: s.path, action: { kind: "route", to: "/carte", search: { node: n.id, sub: s.name } } });
      }
    }
    const libs = new Set(map.nodes.flatMap((n) => n.libs.filter((l) => l.files > 0).map((l) => l.name)));
    for (const name of libs) items.push({ id: `lib:${name}`, group: m.common_libraries(), label: name, action: { kind: "route", to: "/carte", search: { lib: name } } });
    const files = new Set<string>();
    for (const f of [...map.topFiles, ...map.hotspots]) {
      if (files.has(f.file)) continue;
      files.add(f.file);
      items.push({ id: `file:${f.file}`, group: m.search_key_files(), label: f.file.split("/").slice(-2).join("/"), hint: `${f.file} · impact`, action: { kind: "route", to: "/carte", search: { file: f.file } } });
    }
  }
  // Guide de l'équipe : pages, sections et termes du glossaire (en dernier : les données du jour passent avant)
  const guide = input.guide;
  if (guide) {
    const lang = getLang();
    const other = lang === "fr" ? "en" : "fr";
    const pageTitle = new Map(guide.pages.map((p) => [p.key, p.title]));
    const group = guide.name || m.common_team_guide();
    const words = m.search_guide_doc_documentation();
    for (const p of guide.pages) {
      items.push({ id: `guide-page:${p.key}`, group, label: p.title[lang], hint: m.search_guide_page({ key: p.key }), keywords: `${p.title[other]} ${words}`, action: { kind: "route", to: "/guide", search: { p: p.key } } });
    }
    for (const sec of guide.sections) {
      if (sec.id === null) continue;
      const pt = pageTitle.get(sec.page);
      items.push({
        id: `guide:${sec.page}/${sec.id}`,
        group,
        label: sec.title[lang],
        hint: pt?.[lang] ?? sec.page,
        keywords: `${sec.title[other]} ${pt?.[other] ?? ""} ${words}`,
        action: { kind: "route", to: "/guide", search: { p: guideTarget(sec.page, sec.id) } },
      });
    }
    for (const t of guide.terms) {
      const short = t.short[lang];
      items.push({
        id: `guide-term:${t.id}`,
        group: m.search_guide_glossary(),
        label: t.term[lang],
        hint: short.length > 110 ? `${short.slice(0, 109)}…` : short,
        keywords: `${t.term[other]} ${t.id} ${m.search_glossary_definition()}`,
        action: { kind: "route", to: "/guide", search: { p: `guide/reference/glossary/${t.id}` } },
      });
    }
  }
  return items;
}

/** Tous les mots de la requête doivent apparaître (sans tenir compte des accents) ; ceux qui commencent par la requête d'abord */
export function searchIndex(items: SearchItem[], query: string, limit = 60): SearchItem[] {
  const q = norm(query.trim());
  if (!q) return items.filter((i) => i.id.startsWith("tab:") || i.id.startsWith("link:") || i.id.startsWith("pr:")).slice(0, limit);
  const words = q.split(/\s+/);
  const scored: [SearchItem, number][] = [];
  for (const it of items) {
    const label = norm(it.label);
    const hay = `${label} ${norm(it.hint ?? "")} ${norm(it.keywords ?? "")}`;
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push([it, label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2]);
  }
  return scored
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([it]) => it);
}
