// Types and pure logic for the Green Energy Optimizer (data produced by ml/forecast.py and ml/train.py).

export type Co2Source = "actual" | "energinet" | "model";

export type AreaSeries = {
  time: string[];
  price: (number | null)[];
  price_p10: (number | null)[];
  price_p50: (number | null)[];
  price_p90: (number | null)[];
  co2: (number | null)[];
  co2_p10: (number | null)[];
  co2_p50: (number | null)[];
  co2_p90: (number | null)[];
  co2_source: Co2Source[];
};

export type ForecastData = {
  generated_at: string;
  issue_date: string;
  vat: number;
  tariffs_dk2_radius: Record<string, number[]>;
  areas: Record<"DK1" | "DK2", AreaSeries>;
};

export type LeadStats = { lead: number; mae_model: number; mae_baseline: number; skill: number; coverage_p10_p90: number };

export type TargetReport = {
  target: "price" | "co2";
  unit: string;
  period: [string, string];
  mae_model: number;
  mae_baseline: number;
  skill: number;
  coverage_p10_p90: number;
  per_lead: LeadStats[];
  per_month: { month: string; mae_model: number; mae_baseline: number }[];
  charging?: { captured_model: number; captured_baseline: number; hours: number };
};

export type BacktestReport = { price: TargetReport; co2: TargetReport };

export type PriceMode = "pay" | "spot";

/** One hour, everything in display units: kr/kWh and g CO2/kWh. */
export type HourPoint = {
  t: number;
  dkDate: string;
  dkHour: number;
  isForecast: boolean;
  spot: number;
  spotBand: [number, number] | null;
  pay: number | null;
  payBand: [number, number] | null;
  co2: number | null;
  co2Band: [number, number] | null;
  co2Source: Co2Source;
};

export const TZ = "Europe/Copenhagen";
const HOUR = 3_600_000;

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
});

export function dkParts(t: number): { date: string; hour: number } {
  const p = Object.fromEntries(partsFormat.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function buildPoints(data: ForecastData): HourPoint[] {
  const s = data.areas.DK2;
  const mult = 1 + data.vat;
  return s.time.map((iso, i) => {
    const t = Date.parse(iso);
    const { date, hour } = dkParts(t);
    const tariff = data.tariffs_dk2_radius[date]?.[hour] ?? null;
    const isForecast = s.price[i] == null;
    const spot = ((s.price[i] ?? s.price_p50[i]) ?? 0) / 1000;
    const spotBand: [number, number] | null = isForecast ? [(s.price_p10[i] ?? 0) / 1000, (s.price_p90[i] ?? 0) / 1000] : null;
    const pay = tariff == null ? null : (spot + tariff) * mult;
    const payBand: [number, number] | null = spotBand && tariff != null
      ? [(spotBand[0] + tariff) * mult, (spotBand[1] + tariff) * mult] : null;
    const co2Model = s.co2_source[i] === "model";
    const co2 = co2Model ? s.co2_p50[i] : s.co2[i];
    const co2Band: [number, number] | null = co2Model && s.co2_p10[i] != null && s.co2_p90[i] != null
      ? [s.co2_p10[i]!, s.co2_p90[i]!] : null;
    return { t, dkDate: date, dkHour: hour, isForecast, spot, spotBand, pay, payBand, co2, co2Band, co2Source: s.co2_source[i] };
  });
}

export type Device = { id: string; name: string; kwh: number; kw: number; contiguous: boolean; note: string };

export const DEVICES: Device[] = [
  { id: "ev", name: "Electric car", kwh: 40, kw: 11, contiguous: false, note: "Charging can pause and resume" },
  { id: "heatpump", name: "Heat pump boost", kwh: 12, kw: 3, contiguous: false, note: "Pre-heat the house in cheap hours" },
  { id: "dishwasher", name: "Dishwasher", kwh: 1.2, kw: 1.2, contiguous: true, note: "Runs in one go" },
];

export type PlanResult = {
  hours: HourPoint[];
  cost: number;
  co2Kg: number;
  nowCost: number;
  nowCo2Kg: number;
  usesForecast: boolean;
};

/** Pick the hours between start and deadline that minimise a blend of price and CO2.
 *  greenWeight 0 = cheapest, 1 = greenest. Compared against starting right away. */
export function plan(points: HourPoint[], startT: number, endT: number, device: Device, greenWeight: number): PlanResult | null {
  const window = points.filter((p) => p.t >= startT - HOUR + 1 && p.t + HOUR <= endT && p.pay != null && p.co2 != null);
  const n = Math.max(1, Math.ceil(device.kwh / device.kw - 1e-9));
  if (window.length < n) return null;

  const range = (xs: number[]) => [Math.min(...xs), Math.max(...xs)];
  const [pMin, pMax] = range(window.map((p) => p.pay!));
  const [cMin, cMax] = range(window.map((p) => p.co2!));
  const norm = (v: number, lo: number, hi: number) => (hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo));
  const score = window.map((p) => (1 - greenWeight) * norm(p.pay!, pMin, pMax) + greenWeight * norm(p.co2!, cMin, cMax));

  let chosenIdx: number[];
  if (device.contiguous) {
    let best = Infinity;
    let bestStart = 0;
    for (let i = 0; i + n <= window.length; i++) {
      if (window[i + n - 1].t - window[i].t !== (n - 1) * HOUR) continue;
      const sum = score.slice(i, i + n).reduce((a, b) => a + b, 0);
      if (sum < best) { best = sum; bestStart = i; }
    }
    chosenIdx = Array.from({ length: n }, (_, k) => bestStart + k);
  } else {
    chosenIdx = score.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, i]) => i).sort((a, b) => a - b);
  }

  const energy = device.kwh / n;
  const totals = (hs: HourPoint[]) => ({
    cost: hs.reduce((a, p) => a + p.pay! * energy, 0),
    co2Kg: hs.reduce((a, p) => a + (p.co2! * energy) / 1000, 0),
  });
  const hours = chosenIdx.map((i) => window[i]);
  const chosen = totals(hours);
  const now = totals(window.slice(0, n));
  return { hours, cost: chosen.cost, co2Kg: chosen.co2Kg, nowCost: now.cost, nowCo2Kg: now.co2Kg,
           usesForecast: hours.some((p) => p.isForecast) };
}

