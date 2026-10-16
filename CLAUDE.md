# Agent Instructions

This repo follows the DOE (Directive → Orchestration → Execution) pattern for its data/AI pipelines. The website itself is ordinary Next.js app code.

## Layers

- **Directives** (`directives/`): SOPs in Markdown, one per project. They define goals, inputs, which scripts to run in what order, outputs, and known edge cases. Read the relevant directive before working on a project.
- **Orchestration**: you. Read the directive, run the scripts in order, handle errors, and update the directive with what you learn.
- **Execution** (`ml/`): deterministic Python scripts. Use the venv at `ml/.venv` (`ml/.venv/Scripts/python.exe` on Windows). Dependencies are pinned in `ml/requirements.txt`.

## Rules

1. Check `ml/` for an existing script before writing a new one.
2. When something breaks: fix the script, test it, then update the directive with the learning (API limits, data quirks, timing).
3. Don't create or overwrite directives without asking, unless explicitly told to.
4. Never use paid APIs or services without asking. The project budget is zero: free tiers only.

## Files

- `ml/data/`: intermediate data (Parquet). Never commit; always regenerate with the scripts.
- `public/data/`: small published outputs the website reads (e.g. forecast JSON). These are committed.
- `src/`: Next.js website. Site content lives in `src/data/profile.ts` and `src/data/projects.ts`.

## Deploys

Pushing to `main` on GitHub (Gambooi/ai-portfolio) deploys automatically to Vercel: https://gam-pedersen-ai.vercel.app
