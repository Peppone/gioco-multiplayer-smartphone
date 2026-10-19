import { useState } from "react";
import { MazeDrawing } from "./MazeDrawing";
import { SymbolIcon } from "./symbols";
import type { ManualBlock, ManualPage } from "./types";

function Block({ b }: { b: ManualBlock }) {
  switch (b.type) {
    case "h":
      return <h4>{b.text}</h4>;
    case "p":
      return <p>{b.text}</p>;
    case "list": {
      const List = b.ordered ? "ol" : "ul";
      return (
        <List>
          {(b.items ?? []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <table className="art-table">
          <thead>
            <tr>
              {(b.head ?? []).map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(b.rows ?? []).map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "symbols":
      return (
        <div className="art-columns" data-testid="art-columns">
          {(b.columns ?? []).map((col, i) => (
            <ol key={i} aria-label={`Colonna ${i + 1}`}>
              {col.map((id) => (
                <li key={id}>
                  <SymbolIcon id={id} />
                </li>
              ))}
            </ol>
          ))}
        </div>
      );
    case "mazes":
      return (
        <div className="art-mazes" data-testid="art-mazes">
          {(b.mazes ?? []).map((mz, i) => (
            <figure key={i}>
              <MazeDrawing size={b.size ?? 6} cells={mz.cells} marks={mz.marks} />
              <figcaption>Labirinto {i + 1}</figcaption>
            </figure>
          ))}
        </div>
      );
    case "words":
      return (
        <ul className="art-words" data-testid="art-words" aria-label="Parole">
          {(b.words ?? []).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      );
  }
}

/** Una pagina del manuale. Solo testo e disegni: niente da scorrere in orizzontale. */
export function ManualPageView({ page }: { page: ManualPage }) {
  return (
    <article className="art-page" data-testid="art-page" data-page={page.id}>
      <h3>{page.title}</h3>
      {page.blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </article>
  );
}

/** Il manuale dell'esperto: schede con le sole pagine che ha; l'indice dice chi ha le altre. */
export function Manual({ pages, index }: { pages: ManualPage[]; index: { id: number; title: string; owners: string[]; mine: boolean }[] }) {
  const [open, setOpen] = useState(pages[0]?.id ?? null);
  const page = pages.find((p) => p.id === open) ?? pages[0];
  const others = index.filter((i) => !i.mine);
  return (
    <div className="art-manual" data-testid="art-manual">
      <div className="art-tabs" role="tablist" aria-label="Pagine del manuale">
        {pages.map((p) => (
          <button key={p.id} role="tab" aria-selected={page?.id === p.id} data-testid="art-tab" className={page?.id === p.id ? "primary" : ""} onClick={() => setOpen(p.id)}>
            {p.title}
          </button>
        ))}
      </div>
      <div className="art-manual-body">{page ? <ManualPageView page={page} /> : <p className="muted">Nessuna pagina per te.</p>}</div>
      {others.length > 0 && (
        <p className="art-others muted" data-testid="art-others">
          Le altre pagine: {others.map((o) => `${o.title} (${o.owners.join(", ") || "—"})`).join(" · ")}
        </p>
      )}
    </div>
  );
}
