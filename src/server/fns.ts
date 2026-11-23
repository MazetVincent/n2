// Fonctions serveur appelées par l'interface (TanStack Start).
// Tout ce qui touche aux CLI, aux fichiers et aux tokens reste ici, côté serveur.
// Chaque entrée est validée (zod) ; les requêtes passent par les middlewares de src/start.ts (hôte + CSRF).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadConfig, ROOT } from "./config.ts";
import { isAllowedUrl, openInChrome, openInIde } from "./open.ts";
import { cached, forget, run, sourceStats, STARTED_AT } from "./run.ts";
import { readAwsSession, readBranch, readCi, readCloudWatch, readDeploy, readLibs, readPullRequests, readSentry, readSprint } from "./sources.ts";
import type { SourceStatus } from "./types.ts";
import { isValidBranchName } from "../features/branches/logic.ts";
import { reconnectAws as runReconnectAws } from "./sources/aws-reconnect.ts";
import { fetchRemoteBranches, listBranches } from "./sources/branches.ts";
import { fetchCalendar } from "./sources/calendar.ts";
import { githubBranch } from "../features/branches/logic.ts";
import { fetchAlarmCharts } from "./sources/cloudwatch.ts";
import { listLogQueries, runLogQuery as runSavedLogQuery } from "./sources/logs.ts";
import { codeExamples, fetchCodeMap, impactOf, resolveProjectFile } from "./sources/codemap.ts";
import { libDetails } from "./sources/lib-details.ts";
import { fetchOpenPrs } from "./sources/github.ts";
import { fetchWorkspaceLibs, libOverview } from "./sources/libs.ts";
import { logoutMicrosoft, microsoftLoginState, startMicrosoftLogin as runMicrosoftLogin } from "./sources/microsoft-auth.ts";
import { sentryFrames } from "./sources/sentry.ts";
import { fetchSlack } from "./sources/slack.ts";
import { fetchGuide, guideFreshness } from "./sources/guide.ts";
import { docIndex } from "./sources/docs.ts";
import { getPrefs, recordSecret, savePrefs } from "./sources/prefs.ts";
import { CHOOSABLE_TABS, EDITORS, editorName } from "../features/prefs/logic.ts";
import { libMentions, searchDocs as findDocs } from "../features/docs/logic.ts";
import { fetchActivity } from "./sources/activity.ts";
import { fetchStats } from "./sources/stats.ts";
import { buildQuickLinks } from "../features/links/logic.ts";
import { msg } from "./messages.ts";
import { MessageError, redact } from "./run.ts";

const MIN = 60_000;

// IMPORTANT : chaque fonction serveur est déclarée à plat, avec tout son code DANS .handler(...).
// C'est ce qui permet au compilateur de TanStack Start de retirer ce code (et ses imports node:*) du navigateur.
const refresh = z.object({ force: z.boolean().optional() }).optional();

// ---------- Sources du tableau de bord ----------
export const getPullRequests = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => readPullRequests(data?.force ?? false));

// PR ouvertes des dépôts suivis : l'onglet Librairies y cherche les mises à jour en cours
export const getOpenPrs = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("open-prs", 5 * MIN, data?.force ?? false, () => fetchOpenPrs(loadConfig())));

export const getSprint = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => readSprint(data?.force ?? false));

export const getLibs = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => readLibs(data?.force ?? false));

export const getWorkspaceLibs = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("workspace-libs", 6 * 60 * MIN, data?.force ?? false, () => fetchWorkspaceLibs(loadConfig())));

// env : environnement choisi dans Observabilité (« » = tous) ; absent = sentry.environment de la config (« À faire »…)
const sentryEnv = z.string().regex(/^[\w.-]{0,64}$/);
export const getSentry = createServerFn({ method: "GET" })
  .validator(z.object({ force: z.boolean().optional(), env: sentryEnv.optional() }).optional())
  .handler(({ data }) => readSentry(data?.force ?? false, data?.env === undefined ? undefined : data.env || null));

export const getCloudWatch = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => readCloudWatch(data?.force ?? false));

