// « À faire » calculé à partir des sources chargées, sans les éléments reportés ou ignorés.
// Partagé par le Dashboard, le compteur de l'onglet, le titre de la page et les notifications.
import { ok, useAwsSession, useCi, useCloudWatch, useDeploy, useLibs, usePullRequests, useSentry, useSprint } from "~/lib/data";
import { useNow } from "~/lib/now";
import { computeTodo } from "./logic";
import { partition, useSnoozes } from "./snooze";

export function useTodo() {
  const prsQ = usePullRequests();
  const sprintQ = useSprint();
  const cwQ = useCloudWatch();
  const sentryQ = useSentry();
  const libsQ = useLibs();
  const awsQ = useAwsSession();
  const deployQ = useDeploy();
  const ciQ = useCi();
  const snoozes = useSnoozes();
  const now = useNow(60_000);

  const all = computeTodo({ prs: ok(prsQ), sprint: ok(sprintQ), cloudwatch: ok(cwQ), sentry: ok(sentryQ), libs: ok(libsQ), aws: awsQ.data, deploy: ok(deployQ), ci: ok(ciQ), now });
  const { visible, hidden } = partition(all, snoozes, now);
  return {
    items: visible,
    hidden,
    loading: prsQ.isPending || sprintQ.isPending,
    /** toutes les sources ont répondu (avec succès ou non) */
    settled: [prsQ, sprintQ, cwQ, sentryQ, libsQ, awsQ, deployQ, ciQ].every((q) => !q.isPending),
  };
}
