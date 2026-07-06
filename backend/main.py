import json
import os
import re
import uuid
from datetime import datetime
from typing import List

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from agents.drafter import draft_email
from agents.hook_finder import find_hook
from agents.researcher import ProspectVerificationError, research_prospect
from database import get_all_runs, get_existing_run, init_db, save_run
from firestore_db import get_runs_firestore, save_run_firestore
from security import AuthenticatedUser, require_user, reserve_quota_or_raise

VALID_SCENARIOS = {"standard", "no_news", "job_change", "bad_news", "competitor"}
VALID_TONES = {"formal", "casual", "direct"}
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "25"))

SCENARIO_ALIASES = {
    "": "none",
    "none": "none",
    "auto": "none",
    "auto_detect": "none",
    "auto_detected": "none",
    "let_the_system_decide": "none",
    "happy_path": "standard",
    "standard": "standard",
    "no_news": "no_news",
    "no_recent_news": "no_news",
    "recent_job_change": "job_change",
    "job_change": "job_change",
    "company_in_bad_news": "bad_news",
    "bad_news": "bad_news",
    "uses_competitor": "competitor",
    "competitor": "competitor",
}

PLACEHOLDER_VALUES = {
    "a",
    "b",
    "c",
    "n",
    "na",
    "n/a",
    "none",
    "null",
    "test",
    "asdf",
    "qwerty",
    "name",
    "company",
    "unknown",
    "fake",
    "sample",
    "john doe",
    "jane doe",
}

app = FastAPI()

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _alias_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")


def _reject_placeholder(value: str, field_name: str):
    key = value.lower().strip()
    if key in PLACEHOLDER_VALUES:
        raise ValueError(f"{field_name} must be a real value, not a placeholder.")


def _reject_obvious_junk(value: str, field_name: str):
    if re.search(r"https?://|www\.|@", value, re.IGNORECASE):
        raise ValueError(f"{field_name} must not be a URL or email.")
    compact = re.sub(r"[^A-Za-z0-9]", "", value)
    if len(compact) < 2:
        raise ValueError(f"{field_name} is too short.")
    if len(compact) >= 4 and len(set(compact.lower())) <= 2:
        raise ValueError(f"{field_name} looks like junk text.")


class ProspectInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    prospect_name: str = Field(min_length=3, max_length=80)
    company_name: str = Field(min_length=2, max_length=80)
    manual_override: str = "none"
    force_new: bool = False
    tone: str = "formal"

    @field_validator("prospect_name")
    @classmethod
    def validate_prospect_name(cls, value: str) -> str:
        value = _clean_text(value)
        _reject_placeholder(value, "Prospect name")
        _reject_obvious_junk(value, "Prospect name")
        if not re.fullmatch(r"[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,4}", value):
            raise ValueError("Prospect name must be a full human name, for example 'Dara Khosrowshahi'.")
        parts = [re.sub(r"[^A-Za-z]", "", part) for part in value.split()]
        if len(parts) < 2 or any(len(part) < 2 for part in parts):
            raise ValueError("Prospect name must include first and last name.")
        for part in parts:
            if not any(v in part.lower() for v in "aeiouy"):
                raise ValueError("Prospect name looks like random letters.")
        return value

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, value: str) -> str:
        value = _clean_text(value)
        _reject_placeholder(value, "Company name")
        _reject_obvious_junk(value, "Company name")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9&.,'() -]{1,79}", value):
            raise ValueError("Company name contains unsupported characters.")
        alpha_only = re.sub(r"[^A-Za-z]", "", value)
        if alpha_only and not any(v in alpha_only.lower() for v in "aeiouy"):
            raise ValueError("Company name looks like random letters.")
        return value

    @field_validator("manual_override")
    @classmethod
    def validate_manual_override(cls, value: str) -> str:
        normalized = SCENARIO_ALIASES.get(_alias_key(value))
        if normalized is None:
            raise ValueError(f"Unknown scenario override. Use one of: {', '.join(sorted(VALID_SCENARIOS))}.")
        return normalized

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, value: str) -> str:
        normalized = _alias_key(value)
        if normalized not in VALID_TONES:
            raise ValueError("Tone must be formal, casual, or direct.")
        return normalized


class BatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prospects: List[ProspectInput] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


@app.on_event("startup")
async def startup():
    init_db()


def _error_message(error: Exception) -> str:
    if isinstance(error, ProspectVerificationError):
        return str(error)
    return "Pipeline failed before a safe draft could be produced. Please try again with verified inputs."


