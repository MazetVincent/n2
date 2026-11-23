// Carte « Agenda » du Dashboard : réunions Teams / Outlook du jour ou de la semaine, avec « Rejoindre ».
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNow } from "~/lib/now";
import { css, cx } from "styled-system/css";
import { Badge, Button, button, Card, Empty, ExtLink, Icon, Item, ItemMeta, ItemTitle, List, Segmented, SourceView, type Tone } from "~/components/ds";
import { toaster } from "~/lib/actions";
import { useCalendar } from "~/lib/data";
import { locale, m, msg } from "~/lib/i18n";
import { timeFr } from "~/lib/format";
import { disconnectMicrosoft, getMicrosoftLogin, startMicrosoftLogin } from "~/server/fns";
import type { CalendarData, CalendarEvent, MicrosoftLogin } from "~/server/types";
import { daysToShow, eventsOn, isSameDay, meetingState, nextMeeting, type CalendarView, type MeetingState } from "./logic";

const OUTLOOK_URL = "https://outlook.office.com/calendar/view/week";

export function CalendarCard({ view, onViewChange }: { view: CalendarView; onViewChange: (v: CalendarView) => void }) {
  const q = useCalendar();
  const data = q.data?.ok ? q.data.data : undefined;
  return (
    <Card
      title={m.calendar_calendar()}
      collapse="calendar"
      controls={
        <Segmented
          label={m.calendar_period()}
          value={view}
          onChange={onViewChange}
          items={[
            { value: "day", label: m.calendar_day() },
            { value: "week", label: m.calendar_week() },
          ]}
        />
      }
      meta={<ExtLink href={OUTLOOK_URL}>Outlook ↗</ExtLink>}
    >
      <SourceView query={q} skeletons={2}>
        {(d) => <CalendarBody data={d} view={view} />}
      </SourceView>
      {data && data.graph !== "none" && <MicrosoftAccount data={data} />}
    </Card>
  );
}

function CalendarBody({ data, view }: { data: CalendarData; view: CalendarView }) {
  const now = useNow();
  if (data.source === null) return null; // Graph pas encore connecté et pas de lien ICS : seul le bouton de connexion s'affiche
  if (view === "week") return <WeekRow data={data} now={now} />;
  const days = daysToShow(view, data.events, new Date(now));
  const next = nextMeeting(data.events, now);
  return (
    <>
      {days.map((day) => {
        const events = eventsOn(data.events, day);
        return (
          <div key={day.toISOString()}>
            <p className={css({ mt: "3", mb: "2", fontSize: "sm", color: "muted" })}>{day.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })}</p>
            {events.length ? (
              <List>
                {events.map((e) => (
                  <li key={e.id}>
                    <EventRow e={e} state={meetingState(e, now)} isNext={e === next} compact={false} now={now} />
                  </li>
                ))}
              </List>
            ) : (
              <Empty>{m.calendar_no_meetings_today()}</Empty>
            )}
          </div>
        );
      })}
    </>
  );
}

