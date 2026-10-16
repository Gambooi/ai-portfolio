import type { Metadata } from "next";
import { profile } from "@/data/profile";

export const metadata: Metadata = { title: `About | ${profile.name}` };

export default function About() {
  return (
    <section className="max-w-2xl py-16">
      <h1 className="text-4xl font-semibold tracking-tight">About</h1>
      <div className="mt-6 space-y-4 text-lg text-muted">
        {profile.about.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <dl className="mt-10 grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
        <dt className="text-muted">Based in</dt>
        <dd>{profile.location}</dd>
        <dt className="text-muted">Languages</dt>
        <dd>{profile.languages.join(", ")}</dd>
        <dt className="text-muted">Email</dt>
        <dd><a href={`mailto:${profile.email}`} className="text-accent hover:underline">{profile.email}</a></dd>
        <dt className="text-muted">LinkedIn</dt>
        <dd><a href={profile.linkedin} className="text-accent hover:underline" target="_blank" rel="noreferrer">Profile</a></dd>
        {profile.cvUrl && (
          <>
            <dt className="text-muted">CV</dt>
            <dd><a href={profile.cvUrl} className="text-accent hover:underline">Download PDF</a></dd>
          </>
        )}
      </dl>
    </section>
  );
}
