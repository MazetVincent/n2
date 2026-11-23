// Sélecteur de branche de « Ma branche » : un tag (barre du haut, Dashboard, Carte…) qui ouvre une fenêtre modale :
// un champ de recherche, puis trois sections — la branche actuelle (un clic), les branches locales et les branches
// distantes (résultat du dernier git fetch), ces deux listes défilant chacune dans une hauteur maximale.
// Choisir une branche ne fait aucun checkout : N2 compare simplement cette branche à la branche principale.
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { css, cx } from "styled-system/css";
import { badge, Button, Icon, input, overlay } from "~/components/ds";
import { toaster } from "~/lib/actions";
import { ok, useBranches } from "~/lib/data";
import { ago } from "~/lib/format";
import { m, msg } from "~/lib/i18n";
import { fetchBranches } from "~/server/fns";
import type { BranchList, BranchRef } from "./logic";

type Group = "current" | "local" | "remote";
interface Option {
  value: string;
  group: Group;
  date: string | null;
}

function options(list: BranchList | undefined, filter: string): Record<Group, Option[]> {
  const f = filter.trim().toLowerCase();
  const keep = (name: string) => !f || name.toLowerCase().includes(f);
  const of = (group: Group) => (b: BranchRef) => ({ value: b.name, group, date: b.date });
  return {
    current: list?.current && keep(list.current) ? [{ value: list.current, group: "current", date: null }] : [],
    local: (list?.local ?? []).filter((b) => keep(b.name)).map(of("local")),
    remote: (list?.remote ?? []).filter((b) => keep(b.name)).map(of("remote")),
  };
}