// Logs Insights : requêtes enregistrées par l'équipe (liste gardée 10 min) ; lancement à la demande seulement
// (POST : jamais relancé tout seul par un rafraîchissement ; un double clic dans la minute réutilise le résultat)
export const getLogQueries = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("log-queries", 10 * MIN, data?.force ?? false, () => listLogQueries(loadConfig())));

export const runLogQuery = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().regex(/^[\w-]{1,64}$/), window: z.enum(["1h", "24h"]) }))
  .handler(({ data }) => cached(`log-query:${data.id}:${data.window}`, 1 * MIN, false, () => runSavedLogQuery(loadConfig(), data.id, data.window)));

// Courbes des alarmes sur 24 h (onglet CloudWatch seulement : un appel GetMetricData, gardé 5 min)
export const getAlarmCharts = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("alarm-charts", 5 * MIN, data?.force ?? false, () => fetchAlarmCharts(loadConfig())));

export const getCalendar = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("calendar", 5 * MIN, data?.force ?? false, () => fetchCalendar(loadConfig())));

export const getSlack = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("slack", 2 * MIN, data?.force ?? false, () => fetchSlack(loadConfig())));

// Mentions, commentaires et réponses attendues sur GitHub et Jira (complément de Slack)
export const getActivity = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("activity", 2 * MIN, data?.force ?? false, () => fetchActivity(loadConfig())));

// Statistiques de la semaine (PR : revue, fusion ; Sentry : erreurs) : des tendances, relues toutes les 15 min
export const getStats = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("stats", 15 * MIN, data?.force ?? false, () => fetchStats(loadConfig())));

export const getDeploy = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => readDeploy(data?.force ?? false));

export const getCodeMap = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("codemap", 5 * MIN, data?.force ?? false, () => fetchCodeMap(loadConfig())));

// ?branche=… : le nom reçu de la page est validé strictement, puis doit exister dans le dépôt (voir branchTarget)
const branchName = z.string().max(200).refine(isValidBranchName, "Nom de branche invalide");

// CI GitHub de la branche principale et de « ma branche » (nom local ou distant : on garde le nom sur GitHub)
export const getCi = createServerFn({ method: "GET" })
  .validator(z.object({ force: z.boolean().optional(), branch: branchName.optional() }).optional())
  .handler(({ data }) => {
    const branch = data?.branch ? githubBranch(data.branch) : undefined;
    return readCi(data?.force ?? false, branch);
  });


export const getBranch = createServerFn({ method: "GET" })
  .validator(z.object({ force: z.boolean().optional(), branch: branchName.optional() }).optional())
  .handler(({ data }) => readBranch(data?.force ?? false, data?.branch));

// Branches du projet pour le sélecteur « Ma branche » (refs déjà connues, sans réseau)
export const getBranches = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("branches", 1 * MIN, data?.force ?? false, () => listBranches(loadConfig())));

// Guide de l'équipe : index des sections et des fichiers cités (relu seulement quand le fichier change)
export const getGuide = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("guide", 1 * MIN, data?.force ?? false, () => fetchGuide(loadConfig())));

// Passages de code cités par le guide qui ont changé depuis sa révision (git, sans réseau)
export const getGuideFreshness = createServerFn({ method: "GET" })
  .validator(refresh)
  .handler(({ data }) => cached("guide-freshness", 10 * MIN, data?.force ?? false, () => guideFreshness(loadConfig())));

// Documentation du projet (README + guide) : recherche de la carte et passages qui citent une librairie.
// L'index reste sur le serveur ; il est reconstruit au plus toutes les 5 minutes.
const lang = z.enum(["fr", "en"]);

export const searchDocs = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().max(200), lang }))
  .handler(async ({ data }) => {
    const idx = await cached("docs", 5 * MIN, false, () => docIndex(loadConfig()));
    return idx.ok ? { ...idx, data: findDocs(idx.data, data.q, data.lang) } : idx;
  });

