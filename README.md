# Zamp ASA PS3 — Personalised Outreach Engine

AI-powered GTM outreach automation — from prospect to draft.

## Problem
SDRs spend 20+ minutes researching each prospect before writing a cold email.
With 200 prospects, that's 66+ hours — impossible at scale.
Result: generic emails, 1-2% reply rates.

## Solution
Enter a prospect name and company — the system researches, identifies the best
hook, and drafts a personalised email ready for human review. 3-agent pipeline,
real web search, 4 edge case scenarios.

## Architecture

```
Prospect Name + Company
        ↓
Agent 1 — Researcher (Tavily web search + Groq LLM)
        ↓
Agent 2 — Hook Finder (identifies most relevant angle)
        ↓
Agent 3 — Email Drafter (human-sounding cold email)
        ↓
Dashboard (run history, status, outputs)
```

## Edge Cases
- **Happy Path** — recent news, standard outreach
- **No Recent News** — falls back to job postings and product positioning
- **Recent Job Change** — new leader angle, focuses on impact opportunity
- **Company in Bad News** — empathetic tone, avoids sensitive topics
- **Competitor Customer** — differentiation angle, never trash competitor

## Tech Stack
- **Backend:** FastAPI + Python
- **Agents:** Groq (llama-3.3-70b) + Tavily (real-time web search)
- **Frontend:** React + Vite
- **Database:** SQLite (run history)

## Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env` in `backend/`:
```
GROQ_API_KEY=your_groq_key
TAVILY_API_KEY=your_tavily_key
```

```bash
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Live Demo
- Backend: [Render URL]
- Frontend: [Render URL]

## Submission
- **Case Study:** PS-3 — GTM Personalised Outreach
- **Candidate:** Ebad Sayed