def _build_result(
    data: ProspectInput,
    user: AuthenticatedUser,
    research: str,
    sources: list,
    scenario_info: dict,
    rejected_sources: list,
    hook: str,
    email: str,
    score,
    subject_variants: list,
    start_time: datetime,
) -> dict:
    duration = round((datetime.now() - start_time).total_seconds(), 1)
    return {
        "run_id": uuid.uuid4().hex[:12],
        "timestamp": datetime.now().isoformat(),
        "uid": user.uid,
        "prospect": data.prospect_name,
        "company": data.company_name,
        "detected_scenario": scenario_info["scenario"],
        "scenario_confidence": scenario_info["confidence"],
        "scenario_reasoning": scenario_info["reasoning"],
        "tone": data.tone,
        "research_summary": research,
        "sources": sources,
        "rejected_sources_count": len(rejected_sources),
        "hook": hook,
        "email_draft": email,
        "email_score": score,
        "subject_variants": subject_variants,
        "duration": duration,
        "status": "completed",
    }


async def _execute_pipeline(data: ProspectInput, user: AuthenticatedUser, start_time: datetime):
    research, sources, scenario_info, rejected_sources = await research_prospect(
        data.prospect_name,
        data.company_name,
        data.manual_override,
    )
    hook = await find_hook(research, scenario_info["scenario"])
    email, score, subject_variants = await draft_email(
        data.prospect_name,
        data.company_name,
        hook,
        research,
        data.tone,
    )
    result = _build_result(
        data,
        user,
        research,
        sources,
        scenario_info,
        rejected_sources,
        hook,
        email,
        score,
        subject_variants,
        start_time,
    )
    save_run(result)
    save_run_firestore(result)
    return result


@app.post("/check")
async def check_existing(data: ProspectInput, user: AuthenticatedUser = Depends(require_user)):
    existing = get_existing_run(data.prospect_name, data.company_name, user.uid)
    if existing:
        return {"exists": True, "run": existing}
    return {"exists": False}


@app.post("/run")
async def run_pipeline(data: ProspectInput, user: AuthenticatedUser = Depends(require_user)):
    reserve_quota_or_raise(user, 1)

    async def stream():
        start_time = datetime.now()
        try:
            yield f"data: {json.dumps({'stage': 'research', 'status': 'running', 'message': 'Agent 1 - verifying and researching prospect...'})}\n\n"
            research, sources, scenario_info, rejected_sources = await research_prospect(
                data.prospect_name,
                data.company_name,
                data.manual_override,
            )
            research_msg = f"Agent 1 - Research complete (detected: {scenario_info['scenario']})"
            yield f"data: {json.dumps({'stage': 'research', 'status': 'done', 'message': research_msg, 'research': research, 'scenario': scenario_info})}\n\n"

            yield f"data: {json.dumps({'stage': 'hook', 'status': 'running', 'message': 'Agent 2 - identifying best hook...'})}\n\n"
            hook = await find_hook(research, scenario_info["scenario"])
            yield f"data: {json.dumps({'stage': 'hook', 'status': 'done', 'message': 'Agent 2 - hook identified'})}\n\n"

            yield f"data: {json.dumps({'stage': 'draft', 'status': 'running', 'message': 'Agent 3 - drafting personalized email...'})}\n\n"
            email, score, subject_variants = await draft_email(
                data.prospect_name,
                data.company_name,
                hook,
                research,
                data.tone,
            )
            yield f"data: {json.dumps({'stage': 'draft', 'status': 'done', 'message': 'Agent 3 - email drafted'})}\n\n"

            result = _build_result(
                data,
                user,
                research,
                sources,
                scenario_info,
                rejected_sources,
                hook,
                email,
                score,
                subject_variants,
                start_time,
            )
            save_run(result)
            save_run_firestore(result)
            yield f"data: {json.dumps({'stage': 'complete', 'status': 'done', 'result': result})}\n\n"
        except Exception as e:
            print(f"Pipeline error: {type(e).__name__}: {e}")
            yield f"data: {json.dumps({'stage': 'error', 'status': 'error', 'message': _error_message(e)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@app.post("/batch")
async def batch_run(data: BatchInput, user: AuthenticatedUser = Depends(require_user)):
    reserve_quota_or_raise(user, len(data.prospects))
    results = []
    for prospect in data.prospects:
        start_time = datetime.now()
        try:
            result = await _execute_pipeline(prospect, user, start_time)
            results.append(result)
        except Exception as e:
            print(f"Batch item error: {type(e).__name__}: {e}")
            results.append({
                "prospect": prospect.prospect_name,
                "company": prospect.company_name,
                "status": "error",
                "message": _error_message(e),
            })
    return {"results": results}


@app.get("/runs")
def get_runs(user: AuthenticatedUser = Depends(require_user)):
    if not user.is_local_dev:
        firestore_runs = get_runs_firestore(user.uid)
        if firestore_runs:
            return firestore_runs
    return get_all_runs(user.uid)


@app.get("/health")
def health():
    return {"status": "ok", "service": "Hookline backend"}
