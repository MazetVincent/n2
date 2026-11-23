// Reporter ou ignorer un élément de « À faire », et la liste des éléments masqués (pour les réafficher).
import { Popover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { useState, type SyntheticEvent } from "react";
import { css, cx } from "styled-system/css";
import { Badge, Button, Icon, iconButton, overlay } from "~/components/ds";
import { toaster } from "~/lib/actions";
import { locale, m } from "~/lib/i18n";
import { timeFr } from "~/lib/format";
import type { TodoItem } from "./logic";
import { nextMorning, snooze, unsnooze, type SnoozeEntry } from "./snooze";

// Le menu est dans un portail, mais React fait remonter ses événements jusqu'à l'élément cliquable : on les arrête.
const stop = (e: SyntheticEvent) => e.stopPropagation();

const option = overlay.menuItem;

// « Demain 08:00 » / « Lundi 08:00 » ; `inSentence` : comme au milieu d'une phrase (« demain », « lundi » ; « Monday » en anglais)
function morningLabel(d: Date, inSentence = false): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  if (inSentence) return `${isTomorrow ? m.todo_tomorrow_lower() : d.toLocaleDateString(locale(), { weekday: "long" })} ${timeFr(d)}`;
  const day = isTomorrow ? m.todo_tomorrow() : d.toLocaleDateString(locale(), { weekday: "long" });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${timeFr(d)}`;
}

export function SnoozeMenu({ item }: { item: TodoItem }) {
  const [open, setOpen] = useState(false);
  const morning = nextMorning(new Date());
  const choose = (until: number | null, message: string) => {
    snooze(item, until);
    setOpen(false);
    toaster.create({ title: message, description: item.title, type: "success", duration: 2500 });
  };

  return (
    <Popover.Root open={open} onOpenChange={(e) => setOpen(e.open)} positioning={{ placement: "bottom-end" }} lazyMount unmountOnExit>
      <Popover.Trigger
        onClick={stop}
        onKeyDown={stop}
        aria-label={m.todo_snooze_or_ignore()}
        title={m.todo_snooze_or_ignore()}
        className={css(iconButton.raw({ size: "sm" }), { ml: "auto", w: "24px", _hover: { borderColor: "border", bg: "surface" } })}
      >
        <Icon name="clock" size={14} />
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner className={overlay.popoverPositioner}>
          <Popover.Content
            onClick={stop}
            onKeyDown={stop}
            className={cx(overlay.popover(), css({ w: "230px" }))}
          >
            <Popover.Title className={overlay.menuTitle}>
              {m.common_hide()}
            </Popover.Title>
            <button type="button" className={option} onClick={() => choose(Date.now() + 60 * 60_000, m.todo_snoozed_hour())}>
              {m.common_1_hour()}
            </button>
            <button type="button" className={option} onClick={() => choose(morning.getTime(), m.todo_snoozed_until({ when: morningLabel(morning, true) }))}>
              {m.todo_until()} {morningLabel(morning, true)}
            </button>
            <button type="button" className={option} onClick={() => choose(null, m.todo_ignored())}>
              {m.common_ignore()}
              <span className={css({ display: "block", fontSize: "xs", color: "muted", mt: "0.5" })}>
                {item.version !== undefined
                  ? m.todo_comes_back_if_changes_new()
                  : m.todo_30_days()}
              </span>
            </button>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

/** Éléments reportés ou ignorés, repliés en bas de la carte « À faire » */
export function HiddenTodos({ hidden }: { hidden: { item: TodoItem; entry: SnoozeEntry }[] }) {
  const [open, setOpen] = useState(false);
  if (!hidden.length) return null;
  return (
    <div className={css({ mt: "4", pt: "3", borderTop: "1px dashed token(colors.border)" })}>
      <Button variant="link" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={css({ fontSize: "sm" })}>
        <Icon name="chevron" size={14} className={cx(css({ transition: "transform 0.15s" }), !open && css({ transform: "rotate(-90deg)" }))} />
        {m.todo_snoozed_or_ignored()} ({hidden.length})
      </Button>
      {open && (
        <ul className={css({ listStyle: "none", m: 0, mt: "2", p: 0, display: "flex", flexDirection: "column", gap: "1" })}>
          {hidden.map(({ item, entry }) => (
            <li key={item.id} className={css({ display: "flex", alignItems: "center", gap: "2", fontSize: "sm", color: "muted", minW: 0 })}>
              <Badge>{item.label}</Badge>
              <span className={css({ flex: 1, minW: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "text" })}>{item.title}</span>
              <span className={css({ whiteSpace: "nowrap" })}>
                {entry.until === null ? m.todo_ignored_2() : `${m.todo_until_2()} ${new Date(entry.until).toDateString() === new Date().toDateString() ? timeFr(entry.until) : morningLabel(new Date(entry.until), true)}`}
              </span>
              <Button variant="accentLink" onClick={() => unsnooze(item.id)} className={css({ fontSize: "sm" })}>
                {m.todo_show_again()}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
