import Link from "next/link";
import type { Project } from "@/data/projects";
import { StatusBadge } from "./StatusBadge";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group flex flex-col rounded-xl border border-border bg-surface p-6 transition hover:border-accent"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted">0{project.number}</span>
        <StatusBadge status={project.status} />
      </div>
      <h3 className="mt-4 text-lg font-semibold group-hover:text-accent">{project.title}</h3>
      <p className="mt-2 text-sm text-muted">{project.tagline}</p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {project.skills.map((s) => (
          <li key={s} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-foreground">
            {s}
          </li>
        ))}
      </ul>
    </Link>
  );
}
