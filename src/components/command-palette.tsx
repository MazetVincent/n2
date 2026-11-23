// Recherche globale et lanceur (⌘K / Ctrl+K) : onglets, liens rapides, environnements, PR, tickets, erreurs,
// parties, sous-dossiers, librairies, fichiers.
// Fenêtre modale Ark UI (Dialog : focus piégé, Échap, clic à l'extérieur) ; liste filtrée au clavier (↑ ↓ Entrée).
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { css } from "styled-system/css";
import { buildIndex, searchIndex, type SearchItem } from "~/features/search";
import { openInChrome } from "~/lib/actions";
import { ok, useCodeMap, useDeploy, useGuide, usePreferences, usePullRequests, useQuickLinks, useSentry, useSprint } from "~/lib/data";
import { m } from "~/lib/i18n";
import { guideVisible } from "~/features/prefs/logic";
import { getTabs } from "./top-bar";
import { Icon, input, overlay } from "./ds";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const prs = ok(usePullRequests());
  const sprint = ok(useSprint());
  const sentry = ok(useSentry());
  const map = ok(useCodeMap(open)); // la carte n'est analysée que si on ouvre la recherche (ou son onglet)
  const links = useQuickLinks(open).data;
  const deploy = ok(useDeploy());
  const guide = ok(useGuide(open));
  const prefs = usePreferences().data;
  const guideOn = guideVisible(prefs?.ok ? prefs.data : undefined);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const index = useMemo(() => buildIndex({ tabs: getTabs(guideOn), links, deploy, prs, sprint, sentry, map, guide }), [guideOn, links, deploy, prs, sprint, sentry, map, guide]);
  const results = useMemo(() => searchIndex(index, query), [index, query]);
  useEffect(() => setActive(0), [query, open]);
  // Accolades obligatoires : Chrome renvoie désormais une Promise depuis scrollIntoView, et React prendrait
  // cette valeur pour la fonction de nettoyage de l'effet (« destroy is not a function »).
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (item: SearchItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    setQuery("");
    if (item.action.kind === "url") openInChrome(item.action.url);
    else navigate({ to: item.action.to, search: item.action.search as never });
  };

  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)} lazyMount unmountOnExit>
      <Portal>
        <Dialog.Backdrop className={overlay.backdrop} />
        <Dialog.Positioner className={overlay.positioner({ align: "top" })}>
          <Dialog.Content className={overlay.dialog({ size: "md" })}>
            <Dialog.Title className={css({ srOnly: true })}>{m.search_global_search()}</Dialog.Title>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={m.search_search_pr_ticket_link_environment()}
              aria-controls="n2-search-results"
              aria-activedescendant={results[active] ? `n2-search-${active}` : undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
                else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
                else if (e.key === "Enter") run(results[active]);
                else return;
                e.preventDefault();
              }}
              className={css(input.raw({ bare: true }), { borderBottom: "1px solid token(colors.border)", px: "4", py: "3.5", fontSize: "lg" })}
            />
            <ul id="n2-search-results" ref={listRef} role="listbox" className={css({ listStyle: "none", m: 0, p: "1.5", maxH: "min(420px, 60vh)", overflowY: "auto" })}>
              {results.length === 0 && <li className={css({ p: "3", color: "muted", fontSize: "md" })}>{m.search_no_results()}{!map && m.search_map_loading()}</li>}
              {results.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return (
                  <li key={item.id}>
                    {header && <div className={css({ px: "2.5", pt: "2", pb: "1", fontSize: "xs", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "muted" })}>{header}</div>}
                    <div
                      id={`n2-search-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onPointerMove={() => setActive(i)}
                      onClick={() => run(item)}
                      className={css({ display: "flex", alignItems: "center", gap: "2", px: "2.5", py: "1.5", borderRadius: "lg", cursor: "pointer", "&[aria-selected=true]": { bg: "accent.soft" } })}
                    >
                      <span className={css({ flex: 1, minW: 0, display: "flex", flexDirection: "column" })}>
                        <span className={css({ fontSize: "md", fontWeight: "550", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>{item.label}</span>
                        {item.hint && <span className={css({ fontSize: "xs", color: "muted", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>{item.hint}</span>}
                      </span>
                      {/* s'ouvre dans Chrome, hors de N2 */}
                      {item.action.kind === "url" && <Icon name="external" size={13} className={css({ color: "muted" })} />}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={css({ display: "flex", gap: "3", px: "3", py: "2", borderTop: "1px solid token(colors.border)", fontSize: "xs", color: "muted" })}>
              <span>↑ ↓ {m.search_navigate()}</span>
              <span>{m.search_enter_open()}</span>
              <span>{m.search_esc_close()}</span>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