// Semaine : un jour par colonne, côte à côte ; la rangée défile vers la droite et s'ouvre sur aujourd'hui
function WeekRow({ data, now }: { data: CalendarData; now: number }) {
  const days = daysToShow("week", data.events, new Date(now));
  const next = nextMeeting(data.events, now);
  const rowRef = useRef<HTMLDivElement>(null);
  const todayKey = days.find((d) => isSameDay(d, new Date(now)))?.toISOString();
  // à l'ouverture (et quand le jour change) : la colonne d'aujourd'hui en premier, sans toucher au défilement de la page
  useLayoutEffect(() => {
    const row = rowRef.current;
    const col = todayKey ? row?.querySelector<HTMLElement>(`[data-day="${todayKey}"]`) : null;
    if (row && col) row.scrollLeft = col.offsetLeft; // la rangée est « position: relative » : décalage mesuré depuis elle
  }, [todayKey]);
  return (
    <div
      ref={rowRef}
      role="list"
      aria-label={m.calendar_week()}
      className={css({
        display: "flex",
        gap: "3",
        mt: "3",
        pb: "2",
        overflowX: "auto",
        overscrollBehaviorX: "contain",
        scrollSnapType: "x mandatory",
        scrollbarWidth: "thin",
        position: "relative",
      })}
    >
      {days.map((day) => {
        const events = eventsOn(data.events, day);
        const today = isSameDay(day, new Date(now));
        return (
          <section
            key={day.toISOString()}
            role="listitem"
            data-day={day.toISOString()}
            className={css({
              flex: "0 0 min(280px, 85%)",
              minW: 0,
              scrollSnapAlign: "start",
              p: "2.5",
              borderRadius: "lg",
              border: "1px solid token(colors.border)",
              bg: "surface.alt",
              "&[data-today]": { borderColor: "accent" },
            })}
            data-today={today ? "" : undefined}
          >
            <h3 className={css({ textStyle: "overline", color: today ? "accent" : "muted", fontWeight: today ? "bold" : undefined, mb: "2", display: "flex", alignItems: "center", gap: "1.5" })}>
              {day.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" })}
              {today && <Badge tone="accent">{m.calendar_today()}</Badge>}
            </h3>
            {events.length ? (
              <List>
                {events.map((e) => (
                  <li key={e.id}>
                    <EventRow e={e} state={meetingState(e, now)} isNext={e === next} compact now={now} />
                  </li>
                ))}
              </List>
            ) : (
              <Empty>{m.calendar_nothing_planned()}</Empty>
            )}
          </section>
        );
      })}
    </div>
  );
}

const STATE_TONE: Partial<Record<MeetingState, Tone>> = { now: "accent", soon: "warn" };

function EventRow({ e, state, isNext, compact, now }: { e: CalendarEvent; state: MeetingState; isNext: boolean; compact: boolean; now: number }) {
  const minutes = Math.max(1, Math.round((Date.parse(e.start) - now) / 60_000));
  const status: [string, Tone] | null = e.cancelled
    ? [m.calendar_cancelled(), "bad"]
    : state === "now"
      ? [m.calendar_now(), "accent"]
      : state === "soon"
        ? [m.calendar_min({ minutes }), "warn"]
        : e.showAs === "tentative"
          ? [m.calendar_tentative(), "neutral"]
          : e.showAs === "oof"
            ? [m.calendar_out_office(), "info"]
            : null;
  const join = e.joinUrl && !e.cancelled && state !== "past";

  return (
    <div className={cx(css({ transition: "opacity 0.12s" }), (state === "past" || e.showAs === "free") && css({ opacity: 0.55 }))}>
      <Item href={e.webUrl ?? e.joinUrl ?? undefined} tone={e.cancelled ? undefined : (STATE_TONE[state] ?? (isNext ? "info" : undefined))}>
        <div className={css({ display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: "2.5", alignItems: "start" })}>
          <div className={cx(css({ fontSize: "sm", color: "muted", lineHeight: "1.35", pt: "1px" }), "tabular")}>
            {e.allDay ? (
              m.calendar_all_day()
            ) : (
              <>
                <div className={css({ color: "text", fontWeight: "semibold" })}>{timeFr(Date.parse(e.start))}</div>
                <div>{timeFr(Date.parse(e.end))}</div>
              </>
            )}
          </div>
          <div className={css({ minW: 0 })}>
            <div className={css({ display: "flex", alignItems: "start", gap: "2" })}>
              <div className={cx(css({ flex: 1, minW: 0 }), e.cancelled && css({ textDecoration: "line-through", color: "muted" }))}>
                <ItemTitle>{e.title}</ItemTitle>
              </div>
              {join && (
                <ExtLink href={e.joinUrl!} tone={state === "now" || state === "soon" ? "accent" : "neutral"} title={m.calendar_join_teams_meeting()}>
                  {m.calendar_join()}
                </ExtLink>
              )}
            </div>
            {(status || (!compact && (e.location || e.organizer)) || (compact && e.location && !e.joinUrl)) && (
              <ItemMeta>
                {status && <Badge tone={status[1]}>{status[0]}</Badge>}
                {e.location && !(e.joinUrl && /teams/i.test(e.location)) && <span>{e.location}</span>}
                {!compact && e.organizer && <span>· {e.organizer}</span>}
              </ItemMeta>
            )}
          </div>
        </div>
      </Item>
    </div>
  );
}

// ---------- Connexion à Microsoft Graph ----------

function MicrosoftAccount({ data }: { data: CalendarData }) {
  const qc = useQueryClient();
  const [login, setLogin] = useState<MicrosoftLogin | null>(null);
  const start = useMutation({
    mutationFn: () => startMicrosoftLogin(),
    onSuccess: (l) => {
      qc.removeQueries({ queryKey: ["microsoft-login"] }); // pas d'état d'une connexion précédente
      setLogin(l);
    },
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectMicrosoft(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });

  // pendant la connexion : on demande l'état au serveur toutes les 2 s, jusqu'à la validation sur la page Microsoft
  const pending = login?.state === "pending";
  const status = useQuery({ queryKey: ["microsoft-login"], queryFn: () => getMicrosoftLogin(), refetchInterval: 2000, enabled: pending });
  useEffect(() => {
    const s = status.data;
    if (!pending || !s || s.state === "pending") return;
    setLogin(s);
    if (s.state === "done") {
      toaster.create({ title: m.calendar_connected_microsoft(), type: "success", duration: 1800 });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    }
  }, [status.data, pending, qc]);

  if (data.graph === "connected") {
    return (
      <p className={css({ mt: "3", fontSize: "sm", color: "muted", display: "flex", gap: "2", alignItems: "center" })}>
        <Icon name="check" size={13} /> {m.calendar_calendar_read_microsoft_graph()} ·
        <button type="button" disabled={disconnect.isPending} onClick={() => disconnect.mutate()} className={css(button.raw({ variant: "link" }), { textDecoration: "underline" })}>
          {m.calendar_sign_out()}
        </button>
      </p>
    );
  }

  return (
    <div className={css({ mt: "3", p: "3", borderRadius: "lg", border: "1px dashed token(colors.border)", bg: "surface.alt", fontSize: "md" })}>
      {pending ? (
        <>
          <p>{m.calendar_microsoft_page_sign_work_account()}</p>
          <div className={css({ display: "flex", alignItems: "center", gap: "3", flexWrap: "wrap", mt: "2" })}>
            <button
              type="button"
              title={m.calendar_copy_code()}
              onClick={() => {
                navigator.clipboard?.writeText(login.userCode ?? "");
                toaster.create({ title: m.calendar_code_copied(), type: "success", duration: 1500 });
              }}
              className={cx(
                css({ fontFamily: "mono", fontSize: "xl", fontWeight: "bold", letterSpacing: "0.12em", px: "3", py: "1", borderRadius: "lg", border: "1px solid token(colors.border)", bg: "surface", cursor: "copy" }),
                "tabular",
              )}
            >
              {login.userCode}
            </button>
            <ExtLink href={login.verificationUri ?? "https://microsoft.com/devicelogin"} tone="accent">
              {m.calendar_open_microsoft_page()}
            </ExtLink>
          </div>
          <p className={css({ mt: "2", color: "muted", fontSize: "sm", display: "flex", alignItems: "center", gap: "1.5" })}>
            <Icon name="refresh" size={12} spin /> {m.calendar_waiting_confirmation()}
          </p>
        </>
      ) : (
        <>
          <p className={css({ color: "muted" })}>
            {data.source === "ics"
              ? m.calendar_calendar_read_from_ics_link()
              : m.calendar_connect_n2_microsoft_show_teams()}
          </p>
          {login?.state === "error" && <p className={css({ mt: "1.5", color: "bad", fontSize: "sm" })}>{msg(login.error)}</p>}
          <Button variant="solid" size="md" className={css({ mt: "2.5" })} disabled={start.isPending} onClick={() => start.mutate()}>
            {m.calendar_sign_microsoft()}
          </Button>
        </>
      )}
    </div>
  );
}
