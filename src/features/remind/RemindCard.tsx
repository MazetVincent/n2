// Carte « Remind me » du Dashboard : les points à revoir plus tard, lus dans ton fichier Markdown (remind.path).
// Ajouter (champ en haut), cocher, supprimer : N2 ne réécrit que la ligne touchée (src/server/sources/remind.ts).
// « Modifier le .md » ouvre tout le texte ; il n'est enregistré que si le fichier n'a pas changé ailleurs entre-temps.
// Les rappels faits restent dans le fichier (« - [x] »), repliés en bas, avec un bouton pour les vider.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { css, cx } from "styled-system/css";
import { Button, Card, Count, Empty, ExtLink, H3, Icon, iconButton, input, LIST_MAX_H, SourceView } from "~/components/ds";
import { toaster } from "~/lib/actions";
import { useRemind } from "~/lib/data";
import { m, msg } from "~/lib/i18n";
import { changeRemind } from "~/server/fns";
import type { Message, SourceResult } from "~/server/types";
import { groupRemind, inlineParts, REMIND_TEXT_MAX, type RemindChange, type RemindData, type RemindItem } from "./logic";

function useChangeRemind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: RemindChange) => changeRemind({ data: change }),
    // la case suit le clic tout de suite ; la réponse du serveur (ou la relecture après une erreur) fait foi
    onMutate: async (change) => {
      if (change.op !== "toggle") return;
      // une relecture en cours ne doit pas défaire la case cochée
      await qc.cancelQueries({ queryKey: ["remind"] });
      qc.setQueryData<SourceResult<RemindData>>(["remind"], (prev) =>
        prev?.ok ? { ...prev, data: { ...prev.data, items: prev.data.items.map((i) => (i.line === change.line && i.text === change.text ? { ...i, done: !i.done } : i)) } } : prev,
      );
    },
    onSuccess: (r) => {
      if (r.ok) {
        const next: SourceResult<RemindData> = { ok: true, data: r.data, fetchedAt: new Date().toISOString() };
        qc.setQueryData(["remind"], next);
        return;
      }
      fail(r.error);
      // le fichier a pu changer ailleurs : on le relit
      void qc.invalidateQueries({ queryKey: ["remind"] });
    },
    onError: () => {
      fail({ key: "common_n2_server_not_responding" });
      void qc.invalidateQueries({ queryKey: ["remind"] });
    },
  });
}
const fail = (error: Message) => toaster.create({ title: msg(error), type: "error", duration: 4000 });

export function RemindCard() {
  const q = useRemind();
  const data = q.data?.ok ? q.data.data : undefined;
  const open = data?.items.filter((i) => !i.done).length ?? 0;
  const [editing, setEditing] = useState(false);
  return (
    <Card
      collapse="remind"
      scroll={LIST_MAX_H}
      title={<>{m.remind_title()} {open > 0 && <Count>{open}</Count>}</>}
      meta={
        data && !editing && (
          <Button variant="link" onClick={() => setEditing(true)} title={data.path}>
            <Icon name="edit" size={13} />
            {m.remind_edit()}
          </Button>
        )
      }
    >
      <SourceView query={q} skeletons={1}>
        {(d) => (editing ? <RawEditor data={d} onDone={() => setEditing(false)} /> : <RemindList data={d} />)}
      </SourceView>
    </Card>
  );
}