export function currentPoint(points: HourPoint[], now: number): HourPoint | null {
  return points.find((p) => p.t <= now && now < p.t + HOUR) ?? null;
}

/** Cheapest run of `hours` consecutive hours (household price) from the current hour onwards. */
export function cheapestWindow(points: HourPoint[], now: number, hours = 3): { start: number; end: number; avg: number; forecast: boolean } | null {
  const ahead = points.filter((p) => p.t + HOUR > now && p.pay != null);
  let best: { start: number; end: number; avg: number; forecast: boolean } | null = null;
  for (let i = 0; i + hours <= ahead.length; i++) {
    const run = ahead.slice(i, i + hours);
    if (run[hours - 1].t - run[0].t !== (hours - 1) * HOUR) continue;
    const avg = run.reduce((a, p) => a + p.pay!, 0) / hours;
    if (!best || avg < best.avg) best = { start: run[0].t, end: run[hours - 1].t + HOUR, avg, forecast: run.some((p) => p.isForecast) };
  }
  return best;
}

/** Today's average household price (DK date of `p`). */
export function dayAverage(points: HourPoint[], p: HourPoint): number | null {
  const day = points.filter((x) => x.dkDate === p.dkDate && x.pay != null);
  return day.length ? day.reduce((a, x) => a + x.pay!, 0) / day.length : null;
}

/** Where a CO2 value sits relative to the last 7 days of measurements. */
export function co2Level(points: HourPoint[], value: number): "low" | "typical" | "high" {
  const measured = points.filter((p) => p.co2Source === "actual" && p.co2 != null).map((p) => p.co2!).sort((a, b) => a - b);
  if (measured.length < 10) return "typical";
  const q = (f: number) => measured[Math.floor(f * (measured.length - 1))];
  return value <= q(1 / 3) ? "low" : value >= q(2 / 3) ? "high" : "typical";
}

/** Merge consecutive hours into [start, end) blocks. */
export function toBlocks(hours: HourPoint[]): [number, number][] {
  const blocks: [number, number][] = [];
  for (const h of hours) {
    const last = blocks[blocks.length - 1];
    if (last && last[1] === h.t) last[1] = h.t + HOUR;
    else blocks.push([h.t, h.t + HOUR]);
  }
  return blocks;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const fmtDay = (t: number) => dayFmt.format(new Date(t));
export const fmtTime = (t: number) => timeFmt.format(new Date(t));
export const fmtKr = (v: number, digits = 2) => `${v.toFixed(digits)} kr`;
export const HOUR_MS = HOUR;
