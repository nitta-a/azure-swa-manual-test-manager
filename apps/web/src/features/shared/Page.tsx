import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main>
      <nav>
        <Link to="/test-runs">Manual Test Manager</Link>
        <span className="nav-links">
          <Link to="/test-runs">Runs</Link>
          <Link to="/pull-requests">Pull Requests</Link>
          <Link to="/test-definitions">Definitions</Link>
        </span>
      </nav>
      <header>
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  );
}
