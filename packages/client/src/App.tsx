import { Suspense, lazy } from "react";

// Ogni area è un pezzo separato: il telefono scarica solo /play, non regia e schermo.
const Play = lazy(() => import("./play/Play").then((m) => ({ default: m.Play })));
const Admin = lazy(() => import("./admin/Admin").then((m) => ({ default: m.Admin })));
const Preview = lazy(() => import("./preview/Preview").then((m) => ({ default: m.Preview })));
const Screen = lazy(() => import("./screen/Screen").then((m) => ({ default: m.Screen })));

export function App() {
  const area = window.location.pathname.split("/")[1];
  const Area = area === "play" ? Play : area === "admin" ? Admin : area === "preview" ? Preview : Screen;
  return (
    <Suspense fallback={<main className="center"><p>Caricamento…</p></main>}>
      <Area />
    </Suspense>
  );
}
