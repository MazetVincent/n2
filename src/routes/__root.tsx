/// <reference types="vite/client" />
import { Toast, Toaster } from "@ark-ui/react/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRoute, retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState, type ReactNode } from "react";
import { css } from "styled-system/css";
import { CommandPalette } from "~/components/command-palette";
import { branchParam } from "~/features/branches/search";
import { Notifier } from "~/features/notify/Notifier";
import { Konami } from "~/features/secret/Konami";
import { TopBar, useTabShortcuts } from "~/components/top-bar";
import { toaster } from "~/lib/actions";
import { getLang } from "~/lib/i18n";
import { THEME_SCRIPT, themeAttributes } from "~/features/theme/logic";
import { getTheme } from "~/features/theme/theme";
import appCss from "~/styles/app.css?url";
import fontsCss from "~/styles/fonts.css?url";
import mapCss from "~/styles/map.css?url";

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23e5007d'/%3E%3Ctext x='16' y='22' font-family='system-ui' font-weight='800' font-size='15' fill='white' text-anchor='middle'%3EN2%3C/text%3E%3C/svg%3E";

// ?branche=… : branche choisie dans « Ma branche », valable pour tous les onglets. Elle suit chaque navigation
// (onglets, liens, ⌘K) jusqu'à ce qu'on revienne à la branche actuelle dans le sélecteur.
// ?fenetre=preferences : fenêtre Préférences ouverte (gardée au rechargement de la page, ex. changement de langue).
export const Route = createRootRoute({
  validateSearch: z.object({ branche: branchParam, fenetre: z.enum(["preferences"]).optional().catch(undefined) }),
  search: { middlewares: [retainSearchParams(["branche"])] },
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "N2" }],
    links: [
      { rel: "stylesheet", href: fontsCss },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: mapCss },
      { rel: "icon", href: FAVICON },
    ],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
});

function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl+K : recherche globale
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Shortcuts />
      <Notifier />
      <Konami />
      <TopBar onSearch={() => setSearchOpen(true)} />
      <main className={css({ px: "max(24px, calc((100% - 1392px) / 2))", pt: "4", pb: "8", mdDown: { px: "4", pt: "3" } })}>
        <Outlet />
      </main>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <Toaster toaster={toaster}>
        {(toast) => (
          <Toast.Root
            key={toast.id}
            className={css({
              bg: toast.type === "error" ? "bad" : "text",
              color: "bg",
              px: "3.5",
              py: "2",
              borderRadius: "lg",
              fontSize: "md",
              boxShadow: "0 8px 24px rgb(0 0 0 / 20%)",
            })}
          >
            <Toast.Title>{toast.title}</Toast.Title>
            {toast.description && <Toast.Description className={css({ fontSize: "sm", opacity: 0.85, mt: "0.5", maxW: "420px" })}>{toast.description}</Toast.Description>}
          </Toast.Root>
        )}
      </Toaster>
    </QueryClientProvider>
  );
}

function Shortcuts() {
  useTabShortcuts();
  return null;
}

function RootDocument({ children }: { children: ReactNode }) {
  // thème choisi (cookie) : le script pose le thème affiché et son schéma avant l'affichage ; il ajoute des attributs à
  // <html> que React ne rend pas (data-theme, data-scheme), d'où suppressHydrationWarning (cet élément seulement)
  return (
    <html lang={getLang()} {...themeAttributes(getTheme())} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script constant écrit dans le code (src/features/theme/logic.ts) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
