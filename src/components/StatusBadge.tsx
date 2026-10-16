import type { ProjectStatus } from "@/data/projects";

const labels: Record<ProjectStatus, string> = {
  live: "Live demo",
  building: "In progress",
  planned: "Coming soon",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const live = status === "live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        live ? "border-accent text-accent" : "border-border text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-muted"}`} />
      {labels[status]}
    </span>
  );
}
