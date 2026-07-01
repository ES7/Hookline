from groq import Groq
from dotenv import load_dotenv
import os
import json
from agents.scorer import score_email

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


async def draft_email(
    prospect_name: str,
    company_name: str,
    hook: str,
    research: str,
    tone: str = "formal"
):
    first_name = prospect_name.split()[0]

    tone_instruction = {
        "formal": "Professional and polished. No contractions. Respectful distance.",
        "casual": "Conversational and warm. Use contractions. Sound like a peer.",
        "direct": "Straight to the point. No fluff. Short sentences. Lead with value."
    }.get(tone, "Professional and polished.")

    prompt = f"""You are an expert B2B copywriter.

Write a cold outreach email for:
Prospect: {prospect_name}
Company: {company_name}
Tone: {tone_instruction}

Hook: {hook}
Research: {research}

STRICT RULES:
- EXACTLY 4 sentences in body — count them
- Never use: "synergy", "leverage", "hope this finds you well", "we're excited", "we're thrilled"
- Never say "Our technology has helped other companies"
- Every sentence must reference this specific prospect or company
- Do NOT mention our company name — use "our platform"

Return ONLY valid JSON:
{{
  "subject": "primary subject line",
  "body": "Hi {first_name},\\n\\n[exactly 4 sentences]\\n\\n[CTA sentence]\\n\\nBest,\\n[SDR Name]",
  "subject_variants": ["variant 2", "variant 3"]
}}"""

    raw = ""
    for attempt in range(2):  # one retry if first response is malformed
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an expert B2B copywriter. Return only valid JSON. No markdown. No extra text."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content.strip()
        try:
            parsed = json.loads(raw)
            email_text = f"SUBJECT: {parsed['subject']}\n\n{parsed['body']}"
            variants = parsed.get("subject_variants", [])
            score = score_email(parsed["body"], research, prospect_name, company_name)
            return email_text, score, variants
        except Exception:
            continue  # retry once with the same prompt

    # Both attempts failed to produce valid JSON — surface this clearly instead of
    # silently returning unstructured text the frontend can't render properly.
    fallback_score = json.dumps({"overall": 0, "reasoning": "draft_json_parse_failed_after_retry"})
    return f"DRAFT GENERATION FAILED — raw model output:\n{raw}", fallback_score, []
