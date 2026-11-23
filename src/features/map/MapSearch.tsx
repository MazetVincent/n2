// Recherche de la carte, avec autocomplétion : librairies, parties, sous-dossiers et fichiers clés (cherchés dans la page),
// puis passages des README du projet et du guide de l'équipe (cherchés par le serveur, qui garde leur texte).
// Les suggestions s'affichent sous le champ ; flèches + Entrée ou clic pour choisir.
import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { css } from "styled-system/css";
import { Icon, input, overlay } from "~/components/ds";
import { BookIcon } from "~/features/guide/GuideLinks";
import { plural } from "~/lib/format";
import { getLang, m, trPart } from "~/lib/i18n";
import { searchDocs } from "~/server/fns";
import type { CodeMapData, DocHit } from "~/server/types";
import { allLibs, libLabel } from "./model";

export type MapSearchHit =
  | { kind: "lib"; name: string }
  | { kind: "node"; id: string }
  | { kind: "sub"; id: string; sub: string }
  | { kind: "file"; file: string }
  | { kind: "doc"; hit: DocHit };

type Group = "lib" | "part" | "file" | "readme" | "guide";
interface Option {
  value: string;
  group: Group;
  label: string;
  hint?: string;
  hit: MapSearchHit;
}

const GROUPS: Group[] = ["lib", "part", "file", "readme", "guide"];
const GROUP_LABEL: Record<Group, () => string> = {
  lib: m.common_libraries,
  part: m.search_map_parts,
  file: m.search_key_files,
  readme: m.map_search_readmes,
  guide: m.common_team_guide,
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Suggestions tirées de la carte : tous les mots tapés doivent apparaître ; ceux qui commencent par la requête d'abord */
export function localOptions(data: CodeMapData, tests: boolean, query: string): Option[] {
  const q = norm(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const pick = (list: Option[], max: number, key: (o: Option) => string) =>
    list
      .map((o) => ({ o, hay: norm(`${o.label} ${key(o)}`), label: norm(o.label) }))
      .filter((x) => words.every((w) => x.hay.includes(w)))
      .sort((a, b) => Number(!b.label.startsWith(q)) - Number(!a.label.startsWith(q)) || Number(!b.label.includes(q)) - Number(!a.label.includes(q)))
      .slice(0, max)
      .map((x) => x.o);

  const libs: Option[] = allLibs(data, tests).map((l) => ({
    value: `lib:${l.name}`,
    group: "lib",
    label: libLabel(l.name),
    hint: `${plural(l.files, m.common_file(), m.common_files_2())} · ${plural(l.parts, m.common_part(), m.map_parts_2())}`,
    hit: { kind: "lib", name: l.name },
  }));
  const parts: Option[] = data.nodes
    .filter((n) => n.files > 0 || (tests && n.testFiles > 0))
    .flatMap((n) => [
      { value: `node:${n.id}`, group: "part" as const, label: trPart(n.label), hint: n.path, hit: { kind: "node" as const, id: n.id } },
      ...n.contains.map((s) => ({ value: `sub:${n.id}:${s.name}`, group: "part" as const, label: `${trPart(n.label)} › ${trPart(s.name)}`, hint: s.path, hit: { kind: "sub" as const, id: n.id, sub: s.name } })),
    ]);
  const seen = new Set<string>();
  const files: Option[] = [];
  for (const f of [...data.topFiles, ...data.hotspots]) {
    if (seen.has(f.file)) continue;
    seen.add(f.file);
    files.push({ value: `file:${f.file}`, group: "file", label: f.file.split("/").slice(-2).join("/"), hint: f.file, hit: { kind: "file", file: f.file } });
  }
  return [...pick(libs, 6, () => ""), ...pick(parts, 6, (o) => o.hint ?? ""), ...pick(files, 5, (o) => o.hint ?? "")];
}

const docOption = (h: DocHit): Option => ({ value: h.key, group: h.kind, label: h.title, hint: h.where, hit: { kind: "doc", hit: h } });

/** Texte tapé, envoyé au serveur 150 ms après la dernière frappe */
function useDebounced(value: string, ms = 150) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function MapSearch({ data, tests, value, onPick, onClear }: { data: CodeMapData; tests: boolean; value: string; onPick: (hit: MapSearchHit) => void; onClear: () => void }) {
  // le champ suit la sélection de la carte (tag, lien depuis un autre onglet…) : la librairie affichée
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const [open, setOpen] = useState(false);
  const lang = getLang();
  const q = useDebounced(text.trim());
  const docs = useQuery({
    queryKey: ["docs-search", q, lang],
    queryFn: () => searchDocs({ data: { q, lang } }),
    enabled: open && q.length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const docData = q.length >= 2 && docs.data?.ok ? docs.data.data : undefined;
  const docHits = useMemo(() => docData ?? [], [docData]);

  const options = useMemo(() => [...localOptions(data, tests, text), ...docHits.map(docOption)], [data, tests, text, docHits]);
  const collection = useMemo(
    () => createListCollection({ items: options, itemToValue: (o) => o.value, itemToString: (o) => o.label, groupBy: (o) => o.group, groupSort: GROUPS }),
    [options],
  );
  const searching = docs.isFetching && q.length >= 2;

  return (
    <Combobox.Root
      collection={collection}
      inputValue={text}
      onInputValueChange={(d) => {
        // seules les frappes (et la croix) changent le texte ; un choix le règle lui-même (onValueChange)
        if (d.reason !== "input-change" && d.reason !== "clear-trigger") return;
        setText(d.inputValue);
        if (!d.inputValue.trim()) onClear();
      }}
      value={[]}
      onValueChange={(d) => {
        const o = d.items[0] as Option | undefined;
        if (!o) return;
        setText(o.hit.kind === "lib" ? o.hit.name : "");
        onPick(o.hit);
      }}
      open={open && text.trim().length > 0}
      onOpenChange={(d) => setOpen(d.open)}
      openOnClick
      inputBehavior="autohighlight"
      selectionBehavior="preserve"
      allowCustomValue
      positioning={{ placement: "bottom-start", gutter: 4, sameWidth: false }}
      className={css({ flex: 1, minW: "220px", maxW: "520px" })}
    >
      <Combobox.Label className={css({ srOnly: true })}>{m.map_search_label()}</Combobox.Label>
      <Combobox.Control className={css({ position: "relative", display: "flex", alignItems: "center" })}>
        <Icon name="search" size={14} className={css({ position: "absolute", left: "2.5", color: "muted", pointerEvents: "none" })} />
        <Combobox.Input
          placeholder={m.map_search_placeholder()}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            // Échap sur un champ sans suggestions ouvertes : on vide la recherche
            if (e.key === "Escape" && !open && text) {
              setText("");
              onClear();
            }
          }}
          className={css(input.raw(), { bg: "surface.alt", pl: "8", pr: "8" })}
        />
        {text && (
          <Combobox.ClearTrigger
            aria-label={m.map_close()}
            className={css({ position: "absolute", right: "1.5", display: "grid", placeItems: "center", w: "22px", h: "22px", border: "none", borderRadius: "md", bg: "transparent", color: "muted", cursor: "pointer", _hover: { bg: "surface", color: "text" } })}
          >
            ×
          </Combobox.ClearTrigger>
        )}
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner className={overlay.popoverPositioner}>
          <Combobox.Content className={css(overlay.popover.raw({ kind: "panel" }), { w: "min(560px, calc(100vw - 32px))", maxH: "min(460px, 60vh)", overflowY: "auto", p: "1.5" })}>
            {collection.size === 0 && <p className={emptyCls}>{searching ? m.map_search_searching_docs() : m.map_search_no_result()}</p>}
            {collection.group().map(([group, items]) => (
              <Combobox.ItemGroup key={group}>
                <Combobox.ItemGroupLabel className={groupCls}>
                  {(group === "readme" || group === "guide") && <BookIcon size={11} />}
                  {GROUP_LABEL[group as Group]()}
                </Combobox.ItemGroupLabel>
                {items.map((o: Option) => (
                  <Combobox.Item key={o.value} item={o} className={itemCls}>
                    <span className={css({ display: "flex", alignItems: "baseline", gap: "2", minW: 0 })}>
                      <Combobox.ItemText className={css({ fontWeight: "semibold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "none", maxW: "60%" })}>{o.label}</Combobox.ItemText>
                      {o.hint && <span className={css({ color: "muted", fontSize: "xs", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minW: 0 })}>{o.hint}</span>}
                    </span>
                    {o.hit.kind === "doc" && o.hit.hit.snippet && <span className={css({ color: "muted", fontSize: "sm", lineClamp: 2 })}>{o.hit.hit.snippet}</span>}
                  </Combobox.Item>
                ))}
              </Combobox.ItemGroup>
            ))}
            {collection.size > 0 && searching && <p className={emptyCls}>{m.map_search_searching_docs()}</p>}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}

const emptyCls = css({ p: "2.5", color: "muted", fontSize: "sm" });
const groupCls = css({ display: "flex", alignItems: "center", gap: "1.5", px: "2.5", pt: "2", pb: "1", fontSize: "xs", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "muted" });
const itemCls = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  px: "2.5",
  py: "1.5",
  borderRadius: "lg",
  cursor: "pointer",
  fontSize: "md",
  _highlighted: { bg: "surface.alt" },
});