export const getDocMentions = createServerFn({ method: "GET" })
  .validator(z.object({ lib: z.string().max(214), lang }))
  .handler(async ({ data }) => {
    const idx = await cached("docs", 5 * MIN, false, () => docIndex(loadConfig()));
    return idx.ok ? { ...idx, data: libMentions(idx.data, data.lib, data.lang) } : idx;
  });

// Texte complet d'un passage (README choisi dans la recherche de la carte)
export const getDocPassage = createServerFn({ method: "GET" })
  .validator(z.object({ key: z.string().max(1200), lang }))
  .handler(async ({ data }) => {
    const idx = await cached("docs", 5 * MIN, false, () => docIndex(loadConfig()));
    if (!idx.ok) return idx;
    const p = idx.data.passages.find((x) => x.key === data.key);
    return { ...idx, data: p ? (p.text[data.lang] || p.text.fr) : null };
  });

export const getAwsSession = createServerFn({ method: "GET" }).handler(() => readAwsSession());

// Liens rapides de ⌘K (config + liens déduits de GitHub, Jira, Sentry, AWS) : rien de secret, la config ne change qu'au redémarrage
export const getQuickLinks = createServerFn({ method: "GET" }).handler(() => buildQuickLinks(loadConfig()));

// ---------- Carte : détails à la demande ----------
export const getExamples = createServerFn({ method: "GET" })
  .validator(z.object({ node: z.string().max(512), lib: z.string().max(214), tests: z.boolean() }))
  .handler(async ({ data }) => {
    const map = await cached("codemap", 5 * MIN, false, () => fetchCodeMap(loadConfig()));
    if (!map.ok) return map;
    return cached(`ex:${data.node}:${data.lib}:${data.tests}`, 5 * MIN, false, async () => codeExamples(loadConfig(), data.node, data.lib, data.tests));
  });

export const getLibDetails = createServerFn({ method: "GET" })
  .validator(z.object({ name: z.string().max(214) }))
  .handler(({ data }) => cached(`lib:${data.name}`, 60 * MIN, false, () => libDetails(loadConfig(), data.name)));

export const getLibOverview = createServerFn({ method: "GET" })
  .validator(z.object({ name: z.string().max(214) }))
  .handler(({ data }) => cached(`lib-overview:${data.name}`, 60 * MIN, false, () => libOverview(loadConfig(), data.name)));

export const getImpact = createServerFn({ method: "GET" })
  .validator(z.object({ file: z.string().max(1024) }))
  .handler(({ data }) => cached(`impact:${data.file}`, 5 * MIN, false, () => impactOf(loadConfig(), data.file)));

export const getSentryFrames = createServerFn({ method: "GET" })
  .validator(z.object({ issueId: z.string().regex(/^\d{1,20}$/), env: sentryEnv.optional() }))
  .handler(({ data }) => cached(`frames:${data.issueId}:${data.env ?? ""}`, 10 * MIN, false, () => sentryFrames(loadConfig(), data.issueId, data.env || null)));

// Mode de N2 vu par la page : démo (données inventées, N2_DEMO=1) ou non
export const getAppInfo = createServerFn({ method: "GET" }).handler(async () => ({ demo: process.env.N2_DEMO === "1" }));

