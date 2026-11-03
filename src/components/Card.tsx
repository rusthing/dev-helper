import type { ReactNode } from "react";

export function Card({
  title,
  right,
  children,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {(title || right) && (
        <div className="card__head">
          {title && <h3 className="card__title">{title}</h3>}
          {right && <div className="card__right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
