import { useEffect } from "react";
import { type Role, type Rules, rulesSections } from "./rulesText";

interface Props {
  role: Role;
  rules: Rules;
  onClose: () => void;
}

/** Le regole a schermo intero, scorrevoli, con i numeri di questa partita e la parte che riguarda il ruolo del giocatore. */
export function RulesDialog({ role, rules, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(role, rules).map((s) => (
          <section key={s.title} className={s.title.startsWith("Per te") ? "gf-rules-mine" : undefined}>
            <h3>{s.title}</h3>
            {s.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
      </div>
      <button className="primary gf-rules-close" onClick={onClose}>Ho capito</button>
    </div>
  );
}
