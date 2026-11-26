// Données du tableau de bord côté navigateur (TanStack Query) : cache, rafraîchissement automatique,
// bouton « Rafraîchir » qui force le serveur à relire les sources.
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import {
  getActivity,
  getPreferences,
  getBranch,
  getBranches,
  getCalendar,
  getDeploy,
  getCi,
  getCloudWatch,
  getAlarmCharts,
  getLogQueries,
  getCodeMap,
  getLibs,
  getWorkspaceLibs,
  getOpenPrs,
  getPullRequests,
  getSentry,
  getSlack,
  getSprint,
  getStats,
  getAwsSession,
  getQuickLinks,
  getGuide,
  getGuideFreshness,
  getRemind,
} from "~/server/fns";
import type { QuickLink } from "~/features/links/logic";
import type {
  ActivityData,
  AwsSession,
  BranchData,
  CalendarData,
  DeployData,
  CiData,
  CloudWatchData,
  AlarmCharts,
  LogQuery,
  CodeMapData,
  GuideFreshness,
  GuideIndex,
  JiraSprintData,
  LibInfo,
  OpenPr,
  PullRequestsData,
  SentryData,
  SlackData,
  SourceResult,
  StatsData,
  WorkspaceLibs,
} from "~/server/types";
import type { BranchList } from "~/features/branches/logic";
import type { RemindData } from "~/features/remind/logic";

export const AUTO_REFRESH_MS = 5 * 60_000;

// Après un clic sur « Rafraîchir », les requêtes des secondes qui suivent demandent au serveur d'ignorer son cache.
let forceUntil = 0;
const force = () => Date.now() < forceUntil;

type SourceFn<T> = (opts: { data?: { force?: boolean } }) => Promise<SourceResult<T>>;

// Le serveur rend toujours les pages « en chargement » (il ne lit pas les sources pendant le rendu).
// Or la barre du haut lance les requêtes dès son affichage, et le contenu de la page, chargé à part, peut
// s'hydrater APRÈS l'arrivée des données : son premier rendu ne correspondrait plus au HTML du serveur
// (erreur d'hydratation, page entière reconstruite). Pendant l'hydratation, on présente donc l'état
// « en chargement » ; les données s'affichent au rendu suivant, immédiatement après.
function useHydrationSafe<R extends UseQueryResult<unknown>>(q: R): R {
  const hydrated = useHydrated();
  if (hydrated || q.isPending) return q;
  return { ...q, data: undefined, error: null, status: "pending", isPending: true, isLoading: true, isSuccess: false, isError: false } as R;
}

function useSource<T>(key: string, fn: SourceFn<T>, enabled = true): UseQueryResult<SourceResult<T>> {
  return useHydrationSafe(
    useQuery({
      queryKey: [key],
      queryFn: () => fn({ data: { force: force() } }),
      refetchInterval: AUTO_REFRESH_MS,
      staleTime: 60_000,
      enabled,
    }),
  );
}

export const usePullRequests = () => useSource<PullRequestsData>("prs", getPullRequests as SourceFn<PullRequestsData>);
export const useOpenPrs = (enabled = true) => useSource<OpenPr[]>("open-prs", getOpenPrs as SourceFn<OpenPr[]>, enabled);
export const useSprint = () => useSource<JiraSprintData>("jira", getSprint as SourceFn<JiraSprintData>);
export const useLibs = () => useSource<LibInfo[]>("libs", getLibs as SourceFn<LibInfo[]>);
export const useWorkspaceLibs = (enabled = true) => useSource<WorkspaceLibs[]>("workspace-libs", getWorkspaceLibs as SourceFn<WorkspaceLibs[]>, enabled);
/**
 * Erreurs Sentry. Sans argument : l'environnement de la config (sentry.environment), pour « À faire », les compteurs, ⌘K.
 * `env` : celui choisi dans Observabilité (« » = tous les environnements).
 */
export const useSentry = (env?: string): UseQueryResult<SourceResult<SentryData>> =>
  useHydrationSafe(
    useQuery({
      queryKey: ["sentry", env ?? null],
      queryFn: () => getSentry({ data: { force: force(), ...(env !== undefined && { env }) } }),
      refetchInterval: AUTO_REFRESH_MS,
      staleTime: 60_000,
    }),
  );
