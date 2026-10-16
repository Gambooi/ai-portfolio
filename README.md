# AI & Automation Portfolio

Portfolio site with five working AI/automation prototypes.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

Site content lives in `src/data/profile.ts` (about you) and `src/data/projects.ts` (the project list).

## Free stack

| Need | Service | Free tier |
|---|---|---|
| Hosting + API routes | Vercel Hobby | Free for personal, non-commercial sites |
| LLM | Google Gemini API (Flash models) | Free tier with rate limits; free-tier prompts may be used by Google, so demos use public/sample data only |
| Fallback LLM | Groq (open models) | Free tier with rate limits |
| Scheduled Python jobs (forecasts, evals) | GitHub Actions | Free on public repos |
| Vector DB / storage | Supabase (Postgres + pgvector) | Free tier; pauses after a week without activity |
| Rate limiting / cache | Upstash Redis | Free tier |

## Projects

1. Green Energy Optimizer: data engineering + forecasting (Energinet, DMI)
2. Invoice Extraction Automation: document AI + human-in-the-loop
3. Spørg Dokumenterne: Danish RAG with citations
4. Support-Ops Agent: tool-calling agent with live trace
5. LLM Evaluation Dashboard: evals for projects 3 and 4
