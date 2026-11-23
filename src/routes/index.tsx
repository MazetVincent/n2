import { createFileRoute, redirect } from "@tanstack/react-router";

// La page d'accueil est le Dashboard
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
