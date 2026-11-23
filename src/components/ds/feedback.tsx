// Chargement et erreurs d'une source de données.
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { msg } from "~/lib/i18n";
import type { SourceError, SourceResult } from "~/server/types";

// ---------- Chargement / erreurs d'une source ----------
export const Skeleton = ({ h = 46 }: { h?: number }) => (
  <div className={css({ borderRadius: "lg", bg: "surface.alt", mt: "2", animation: "pulse 1.2s infinite ease-in-out" })} style={{ height: h }} />
);

export function ErrorBox({ error }: { error: SourceError }) {
  const hint = msg(error.hint)?.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
  return (
    <div
      className={css({
        mt: "3",
        p: "3",
        borderRadius: "lg",
        bg: error.kind === "auth" ? "warn.soft" : "bad.soft",
        color: error.kind === "auth" ? "warn" : "bad",
      })}
    >
      <strong>{msg(error.message)}</strong>
      {hint && <p className={css({ mt: "1", color: "text" })}>{hint}</p>}
    </div>
  );
}

export function SourceView<T>({ query, children, skeletons = 2 }: { query: UseQueryResult<SourceResult<T>>; children: (data: T) => ReactNode; skeletons?: number }) {
  if (query.isPending) return <>{Array.from({ length: skeletons }, (_, i) => <Skeleton key={i} />)}</>;
  if (query.isError) return <ErrorBox error={{ kind: "unavailable", message: { key: "common_n2_server_not_responding" }, hint: { key: "ds_restart_bun_run_dev" } }} />;
  const result = query.data;
  if (!result.ok) return <ErrorBox error={result.error} />;
  return <>{children(result.data)}</>;
}