// ---------- État des sources (observabilité de N2 lui-même) ----------
let n2Commit: Promise<string | null> | null = null;
export const getSourceStatus = createServerFn({ method: "GET" }).handler(async (): Promise<SourceStatus> => {
  // commit de N2 lu une fois (la page se rafraîchit souvent)
  n2Commit ??= run("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], 5_000).then((s) => s.trim() || null, () => null);
  return { startedAt: STARTED_AT, mode: import.meta.env.DEV ? "dev" : "production", commit: await n2Commit, sources: sourceStats() };
});

// ---------- Actions ----------
// git fetch à la demande depuis le sélecteur de branche : met à jour les branches distantes connues
export const fetchBranches = createServerFn({ method: "POST" }).handler(() => cached("branches", 1 * MIN, true, () => fetchRemoteBranches(loadConfig())));

// Reconnexion AWS (clic sur « AWS expirée ») : la commande vient de config.local.json, aucun paramètre n'est reçu
export const reconnectAws = createServerFn({ method: "POST" }).handler(() => runReconnectAws(loadConfig()));

// Connexion à Microsoft Graph (agenda) : la page affiche le code, puis interroge l'état jusqu'à la validation.
// Rien n'est reçu de la page : l'app Entra vient de config.local.json, les jetons restent côté serveur.
export const startMicrosoftLogin = createServerFn({ method: "POST" }).handler(async () => {
  const graph = loadConfig().calendar?.graph;
  if (!graph) return { state: "error" as const, error: msg("srv_graph_missing") };
  return runMicrosoftLogin(graph, () => forget("calendar"));
});

export const getMicrosoftLogin = createServerFn({ method: "GET" }).handler(() => microsoftLoginState());

export const disconnectMicrosoft = createServerFn({ method: "POST" }).handler(() => {
  logoutMicrosoft();
  forget("calendar");
  return { ok: true as const };
});

// ---------- Préférences (config.local.json) ----------
export const getPreferences = createServerFn({ method: "GET" }).handler(() => {
  try {
    return { ok: true as const, data: getPrefs() };
  } catch (e) {
    return { ok: false as const, error: e instanceof MessageError ? e.msg : msg("srv_raw", { text: redact(e instanceof Error ? e.message : String(e)) || "?" }) };
  }
});

const path = z.string().max(1024).refine((p) => !p.includes("\0"));
export const savePreferences = createServerFn({ method: "POST" })
  .validator(
    z.object({
      tabs: z.array(z.enum(CHOOSABLE_TABS as [string, ...string[]])).max(CHOOSABLE_TABS.length),
      editor: z.enum(EDITORS),
      jetbrains: path,
      projectPath: path.refine((p) => p.trim().length > 0),
      // lecture du guide : absente d'une page ouverte avant son ajout, elle reste désactivée
      guide: z.object({ enabled: z.boolean(), path, references: z.boolean().default(false), terms: z.boolean().default(false) }),
    }),
  )
  .handler(({ data }) => {
    try {
      return { ok: true as const, data: savePrefs(data as Parameters<typeof savePrefs>[0]) };
    } catch (e) {
      return { ok: false as const, error: e instanceof MessageError ? e.msg : msg("srv_raw", { text: redact(e instanceof Error ? e.message : String(e)) || "?" }) };
    }
  });

// Le secret : code Konami fait, option du guide cliquée, page Statistiques ouverte (de simples booléens dans la config)
export const secretEvent = createServerFn({ method: "POST" })
  .validator(z.object({ event: z.enum(["konami", "guide", "stats"]) }))
  .handler(({ data }) => {
    try {
      return { ok: true as const, data: recordSecret(data.event) };
    } catch (e) {
      return { ok: false as const, error: e instanceof MessageError ? e.msg : msg("srv_raw", { text: redact(e instanceof Error ? e.message : String(e)) || "?" }) };
    }
  });

// ---------- Actions : ouvrir un lien dans Chrome, un fichier dans l'IDE ----------
export const openUrl = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().max(2048) }))
  .handler(async ({ data }) => {
    if (!isAllowedUrl(loadConfig(), data.url)) return { ok: false as const, error: msg("srv_link_not_allowed") };
    await openInChrome(data.url);
    return { ok: true as const };
  });

export const openFile = createServerFn({ method: "POST" })
  .validator(z.object({ file: z.string().max(1024), line: z.number().int().min(1).max(1_000_000) }))
  .handler(async ({ data }) => {
    const target = resolveProjectFile(loadConfig(), data.file, data.line);
    if (!target) return { ok: false as const, error: msg("srv_file_not_allowed") };
    try {
      const cfg = loadConfig();
      await openInIde(cfg, target.path, target.line);
      return { ok: true as const, editor: editorName(cfg.ui?.editor, cfg.codemap?.ide) };
    } catch (e) {
      return { ok: false as const, error: e instanceof MessageError ? e.msg : msg("srv_raw", { text: redact(e instanceof Error ? e.message : String(e)) || "?" }) };
    }
  });
