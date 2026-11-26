// Préférences (icône boulon, à droite de la cloche) : langue, onglets affichés, éditeur où ouvrir le code,
// chemin du projet, guide (fichier et lecture), et le fichier de « Remind me » (affiché seulement). La langue est un cookie du navigateur (la page se recharge) ; le reste est écrit dans
// config.local.json par le serveur, qui vérifie les chemins avant d'enregistrer.
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import { css } from "styled-system/css";
import { Button, ErrorBox, H3, Icon, IconButton, input, overlay, Segmented, Skeleton, Switch, ToggleChip } from "~/components/ds";
import { toaster } from "~/lib/actions";
import { usePreferences } from "~/lib/data";
import { getLang, m, msg, setLang } from "~/lib/i18n";
import { savePreferences } from "~/server/fns";
import type { Message } from "~/server/types";
import { useGuideTouched } from "~/features/secret/Konami";
import { CHOOSABLE_TABS, EDITOR_LABEL, EDITORS, HOME_TAB, LINK_TARGETS, TAB_GROUPS, type LinkTarget, type Preferences, type TabPath } from "./logic";

const TAB_LABEL: Record<string, () => string> = {
  "/pull-requests": m.tab_pull_requests,
  "/sprint": m.tab_sprint,
  "/carte": m.tab_map,
  "/librairies": m.tab_libraries,
  "/observabilite": m.tab_observability,
  "/deploiements": m.tab_deployments,
};

/** Libellé de chaque groupe de la barre d'onglets, par son premier onglet (TAB_GROUPS, src/features/prefs/logic.ts) */
const GROUP_LABEL: Record<string, () => string> = { "/dashboard": m.prefs_group_today, "/carte": m.prefs_group_code, "/observabilite": m.prefs_group_prod };

// La fenêtre est ouverte par l'adresse (?fenetre=preferences, route racine) : elle reste ouverte quand la page est
// rechargée (changement de langue). Ouvrir et fermer remplacent l'adresse : le bouton retour ne la rouvre pas.
export function PreferencesButton({ className }: { className: string }) {
  const open = useSearch({ strict: false }).fenetre === "preferences";
  const navigate = useNavigate();
  const setOpen = (o: boolean) => void navigate({ to: ".", search: (s) => ({ ...s, fenetre: o ? "preferences" : undefined }), replace: true, resetScroll: false });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={m.prefs_title()} title={m.prefs_title()} aria-haspopup="dialog" className={className}>
        <Icon name="nut" size={16} />
      </button>
      <PreferencesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Brouillon gardé le temps du rechargement de la page quand la langue change (sessionStorage, cet onglet seulement) */
const DRAFT_KEY = "n2.prefs.draft";
function readDraft(): Preferences | undefined {
  try {
    // gardé seulement le temps du rechargement : un brouillon plus ancien n'est pas repris
    const kept = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as { at: number; draft: Preferences } | null;
    return kept && Date.now() - kept.at < 30_000 ? kept.draft : undefined;
  } catch {
    return undefined;
  }
}
function dropDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* rien à retirer */
  }
}
function keepDraft(draft: Preferences) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), draft }));
  } catch {
    /* brouillon perdu au rechargement */
  }
}

function PreferencesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)} lazyMount unmountOnExit>
      <Portal>
        <Dialog.Backdrop className={overlay.backdrop} />
        <Dialog.Positioner className={overlay.positioner({ align: "scroll" })}>
          <Dialog.Content className={overlay.dialog({ size: "md" })}>
            <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", px: "5", pt: "4", pb: "2" })}>
              <Dialog.Title className={css({ textStyle: "heading" })}>{m.prefs_title()}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <IconButton label={m.prefs_cancel()}>
                  <Icon name="close" size={16} />
                </IconButton>
              </Dialog.CloseTrigger>
            </div>
            <Body onDone={() => onOpenChange(false)} />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

const LINK_LABEL: Record<LinkTarget, () => string> = { browser: m.prefs_links_browser, chrome: m.prefs_links_chrome };

