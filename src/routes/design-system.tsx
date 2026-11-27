// Galerie du design system : chaque composant de src/components/ds avec ses variantes, sur les vraies couleurs
// (clair / sombre selon le système). Onglet caché, ouvert depuis ⌘K « Design system ».
import { Dialog } from "@ark-ui/react/dialog";
import { Popover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { css, cx } from "styled-system/css";
import {
  Badge,
  badge,
  Button,
  button,
  Card,
  cols2,
  Count,
  Dot,
  Empty,
  ErrorBox,
  FitScroll,
  H3,
  Icon,
  ICON_NAMES,
  IconButton,
  input,
  Item,
  ItemMeta,
  ItemTitle,
  List,
  overlay,
  Progress,
  Section,
  Segmented,
  Skeleton,
  Switch,
  Tabs,
  Toggle,
  ToggleChip,
  TONES,
} from "~/components/ds";
import { m } from "~/lib/i18n";

export const Route = createFileRoute("/design-system")({ component: DesignSystemPage });

const COLORS = [
  ["bg", "bg"],
  ["surface", "surface"],
  ["surface.alt", "surface-alt"],
  ["surface.lift", "surface-lift"],
  ["border", "border"],
  ["text", "text"],
  ["muted", "muted"],
  ["accent", "accent"],
  ["accent.soft", "accent-soft"],
  ["neon", "neon"],
  ["sign", "sign"],
  ["tube", "tube"],
  ["tube.off", "tube-off"],
  ["screw", "screw"],
  ["electrode", "electrode"],
  ["contrast", "contrast"],
  ["heat", "heat"],
  ["ok", "ok"],
  ["ok.soft", "ok-soft"],
  ["warn", "warn"],
  ["warn.soft", "warn-soft"],
  ["bad", "bad"],
  ["bad.soft", "bad-soft"],
  ["info", "info"],
  ["info.soft", "info-soft"],
] as const;
const CATS = ["front", "api", "back", "shared", "infra", "tooling"] as const;
// classes écrites en entier : Panda ne lit que des valeurs statiques
const TEXT_STYLES = {
  title: css({ textStyle: "title" }),
  heading: css({ textStyle: "heading" }),
  body: css({ textStyle: "body" }),
  caption: css({ textStyle: "caption" }),
  overline: css({ textStyle: "overline" }),
  label: css({ textStyle: "label" }),
};
const BUTTON_VARIANTS = ["solid", "outline", "ghost", "control", "link", "accentLink"] as const;
const BUTTON_SIZES = ["xs", "sm", "md"] as const;

const row = css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3" });
const code = css({ fontFamily: "mono", fontSize: "xs", color: "muted" });

function Demo({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "1.5", minW: 0 })}>
      <span className={code}>{name}</span>
      <div className={row}>{children}</div>
    </div>
  );
}

