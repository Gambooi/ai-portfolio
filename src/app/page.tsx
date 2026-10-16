import Link from "next/link";
import { profile } from "@/data/profile";
import { projects } from "@/data/projects";
import { ProjectCard } from "@/components/ProjectCard";

export default function Home() {
  return (
    <>
      <section className="py-20 sm:py-28">
        <p className="font-mono text-sm text-accent">{profile.location}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {profile.name}
          <span className="block text-muted">{profile.role}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">{profile.tagline}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="#projects"
            className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
          >
            See the projects
          </Link>
          <a
            href={`mailto:${profile.email}`}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:border-accent"
          >
            Get in touch
          </a>
        </div>
      </section>

      <section id="projects" className="scroll-mt-8">
        <h2 className="text-2xl font-semibold tracking-tight">Projects</h2>
        <p className="mt-2 text-muted">
          Five working prototypes, each showing a different skill. Every demo runs in one click.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      </section>
    </>
  );
}
