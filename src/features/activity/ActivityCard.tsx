// Carte « GitHub et Jira » du Dashboard : les fils où d'autres ont écrit depuis mon dernier message
// (mentions, commentaires sur mes PR et tickets, réponses). Le complément de la carte Slack.
import { css } from "styled-system/css";
import { Badge, Card, LIST_MAX_H, Count, Empty, Item, ItemMeta, List, Segmented, SourceView, type Tone } from "~/components/ds";
import { useActivity } from "~/lib/data";
import { ago, plural } from "~/lib/format";
import { m, msg } from "~/lib/i18n";
import type { ActivityData, ActivityItem, ActivityKind } from "~/server/types";

export type ActivityView = "all" | "github" | "jira";

const KIND = (source: ActivityItem["source"]): Record<ActivityKind, [string, Tone]> => ({
  mention: [m.activity_mention(), "accent"],
  comment: source === "github" ? [m.activity_pr(), "info"] : [m.activity_ticket(), "info"],
  reply: [m.activity_reply(), "neutral"],
});

export function ActivityCard({ view, onViewChange }: { view: ActivityView; onViewChange: (v: ActivityView) => void }) {
  const q = useActivity();
  const d = q.data?.ok ? q.data.data : undefined;
  const count = (source?: ActivityItem["source"]) => (d ? d.items.filter((i) => !source || i.source === source).length || undefined : undefined);
  return (
    <Card
      title="GitHub · Jira"
      collapse="activity"
      scroll={LIST_MAX_H}
      controls={
        <Segmented
          label={m.activity_source()}
          value={view}
          onChange={onViewChange}
          items={[
            { value: "all", label: m.activity_all(), count: count() },
            { value: "github", label: "GitHub", count: count("github") },
            { value: "jira", label: "Jira", count: count("jira") },
          ]}
        />
      }
      meta={d && m.activity_awaiting_reply_d({ days: d.days })}
    >
      <SourceView query={q} skeletons={3}>
        {(data) => <ActivityBody data={data} view={view} />}
      </SourceView>
    </Card>
  );
}

function ActivityBody({ data, view }: { data: ActivityData; view: ActivityView }) {
  const items = data.items.filter((i) => view === "all" || i.source === view);
  const failed = data.failed.filter((f) => view === "all" || f.source === view);
  return (
    <>
      {failed.map((f) => (
        <p key={f.source} className={css({ mt: "2", fontSize: "sm", color: "warn" })}>
          {f.source === "github" ? "GitHub" : "Jira"} : {msg(f.message)}
          {f.hint && <span className={css({ color: "muted" })}> · {msg(f.hint)}</span>}
        </p>
      ))}
      {items.length ? (
        <List>
          {items.map((i) => (
            <li key={i.id}>
              <ActivityRow item={i} />
            </li>
          ))}
        </List>
      ) : (
        !failed.length && (
          <Empty>
            {m.activity_nothing_awaiting_reply_last_days({ days: data.days })}
          </Empty>
        )
      )}
    </>
  );
}

function ActivityRow({ item: i }: { item: ActivityItem }) {
  const [kind, tone] = KIND(i.source)[i.kind];
  return (
    <Item href={i.url} tone={i.kind === "mention" ? "accent" : undefined}>
      <div className={css({ display: "flex", alignItems: "baseline", gap: "2", fontSize: "md", minW: 0 })}>
        <span className={css({ fontWeight: "550", whiteSpace: "nowrap" })}>{i.author}</span>
        <span className={css({ color: "muted", fontSize: "sm", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minW: 0 })}>
          {i.ref} · {i.title}
        </span>
        <span className={css({ ml: "auto", color: "muted", fontSize: "sm", whiteSpace: "nowrap" })}>{ago(i.at)}</span>
      </div>
      <p className={css({ mt: "0.5", fontSize: "md", color: "text", overflow: "hidden", lineClamp: 3, wordBreak: "break-word" })}>{i.excerpt || m.activity_empty_comment()}</p>
      <ItemMeta>
        <Badge tone={tone}>{kind}</Badge>
        <span className={css({ color: "muted", fontSize: "sm" })}>{i.where}</span>
        {i.count > 1 && <Count>{plural(i.count, m.activity_message(), m.activity_messages())}</Count>}
      </ItemMeta>
    </Item>
  );
}
