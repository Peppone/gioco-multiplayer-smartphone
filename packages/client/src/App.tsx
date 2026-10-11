import { Admin } from "./admin/Admin";
import { Play } from "./play/Play";
import { Screen } from "./screen/Screen";

export function App() {
  const area = window.location.pathname.split("/")[1];
  if (area === "play") return <Play />;
  if (area === "admin") return <Admin />;
  return <Screen />;
}
