// Liens vers le guide de l'équipe depuis les autres onglets : sections choisies dans la config (Déploiements, Observabilité, PR)
// et sections qui parlent d'un fichier ou d'une partie du code (carte, trace Sentry, ma branche).
import { Link } from "@tanstack/react-router";
import { Button } from "~/components/ds";
import { useMemo, useState, type ReactNode } from "react";
import { css, cx } from "styled-system/css";
import { useGuide, ok } from "~/lib/data";
import { getLang, m } from "~/lib/i18n";
import type { GuideTabLinks } from "~/server/types";
import { guideTarget, pageTitle, sectionsForFiles, text, type SectionMatch } from "./logic";

const linkCls = css({ color: "info", textDecoration: "none", _hover: { textDecoration: "underline" } });

export function GuideLink({ target, children, className, title }: { target: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <Link to="/guide" search={{ p: target }} className={cx(linkCls, className)} title={title}>
      {children}
    </Link>
  );
}

// Petite marque « guide » devant les liens, pour les reconnaître d'un coup d'œil
export const BookIcon = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={css({ flex: "none" })}>
    <path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20v-5" />
  </svg>
);

/**
 * Ligne « Dans le guide : … » avec les sections choisies pour l'onglet dans la config (guide.links).
 * Le titre vient du guide (il suit les nouvelles versions) ; une adresse qu'il ne connaît plus est ignorée.
 * Rien n'est affiché si le guide n'est pas configuré ou si aucune section n'est choisie pour l'onglet.
 */
export function GuideReflexLinks({ tab }: { tab: keyof GuideTabLinks }) {
  const guide = ok(useGuide());
  if (!guide) return null;
  const lang = getLang();
  const titleOf = (target: string) => {
    const s = guide.sections.find((x) => guideTarget(x.page, x.id) === target);
    if (s) return text(s.title, lang);
    const p = guide.pages.find((x) => x.key === target);
    return p ? text(p.title, lang) : null;
  };
  const items = (guide.links?.[tab] ?? []).flatMap((target) => {
    const label = titleOf(target);
    return label ? [{ target, label }] : [];
  });
  if (!items.length) return null;
  return (
    <p className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap", fontSize: "sm", color: "muted" })}>
      <BookIcon />
      <span>{m.guide_guide()}</span>
      {items.map((it, i) => (
        <span key={it.target} className={css({ display: "inline-flex", gap: "2" })}>
          {i > 0 && <span aria-hidden>·</span>}
          <GuideLink target={it.target}>{it.label}</GuideLink>
        </span>
      ))}
    </p>
  );
}

/** Liste des sections du guide trouvées pour des fichiers (les plus pertinentes d'abord, le reste replié) */
export function GuideMatches({ matches, max = 4, showFiles = false, empty }: { matches: SectionMatch[]; max?: number; showFiles?: boolean; empty?: ReactNode }) {
  const guide = ok(useGuide());
  const [all, setAll] = useState(false);
  if (!guide) return null;
  if (!matches.length) return empty ? <>{empty}</> : null;
  const lang = getLang();
  const shown = all ? matches : matches.slice(0, max);
  return (
    <ul className={css({ listStyle: "none", p: 0, m: 0, display: "flex", flexDirection: "column", gap: "1" })}>
      {shown.map((match) => (
        <li key={guideTarget(match.section.page, match.section.id)} className={css({ display: "flex", alignItems: "baseline", gap: "2", fontSize: "sm", minW: 0 })}>
          <span className={css({ color: "muted", alignSelf: "center" })}>
            <BookIcon size={12} />
          </span>
          <span className={css({ minW: 0 })}>
            <GuideLink target={guideTarget(match.section.page, match.section.id)}>{text(match.section.title, lang)}</GuideLink>
            {pageTitle(guide, match.section.page, lang) !== text(match.section.title, lang) && <span className={css({ color: "muted" })}> · {pageTitle(guide, match.section.page, lang)}</span>}
            {showFiles && match.files.length > 1 && <span className={css({ color: "muted" })}> · {m.common_files({ files: match.files.length })}</span>}
          </span>
        </li>
      ))}
      {matches.length > max && (
        <li>
          <Button variant="link" onClick={() => setAll((v) => !v)}>
            {all ? m.guide_fewer_sections() : m.guide_more_sections({ matches: matches.length - max })}
          </Button>
        </li>
      )}
    </ul>
  );
}

/**
 * « Dans le guide » pour une liste de fichiers (ma branche, une trace Sentry) : les sections qui en parlent.
 * Rien n'est affiché si le guide n'est pas configuré ou ne cite aucun de ces fichiers.
 */
export function GuideForFiles({ files, title, max = 4, className }: { files: string[]; title?: ReactNode; max?: number; className?: string }) {
  const guide = ok(useGuide());
  // un même fichier peut revenir plusieurs fois (trace Sentry) : gardé une fois, à sa première place
  const key = [...new Set(files)].join("\n");
  const matches = useMemo(() => sectionsForFiles(guide, key ? key.split("\n") : []), [guide, key]);
  if (!matches.length) return null;
  return (
    <div className={className}>
      {title}
      <GuideMatches matches={matches} max={max} showFiles={files.length > 1} />
    </div>
  );
}

