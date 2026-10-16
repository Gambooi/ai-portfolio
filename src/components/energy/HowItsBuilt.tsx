const steps = [
  { title: "Fetch", body: "Energinet prices, CO₂ and tariffs. Open-Meteo weather forecasts for 5 locations in Denmark and Germany." },
  { title: "Train", body: "LightGBM quantile models (P10/P50/P90) for price and CO₂, 1–7 days ahead, plus conformal calibration." },
  { title: "Forecast", body: "Today's weather forecast in, 7-day forecast out, written as a small JSON file." },
  { title: "Publish", body: "Committed to GitHub, which redeploys this site on Vercel. The planner runs in your browser." },
];

const decisions = [
  ["Forecast days 2–7, not tomorrow",
    "Tomorrow's prices are published around 13:00 the day before, so the model's job starts where published data ends."],
  ["Train on old forecasts, not old weather",
    "The model learns from weather forecasts as they looked 1–7 days in advance (Open-Meteo's archive of previous runs). Training on observed weather would make the backtest look better than reality."],
  ["Ranges, not just one line",
    "Quantile models give an 80% range, calibrated with conformal prediction on the most recent 3 months. The page reports how often reality actually lands inside it."],
  ["What households actually pay",
    "The planner adds Radius' time-of-use grid tariff (expensive 17–21), Energinet's tariffs, electricity tax and VAT. Spot price alone would pick the wrong hours."],
  ["A daily batch job, not a server",
    "Forecasts change once a day, so a scheduled GitHub Actions job is enough. No server to keep warm, nothing to pay for, and the page loads instantly."],
];

export function HowItsBuilt({ github, coverage }: { github: string; coverage: number }) {
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-semibold tracking-tight">How it&apos;s built</h2>

      <ol className="mt-6 grid gap-3 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative rounded-xl border border-border bg-surface p-4">
            <div className="font-mono text-xs text-accent">0{i + 1}</div>
            <div className="mt-1 font-medium">{s.title}</div>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">
        Runs every afternoon on GitHub Actions, after the next day&apos;s prices are published. Retrains and re-tests the model each run.
        Total cost: 0 kr.
      </p>

      <h3 className="mt-10 text-lg font-semibold">Decisions and tradeoffs</h3>
      <dl className="mt-4 space-y-5">
        {decisions.map(([title, body]) => (
          <div key={title}>
            <dt className="font-medium">{title}</dt>
            <dd className="mt-1 max-w-3xl text-muted">{body}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-10 text-lg font-semibold">Limitations</h3>
      <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-muted">
        <li>Price spikes driven by things weather can&apos;t see (outages, gas prices, interconnector limits) are missed.</li>
        <li>The 80% range holds {Math.round(coverage * 100)}% of actual prices: prices keep shifting, and calibration lags behind.</li>
        <li>The household price uses Radius&apos; tariff (most of Copenhagen) and excludes supplier markup.</li>
      </ul>

      <a href={`${github}/tree/main/ml`} target="_blank" rel="noreferrer"
        className="mt-8 inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent">
        Read the code on GitHub →
      </a>
    </section>
  );
}