export const useCloudWatch = () => useSource<CloudWatchData>("cloudwatch", getCloudWatch as SourceFn<CloudWatchData>);
/** Requêtes Logs Insights enregistrées (onglet CloudWatch) */
export const useLogQueries = (enabled = true) => useSource<LogQuery[]>("log-queries", getLogQueries as SourceFn<LogQuery[]>, enabled);
/** Courbes des alarmes sur 24 h : seulement quand l'onglet CloudWatch est ouvert */
export const useAlarmCharts = (enabled = true) => useSource<AlarmCharts>("alarm-charts", getAlarmCharts as SourceFn<AlarmCharts>, enabled);
export const useCalendar = () => useSource<CalendarData>("calendar", getCalendar as SourceFn<CalendarData>);
export const useSlack = () => useSource<SlackData>("slack", getSlack as SourceFn<SlackData>);
export const useStats = (enabled = true) => useSource<StatsData>("stats", getStats as SourceFn<StatsData>, enabled);
export const useActivity = () => useSource<ActivityData>("activity", getActivity as SourceFn<ActivityData>);
export const useDeploy = () => useSource<DeployData>("deploy", getDeploy as SourceFn<DeployData>);
export const useCodeMap = (enabled = true) => useSource<CodeMapData>("codemap", getCodeMap as SourceFn<CodeMapData>, enabled);
/** Index du guide de l'équipe. Rarement modifié : relu toutes les 5 min au plus (le serveur ne relit le fichier que s'il a changé). */
export const useGuide = (enabled = true) => useSource<GuideIndex>("guide", getGuide as SourceFn<GuideIndex>, enabled);
export const useGuideFreshness = (enabled = true) => useSource<GuideFreshness>("guide-freshness", getGuideFreshness as SourceFn<GuideFreshness>, enabled);
export const useBranches = (enabled = true) => useSource<BranchList>("branches", getBranches as SourceFn<BranchList>, enabled);

/** CI GitHub de la branche principale et de `branch` (« Ma branche » ; sans elle, la branche actuelle du projet) */
export const useCi = (branch?: string, enabled = true): UseQueryResult<SourceResult<CiData>> =>
  useHydrationSafe(
    useQuery({
      queryKey: ["ci", branch ?? ""],
      queryFn: () => getCi({ data: { force: force(), ...(branch && { branch }) } }),
      refetchInterval: AUTO_REFRESH_MS,
      staleTime: 60_000,
      enabled,
    }),
  );

/** « Ma branche » : la branche choisie dans le sélecteur (paramètre ?branche=), sinon la branche actuelle du projet */
export const useBranch = (branch?: string, enabled = true): UseQueryResult<SourceResult<BranchData>> =>
  useHydrationSafe(
    useQuery({
      queryKey: ["branch", branch ?? ""],
      queryFn: () => getBranch({ data: { force: force(), branch } }),
      refetchInterval: AUTO_REFRESH_MS,
      staleTime: 60_000,
      enabled,
    }),
  );

export const useAwsSession = () => useHydrationSafe(useQuery<AwsSession>({ queryKey: ["aws-session"], queryFn: () => getAwsSession(), refetchInterval: 60_000 }));

/** Liens rapides de ⌘K : chargés à la première ouverture, puis gardés (la config ne change qu'au redémarrage du serveur) */
export const useQuickLinks = (enabled = true) => useQuery<QuickLink[]>({ queryKey: ["quick-links"], queryFn: () => getQuickLinks(), staleTime: Infinity, enabled });

/** Préférences de N2 (config.local.json) : onglets affichés, éditeur, chemins du projet et du guide */
export const usePreferences = () => useHydrationSafe(useQuery({ queryKey: ["prefs"], queryFn: () => getPreferences(), staleTime: Infinity }));

/** « Remind me » : le fichier des rappels, relu toutes les 30 s et au retour sur la page (il peut changer dans ton éditeur) */
export const useRemind = () =>
  useHydrationSafe(useQuery<SourceResult<RemindData>>({ queryKey: ["remind"], queryFn: () => getRemind(), refetchInterval: 30_000, refetchOnWindowFocus: true }));

export function useRefreshAll() {
  const qc = useQueryClient();
  return async () => {
    forceUntil = Date.now() + 5_000;
    await qc.invalidateQueries();
  };
}

/** Les données d'une source si elle a réussi, sinon undefined */
export const ok = <T,>(q: UseQueryResult<SourceResult<T>>): T | undefined => (q.data?.ok ? q.data.data : undefined);