function Body({ onDone }: { onDone: () => void }) {
  const q = usePreferences();
  const saved = q.data?.ok ? q.data.data : undefined;
  // après un changement de langue : le brouillon d'avant le rechargement (le secret, lui, vient toujours du serveur)
  const [kept] = useState(readDraft);
  const fromSaved = (p: Preferences): Preferences => (kept ? { ...p, ...kept, secret: p.secret } : p);
  const [draft, setDraft] = useState<Preferences | undefined>(saved && fromSaved(saved));
  useEffect(() => {
    if (kept) dropDraft();
  }, [kept]);
  useEffect(() => {
    if (saved && !draft) setDraft(fromSaved(saved));
  }, [saved, draft]);
  const [error, setError] = useState<Message | null>(null);
  const touchGuide = useGuideTouched();
  const readingId = useId();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (p: Preferences) => savePreferences({ data: p }),
    onSuccess: (r) => {
      if (!r.ok) return setError(r.error);
      qc.setQueryData(["prefs"], r);
      // projet, guide, éditeur ont pu changer : tout est relu
      void qc.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "prefs" });
      toaster.create({ title: m.prefs_saved(), type: "success", duration: 2500 });
      onDone();
    },
    onError: () => setError({ key: "srv_raw", params: { text: m.common_n2_server_not_responding() } }),
  });

  if (q.data && !q.data.ok) return <div className={css({ p: "5" })}><ErrorBox error={{ kind: "config", message: q.data.error }} /></div>;
  if (!draft) return <div className={css({ p: "5" })}><Skeleton h={240} /></div>;
  const set = (patch: Partial<Preferences>) => setDraft({ ...draft, ...patch });
  const toggleTab = (t: TabPath, on: boolean) => set({ tabs: on ? [...draft.tabs, t] : draft.tabs.filter((x) => x !== t) });
  const lang = getLang();
  const allTabs = draft.tabs.length === CHOOSABLE_TABS.length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate(draft);
      }}
    >
      <div className={css({ px: "5", pb: "4", display: "flex", flexDirection: "column", gap: "1" })}>
        <Field title={m.prefs_language()} hint={m.prefs_language_reload()}>
          <Segmented
            label={m.prefs_language()}
            value={lang}
            onChange={(v) => {
              if (v === lang) return;
              keepDraft(draft);
              setLang(v);
            }}
            items={[
              { value: "fr", label: <span className={flagRow}><FlagFr /> Français</span> },
              { value: "en", label: <span className={flagRow}><FlagUk /> English</span> },
            ]}
          />
        </Field>

        {/* le titre est un simple texte ; « Tout afficher / Tout masquer » sur sa ligne ; une ligne par groupe de la barre */}
        <Field
          title={m.prefs_tabs()}
          hint={m.prefs_tabs_hint()}
          action={
            <Button variant="link" size="xs" onClick={() => set({ tabs: allTabs ? [] : [...CHOOSABLE_TABS] })}>
              {allTabs ? m.prefs_hide_all() : m.prefs_show_all()}
            </Button>
          }
        >
          <div className={css({ display: "grid", gridTemplateColumns: "max-content repeat(3, minmax(0, 1fr))", alignItems: "center", columnGap: "2", rowGap: "1.5", smDown: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } })}>
            {TAB_GROUPS.map((group, i) => (
              <Fragment key={i}>
                <span className={css({ textStyle: "caption", color: "muted", pr: "2", smDown: { gridColumn: "1 / -1", pt: "1" } })}>{GROUP_LABEL[group[0]]?.()}</span>
                {group.includes(HOME_TAB as never) && (
                  <ToggleChip pressed disabled icon={<Icon name="lock" size={12} />} title={m.prefs_tabs_hint()} onClick={() => {}}>
                    {m.tab_dashboard()}
                  </ToggleChip>
                )}
                {CHOOSABLE_TABS.filter((t) => (group as readonly TabPath[]).includes(t)).map((t) => (
                  <ToggleChip key={t} pressed={draft.tabs.includes(t)} onClick={() => toggleTab(t, !draft.tabs.includes(t))}>
                    {TAB_LABEL[t]()}
                  </ToggleChip>
                ))}
                {/* chaque groupe commence sur une nouvelle ligne */}
                <span aria-hidden className={css({ gridColumn: "1 / -1", h: 0 })} />
              </Fragment>
            ))}
          </div>
        </Field>

        <Field title={m.prefs_editor()} hint={draft.editor === "github" ? m.prefs_github_hint() : undefined}>
          <Segmented label={m.prefs_editor()} value={draft.editor} onChange={(editor) => set({ editor })} items={EDITORS.map((e) => ({ value: e, label: EDITOR_LABEL[e] }))} />
          {draft.editor === "jetbrains" && <PathInput label={m.prefs_jetbrains_path()} value={draft.jetbrains} onChange={(jetbrains) => set({ jetbrains })} />}
        </Field>

        <Field title={m.prefs_links()} hint={draft.links === "chrome" ? m.prefs_links_chrome_hint() : undefined}>
          <Segmented label={m.prefs_links()} value={draft.links} onChange={(links) => set({ links })} items={LINK_TARGETS.map((t) => ({ value: t, label: LINK_LABEL[t]() }))} />
        </Field>

        <Field title={m.prefs_project()} hint={m.prefs_project_hint()}>
          <PathInput label={m.prefs_project()} value={draft.projectPath} onChange={(projectPath) => set({ projectPath })} />
        </Field>

        {/* affiché seulement : la page ne peut pas changer le fichier que N2 écrit (docs/adr/0010-fichier-de-rappels.md) */}
        <Field title={m.prefs_remind_path()} hint={m.prefs_remind_config_hint()}>
          <code className={css({ fontFamily: "mono", fontSize: "sm", overflowWrap: "anywhere" })}>{draft.remindPath}</code>
        </Field>

        {/* l'option du guide n'existe qu'une fois le secret débloqué (src/features/secret/Konami.tsx) */}
        {saved?.secret.unlocked && (
          <Field title={m.prefs_guide()}>
            <Segmented
              label={m.prefs_guide()}
              value={draft.guide.enabled ? "on" : "off"}
              onChange={(v) => {
                touchGuide();
                set({ guide: { ...draft.guide, enabled: v === "on" } });
              }}
              items={[
                { value: "off", label: m.prefs_guide_off() },
                { value: "on", label: m.prefs_guide_on() },
              ]}
            />
            {draft.guide.enabled && (
              <>
                <PathInput label={m.prefs_guide_path()} value={draft.guide.path} onChange={(path) => set({ guide: { ...draft.guide, path } })} />
                {/* réglages transmis au guide à son chargement (src/features/guide/embed.ts) */}
                <div role="group" aria-labelledby={readingId} className={css({ display: "flex", flexDirection: "column", gap: "2", mt: "1" })}>
                  <span id={readingId} className={css({ fontSize: "sm", color: "muted" })}>
                    {m.prefs_guide_reading()}
                  </span>
                  <SettingSwitch
                    title={m.prefs_guide_references()}
                    hint={m.prefs_guide_references_hint()}
                    checked={draft.guide.references}
                    onChange={(references) => set({ guide: { ...draft.guide, references } })}
                  />
                  <SettingSwitch title={m.prefs_guide_terms()} hint={m.prefs_guide_terms_hint()} checked={draft.guide.terms} onChange={(terms) => set({ guide: { ...draft.guide, terms } })} />
                </div>
              </>
            )}
          </Field>
        )}

        <Field title={m.prefs_diagnostic()} hint={m.prefs_diagnostic_hint()}>
          <Link to="/sources" onClick={onDone} className={css({ fontSize: "md", color: "info" })}>
            {m.prefs_source_status()} →
          </Link>
        </Field>

        {error && <p role="alert" className={css({ mt: "2", color: "bad", fontSize: "md" })}>{msg(error)}</p>}
      </div>
      <div className={css({ display: "flex", alignItems: "center", gap: "2", px: "5", py: "3", borderTop: "1px solid token(colors.border)" })}>
        <span className={css({ textStyle: "caption", color: "muted", mr: "auto" })}>{m.prefs_saved_where()}</span>
        <Button size="sm" onClick={onDone}>
          {m.prefs_cancel()}
        </Button>
        <Button size="sm" variant="solid" type="submit" disabled={save.isPending}>
          {m.prefs_save()}
        </Button>
      </div>
    </form>
  );
}

