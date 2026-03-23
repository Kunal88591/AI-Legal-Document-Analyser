from flask import Flask, request, jsonify
import re
from collections import Counter

import spacy
from spacy.pipeline import EntityRuler

app = Flask(__name__)
nlp = spacy.load("en_core_web_sm")

if "entity_ruler" not in nlp.pipe_names:
    ruler = nlp.add_pipe("entity_ruler", before="ner")
    ruler.add_patterns([
        {"label": "CLAUSE", "pattern": "non-compete"},
        {"label": "CLAUSE", "pattern": "non compete"},
        {"label": "CLAUSE", "pattern": "termination"},
        {"label": "CLAUSE", "pattern": "confidentiality"},
        {"label": "CLAUSE", "pattern": "indemnity"},
        {"label": "CLAUSE", "pattern": "arbitration"},
        {"label": "CLAUSE", "pattern": "liability"},
        {"label": "CLAUSE", "pattern": "penalty"},
        {"label": "CLAUSE", "pattern": "notice period"},
    ])


RISK_PATTERNS = {
    "#Indemnity": ["indemnify", "indemnification", "hold harmless"],
    "#NonCompete": ["non-compete", "non compete", "restrictive covenant"],
    "#Liability": ["liability", "liable", "damages", "limitation of liability"],
    "#Penalty": ["penalty", "fine", "liquidated damages"],
    "#Termination": ["termination", "terminate", "notice period", "for cause", "without cause"],
    "#Arbitration": ["arbitration", "binding arbitration", "dispute resolution"],
    "#Confidentiality": ["confidential", "confidentiality", "non-disclosure", "nda"],
}

IMPORTANT_PATTERNS = [
    "salary", "compensation", "payment", "fee", "bonus", "effective date", "start date",
    "end date", "term", "duration", "renewal", "notice", "deliverable", "scope"
]

WARNING_PATTERNS = [
    "termination", "notice", "breach", "default", "late payment", "suspension", "renewal"
]

DATE_REGEX = r"\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b"
DURATION_REGEX = r"\b\d+\s*(?:day|days|month|months|year|years|week|weeks)\b"
MONEY_REGEX = r"(?:₹\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|₹\s?\d+(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b)"

CLAUSE_RULES = [
    ("Termination", ["terminate", "termination", "notice"], "High"),
    ("Non-Compete", ["non-compete", "non compete", "restrict", "restrictive covenant"], "High"),
    ("Penalty", ["penalty", "fine", "liquidated damages"], "High"),
    ("Confidentiality", ["confidentiality", "confidential", "nda", "non-disclosure"], "Moderate"),
    ("Salary", ["salary", "compensation", "payment", "fee", "bonus"], "Low"),
    ("Indemnity", ["indemnify", "indemnity", "hold harmless"], "High"),
]

SIMPLIFY_MAP = {
    "shall": "must",
    "indemnify": "cover losses",
    "hereinafter": "from now on",
    "pursuant to": "under",
    "notwithstanding": "even if",
    "commence": "start",
    "terminate": "end",
    "in the event that": "if",
    "prior to": "before",
    "thereafter": "after that",
    "provided that": "if",
}


def simplify_text(text):
    simplified = text
    for original, replacement in SIMPLIFY_MAP.items():
        simplified = re.sub(r"\b" + re.escape(original) + r"\b", replacement, simplified, flags=re.IGNORECASE)
    simplified = re.sub(r"\s+", " ", simplified).strip()
    return simplified


def extract_regex_facts(text):
    money_matches = []
    for match in re.finditer(MONEY_REGEX, text):
        value = match.group(0).strip()
        if value:
            money_matches.append(value)
    return {
        "dates": re.findall(DATE_REGEX, text, flags=re.IGNORECASE),
        "money": money_matches,
        "durations": re.findall(DURATION_REGEX, text, flags=re.IGNORECASE),
    }


def confidence_score(sentence, keywords):
    lower = sentence.lower()
    score = 0.0
    for keyword in keywords:
        if keyword in lower:
            score += 0.35
    if len(keywords) > 1:
        score += 0.15
    return round(min(score, 1.0), 2)


