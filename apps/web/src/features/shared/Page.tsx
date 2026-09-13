import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main>
      <nav>
        <Link to="/pull-requests">Manual Test Manager</Link>
      </nav>
      <header>
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  );
}
