// Carte « Slack » du Dashboard : messages directs, mentions et derniers messages des salons suivis.
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";
import { Badge, Card, LIST_MAX_H, Count, Empty, ExtLink, H3, Item, ItemMeta, List, Segmented, SourceView } from "~/components/ds";
import { useSlack } from "~/lib/data";
import { ago, plural } from "~/lib/format";
import { m } from "~/lib/i18n";
import type { SlackData, SlackMessage } from "~/server/types";

export type SlackView = "dm" | "mentions" | "channels";

const iso = (ts: string) => new Date(Number(ts) * 1000).toISOString();

export function SlackCard({ view, onViewChange }: { view: SlackView; onViewChange: (v: SlackView) => void }) {
  const q = useSlack();
  const d = q.data?.ok ? q.data.data : undefined;
  const dmUnread = d?.dms.reduce((n, c) => n + c.unread, 0) ?? 0;
  const channelUnread = d?.channels.reduce((n, c) => n + (c.unread ?? 0), 0) ?? 0;
  return (
    <Card
      title="Slack"
      collapse="slack"
      scroll={LIST_MAX_H}
      controls={
        <Segmented
          label={m.slack_slack_view()}
          value={view}
          onChange={onViewChange}
          items={[
            { value: "dm", label: m.slack_direct_messages(), count: d ? dmUnread || undefined : undefined },
            { value: "mentions", label: m.slack_mentions(), count: d ? d.mentions.length || undefined : undefined },
            { value: "channels", label: m.slack_channels(), count: d ? channelUnread || undefined : undefined },
          ]}
        />
      }
      meta={d && <ExtLink href={d.url}>{d.team} ↗</ExtLink>}
    >
      <SourceView query={q} skeletons={3}>
        {(data) => <SlackBody data={data} view={view} />}
      </SourceView>
    </Card>
  );
}

function SlackBody({ data, view }: { data: SlackData; view: SlackView }) {
  if (view === "dm") {
    return data.dms.length ? (
      <List>
        {data.dms.map((c) => (
          <li key={c.id}>
            <MessageRow m={c.last} title={c.name} extra={c.unread > 0 && <Badge tone="accent">{plural(c.unread, m.slack_unread(), m.slack_unread_2())}</Badge>} />
          </li>
        ))}
      </List>
    ) : (
      <Empty>{m.slack_no_direct_messages_last_7()}</Empty>
    );
  }

  if (view === "mentions") {
    return data.mentions.length ? (
      <List>
        {data.mentions.map((m) => (
          <li key={`${m.channelId}:${m.ts}`}>
            <MessageRow m={m} title={m.author} where={m.channel} />
          </li>
        ))}
      </List>
    ) : (
      <Empty>{m.slack_nobody_mentioned_last_7_days()}</Empty>
    );
  }

  return (
    <>
      {data.missing.length > 0 && (
        <p className={css({ mt: "2", fontSize: "sm", color: "warn" })}>
          {m.slack_channels_not_found()} {data.missing.join(", ")}
        </p>
      )}
      {!data.channels.length && !data.missing.length && (
        <Empty>{m.slack_no_channels_followed_add_them()}</Empty>
      )}
      {data.channels.map((c) => (
        <div key={c.id}>
          <H3>
            #{c.name}
            {c.unread ? <Badge tone="accent">{plural(c.unread, m.slack_unread(), m.slack_unread_2())}</Badge> : null}
            <ExtLink href={c.url} className={css({ ml: "auto", textTransform: "none", letterSpacing: "normal" })}>
              {m.common_open()}
            </ExtLink>
          </H3>
          {c.messages.length ? (
            <List>
              {c.messages.map((m) => (
                <li key={m.ts}>
                  <MessageRow m={m} title={m.author} compact />
                </li>
              ))}
            </List>
          ) : (
            <Empty>{m.slack_no_messages()}</Empty>
          )}
        </div>
      ))}
    </>
  );
}

function MessageRow({ m: message, title, where, extra, compact }: { m: SlackMessage; title: string; where?: string; extra?: ReactNode; compact?: boolean }) {
  return (
    <Item href={message.url} tone={message.unread ? "accent" : undefined}>
      <div className={css({ display: "flex", alignItems: "baseline", gap: "2", fontSize: "md", minW: 0 })}>
        <span className={cx(css({ fontWeight: message.unread ? "bold" : "550", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }))}>{title}</span>
        {where && <span className={css({ color: "muted", fontSize: "sm", whiteSpace: "nowrap" })}>{where}</span>}
        <span className={css({ ml: "auto", color: "muted", fontSize: "sm", whiteSpace: "nowrap" })}>{ago(iso(message.ts))}</span>
      </div>
      <p className={css({ mt: "0.5", fontSize: "md", color: message.unread ? "text" : "muted", whiteSpace: "pre-line", overflow: "hidden", lineClamp: compact ? 2 : 3, wordBreak: "break-word" })}>
        {message.mine && <span className={css({ color: "muted" })}>{m.slack_you()}</span>}
        {message.text || m.slack_empty_message()}
      </p>
      {(extra || message.replies > 0) && (
        <ItemMeta>
          {extra}
          {message.replies > 0 && <Count>{plural(message.replies, m.slack_reply(), m.slack_replies())}</Count>}
        </ItemMeta>
      )}
    </Item>
  );
}