/** Rubrique des préférences : un titre en simple texte ; `action` : un lien posé sur la ligne du titre (ex. « Tout masquer ») */
function Field({ title, hint, action, children }: { title?: string; hint?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className={css({ display: "flex", flexDirection: "column", gap: "2", pb: "2" })}>
      {title && (
        <H3>
          {title}
          {action && <span className={css({ ml: "auto", textTransform: "none", letterSpacing: "normal", fontWeight: "normal" })}>{action}</span>}
        </H3>
      )}
      {children}
      {hint && <p className={css({ fontSize: "sm", color: "muted" })}>{hint}</p>}
    </section>
  );
}

/** Interrupteur d'un réglage : son nom sur la ligne de l'interrupteur (toute la ligne est cliquable), son explication dessous */
function SettingSwitch({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const hintId = useId();
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "0.5" })}>
      <Switch
        checked={checked}
        onChange={onChange}
        describedBy={hintId}
        className={css({ w: "full", justifyContent: "space-between", gap: "4" })}
        label={<span className={css({ fontSize: "md", color: "text" })}>{title}</span>}
      />
      <span id={hintId} className={css({ fontSize: "sm", color: "muted" })}>
        {hint}
      </span>
    </div>
  );
}

function PathInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={css({ display: "flex", flexDirection: "column", gap: "1", fontSize: "sm", color: "muted" })}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoComplete="off" className={css(input.raw(), { fontFamily: "mono", fontSize: "sm" })} />
    </label>
  );
}

const flagRow = css({ display: "inline-flex", alignItems: "center", gap: "1.5" });
const flag = css({ w: "18px", h: "12px", borderRadius: "2px", flex: "none", boxShadow: "0 0 0 1px rgb(0 0 0 / 12%)" });

const FlagFr = () => (
  <svg viewBox="0 0 3 2" className={flag} aria-hidden>
    <rect width="1" height="2" fill="#0055A4" />
    <rect x="1" width="1" height="2" fill="#FFFFFF" />
    <rect x="2" width="1" height="2" fill="#EF4135" />
  </svg>
);

const FlagUk = () => (
  <svg viewBox="0 0 60 30" preserveAspectRatio="none" className={flag} aria-hidden>
    <clipPath id="n2-uk-t">
      <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
    </clipPath>
    <rect width="60" height="30" fill="#012169" />
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
    <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#n2-uk-t)" stroke="#C8102E" strokeWidth="4" />
    <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
    <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
  </svg>
);
