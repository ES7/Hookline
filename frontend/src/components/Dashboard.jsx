import axios from "axios"
import { useEffect, useState } from "react"
import { useAuth } from "../AuthContext"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000"

export default function Dashboard() {
  const { user, authHeaders } = useAuth()
  const [runs, setRuns] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchRuns = async () => {
      if (!user) return
      try {
        const headers = await authHeaders()
        const res = await axios.get(`${BACKEND_URL}/runs`, { headers })
        setRuns(res.data)
        setError(null)
      } catch (err) {
        const detail = err.response?.data?.detail
        const status = err.response?.status || "Network Error"
        const url = err.config?.url || "Unknown URL"
        setError(typeof detail === "string" ? detail : `${err.message} (${status} at ${url})`)
      }
    }
    fetchRuns()
  }, [user, authHeaders])

  const scenarioLabel = {
    standard: "Happy Path",
    no_news: "No Recent News",
    job_change: "Recent Job Change",
    bad_news: "Company in Bad News",
    competitor: "Uses Competitor",
  }

  const totalRuns = runs.length
  const completedRuns = runs.filter((run) => run.status === "completed").length
  const successRate = totalRuns ? Math.round((completedRuns / totalRuns) * 100) : 0
  const avgDuration = totalRuns ? Math.round(runs.reduce((total, run) => total + (run.duration || 0), 0) / totalRuns) : 0
  const scenarioCounts = runs.reduce((acc, run) => {
    acc[run.detected_scenario] = (acc[run.detected_scenario] || 0) + 1
    return acc
  }, {})
  const topScenario = Object.entries(scenarioCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
        {[
          { label: "Total Runs", value: totalRuns, color: "#6c63ff" },
          { label: "Success Rate", value: `${successRate}%`, color: "#2e7d32" },
          { label: "Avg Duration", value: `${avgDuration}s`, color: "#e65100" },
          { label: "Top Scenario", value: topScenario ? scenarioLabel[topScenario[0]]?.split(" ")[0] : "-", color: "#1a1a1a" },
        ].map((metric) => (
          <div key={metric.label} className="card" style={{ textAlign: "center", padding: "20px" }}>
            <div style={{ fontSize: "28px", fontWeight: 700, color: metric.color }}>{metric.value}</div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>{metric.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Run History</h2>
        {error ? (
          <div className="error-box">{error}</div>
        ) : runs.length === 0 ? (
          <div className="empty">No runs yet. Go to New Run to start.</div>
        ) : (
          <div className="runs-grid">
            {runs.map((run) => (
              <div key={run.id || run.run_id}>
                <div className="run-card" onClick={() => setSelected(selected?.run_id === run.run_id ? null : run)}>
                  <span className="run-id">#{run.run_id || run.id}</span>
                  <span className="run-prospect">{run.prospect} @ {run.company}</span>
                  <span className="badge none">{scenarioLabel[run.detected_scenario] || run.detected_scenario}</span>
                  {run.email_score && (() => {
                    try {
                      const score = typeof run.email_score === "string" ? JSON.parse(run.email_score) : run.email_score
                      return score.overall ? <span className="badge completed">{score.overall}/10</span> : null
                    } catch {
                      return null
                    }
                  })()}
                  {run.duration && <span className="meta-item">{run.duration}s</span>}
                  <span className="badge completed">{run.status}</span>
                  <span className="run-time">{new Date(run.timestamp).toLocaleString()}</span>
                </div>

                {selected?.run_id === run.run_id && (
                  <div style={{ padding: "16px 20px", background: "#f8f9fa", borderRadius: "0 0 8px 8px", border: "1px solid #e0e0e0", borderTop: "none" }}>
                    <p style={{ fontSize: "12px", color: "#6c63ff", fontWeight: 600, marginBottom: "8px" }}>Hook</p>
                    <p style={{ fontSize: "13px", marginBottom: "16px", lineHeight: 1.6 }}>{run.hook}</p>

                    {run.sources?.length > 0 && (
                      <>
                        <p style={{ fontSize: "12px", color: "#555", fontWeight: 600, marginBottom: "8px" }}>Sources</p>
                        <div style={{ marginBottom: "16px" }}>
                          {run.sources.map((src, index) => (
                            <div key={`${src}-${index}`}>
                              <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#6c63ff", wordBreak: "break-all" }}>{src}</a>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <p style={{ fontSize: "12px", color: "#555", fontWeight: 600, marginBottom: "8px" }}>Email Draft</p>
                    <pre style={{ fontSize: "13px", lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{run.email_draft}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
