export default function EmailOutput({ result, research }) {
  const copy = () => { navigator.clipboard.writeText(result.email_draft); alert("Copied!") }
  const download = () => {
    const blob = new Blob([result.email_draft], { type: "text/plain" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `outreach_${result.prospect.replace(" ", "_")}.txt`; a.click()
  }

  const scenarioLabel = { standard: "Happy Path (auto-detected)", no_news: "No Recent News (auto-detected)", job_change: "Recent Job Change (auto-detected)", bad_news: "Company in Bad News (auto-detected)", competitor: "Uses Competitor (auto-detected)" }
  const score = (() => {
    try {
      return typeof result.email_score === "string" ? JSON.parse(result.email_score) : result.email_score
    } catch {
      return null
    }
  })()
  const scoreColor = (v) => v >= 8 ? "#2e7d32" : v >= 6 ? "#e65100" : "#cc0000"

  // Parse confidence from hook text
  const confidenceMatch = result.hook?.match(/CONFIDENCE:\s*(High|Medium|Low)/i)
  const confidence = confidenceMatch ? confidenceMatch[1] : null
  const confidenceColor = { High: "#2e7d32", Medium: "#e65100", Low: "#cc0000" }

  return (
    <div className="card">
      <h2>📧 Generated Outreach</h2>

      <div className="meta">
        <span className="meta-item">🏃 Run ID: {result.run_id}</span>
        <span className="meta-item">👤 {result.prospect}</span>
        <span className="meta-item">🏢 {result.company}</span>
        <span className="meta-item">🎭 {scenarioLabel[result.detected_scenario] || result.detected_scenario}</span>
        {result.tone && <span className="meta-item">🎙️ {result.tone}</span>}
        {result.duration && <span className="meta-item">⏱️ {result.duration}s</span>}
        <span className="meta-item">✅ {result.status}</span>
      </div>

      {result.scenario_reasoning && (
        <div style={{ background: "#f0f4ff", border: "1px solid #d0d9ff", borderRadius: "8px", padding: "10px 16px", marginBottom: "16px", fontSize: "12px", color: "#444" }}>
          <strong>🔍 Why this scenario was detected ({result.scenario_confidence} confidence):</strong> {result.scenario_reasoning}
        </div>
      )}
      {/* Score */}
      {score && score.overall && (
        <div style={{ background: "#f8f9fa", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>📊 Email Quality Score</p>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {[{ label: "Overall", value: score.overall }, { label: "Specificity", value: score.specificity }].map(item => (
              <div key={item.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "24px", fontWeight: 700, color: scoreColor(item.value) }}>{item.value}/10</div>
                <div style={{ fontSize: "11px", color: "#888" }}>{item.label}</div>
              </div>
            ))}
          </div>
          {score.grounded_in_research !== undefined && (
            <p style={{ fontSize: "12px", marginTop: "8px", fontWeight: 600, color: score.grounded_in_research ? "#2e7d32" : "#cc0000" }}>
              {score.grounded_in_research ? "✅ Grounded in research" : "⚠️ Not fully grounded in research"}
            </p>
          )}
          {score.evidence?.facts_not_found_in_research?.length > 0 && (
            <div style={{ fontSize: "12px", color: "#cc0000", marginTop: "6px" }}>
              <strong>Ungrounded claims:</strong> {score.evidence.facts_not_found_in_research.join(", ")}
            </div>
          )}
          {score.formula && (
            <p style={{ fontSize: "11px", color: "#999", marginTop: "8px", fontFamily: "monospace" }}>{score.formula}</p>
          )}
          {score.reasoning && <p style={{ fontSize: "12px", color: "#666", marginTop: "4px", fontStyle: "italic" }}>{score.reasoning}</p>}
        </div>
      )}

      {/* Hook + Confidence Badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h3 style={{ fontSize: "13px", color: "#6c63ff", fontWeight: 600 }}>🎯 Hook Identified</h3>
        {confidence && (
          <span style={{ background: confidenceColor[confidence], color: "white", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 600 }}>
            {confidence} Confidence
          </span>
        )}
      </div>
      <div className="hook-box">{result.hook}</div>

      {/* Research Preview */}
      {research && (
        <details style={{ marginTop: "16px", marginBottom: "8px" }}>
          <summary style={{ fontSize: "13px", color: "#555", fontWeight: 600, cursor: "pointer" }}>🔬 Research Preview (Agent 1 Output)</summary>
          <div style={{ background: "#f8f9fa", borderRadius: "8px", padding: "12px 16px", marginTop: "8px", fontSize: "13px", lineHeight: 1.6, color: "#444" }}>
            {research}
          </div>
        </details>
      )}

      {/* Subject Variants */}
      {result.subject_variants?.length > 0 && (
        <>
          <h3 style={{ fontSize: "13px", color: "#555", marginBottom: "8px", fontWeight: 600, marginTop: "16px" }}>📝 Subject Line Variants</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
            {result.subject_variants.map((v, i) => (
              <div key={i} style={{ background: "#f0edff", borderRadius: "6px", padding: "8px 12px", fontSize: "13px", color: "#4a4a4a" }}>{i + 1}. {v}</div>
            ))}
          </div>
        </>
      )}

      {/* Sources */}
      {result.sources?.length > 0 && (
        <>
          <h3 style={{ fontSize: "13px", color: "#555", marginBottom: "8px", fontWeight: 600 }}>🔗 Sources Used</h3>
          <div style={{ background: "#f8f9fa", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
            {result.sources.map((src, i) => (
              <div key={i} style={{ marginBottom: "4px" }}>
                <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#6c63ff", wordBreak: "break-all" }}>{src}</a>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Email */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h3 style={{ fontSize: "13px", color: "#555", fontWeight: 600 }}>✉️ Email Draft</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={copy} style={{ background: "none", border: "1px solid #e0e0e0", padding: "4px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}>Copy</button>
          <button onClick={download} style={{ background: "none", border: "1px solid #6c63ff", padding: "4px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", color: "#6c63ff" }}>Download</button>
        </div>
      </div>
      <div className="email-box">{result.email_draft}</div>
    </div>
  )
}
