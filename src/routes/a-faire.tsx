import { createFileRoute, redirect } from "@tanstack/react-router";

// Ancienne adresse de l'onglet « À faire », devenu le Dashboard : les favoris continuent de marcher
export const Route = createFileRoute("/a-faire")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dashboard", search });
  },
});
