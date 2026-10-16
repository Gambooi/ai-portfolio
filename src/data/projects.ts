export type ProjectStatus = "live" | "building" | "planned";

export type Project = {
  slug: string;
  number: number;
  title: string;
  tagline: string;
  description: string;
  skills: string[];
  stack: string[];
  status: ProjectStatus;
  github?: string;
};

export const projects: Project[] = [
  {
    slug: "green-energy-optimizer",
    number: 1,
    title: "Green Energy Optimizer",
    tagline: "Forecasts Danish electricity prices and CO₂ to find the cheapest, greenest hours.",
    description:
      "Forecasts Danish electricity prices and CO₂ intensity 7 days ahead from Energinet data and weather forecasts, then plans the cheapest or greenest hours to charge a car or run a heat pump, using the price a Copenhagen household actually pays. Retrained and updated every day, with its accuracy tested on a year of unseen data.",
    skills: ["Data engineering", "Time-series forecasting", "Uncertainty calibration", "Scheduled pipelines", "Data visualization"],
    stack: ["Python", "pandas", "LightGBM", "Conformal prediction", "GitHub Actions", "Next.js", "Recharts"],
    status: "live",
  },
  {
    slug: "invoice-extraction",
    number: 2,
    title: "Invoice Extraction Automation",
    tagline: "PDF invoice in, validated structured data out, with a human in the loop.",
    description:
      "Upload an invoice or pick a sample. A vision LLM extracts structured fields, rules validate VAT, totals and CVR numbers, low-confidence fields are flagged for human review, and approved rows are exported to a spreadsheet.",
    skills: ["Document AI", "Structured outputs", "Validation", "Human-in-the-loop", "Workflow automation"],
    stack: ["Gemini", "TypeScript", "Zod", "Google Sheets API"],
    status: "planned",
  },
  {
    slug: "danish-document-assistant",
    number: 3,
    title: "Spørg Dokumenterne",
    tagline: "Ask questions about Danish documents and get answers with sources.",
    description:
      "A retrieval-augmented assistant over a real Danish document collection. Every answer cites the passages it used, so you can click through and check. Answers in Danish or English.",
    skills: ["RAG", "Embeddings & vector search", "Danish NLP", "Citations & grounding", "Streaming UI"],
    stack: ["Gemini", "pgvector", "Next.js"],
    status: "planned",
  },
  {
    slug: "support-ops-agent",
    number: 4,
    title: "Support-Ops Agent",
    tagline: "An AI agent that triages support emails, and shows its work.",
    description:
      "Classifies incoming customer emails, looks up orders, drafts replies, creates tickets or escalates to a human. A live trace shows every reasoning step and tool call the agent makes.",
    skills: ["Agents & tool calling", "Guardrails", "Escalation logic", "Observability"],
    stack: ["Gemini", "TypeScript", "Next.js"],
    status: "planned",
  },
  {
    slug: "llm-eval-dashboard",
    number: 5,
    title: "LLM Evaluation Dashboard",
    tagline: "Measures the other AI projects on accuracy, cost and latency.",
    description:
      "Runs the document assistant and the support agent against golden test sets, scores accuracy and faithfulness with an LLM judge checked against human labels, and tracks cost and latency across prompt and model versions.",
    skills: ["Evaluation design", "LLM-as-judge", "Regression testing", "Cost/latency analysis"],
    stack: ["Python", "GitHub Actions", "Next.js"],
    status: "planned",
  },
];

export function getProject(slug: string) {
  return projects.find((p) => p.slug === slug);
}
