import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProject, projects } from "@/data/projects";
import { profile } from "@/data/profile";
import { StatusBadge } from "@/components/StatusBadge";
import { EnergyOptimizer } from "@/components/energy/EnergyOptimizer";
import { HowItsBuilt } from "@/components/energy/HowItsBuilt";
import { Reveal } from "@/components/motion/Reveal";
import type { BacktestReport, ForecastData } from "@/lib/energy";

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", file), "utf8")) as T;
}

function Demo({ slug }: { slug: string }) {
  if (slug === "green-energy-optimizer") {
    const report = readJson<BacktestReport>("energy_backtest.json");
    return (
      <>
        <EnergyOptimizer data={readJson<ForecastData>("energy_forecast.json")} report={report} />
        <Reveal>
          <HowItsBuilt github={profile.github + "/ai-portfolio"} coverage={report.price.coverage_p10_p90} />
        </Reveal>
      </>
    );
  }
  return null;
}

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const project = getProject((await params).slug);
  return project ? { title: project.title, description: project.tagline } : {};
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const project = getProject((await params).slug);
  if (!project) notFound();

  return (
    <article className="py-16">
      <Link href="/#projects" className="text-sm text-muted hover:text-foreground">
        ← All projects
      </Link>
      <div className="mt-6 flex items-center gap-3">
        <span className="font-mono text-sm text-muted">0{project.number}</span>
        <StatusBadge status={project.status} />
      </div>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{project.title}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">{project.description}</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Skills shown</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {project.skills.map((s) => (
              <li key={s} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm">{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Stack</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {project.stack.map((s) => (
              <li key={s} className="rounded-full border border-border px-2.5 py-0.5 font-mono text-sm">{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {project.status === "planned" ? (
        <section className="mt-10 rounded-xl border border-dashed border-border bg-surface p-10 text-center text-muted">
          The live demo is being built and will appear here.
        </section>
      ) : (
        <Demo slug={project.slug} />
      )}
    </article>
  );
}