function DesignSystemPage() {
  const [seg, setSeg] = useState<"a" | "b" | "c">("a");
  const [tab, setTab] = useState<"one" | "two">("one");
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [chips, setChips] = useState([true, false]);
  const [dialog, setDialog] = useState(false);

  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
      <header>
        <h1 className={css({ textStyle: "title" })}>Design system</h1>
        <p className={css({ color: "muted", mt: "1", textStyle: "body" })}>
          {m.ds_components_src_components_ds_their()}
        </p>
      </header>

      <Card title={m.ds_colours()} meta="panda.config.ts · semanticTokens">
        <div className={css({ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "3" })}>
          {COLORS.map(([token, v]) => (
            <div key={token} className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
              <span className={css({ h: "40px", borderRadius: "lg", border: "1px solid token(colors.border)" })} style={{ background: `var(--colors-${v})` }} />
              <span className={code}>{token}</span>
            </div>
          ))}
        </div>
        <H3>{m.ds_map_layers()}</H3>
        <div className={row}>
          {CATS.map((c) => (
            <span key={c} className={css({ display: "inline-flex", alignItems: "center", gap: "1.5", textStyle: "caption" })}>
              <Dot color={`var(--colors-cat-${c})`} /> cat.{c}
            </span>
          ))}
        </div>
      </Card>

      <div className={cols2}>
        <Card title={m.ds_text()} meta="textStyle">
          <div className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
            {Object.entries(TEXT_STYLES).map(([t, cls]) => (
              <div key={t} className={css({ display: "flex", alignItems: "baseline", gap: "3" })}>
                <span className={cx(code, css({ w: "70px", flex: "none" }))}>{t}</span>
                <span className={cls}>{m.ds_review_requested_pr()}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={m.ds_fields()} meta="input()">
          <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
            <input className={input()} placeholder={m.ds_filter()} />
            <div className={css({ border: "1px solid token(colors.border)", borderRadius: "lg" })}>
              <input className={input({ bare: true })} placeholder={m.ds_frameless_inside_block_bare()} />
            </div>
          </div>
        </Card>
      </div>

      <Card title={m.ds_buttons()} meta="Button · IconButton">
        <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
          {BUTTON_VARIANTS.map((v) => (
            <Demo key={v} name={`variant="${v}"`}>
              {BUTTON_SIZES.map((s) => (
                <Button key={s} variant={v} size={s}>
                  {s}
                </Button>
              ))}
              <Button variant={v} disabled>
                {m.ds_disabled()}
              </Button>
            </Demo>
          ))}
          <Demo name="aria-pressed">
            <Button aria-pressed={pressed} onClick={() => setPressed(!pressed)}>
              <Icon name="target" size={14} /> {pressed ? m.ds_pressed() : m.ds_click()}
            </Button>
          </Demo>
          <Demo name="ToggleChip · group / item">
            <div className={css({ display: "flex", flexDirection: "column", gap: "1", w: "180px" })}>
              <ToggleChip level="group" pressed={chips.some(Boolean)} onClick={() => setChips(chips.some(Boolean) ? [false, false] : [true, true])}>
                Front
              </ToggleChip>
              {["web", "admin"].map((name, i) => (
                <ToggleChip key={name} pressed={chips[i]} onClick={() => setChips(chips.map((c, k) => (k === i ? !c : c)))}>
                  {name}
                </ToggleChip>
              ))}
            </div>
          </Demo>
          <Demo name="IconButton size · framed">
            <IconButton label={m.ds_refresh()} size="sm">
              <Icon name="refresh" size={14} />
            </IconButton>
            <IconButton label={m.ds_refresh()}>
              <Icon name="refresh" size={16} />
            </IconButton>
            <IconButton label={m.ds_refresh()} size="bar" framed>
              <Icon name="refresh" size={16} />
            </IconButton>
          </Demo>
        </div>
      </Card>

      <div className={cols2}>
        <Card title={m.ds_badges()} meta="Badge · Count · Dot">
          <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
            <Demo name="tone">
              {TONES.map((t) => (
                <Badge key={t} tone={t}>
                  {t}
                </Badge>
              ))}
            </Demo>
            <Demo name="badge({ interactive: true })">
              {TONES.map((t) => (
                <button key={t} type="button" className={badge({ tone: t, interactive: true })}>
                  {t}
                </button>
              ))}
            </Demo>
            <Demo name="Count">
              <span>
                {m.ds_reviews()} <Count>4</Count>
              </span>
            </Demo>
          </div>
        </Card>

        <Card title={m.ds_controls()} meta="Toggle · Switch · Segmented · Tabs · Progress">
          <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
            <Demo name="Toggle · Switch">
              <Toggle label={m.ds_hide_autoscaling()} checked={checked} onChange={setChecked} />
              <Toggle label={m.ds_partial_group()} checked="indeterminate" onChange={() => {}} />
              <Switch label={m.ds_notifications()} checked={on} onChange={setOn} />
            </Demo>
            <Demo name="Segmented">
              <Segmented
                label="demo"
                value={seg}
                onChange={setSeg}
                items={[
                  { value: "a", label: m.ds_new(), count: 3 },
                  { value: "b", label: m.ds_frequent() },
                  { value: "c", label: m.ds_all() },
                ]}
              />
            </Demo>
            <Demo name="Tabs">
              <Tabs
                label="demo"
                value={tab}
                onChange={setTab}
                items={[
                  { value: "one", label: "Sentry", count: 2 },
                  { value: "two", label: "CloudWatch" },
                ]}
                className={css({ w: "full" })}
              >
                <p className={css({ pt: "2", color: "muted", textStyle: "body" })}>{tab === "one" ? "Sentry" : "CloudWatch"}</p>
              </Tabs>
            </Demo>
            <Demo name="Progress tone">
              <div className={css({ display: "flex", flexDirection: "column", gap: "2", w: "full" })}>
                {(["ok", "accent", "info", "warn"] as const).map((t, i) => (
                  // Progress s'étire sur la ligne (flex: 1) : on le pose dans une ligne
                  <div key={t} className={css({ display: "flex" })}>
                    <Progress label={t} tone={t} value={(i + 1) * 2} max={9} />
                  </div>
                ))}
              </div>
            </Demo>
          </div>
        </Card>
      </div>

      <div className={cols2}>
        <Card title={m.ds_lists()} meta="Item · List · H3 · Section · Empty · FitScroll">
          <H3>{m.ds_heading()}</H3>
          <List>
            {(["bad", "warn", "info", "ok", "neutral"] as const).map((t) => (
              <li key={t}>
                <Item tone={t} onSelect={() => {}}>
                  <ItemTitle>{m.ds_clickable_item()} · tone={t}</ItemTitle>
                  <ItemMeta>
                    <Badge tone={t}>{t}</Badge> #1234 · {m.ds_2_h_ago()}
                  </ItemMeta>
                </Item>
              </li>
            ))}
          </List>
          <H3>{m.ds_heading()}</H3>
          <Empty>{m.ds_nothing_show()}</Empty>
          <Section id="ds.demo" title={m.ds_collapsible_section()} remember={false}>
            <p className={css({ textStyle: "body" })}>{m.ds_section_content()}</p>
          </Section>
          <H3>FitScroll</H3>
          <FitScroll min={140}>
            <List>
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i}>
                  <Item onSelect={() => {}}>
                    <ItemTitle>
                      {m.ds_clickable_item()} · {i + 1}
                    </ItemTitle>
                  </Item>
                </li>
              ))}
            </List>
          </FitScroll>
        </Card>

        <Card title={m.ds_loading_errors()} meta="Skeleton · ErrorBox · SourceView">
          <Skeleton />
          <Skeleton h={24} />
          <ErrorBox error={{ kind: "auth", message: { key: "srv_gh_not_logged_in" }, hint: { key: "srv_hint_gh_login" } }} />
          <ErrorBox error={{ kind: "unavailable", message: { key: "srv_sentry_responded", params: { status: "500" } } }} />
        </Card>
      </div>

      <div className={cols2}>
        <Card title={m.ds_menus_dialogs()} meta="overlay">
          <div className={row}>
            <Popover.Root positioning={{ placement: "bottom-start" }}>
              <Popover.Trigger className={button()}>
                {m.ds_open_menu()} <Icon name="chevron" size={12} />
              </Popover.Trigger>
              <Portal>
                <Popover.Positioner className={overlay.popoverPositioner}>
                  <Popover.Content className={cx(overlay.popover(), css({ w: "220px" }))}>
                    <Popover.Title className={overlay.menuTitle}>{m.common_hide()}</Popover.Title>
                    <button type="button" className={overlay.menuItem}>
                      {m.common_1_hour()}
                    </button>
                    <button type="button" className={overlay.menuItem}>
                      {m.common_ignore()}
                    </button>
                  </Popover.Content>
                </Popover.Positioner>
              </Portal>
            </Popover.Root>
            <Button onClick={() => setDialog(true)}>{m.ds_open_dialog()}</Button>
            <Dialog.Root open={dialog} onOpenChange={(d) => setDialog(d.open)} lazyMount unmountOnExit>
              <Portal>
                <Dialog.Backdrop className={overlay.backdrop} />
                <Dialog.Positioner className={overlay.positioner()}>
                  <Dialog.Content className={cx(overlay.dialog({ size: "md" }), css({ p: "5" }))}>
                    <Dialog.Title className={css({ textStyle: "heading" })}>{m.ds_dialog()}</Dialog.Title>
                    <p className={css({ mt: "2", color: "muted", textStyle: "body" })}>overlay.backdrop · overlay.positioner() · overlay.dialog()</p>
                    <div className={css({ display: "flex", justifyContent: "flex-end", gap: "2", mt: "4" })}>
                      <Button onClick={() => setDialog(false)}>{m.ds_cancel()}</Button>
                      <Button variant="solid" onClick={() => setDialog(false)}>
                        {m.ds_confirm()}
                      </Button>
                    </div>
                  </Dialog.Content>
                </Dialog.Positioner>
              </Portal>
            </Dialog.Root>
          </div>
        </Card>

        <Card title={m.ds_icons()} meta="Icon">
          <div className={css({ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "3" })}>
            {ICON_NAMES.map((n) => (
              <div key={n} className={css({ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5", py: "2", borderRadius: "lg", bg: "surface.alt" })}>
                <Icon name={n} size={18} />
                <span className={code}>{n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

