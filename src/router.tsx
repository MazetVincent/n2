import { Link, createRouter } from "@tanstack/react-router";
import { css } from "styled-system/css";
import { m } from "./lib/i18n";
import { routeTree } from "./routeTree.gen";

function NotFound() {
  return (
    <p className={css({ color: "muted", py: "8", textAlign: "center" })}>
      {m.app_page_not_found()} <Link to="/dashboard">{m.app_back_dashboard()}</Link>
    </p>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
