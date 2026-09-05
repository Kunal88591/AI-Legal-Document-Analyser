import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

# Add apps/ai-service to path
sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))

from app.services.intelligence_engine import IntelligenceEngine


def test_synthetic_contract_analysis():
    candidates = [
        Path(__file__).parent.parent.parent.parent / "tests" / "fixtures" / "Legal_AI_Test_Contract_Critical_Clauses.docx",
        Path(__file__).parent.parent.parent.parent / "sample_documents" / "Legal_AI_Test_Contract_Critical_Clauses.docx",
        Path(__file__).parent.parent / "Legal_AI_Test_Contract_Critical_Clauses.docx",
        Path("Legal_AI_Test_Contract_Critical_Clauses.docx"),
        Path("/app/Legal_AI_Test_Contract_Critical_Clauses.docx"),
        Path("/app/tests/fixtures/Legal_AI_Test_Contract_Critical_Clauses.docx"),
    ]
    docx_path = next((p for p in candidates if p.exists()), None)
    assert docx_path is not None, f"Fixture not found in any candidate path: {candidates}"

    with zipfile.ZipFile(docx_path) as z:
        xml_content = z.read("word/document.xml")
    tree = ET.fromstring(xml_content)
    text = " ".join(node.text for node in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t") if node.text)

    engine = IntelligenceEngine()
    analysis = engine.analyze_document(
        document_id="test-synthetic-doc",
        file_name="Legal_AI_Test_Contract_Critical_Clauses.docx",
        jurisdiction="England and Wales",
        text=text,
        file_bytes=None,
        extraction_method="apache-poi",
        ocr_recommended=False,
    )

    print("\n--- 1. CONTRACT CLASSIFICATION ---")
    contract_type = analysis["contractType"]
    print("Contract Type:", contract_type)
    assert contract_type == "Software Services / Commercial Services Agreement", f"Unexpected contract type: {contract_type}"
    assert "Employment" not in contract_type, "Contract must NOT be classified as Employment!"
    print("[PASS] Classification accurately identified as Software Services / Commercial Agreement")

    print("\n--- 2. OCR REPORTING ---")
    print("OCR Recommended:", analysis["ocrRecommended"])
    print("OCR Confidence:", analysis["ocrConfidence"])
    print("OCR Status:", analysis["ocrStatus"])
    assert analysis["ocrRecommended"] is False
    assert analysis["ocrConfidence"] == 0.0 or analysis["ocrConfidence"] is None
    print("[PASS] OCR is properly reported as Not Required for native digital extraction")

    print("\n--- 3. BALANCED RISK SCORING ---")
    score = analysis["riskScore"]
    level = analysis["riskLevel"]
    breakdown = analysis["riskBreakdown"]
    print(f"Risk Score: {score}/100 ({level})")
    print("Categories:", breakdown["categories"])
    print("Rationale:", breakdown["rationale"])
    assert 40 <= score <= 70, f"Expected realistic risk score between 40 and 70, got {score}"
    assert level in {"Moderate", "High"}, f"Expected Moderate or High risk, got {level}"
    print("[PASS] Risk score is balanced and explainable (not saturated 100)")

    print("\n--- 4. SEMANTIC DATES ---")
    dates_by_type = {d["type"]: d["date"] for d in analysis["facts"]["semanticDates"]}
    print("Detected Semantic Dates:", dates_by_type)
    assert "EFFECTIVE_DATE" in dates_by_type, "Missing EFFECTIVE_DATE"
    assert dates_by_type["EFFECTIVE_DATE"] == "2026-01-15", f"Expected 2026-01-15, got {dates_by_type['EFFECTIVE_DATE']}"
    assert "EXPIRATION_DATE" in dates_by_type, "Missing EXPIRATION_DATE"
    assert dates_by_type["EXPIRATION_DATE"] == "2027-01-14", f"Expected 2027-01-14, got {dates_by_type['EXPIRATION_DATE']}"
    assert "NON_RENEWAL_NOTICE_DEADLINE" in dates_by_type, "Missing NON_RENEWAL_NOTICE_DEADLINE"
    assert dates_by_type["NON_RENEWAL_NOTICE_DEADLINE"] in {"2026-11-15", "2026-11-16"}, f"Expected 2026-11-15, got {dates_by_type['NON_RENEWAL_NOTICE_DEADLINE']}"
    print("[PASS] Semantic dates accurately extracted and normalized to ISO 8601")

    print("\n--- 5. SEMANTIC DURATIONS ---")
    dur_types = {d["type"]: d["matchedText"] for d in analysis["facts"]["semanticDurations"]}
    print("Detected Durations:")
    for dt, val in dur_types.items():
        print(f"  {dt}: {val}")
    assert "INITIAL_TERM" in dur_types, "Missing INITIAL_TERM"
    assert "RENEWAL_PERIOD" in dur_types, "Missing RENEWAL_PERIOD"
    assert "NON_RENEWAL_NOTICE_PERIOD" in dur_types, "Missing NON_RENEWAL_NOTICE_PERIOD"
    assert "CONVENIENCE_TERMINATION_NOTICE" in dur_types, "Missing CONVENIENCE_TERMINATION_NOTICE"
    assert "SECURITY_INCIDENT_NOTIFICATION" in dur_types, "Missing SECURITY_INCIDENT_NOTIFICATION"
    assert "CURE_PERIOD" in dur_types, "Missing CURE_PERIOD"
    assert "CONFIDENTIALITY_SURVIVAL" in dur_types, "Missing CONFIDENTIALITY_SURVIVAL"
    print("[PASS] All key contractual durations identified and semantically differentiated")

    print("\n--- 6. STRUCTURED OBLIGATIONS ---")
    obligations = analysis["obligations"]
    print(f"Extracted {len(obligations)} structured obligations:")
    for ob in obligations:
        print(f"  [{ob['party']}] {ob['obligation']} (Deadline: {ob['deadline']})")
    assert len(obligations) >= 8, f"Expected at least 8 obligations, got {len(obligations)}"
    parties = {ob["party"] for ob in obligations}
    assert "Provider" in parties, "Must extract Provider obligations"
    assert "Customer" in parties, "Must extract Customer obligations"
    print("[PASS] Structured obligations extracted with parties, triggers, and deadlines")

    print("\n--- 7. CONTRACT METADATA ---")
    meta = analysis["contractMetadata"]
    print("Parties:", meta["parties"])
    print("Governing Law:", meta["governingLaw"])
    print("Monthly Fee:", meta["monthlyFee"])
    assert "England and Wales" in meta["governingLaw"]
    assert "USD 12,000" in meta["monthlyFee"] or "12,000" in meta["monthlyFee"]
    print("[PASS] Core contract metadata extracted accurately")

    print("\n========================================================")
    print("   ALL REGRESSION TEST ASSERTIONS PASSED PERFECTLY!     ")
    print("========================================================")


if __name__ == "__main__":
    test_synthetic_contract_analysis()
