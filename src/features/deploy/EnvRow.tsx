// Un environnement de branche : état du dernier déploiement, liens vers l'environnement (si deploy.envUrl est réglé), le pipeline et le ticket.
import { css, cx } from "styled-system/css";
import { Badge, ExtLink, Item, ItemMeta } from "~/components/ds";
import { ago } from "~/lib/format";
import { m } from "~/lib/i18n";
import type { DeployData, DynamicEnv } from "~/server/types";
import { cleanMessage, commitLine, statusBadge } from "./ui";

export function EnvRow({ e, mine, links }: { e: DynamicEnv; mine: boolean; links: DeployData["links"] }) {
  const [label, tone] = statusBadge(e.last?.status ?? null);
  const key = /^[a-z]+-\d+$/.test(e.slug) ? e.slug.toUpperCase() : null;
  return (
    <Item href={e.url ?? e.consoleUrl} tone={mine ? "accent" : undefined}>
      <div className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" })}>
        <strong className={css({ fontSize: "md" })}>{key ?? e.slug}</strong>
        {mine && <Badge tone="accent">{m.common_my_branch()}</Badge>}
        <Badge tone={tone}>{label}</Badge>
        {e.last && <span className={css({ fontSize: "sm", color: "muted" })}>{ago(e.last.startedAt)}</span>}
      </div>
      {e.last?.message && <div className={cx(commitLine, css({ mt: "1", color: "muted", fontSize: "sm" }))}>{cleanMessage(e.last.message)}</div>}
      <ItemMeta>
        {e.url && (
          <>
            <ExtLink href={e.url}>{m.deploy_open_environment()}</ExtLink>
            <span>·</span>
          </>
        )}
        <ExtLink href={e.consoleUrl}>{m.common_pipeline()}</ExtLink>
        {key && (
          <>
            <span>·</span>
            <ExtLink href={`${links.jira}${key}`}>Jira ↗</ExtLink>
          </>
        )}
      </ItemMeta>
    </Item>
  );
}
