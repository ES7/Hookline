export default function RunStatus({ stages }) {
  const STEPS = [
    {
      id: "research",
      label: "Agent 1 — Researching prospect & company",
      icon: "🔍"
    },
    {
      id: "hook",
      label: "Agent 2 — Identifying best hook",
      icon: "🎯"
    },
    {
      id: "draft",
      label: "Agent 3 — Drafting personalised email",
      icon: "✍️"
    }
  ]

  return (
    <div className="card">
      <h2>⚡ Pipeline Running</h2>
      <div className="status-steps">
        {STEPS.map(step => (
          <div
            key={step.id}
            className={`step ${
              stages[step.id] === "running"
                ? "active"
                : stages[step.id] === "done"
                ? "done"
                : ""
            }`}
          >
            {stages[step.id] === "running" && (
              <div className="spinner" />
            )}
            {stages[step.id] === "done" && (
              <span>✅</span>
            )}
            {stages[step.id] === "waiting" && (
              <span>⏳</span>
            )}
            {step.icon} {step.label}
          </div>
        ))}
      </div>
    </div>
  )
}