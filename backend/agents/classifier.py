from groq import Groq
from dotenv import load_dotenv
import os
import json

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

VALID_CASES = ["standard", "no_news", "job_change", "bad_news", "competitor"]


async def classify_scenario(prospect_name: str, company_name: str, raw_search_text: str) -> dict:
    """
    Looks at the raw research findings and decides which scenario this prospect
    actually falls into. This replaces manually picking an edge case — the system
    decides for itself, the way it would have to in production.
    """
    prompt = f"""You are classifying a B2B sales research result into exactly one scenario.

Prospect: {prospect_name}
Company: {company_name}

RAW RESEARCH FINDINGS:
{raw_search_text}

Choose exactly ONE scenario from this list:
- "standard": there is clear recent news (launch, funding, announcement, expansion) to hook on
- "no_news": search results are thin, generic, or stale (older than ~12 months) — nothing timely to reference
- "job_change": the findings EXPLICITLY state the prospect joined, was hired, or was promoted within roughly the last 6 months — there must be an actual date or phrase like "recently joined" / "newly appointed" / "announced as" in the source text itself
- "bad_news": the company appears to be facing layoffs, controversy, lawsuits, declining performance, or other negative coverage
- "competitor": the findings show the company already uses a named competitor tool/platform

CRITICAL RULE FOR "job_change": Merely finding the prospect's CURRENT title (e.g. "Co-Founder", "CEO") is NOT evidence of a recent change. People hold titles for years. Only choose "job_change" if the research explicitly mentions a recent hiring/joining/promotion event with some time signal. An old "Co-Founder" bio line, an award announcement, or a general LinkedIn profile description is NOT a job change — that falls under "standard" (if there's other recent news) or "no_news" (if there isn't).

If you are unsure whether something is recent, do NOT default to "job_change" — default to "standard" or "no_news" instead, since a false "job_change" claim is worse than a generic email.

Return ONLY valid JSON, no markdown, no explanation outside the JSON:
{{"scenario": "one_of_the_five_values_above", "confidence": "high|medium|low", "reasoning": "one sentence, what SPECIFIC text in the findings led to this — quote or paraphrase the actual evidence"}}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": "You are a precise classifier. Return only valid JSON. Never invent findings that are not in the provided text."},
            {"role": "user", "content": prompt}
        ],
        temperature=0,
        max_tokens=200,
        response_format={"type": "json_object"},
    )

    try:
        parsed = json.loads(response.choices[0].message.content)
        scenario = parsed.get("scenario", "standard")
        if scenario not in VALID_CASES:
            scenario = "standard"
        return {
            "scenario": scenario,
            "confidence": parsed.get("confidence", "medium"),
            "reasoning": parsed.get("reasoning", ""),
        }
    except Exception:
        # if classification itself fails, fall back to standard rather than crashing the pipeline
        return {"scenario": "standard", "confidence": "low", "reasoning": "classifier_parse_failed"}