def detect_clause(sentence):
    lowered = sentence.lower()

    if "terminate" in lowered and "notice" in lowered:
        return "Termination Clause", "High"

    if "non-compete" in lowered or "non compete" in lowered:
        return "Non-Compete Clause", "High"

    if "penalty" in lowered or "fine" in lowered or "liquidated damages" in lowered:
        return "Penalty Clause", "High"

    if "confidential" in lowered or "nda" in lowered or "non-disclosure" in lowered:
        return "Confidentiality Clause", "Moderate"

    if any(term in lowered for term in ("salary", "compensation", "payment", "fee", "bonus")):
        return "Salary/Payment Clause", "Low"

    if "indemnify" in lowered or "hold harmless" in lowered:
        return "Indemnity Clause", "High"

    return None, "Low"


def normalize_clause_type(clause_type):
    return clause_type.replace(" Clause", "")


def build_clauses(sentences):
    clauses = []
    for sentence in sentences:
        clause_type, risk = detect_clause(sentence)
        if not clause_type:
            continue

        keywords = [word for word in re.split(r"[^a-zA-Z-]+", clause_type.lower()) if word]
        confidence = confidence_score(sentence, keywords)
        clauses.append({
            "type": normalize_clause_type(clause_type),
            "text": sentence,
            "risk": risk,
            "confidence": confidence,
        })
    return clauses


def detect_contract_type(text):
    lowered = text.lower()
    if "employment" in lowered or "employee" in lowered:
        return "Employment"
    if "lease" in lowered or "tenant" in lowered or "landlord" in lowered:
        return "Lease"
    if "service" in lowered or "consulting" in lowered:
        return "Service Agreement"
    if "non-disclosure" in lowered or "nda" in lowered:
        return "Non-Disclosure"
    return "General Contract"


def line_severity(line):
    lowered = line.lower()
    for keywords in RISK_PATTERNS.values():
        if any(k in lowered for k in keywords):
            return "risky"
    if any(k in lowered for k in WARNING_PATTERNS):
        return "warning"
    if any(k in lowered for k in IMPORTANT_PATTERNS):
        return "important"
    return "neutral"


def analyze_lines(lines):
    highlights = []
    tags = set()
    risky_lines = []
    counts = Counter()

    for idx, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue
        severity = line_severity(line)
        counts[severity] += 1

        if severity != "neutral":
            highlights.append({"lineNumber": idx + 1, "text": line, "severity": severity})

        lowered = line.lower()
        for tag, keywords in RISK_PATTERNS.items():
            if any(k in lowered for k in keywords):
                tags.add(tag)
                risky_lines.append(line)

    return highlights, sorted(tags), risky_lines, counts


def extract_dates(entities):
    date_values = [e["text"] for e in entities if e["label"] == "DATE"]
    timeline = []
    labels = ["Start Date", "End Date", "Notice Deadline"]

    for idx, value in enumerate(date_values[:3]):
        timeline.append({"label": labels[idx], "value": value})

    return timeline


def extract_notice_period(text):
    match = re.search(r"(\d{1,3})\s*(days|day|months|month)\s*(notice)?", text, re.IGNORECASE)
    if match:
        unit = match.group(2).lower()
        if not unit.endswith("s"):
            unit += "s"
        return f"{match.group(1)} {unit}"
    return "Not specified"


def extract_duration(text):
    match = re.search(r"(\d{1,3})\s*(year|years|month|months)", text, re.IGNORECASE)
    if match:
        return f"{match.group(1)} {match.group(2)}"
    return "Not clearly stated"


def overall_risk_label(score):
    if score >= 70:
        return "High"
    if score >= 40:
        return "Moderate"
    return "Low"


def risk_from_counts(counts):
    risky = counts.get("risky", 0)
    warning = counts.get("warning", 0)
    important = counts.get("important", 0)
    raw_score = risky * 18 + warning * 10 + important * 3
    return min(100, raw_score)