function RemindList({ data }: { data: RemindData }) {
  const change = useChangeRemind();
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  const { open, done } = groupRemind(data.items);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    change.mutate({ op: "add", text: t }, { onSuccess: (r) => r.ok && setText("") });
  };
  return (
    <>
      <form
        className={css({ display: "flex", gap: "2", mt: "3" })}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={REMIND_TEXT_MAX}
          placeholder={m.remind_add_placeholder()}
          aria-label={m.remind_add_placeholder()}
          className={input()}
        />
        <Button type="submit" variant="outline" size="md" disabled={!text.trim() || change.isPending}>
          {m.remind_add()}
        </Button>
      </form>
      {open.length === 0 && <Empty>{data.items.length ? m.remind_all_done() : m.remind_empty()}</Empty>}
      {open.map((g) => (
        <div key={g.section ?? ""}>
          {/* une seule section : son titre ferait doublon avec celui de la carte */}
          {open.length > 1 && g.section && <H3>{g.section}</H3>}
          <ul className={list}>
            {g.items.map((it) => (
              <Row key={`${it.line}:${it.text}`} item={it} onChange={(c) => change.mutate(c)} busy={change.isPending} />
            ))}
          </ul>
        </div>
      ))}
      {done.length > 0 && (
        <div className={css({ mt: "4", pt: "3", borderTop: "1px dashed token(colors.border)" })}>
          <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
            <Button variant="link" aria-expanded={showDone} onClick={() => setShowDone((o) => !o)} className={css({ fontSize: "sm" })}>
              <Icon name="chevron" size={14} className={cx(css({ transition: "transform 0.15s" }), !showDone && css({ transform: "rotate(-90deg)" }))} />
              {m.remind_done()} ({done.length})
            </Button>
            {showDone && (
              <Button variant="accentLink" className={css({ ml: "auto", fontSize: "sm" })} disabled={change.isPending} onClick={() => change.mutate({ op: "clearDone" })}>
                {m.remind_clear_done()}
              </Button>
            )}
          </div>
          {showDone && (
            <ul className={cx(list, css({ mt: "2" }))}>
              {done.map((it) => (
                <Row key={`${it.line}:${it.text}`} item={it} onChange={(c) => change.mutate(c)} busy={change.isPending} />
              ))}
            </ul>
          )}
        </div>
      )}
      <p className={css({ mt: "3", textStyle: "caption", color: "muted", fontFamily: "mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={data.path}>
        {data.path}
        {!data.exists && ` · ${m.remind_created_on_add()}`}
      </p>
    </>
  );
}

const list = css({ listStyle: "none", m: 0, mt: "2", p: 0, display: "flex", flexDirection: "column", gap: "0.5" });

function Row({ item, onChange, busy }: { item: RemindItem; onChange: (c: RemindChange) => void; busy: boolean }) {
  const id = useId();
  // libellé du bouton : le texte tel qu'affiché, sans la syntaxe Markdown
  const plain = inlineParts(item.text).map((p) => p.text).join("");
  return (
    <li
      className={css({
        display: "flex",
        alignItems: "flex-start",
        gap: "2.5",
        px: "2",
        py: "1.5",
        borderRadius: "md",
        _hover: { bg: "surface.alt" },
        "&:hover .remind-remove, &:focus-within .remind-remove": { opacity: 1 },
      })}
    >
      <input
        id={id}
        type="checkbox"
        checked={item.done}
        disabled={busy}
        onChange={() => onChange({ op: "toggle", line: item.line, text: item.text })}
        className={css({ mt: "3px", w: "15px", h: "15px", flex: "none", accentColor: "accent", cursor: "pointer" })}
      />
      <label htmlFor={id} className={css({ flex: 1, minW: 0, cursor: "pointer", overflowWrap: "anywhere" }, item.done && { color: "muted", textDecoration: "line-through" })}>
        <Inline text={item.text} />
      </label>
      <button
        type="button"
        aria-label={m.remind_remove({ text: plain })}
        title={m.remind_remove({ text: plain })}
        disabled={busy}
        onClick={() => onChange({ op: "remove", line: item.line, text: item.text })}
        className={cx("remind-remove", css(iconButton.raw({ size: "sm" }), { w: "22px", h: "22px", opacity: 0, transition: "opacity 0.12s", _focusVisible: { opacity: 1 } }))}
      >
        <Icon name="close" size={12} />
      </button>
    </li>
  );
}

function Inline({ text }: { text: string }) {
  // clé : position du morceau dans le texte affiché (stable tant que le texte ne change pas)
  let at = 0;
  return (
    <>
      {inlineParts(text).map((p) => {
        const key = at;
        at += p.text.length + 1;
        return p.kind === "code" ? (
          <code key={key}>{p.text}</code>
        ) : p.kind === "bold" ? (
          <strong key={key}>{p.text}</strong>
        ) : p.kind === "link" ? (
          <ExtLink key={key} href={p.href} className={css({ color: "accent", textDecoration: "underline" })}>
            {p.text}
          </ExtLink>
        ) : (
          <span key={key}>{p.text}</span>
        );
      })}
    </>
  );
}

function RawEditor({ data, onDone }: { data: RemindData; onDone: () => void }) {
  const change = useChangeRemind();
  const [content, setContent] = useState(data.content);
  // version du fichier au moment où l'édition a commencé : un changement fait ailleurs depuis est refusé, pas écrasé
  const [version, setVersion] = useState(data.version);
  const changedElsewhere = data.version !== version;
  const hintId = useId();
  return (
    <form
      className={css({ mt: "3", display: "flex", flexDirection: "column", gap: "2" })}
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate({ op: "replace", content, version }, { onSuccess: (r) => r.ok && onDone() });
      }}
    >
      {changedElsewhere && (
        <p role="status" className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap", px: "2.5", py: "1.5", borderRadius: "md", bg: "warn.soft", color: "warn", fontSize: "sm" })}>
          {m.remind_changed_elsewhere()}
          <Button
            variant="accentLink"
            className={css({ ml: "auto", fontSize: "sm" })}
            onClick={() => {
              setContent(data.content);
              setVersion(data.version);
            }}
          >
            {m.remind_reload()}
          </Button>
        </p>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        aria-label={m.remind_edit()}
        aria-describedby={hintId}
        spellCheck={false}
        rows={14}
        // biome-ignore lint/a11y/noAutofocus: l'édition vient d'être demandée par un clic, le texte est la seule chose à faire
        autoFocus
        className={css(input.raw(), { h: "auto", minH: "220px", py: "2", fontFamily: "mono", fontSize: "sm", lineHeight: "1.5", resize: "vertical" })}
      />
      <p id={hintId} className={css({ textStyle: "caption", color: "muted" })}>
        {m.remind_edit_hint()}
      </p>
      <div className={css({ display: "flex", gap: "2", justifyContent: "flex-end" })}>
        <Button type="button" variant="ghost" size="md" onClick={onDone}>
          {m.prefs_cancel()}
        </Button>
        <Button type="submit" variant="solid" size="md" disabled={change.isPending || changedElsewhere || content === data.content}>
          {m.prefs_save()}
        </Button>
      </div>
    </form>
  );
}
