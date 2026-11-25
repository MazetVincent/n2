// Barre du haut : logo, recherche (large, juste à côté du logo) et « Ma branche », rafraîchir (avec l'heure de mise à jour),
// session AWS, notifications, préférences (boulon) ; les onglets (avec compteurs) en dessous.
import { Link, useCanGoBack, useHydrated, useNavigate, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import { css, cva, cx } from "styled-system/css";
import { button, Icon, iconButton } from "~/components/ds";
import { useTabBadges, type BadgeTone } from "~/features/badges";
import { BranchDialog } from "~/features/branches/BranchPicker";
import { setBranchFilter, useBranchFilter } from "~/features/branches/filter";
import { NotifyToggle } from "~/features/notify/NotifyToggle";
import { PreferencesButton } from "~/features/prefs/PreferencesDialog";
import { ALL_TABS, GHOST_TAB, GUIDE_TAB, TAB_GROUPS, visibleTabs, type TabPath } from "~/features/prefs/logic";
import { ok, useAwsSession, useBranches, usePreferences, useRefreshAll } from "~/lib/data";
import { remaining, timeFr } from "~/lib/format";
import { toaster } from "~/lib/actions";
import { m, msg } from "~/lib/i18n";
import { getAppInfo, reconnectAws } from "~/server/fns";

const TAB_LABELS = {
  "/dashboard": m.tab_dashboard,
  "/pull-requests": m.tab_pull_requests,
  "/sprint": m.tab_sprint,
  "/carte": m.tab_map,
  "/librairies": m.tab_libraries,
  "/observabilite": m.tab_observability,
  "/deploiements": m.tab_deployments,
  "/statistiques": m.tab_stats,
  "/guide": m.tab_guide,
} as const;
// Trois groupes, séparés par un espace plus large : le travail du jour, le code, la prod (src/features/prefs/logic.ts).
// Les onglets affichés suivent les préférences ; Stats est un onglet « fantôme » : toujours le dernier à droite, invisible
// (même au survol), absent de la recherche ⌘K et des raccourcis 1 à 9 (voir aussi src/features/secret/Konami.tsx).
const TAB_PATHS = ALL_TABS;
/** Premier onglet de chaque groupe (sauf le tout premier) : c'est lui qui porte l'espace avant le groupe */
const GROUP_STARTS = new Set<string>(TAB_GROUPS.slice(1).map((g) => g[0]));

/**
 * Les onglets que la recherche ⌘K connaît, avec leur libellé dans la langue courante : tous, même ceux masqués dans
 * la barre (on les retrouve en les cherchant), sauf le fantôme, et le Guide quand il est désactivé.
 */
export const getTabs = (guideEnabled = true) => TAB_PATHS.filter((to) => to !== GHOST_TAB && (guideEnabled || to !== GUIDE_TAB)).map((to) => ({ to, label: TAB_LABELS[to]() }));

/** Onglets de la barre selon les préférences (tous tant qu'elles ne sont pas lues) */
function useVisibleTabs(): TabPath[] {
  const p = usePreferences().data;
  return visibleTabs(p?.ok ? p.data : undefined);
}

// Contrôles de la barre (recherche, rafraîchir, Ma branche, AWS) : bouton « control » du design system, 34px de haut ;
// les boutons-icônes (notifications, préférences) : carrés de 34px, même cadre
const ctrlRaw = button.raw({ variant: "control", size: "bar" });
const iconCtrl = iconButton({ size: "bar", framed: true });

const tabBadge = cva({
  base: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "1", minW: "20px", px: "7px", borderRadius: "full", fontSize: "xs", lineHeight: "18px", textAlign: "center", border: "1px solid token(colors.border)", bg: "surface.alt", color: "muted" },
  variants: {
    tone: {
      "": {},
      ok: { bg: "ok.soft", color: "ok", borderColor: "transparent" },
      warn: { bg: "warn.soft", color: "warn", borderColor: "transparent" },
      bad: { bg: "bad.soft", color: "bad", borderColor: "transparent" },
    },
  },
});

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const badges = useTabBadges();
  const refreshAll = useRefreshAll();
  const fetching = useIsFetching() > 0;
  const lastUpdate = useLastUpdate();
  const shown = useVisibleTabs();
  const tabs = shown.map((to) => ({ to, label: TAB_LABELS[to]() }));
  // raccourcis 1 à 9 : les onglets affichés, sans le fantôme
  const keyOf = (to: string) => shown.filter((t) => t !== GHOST_TAB).indexOf(to as TabPath) + 1;

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navRef = useRef<HTMLElement>(null);
  const fade = useScrollFade(navRef, pathname);


  return (
    <header
      className={css({
        // 1re ligne : logo, recherche, actions ; 2e ligne : onglets sur toute la largeur (défilables s'ils ne tiennent pas)
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gridTemplateAreas: '"logo search actions" "nav nav nav"',
        alignItems: "center",
        columnGap: "3",
        rowGap: "1",
        pt: "2.5",
        px: "max(24px, calc((100% - 1392px) / 2))",
        borderBottom: "1px solid token(colors.border)",
        bg: "color-mix(in srgb, token(colors.bg) 88%, transparent)",
        backdropFilter: "saturate(1.4) blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        mdDown: { px: "4", "--logo-x": "32px" },
        // Thème sombre : le logo, une enseigne au néon, irradie sa couleur sur la barre (halo autour du logo et lueur
        // qui court sur le bord du bas), au rythme de ses battements. --logo-x : centre du logo (marge + 18px).
        "--logo-x": "calc(max(24px, (100% - 1392px) / 2) + 18px)",
        "@media (prefers-color-scheme: dark)": {
          "&::before, &::after": { content: '""', position: "absolute", pointerEvents: "none", zIndex: -1, animation: "neon-flicker 9s linear infinite" },
          _before: { inset: 0, bgImage: "radial-gradient(720px 170px at var(--logo-x) 26px, rgb(255 61 119 / 30%), rgb(255 61 119 / 10%) 45%, transparent 78%)" },
          _after: { left: 0, right: 0, bottom: "-1px", h: "1px", bgImage: "linear-gradient(90deg, transparent, rgb(255 61 119 / 85%) var(--logo-x), rgb(255 61 119 / 25%) calc(var(--logo-x) + 360px), transparent calc(var(--logo-x) + 720px))" },
        },
      })}
    >
      <Link
        to="/dashboard"
        aria-label={m.topbar_n2_home()}
        // clair : carré rose ; sombre : enseigne au néon, sans fond, qui bat de temps en temps
        className={css({
          gridArea: "logo",
          position: "relative",
          display: "grid",
          placeItems: "center",
          w: "36px",
          h: "36px",
          borderRadius: "lg",
          bg: { base: "accent", _osDark: "transparent" },
          color: { base: "white", _osDark: "neon" },
          fontWeight: "800",
          fontSize: { base: "base", _osDark: "18px" },
          fontStyle: { _osDark: "italic" },
          textDecoration: "none",
          letterSpacing: "-0.02em",
        })}
      >
        <span className={css({ textShadow: "neonSign", animation: { _osDark: "neon-flicker 9s linear infinite" } })}>N2</span>
        <DemoBadge />
      </Link>
      <nav
        ref={navRef}
        aria-label={m.topbar_sections()}
        data-fade={fade}
        className={css({
          gridArea: "nav",
          position: "relative",
          display: "flex",
          alignItems: "stretch",
          gap: "1",
          minW: 0,
          // premier onglet aligné sur le logo (le texte, pas le bord de l'onglet)
          mx: "-3",
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          // fondu sur le bord où il reste des onglets à faire défiler
          "&[data-fade=end]": { maskImage: "linear-gradient(to right, black calc(100% - 32px), transparent)" },
          "&[data-fade=start]": { maskImage: "linear-gradient(to right, transparent, black 32px)" },
          "&[data-fade=both]": { maskImage: "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)" },
        })}
      >
        {tabs.map((t) => {
          const b = badges[t.to];
          const ghost = t.to === GHOST_TAB;
          return (
            <Link
              key={t.to}
              to={t.to}
              data-group-start={GROUP_STARTS.has(t.to) || undefined}
              data-ghost={ghost || undefined}
              title={ghost ? undefined : `${t.label} (${m.topbar_key()} ${keyOf(t.to)})`}
              className={css({
                position: "relative",
                flex: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "2",
                whiteSpace: "nowrap",
                px: "3",
                pt: "10px",
                pb: "10px",
                color: "muted",
                fontWeight: "semibold",
                textDecoration: "none",
                borderBottom: "2px solid transparent",
                transition: "color 0.12s, border-color 0.12s",
                _hover: { color: "text", borderBottomColor: "border" },
                _focusVisible: { outlineOffset: "-4px", borderRadius: "lg" },
                "&[data-status=active]": { color: "text", borderBottomColor: "accent", textShadow: "neonText" },
                "&[data-status=active] > span": { textShadow: "none" },
                // sombre : le trait de l'onglet actif devient un tube de néon
                "@media (prefers-color-scheme: dark)": {
                  "&[data-status=active]::after": { content: '""', position: "absolute", left: 0, right: 0, bottom: "-2px", h: "2px", borderRadius: "full", bg: "neon", boxShadow: "neonTube" },
                },
                "&[data-group-start]": { ml: "6", mdDown: { ml: "3" } },
                // fantôme : poussé à droite, invisible en toutes circonstances (survol, clavier, onglet actif, pas de main au survol), mais cliquable
                "&[data-ghost], &[data-ghost]:hover, &[data-ghost]:focus-visible, &[data-ghost][data-status=active]": { ml: "auto", opacity: 0, outline: "none", cursor: "default" },
              })}
            >
              {t.label}
              {b && (
                <span className={cx(tabBadge({ tone: b.tone as BadgeTone }), "tabular")}>
                  {b.icon && <Icon name={b.icon} size={11} />}
                  {b.text}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {/* retour, recherche ⌘K, puis « Ma branche » : la branche suivie par tous les onglets */}
      <div className={css({ gridArea: "search", display: "flex", alignItems: "center", gap: "2.5", minW: 0 })}>
        <BackButton />
        <button
          type="button"
          onClick={onSearch}
          title={m.topbar_search_everywhere_k()}
          aria-label={m.topbar_search_everywhere()}
          className={css(ctrlRaw, {
            flex: 1,
            w: "full",
            maxW: "560px",
            minW: 0,
            px: "3",
            bg: "surface.alt",
            cursor: "text",
            mdDown: { w: "auto", cursor: "pointer" },
          })}
        >
          <Icon name="search" size={15} />
          <span className={css({ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", mdDown: { display: "none" } })}>
            {m.topbar_search_prs_tickets_errors_files()}
          </span>
          <kbd className={css({ fontSize: "xs", fontFamily: "inherit", border: "1px solid token(colors.border)", borderRadius: "sm", px: "1", lineHeight: "16px", bg: "surface", mdDown: { display: "none" } })}>⌘K</kbd>
        </button>
        <TopBranch />
      </div>
      <div className={css({ gridArea: "actions", justifySelf: "end", minW: 0, display: "flex", alignItems: "center", gap: "2" })}>
        <button
          type="button"
          onClick={refreshAll}
          disabled={fetching}
          aria-label={m.topbar_refresh_all_sources()}
          title={lastUpdate ? m.topbar_last_updated_at({ lastUpdate: timeFr(lastUpdate) }) : m.topbar_loading()}
          className={css(ctrlRaw, { _disabled: { opacity: 1, cursor: "progress", color: "muted", _hover: { bg: "surface" } } })}
        >
          <Icon name="refresh" size={16} spin={fetching} />
          <span className={cx(css({ textStyle: "caption" }), "tabular")}>{fetching ? m.topbar_updating() : lastUpdate ? timeFr(lastUpdate) : "…"}</span>
        </button>
        <AwsBadge />
        <NotifyToggle className={iconCtrl} />
        <PreferencesButton className={iconCtrl} />
      </div>
    </header>
  );
}

// Retour à la page précédente de N2, telle qu'on l'a laissée : l'adresse garde l'onglet, ses filtres et ses fenêtres
// (fiche d'une librairie, sélection de la carte…). Grisé quand N2 n'a pas de page précédente dans cet onglet du navigateur.
function BackButton() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // le serveur ne connaît pas l'historique : grisé au premier rendu, puis l'état du navigateur (sinon, après un
  // rechargement de la page, l'attribut « disabled » rendu par le serveur resterait)
  const hydrated = useHydrated();
  return (
    <button type="button" onClick={() => router.history.back()} disabled={!hydrated || !canGoBack} aria-label={m.topbar_back()} title={m.topbar_back()} className={iconCtrl}>
      <Icon name="back" size={16} />
    </button>
  );
}

// « Ma branche » : un contrôle scindé de la même hauteur que les autres. À gauche, la branche choisie (?branche=, gardée
// sur tous les onglets ; sinon la branche actuelle du projet) : un clic ouvre le choix de branche. À droite, le filtre
// (◎) : allumé, les onglets ne montrent que ce qui concerne cette branche, et tout le contrôle passe en rose.
function TopBranch() {
  const { branche } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const filtered = useBranchFilter();
  const list = ok(useBranches());
  const [open, setOpen] = useState(false);
  const selected = branche ?? list?.current ?? undefined;
  const filterLabel = filtered ? m.branches_filter_on_help() : m.branches_filter_switch_help();
  return (
    <div role="group" aria-label={m.common_my_branch()} data-on={filtered || undefined} className={branchGroup}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={m.branches_switch_branch()}
        aria-label={m.branches_branch_switch_branch({ selected: selected ?? "…" })}
        aria-haspopup="dialog"
        className={cx(branchPart, css({ px: "3" }))}
      >
        <Icon name="branch" size={16} />
        <span className={css({ minW: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "mono", textStyle: "caption", color: "text" })}>{selected ?? "…"}</span>
        <Icon name="chevron" size={12} />
      </button>
      <button type="button" aria-pressed={filtered} aria-label={m.branches_filter_switch()} title={filterLabel} onClick={() => setBranchFilter(!filtered)} className={cx(branchPart, branchFilter)}>
        <Icon name="target" size={16} />
      </button>
      <BranchDialog open={open} onOpenChange={setOpen} value={branche} onChange={(b) => navigate({ to: ".", search: (s) => ({ ...s, branche: b }), resetScroll: false })} />
    </div>
  );
}

const branchGroup = css({
  display: "flex",
  alignItems: "stretch",
  flex: "none",
  h: "34px",
  maxW: "45%",
  minW: 0,
  border: "1px solid token(colors.border)",
  borderRadius: "lg",
  bg: "surface",
  overflow: "hidden",
  transition: "border-color 0.12s, background 0.12s",
  "&[data-on]": { borderColor: "accent", bg: "accent.soft" },
});
const branchPart = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minW: 0,
  border: "none",
  bg: "transparent",
  color: "muted",
  cursor: "pointer",
  transition: "background 0.12s, color 0.12s",
  _hover: { bg: "surface.alt", color: "text" },
  "[data-on] > &": { _hover: { bg: "color-mix(in srgb, token(colors.accent) 10%, transparent)" } },
  _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "-2px" },
});
const branchFilter = css({
  flex: "none",
  justifyContent: "center",
  w: "34px",
  borderLeft: "1px solid token(colors.border)",
  "[data-on] > &": { borderLeftColor: "accent", color: "accent", _hover: { color: "accent" } },
});

/**
 * Barre d'onglets défilante : garde l'onglet actif visible (au chargement, en changeant d'onglet ou de largeur)
 * et dit de quel côté il reste des onglets cachés, pour le fondu.
 * On fait défiler la barre elle-même : scrollIntoView ferait aussi défiler la page.
 */
function useScrollFade(ref: RefObject<HTMLElement | null>, pathname: string): "none" | "start" | "end" | "both" {
  const [fade, setFade] = useState<"none" | "start" | "end" | "both">("none");
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => {
      const start = nav.scrollLeft > 1;
      const end = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
      setFade(start && end ? "both" : start ? "start" : end ? "end" : "none");
    };
    const reveal = () => {
      const active = nav.querySelector<HTMLElement>("[data-status=active]");
      if (active) {
        const margin = 32; // la largeur du fondu
        const left = active.offsetLeft; // la barre est positionnée : position dans son contenu
        if (left - margin < nav.scrollLeft) nav.scrollLeft = Math.max(0, left - margin);
        else if (left + active.offsetWidth + margin > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = left + active.offsetWidth + margin - nav.clientWidth;
      }
      update();
    };
    reveal();
    // la largeur change avec la fenêtre et quand les compteurs arrivent
    const ro = new ResizeObserver(reveal);
    ro.observe(nav);
    for (const el of nav.children) ro.observe(el);
    nav.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      nav.removeEventListener("scroll", update);
    };
  }, [ref, pathname]);
  return fade;
}

// Heure de la dernière mise à jour des données (toutes sources confondues)
function useLastUpdate(): number | null {
  const qc = useQueryClient();
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const update = () => {
      const times = qc.getQueryCache().getAll().map((q) => q.state.dataUpdatedAt).filter(Boolean);
      if (alive) setLast(times.length ? Math.max(...times) : null);
    };
    update();
    // Le cache prévient aussi quand une autre page crée une requête PENDANT son rendu :
    // on reporte la mise à jour après ce rendu (sinon React signale un setState pendant le rendu d'un autre composant).
    const unsubscribe = qc.getQueryCache().subscribe(() => queueMicrotask(update));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [qc]);
  return last;
}

// Raccourcis : 1 à 9 pour les onglets affichés (sans l'onglet fantôme)
export function useTabShortcuts() {
  const navigate = useNavigate();
  const shown = useVisibleTabs().filter((t) => t !== GHOST_TAB);
  const key = shown.join(",");
  useEffect(() => {
    const paths = key.split(",");
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (/input|textarea|select/i.test(t.tagName) || t.isContentEditable) return;
      const n = Number(e.key);
      if (n >= 1 && n <= paths.length) navigate({ to: paths[n - 1] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, key]);
}

// Session AWS : temps restant ; une fois expirée, un clic lance la reconnexion configurée (aws.reconnect,
// `npm run aws:login` dans le projet suivi), qui ouvre le navigateur pour se connecter. Tout est rafraîchi ensuite.
function AwsBadge() {
  const aws = useAwsSession().data;
  const refreshAll = useRefreshAll();
  const reconnect = useMutation({
    mutationFn: () => reconnectAws(),
    onMutate: () => toaster.create({ id: "aws-reconnect", type: "loading", title: m.topbar_connecting_aws(), description: m.topbar_finish_signing_browser() }),
    onSuccess: (r) => {
      toaster.update("aws-reconnect", r.ok ? { type: "success", title: m.topbar_connected_aws(), description: undefined, duration: 2500 } : { type: "error", title: m.topbar_aws_sign_failed(), description: msg(r.error), duration: 8000 });
      if (r.ok) void refreshAll();
    },
    onError: () => toaster.update("aws-reconnect", { type: "error", title: m.common_n2_server_not_responding(), description: undefined, duration: 4000 }),
  });
  // place réservée pendant le chargement : la barre ne saute pas
  if (!aws) return <span aria-hidden className={css({ w: "96px", h: "34px", smDown: { display: "none" } })} />;
  const left = remaining(aws.expiresAt);
  const tone = !aws.expiresAt ? "muted" : !left ? "bad" : left.endsWith("min") ? "warn" : "muted";
  const clickable = tone === "bad" && aws.canReconnect;
  const until = aws.expiresAt && timeFr(new Date(aws.expiresAt));
  const title = clickable
    ? m.topbar_aws_session_expired_click_sign({ profile: aws.profile })
    : until
      ? m.topbar_aws_session_valid_until({ profile: aws.profile, until })
      : m.topbar_aws_session_expiry_unknown();
  const className = cx(
    // même gabarit que les contrôles de la barre ; ce n'est un bouton qu'une fois la session expirée
    css({ display: "inline-flex", alignItems: "center", gap: "2", h: "34px", px: "3", borderRadius: "lg", textStyle: "caption", whiteSpace: "nowrap", border: "1px solid token(colors.border)", bg: "surface", smDown: { display: "none" } }),
    tone === "bad" ? css({ bg: "bad.soft", color: "bad", borderColor: "transparent" }) : tone === "warn" ? css({ bg: "warn.soft", color: "warn", borderColor: "transparent" }) : css({ color: "muted" }),
    clickable && css({ cursor: "pointer", _hover: { borderColor: "currentColor" }, _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "2px" }, _disabled: { cursor: "progress" } }),
    "tabular",
  );
  const content = (
    <>
      <Icon name={reconnect.isPending ? "refresh" : "clock"} size={16} spin={reconnect.isPending} />
      AWS {reconnect.isPending ? m.topbar_connecting() : aws.expiresAt ? (left ?? m.topbar_expired()) : "?"}
    </>
  );
  return clickable ? (
    <button type="button" title={title} className={className} disabled={reconnect.isPending} onClick={() => reconnect.mutate()}>
      {content}
    </button>
  ) : (
    <span title={title} className={className}>
      {content}
    </span>
  );
}

/** Mode démo (bun run demo) : un badge sous le logo, pour ne jamais confondre ces données inventées avec les vraies */
function DemoBadge() {
  const info = useQuery({ queryKey: ["app-info"], queryFn: () => getAppInfo(), staleTime: Number.POSITIVE_INFINITY });
  if (!info.data?.demo) return null;
  return (
    <span
      title={m.topbar_demo_hint()}
      className={css({ position: "absolute", bottom: "-7px", left: "50%", transform: "translateX(-50%)", px: "1", borderRadius: "sm", bg: "warn", color: "contrast", fontSize: "2xs", fontStyle: "normal", fontWeight: "700", letterSpacing: "0.02em", lineHeight: "1.4" })}
    >
      {m.topbar_demo()}
    </span>
  );
}
