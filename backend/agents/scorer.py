import re
import json

# Weighted rubric, same idea as an IELTS band-score formula: fixed criteria,
# fixed weights, no model "judgment" involved. Same input -> same output, every time.
WEIGHTS = {
    "grounding": 0.45,      # do the specific claims in the email actually exist in the research?
    "specificity": 0.25,    # does the email reference enough distinct, concrete facts?
    "personalization": 0.20,  # does it actually name the prospect and company?
    "compliance": 0.10,     # does it avoid the banned generic phrases / follow structure rules?
}

BANNED_PHRASES = [
    "synergy", "leverage", "hope this finds you well",
    "we're excited", "we are excited", "we're thrilled", "we are thrilled",
    "our technology has helped other companies",
]

EXPECTED_FACT_TARGET = 3  # email should reference at least this many distinct facts to be "specific"

# Words that commonly start a sentence and get capitalized for grammar reasons,
# not because they're part of a proper noun. "As Google continues..." should
# not be read as a fact called "As Google" — "As" is a sentence starter, not
# part of the entity name.
SENTENCE_STARTERS = {
    "as", "the", "this", "that", "our", "your", "their", "his", "her", "its",
    "by", "in", "on", "with", "for", "and", "but", "or", "if", "when", "while",
    "best", "hi", "dear", "i", "we", "you", "since", "given", "given that",
    "subject", "regards", "sincerely", "thanks", "thank",
}


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9.%$ ]+", " ", text.lower()).strip()


def _strip_template_scaffolding(text: str) -> str:
    """
    Removes the parts of a cold email that are structural template text, not
    factual claims: the "Hi {Name}," greeting line, the "Best,\n[Sender]"
    signoff, and any bracketed placeholder like "[SDR Name]". Without this,
    the fact extractor flags "Hi Sundar" and "[SDR Name]" as unverified
    claims, which is a false positive — they were never meant to be facts.
    """
    text = re.sub(r"^(Hi|Hello|Dear)\s+[A-Za-z]+\s*,", "", text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\[[^\]]*\]", "", text)  # strip [SDR Name], [Sender], etc.
    # Strip the whole sign-off block: "Best,\nSamantha Rodriguez" or "Best, [SDR Name]" —
    # the sender's own name is never a "fact about the prospect" that needs grounding,
    # whether the model left it as a placeholder or filled in a literal name.
    text = re.sub(r"(Best|Regards|Sincerely|Thanks|Cheers),?\s*[A-Za-z .]*\s*$", "", text.strip(), flags=re.IGNORECASE)
    return text


def _extract_facts(text: str) -> list:
    """
    Pulls out checkable, concrete facts from a block of text:
    - numbers/amounts ($2.2 million, 40%, 2024, etc.)
    - capitalized multi-word phrases (proper nouns: company names, investor names, product names)
    These are the things a 'specific' email should reference, and the things
    that need to actually trace back to the research to count as grounded.

    Filters out sentence-starter words (e.g. "As Google" -> the "As" isn't
    part of the name) and template scaffolding before extracting.
    """
    text = _strip_template_scaffolding(text)
    facts = []
    facts += re.findall(r"\$?\d[\d,]*\.?\d*\s?(?:million|billion|k|%|percent)?", text)
    facts += re.findall(r"(?:[A-Z][a-zA-Z]+\s){1,3}[A-Z][a-zA-Z]+", text)
    cleaned = []
    seen = set()
    for f in facts:
        f = f.strip()
        if not f:
            continue
        first_word = f.split()[0].lower() if f.split() else ""
        if first_word in SENTENCE_STARTERS:
            # drop the leading sentence-starter word and keep the rest if anything remains
            remainder = " ".join(f.split()[1:]).strip()
            if not remainder or remainder[0].islower():
                continue
            f = remainder
        if len(f) < 2:
            continue
        key = f.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(f)
    return cleaned


def score_email(email_body: str, research_text: str, prospect_name: str, company_name: str) -> dict:
    """
    Returns a fully deterministic score with the formula and inputs that
    produced it attached, so the number is auditable instead of a black box.
    """
    email_facts = _extract_facts(email_body)
    research_norm = _normalize(research_text)

    grounded_facts = [f for f in email_facts if _normalize(f) and _normalize(f) in research_norm]
    ungrounded_facts = [f for f in email_facts if f not in grounded_facts]

    grounding_score = (len(grounded_facts) / len(email_facts)) if email_facts else 0.5
    specificity_score = min(len(email_facts) / EXPECTED_FACT_TARGET, 1.0)

    first_name = prospect_name.split()[0] if prospect_name else ""
    has_first_name = bool(first_name) and first_name.lower() in email_body.lower()
    has_company = bool(company_name) and company_name.lower() in email_body.lower()
    personalization_score = (0.5 if has_first_name else 0) + (0.5 if has_company else 0)

    banned_hits = [p for p in BANNED_PHRASES if p in email_body.lower()]
    compliance_score = max(1.0 - 0.25 * len(banned_hits), 0.0)

    overall_fraction = (
        WEIGHTS["grounding"] * grounding_score
        + WEIGHTS["specificity"] * specificity_score
        + WEIGHTS["personalization"] * personalization_score
        + WEIGHTS["compliance"] * compliance_score
    )
    overall = round(overall_fraction * 10, 1)

    result = {
        "overall": overall,
        "specificity": round(specificity_score * 10, 1),
        "grounding": round(grounding_score * 10, 1),
        "personalization": round(personalization_score * 10, 1),
        "compliance": round(compliance_score * 10, 1),
        "grounded_in_research": len(ungrounded_facts) == 0 and len(email_facts) > 0,
        "evidence": {
            "facts_referenced_in_email": email_facts,
            "facts_traced_to_research": grounded_facts,
            "facts_not_found_in_research": ungrounded_facts,
            "banned_phrases_found": banned_hits,
            "has_prospect_first_name": has_first_name,
            "has_company_name": has_company,
        },
        "formula": "overall = 10 * (0.45*grounding + 0.25*specificity + 0.20*personalization + 0.10*compliance)",
    }
    return json.dumps(result)