def answer_questions(text, tags, risk_score):
    lowered = text.lower()

    penalty_answer = "No explicit penalty clause found."
    if "penalty" in lowered or "liquidated damages" in lowered or "fine" in lowered:
        penalty_answer = "Yes. A penalty-related clause appears in the document."

    exit_answer = "Early exit terms are not clearly mentioned."
    if "terminate" in lowered or "termination" in lowered:
        exit_answer = "Possibly. There is a termination clause, so early exit may be allowed under listed conditions."

    if risk_score >= 70:
        risk_answer = "Your risks are high, especially around clauses like {}.".format(
            ", ".join(tags[:3]) if tags else "liability and termination"
        )
    elif risk_score >= 40:
        risk_answer = "Your risks are moderate. Review notice, termination, and liability language closely."
    else:
        risk_answer = "Your risks look low, but still review all obligations before signing."

    return {
        "Is there a penalty?": penalty_answer,
        "Can I leave early?": exit_answer,
        "What are my risks?": risk_answer,
    }


def build_summary_points(contract_type, duration, notice_period, risk_label, tags):
    top_tag = tags[0] if tags else "#General"
    return [
        f"Contract type: {contract_type}",
        f"Duration: {duration}",
        f"Notice period: {notice_period}",
        f"Risk: {top_tag.replace('#', '')} clause present",
        f"Overall: {risk_label} Risk",
    ]


def build_clean_json(text, jurisdiction, entities, clauses, highlights, tags, counts):
    regex_facts = extract_regex_facts(text)
    return {
        "clauses": clauses,
        "facts": {
            "dates": regex_facts["dates"],
            "money": regex_facts["money"],
            "durations": regex_facts["durations"],
        },
        "entities": entities,
        "highlights": highlights,
        "clauseTags": tags,
        "clauseDistribution": {
            "important": counts.get("important", 0),
            "warning": counts.get("warning", 0),
            "risky": counts.get("risky", 0),
            "neutral": counts.get("neutral", 0),
        },
        "jurisdiction": jurisdiction,
    }


@app.route('/analyze', methods=['POST'])
def analyze():
    payload = request.json or {}
    text = payload.get('text', '')
    jurisdiction = payload.get('jurisdiction', 'Global')

    doc = nlp(text)
    entities = [{"text": ent.text, "label": ent.label_} for ent in doc.ents]
    lines = [line for line in text.splitlines() if line.strip()]
    sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]
    highlights, tags, risky_lines, counts = analyze_lines(lines)
    clauses = build_clauses(sentences)

    risk_score = risk_from_counts(counts)
    if jurisdiction.lower() in {"india", "eu"} and "#NonCompete" in tags:
        risk_score = min(100, risk_score + 8)

    risk_label = overall_risk_label(risk_score)
    notice_period = extract_notice_period(text)
    duration = extract_duration(text)
    contract_type = detect_contract_type(text)

    summary = " ".join(text.split()[:100]).strip()
    if summary:
        summary += "..."

    summary_points = build_summary_points(contract_type, duration, notice_period, risk_label, tags)
    timeline = extract_dates(entities)
    qa = answer_questions(text, tags, risk_score)
    clean_json = build_clean_json(text, jurisdiction, entities, clauses, highlights, tags, counts)

    return jsonify({
        "entities": entities,
        "text": text,
        "summary": summary,
        "simpleSummary": simplify_text(summary),
        "summaryPoints": summary_points,
        "riskScore": risk_score,
        "riskLevel": risk_label,
        "clauseTags": tags,
        "highlights": highlights,
        "timeline": timeline,
        "qa": qa,
        "riskyClauses": risky_lines[:8],
        "cleanOutput": clean_json,
        "facts": clean_json["facts"],
        "jurisdiction": jurisdiction,
    })


@app.route('/simplify', methods=['POST'])
def simplify():
    payload = request.json or {}
    text = payload.get('text', '')
    return jsonify({"simpleText": simplify_text(text)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