/** Le tag de la branche : nom de la branche choisie (ou actuelle), un clic ouvre la fenêtre de choix */
export function BranchTag({ selected, onClick, className }: { selected: string | undefined; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(css(badge.raw({ tone: "accent", interactive: true }), { fontSize: "sm", py: "2px", minW: 0 }), className)}
      title={m.branches_switch_branch()}
      aria-label={m.branches_branch_switch_branch({ selected: selected ?? "…" })}
      aria-haspopup="dialog"
    >
      <Icon name="branch" size={13} />
      <span className={css({ maxW: "36ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>{selected ?? "…"}</span>
      <Icon name="chevron" size={12} />
    </button>
  );
}

/**
 * `value` : branche choisie (paramètre d'URL), undefined pour la branche actuelle du projet.
 * `onChange(undefined)` quand on revient à la branche actuelle : l'URL reste propre et suit le dépôt.
 */
export function BranchPicker({ value, onChange, className }: { value: string | undefined; onChange: (branch: string | undefined) => void; className?: string }) {
  const list = ok(useBranches());
  const [open, setOpen] = useState(false);
  const selected = value ?? list?.current ?? undefined;
  return (
    <>
      <BranchTag selected={selected} onClick={() => setOpen(true)} className={className} />
      <BranchDialog open={open} onOpenChange={setOpen} value={value} onChange={onChange} />
    </>
  );
}

export function BranchDialog({ open, onOpenChange, value, onChange }: { open: boolean; onOpenChange: (open: boolean) => void; value: string | undefined; onChange: (branch: string | undefined) => void }) {
  const q = useBranches();
  const list = ok(q);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const fetchMut = useMutation({
    mutationFn: () => fetchBranches(),
    onSuccess: (r) => {
      if (r.ok) qc.setQueryData(["branches"], r);
      toaster.create({ title: r.ok ? m.branches_remote_branches_up_date() : msg(r.error.message), type: r.ok ? "success" : "error", duration: 2500 });
    },
    onError: () => toaster.create({ title: m.common_n2_server_not_responding(), type: "error", duration: 2500 }),
  });

  const selected = value ?? list?.current ?? undefined;
  const groups = useMemo(() => options(list, filter), [list, filter]);
  // ordre du clavier : branche actuelle, locales, distantes
  const flat = useMemo(() => [...groups.current, ...groups.local, ...groups.remote], [groups]);
  useEffect(() => setActive(0), [filter, open]);
  // garde l'élément actif visible, dans sa liste qui défile (accolades : scrollIntoView peut renvoyer une Promise)
  useEffect(() => {
    bodyRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (name: string) => {
    onChange(name === list?.current ? undefined : name);
    onOpenChange(false);
  };

  const indexOf = (o: Option) => flat.indexOf(o);
  const row = (o: Option) => {
    const i = indexOf(o);
    return (
      <div
        key={`${o.group}:${o.value}`}
        id={`n2-branch-${i}`}
        data-index={i}
        role="option"
        aria-selected={o.value === selected}
        data-active={i === active || undefined}
        onPointerMove={() => setActive(i)}
        onClick={() => choose(o.value)}
        className={itemCls}
      >
        <span className={css({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minW: 0 })}>{o.value}</span>
        {o.date && <span className={css({ color: "muted", fontSize: "xs", whiteSpace: "nowrap" })}>{ago(o.date)}</span>}
        {o.value === selected && <Icon name="check" size={14} className={css({ color: "accent" })} />}
      </div>
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(d) => {
        onOpenChange(d.open);
        if (!d.open) setFilter("");
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className={overlay.backdrop} />
        <Dialog.Positioner className={overlay.positioner({ align: "top" })}>
          <Dialog.Content className={overlay.dialog({ size: "md" })}>
            <Dialog.Title className={css({ srOnly: true })}>{m.branches_choose_branch()}</Dialog.Title>
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={m.branches_filter_branches()}
              aria-controls="n2-branches"
              aria-activedescendant={flat[active] ? `n2-branch-${active}` : undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(flat.length - 1, a + 1));
                else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
                else if (e.key === "Enter" && flat[active]) choose(flat[active].value);
                else return;
                e.preventDefault();
              }}
              className={css(input.raw({ bare: true }), { borderBottom: "1px solid token(colors.border)", px: "4", py: "3.5", fontSize: "lg" })}
            />
            <div id="n2-branches" ref={bodyRef} role="listbox" aria-label={m.branches_project_branches()} className={css({ p: "2", display: "flex", flexDirection: "column", gap: "1" })}>
              {q.isPending && <p className={emptyCls}>{m.branches_loading_branches()}</p>}
              {q.data && !q.data.ok && <p className={emptyCls}>{msg(q.data.error.message)}</p>}
              {list && !flat.length && <p className={emptyCls}>{m.branches_no_matching_branch()}</p>}

              {groups.current.length > 0 && <Section label={m.branches_current_branch()}>{groups.current.map(row)}</Section>}
              {groups.local.length > 0 && (
                <Section label={m.branches_local_branches()} count={groups.local.length}>
                  <div className={scrollCls}>{groups.local.map(row)}</div>
                </Section>
              )}
              {list && (
                <Section
                  label={m.branches_remote_branches()}
                  count={groups.remote.length}
                  action={
                    <Button size="xs" disabled={fetchMut.isPending} onClick={() => fetchMut.mutate()} title={m.branches_remote_refs_already_fetched()}>
                      <Icon name="refresh" size={13} spin={fetchMut.isPending} /> git fetch
                    </Button>
                  }
                >
                  {groups.remote.length > 0 ? <div className={scrollCls}>{groups.remote.map(row)}</div> : <p className={emptyCls}>{m.branches_no_matching_branch()}</p>}
                </Section>
              )}
            </div>
            <div className={css({ display: "flex", gap: "3", px: "3", py: "2", borderTop: "1px solid token(colors.border)", fontSize: "xs", color: "muted" })}>
              <span>↑ ↓ {m.search_navigate()}</span>
              <span>{m.search_enter_open()}</span>
              <span>{m.search_esc_close()}</span>
              {value && list?.current && (
                <button type="button" onClick={() => choose(list.current!)} className={css({ ml: "auto", border: "none", bg: "transparent", p: 0, color: "accent", fontSize: "xs", fontWeight: "semibold", cursor: "pointer", _hover: { textDecoration: "underline" } })}>
                  {m.branches_back_to_current()}
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function Section({ label, count, action, children }: { label: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section role="group" aria-label={label}>
      <div className={groupCls}>
        <span>
          {label}
          {count !== undefined && <span className={css({ fontWeight: "normal" })}> · {count}</span>}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

const emptyCls = css({ px: "2.5", py: "2", color: "muted", fontSize: "md" });
const groupCls = css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2", px: "2.5", pt: "2", pb: "1", fontSize: "xs", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "muted" });
// les listes de branches locales et distantes défilent chacune dans leur hauteur
const scrollCls = css({ maxH: "min(220px, 26vh)", overflowY: "auto", overscrollBehavior: "contain", scrollbarWidth: "thin" });
const itemCls = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "2.5",
  py: "1.5",
  borderRadius: "lg",
  cursor: "pointer",
  fontSize: "md",
  fontFamily: "mono",
  "&[data-active]": { bg: "accent.soft" },
  "&[aria-selected=true]": { color: "accent", fontWeight: "semibold" },
});
