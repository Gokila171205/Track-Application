"""
Comprehensive Test Suite for Explainable Application Validation Engine.
Verifies all 15 core statutory test cases specified in the requirements.
"""

import sys
import io
from pathlib import Path
from datetime import date, datetime, timezone
import pypdf

# Ensure backend root is on sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.services.explainable_validator import (
    validate_document_explainable,
    validate_phone_explainable,
    validate_email_explainable,
    validate_required_field_explainable,
    validate_missing_document_explainable,
    validate_application_dossier,
    names_match,
    extract_validity_details,
    parse_date_string
)

def create_sample_pdf(text: str) -> bytes:
    """Helper to generate a genuine PDF binary containing text streams."""
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=612, height=792)
    metadata = {
        "/Producer": "Government of India e-District Service Portal",
        "/Title": "Statutory Certificate",
        "/Subject": text
    }
    writer.add_metadata(metadata)
    page = writer.pages[0]
    safe_lines = [line.replace("(", "").replace(")", "").strip() for line in text.split("\n") if line.strip()]
    stream_ops = "BT /F1 12 Tf 50 720 Td 14 TL "
    for line in safe_lines:
        stream_ops += f"({line}) ' "
    stream_ops += "ET"

    content_stream = pypdf.generic.DecodedStreamObject()
    content_stream.set_data(stream_ops.encode("latin-1", errors="replace"))
    page[pypdf.generic.NameObject("/Contents")] = content_stream

    font_dict = pypdf.generic.DictionaryObject({
        pypdf.generic.NameObject("/Type"): pypdf.generic.NameObject("/Font"),
        pypdf.generic.NameObject("/Subtype"): pypdf.generic.NameObject("/Type1"),
        pypdf.generic.NameObject("/BaseFont"): pypdf.generic.NameObject("/Helvetica"),
    })
    fonts = pypdf.generic.DictionaryObject({pypdf.generic.NameObject("/F1"): font_dict})
    page[pypdf.generic.NameObject("/Resources")] = pypdf.generic.DictionaryObject({
        pypdf.generic.NameObject("/Font"): fonts
    })

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


# --------------------------------------------------------------------------
# CASE 1: Income Certificate required -> Caste Certificate uploaded
# --------------------------------------------------------------------------
def test_case_01_document_type_mismatch():
    caste_text = (
        "GOVERNMENT OF JHARKHAND\n"
        "OFFICE OF THE SUB-DIVISIONAL OFFICER, RANCHI\n"
        "SCHEDULED TRIBE COMMUNITY CASTE CERTIFICATE\n"
        "Certificate No: ST/JH/2024/99120\n"
        "This is to certify that Shri Arun Kumar son of Shri Ramesh Kumar,\n"
        "resident of Village Khunti, District Ranchi, Jharkhand belongs to the\n"
        "Santhal Community which is recognized as a Scheduled Tribe under the\n"
        "Constitution (Scheduled Tribes) Order, 1950 as amended.\n"
        "Issued by: Sub-Divisional Magistrate, Ranchi Revenue Division.\n"
    )
    caste_pdf = create_sample_pdf(caste_text)
    res1 = validate_document_explainable(
        file_bytes=caste_pdf,
        filename="caste_cert.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE",
        applicant_name="Arun Kumar"
    )
    assert res1["status"] == "ERROR", f"Expected ERROR, got {res1['status']}"
    assert res1["category"] == "DOCUMENT_TYPE_MISMATCH"
    assert "Incorrect Document Uploaded" in res1["what_is_wrong"]
    assert "Caste" in res1["why_is_wrong"] or "Community" in res1["why_is_wrong"]
    assert "Income Certificate" in res1["expected"]
    assert "Please upload a valid Income Certificate" in res1["action"]


# --------------------------------------------------------------------------
# CASE 2: Expired Income Certificate uploaded
# --------------------------------------------------------------------------
def test_case_02_expired_document():
    expired_income_text = (
        "OFFICE OF THE TEHSILDAR, DISTRICT REVENUE ADMINISTRATION\n"
        "ANNUAL INCOME CERTIFICATE\n"
        "Certificate No: INC/2024/77102\n"
        "This is to certify that Shri Arun Kumar son of Shri Ramesh Kumar,\n"
        "resident of District Khunti has a gross annual family income of Rs. 1,45,000\n"
        "(Rupees One Lakh Forty Five Thousand Only) from all sources.\n"
        "Valid until: 31/03/2024\n"
        "Date of Issue: 10/05/2023\n"
        "Tehsildar Signature & Seal\n"
    )
    expired_pdf = create_sample_pdf(expired_income_text)
    ref_date = date(2026, 4, 1) # After 31/03/2024
    res2 = validate_document_explainable(
        file_bytes=expired_pdf,
        filename="income_expired.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE",
        applicant_name="Arun Kumar",
        current_reference_date=ref_date
    )
    assert res2["status"] == "ERROR"
    assert res2["category"] == "DOCUMENT_EXPIRED"
    assert "Document Expired" in res2["what_is_wrong"]
    assert "31/03/2024" in res2["why_is_wrong"]
    assert "current and valid" in res2["action"]


# --------------------------------------------------------------------------
# CASE 3: Correct Document -> Show successful validation
# --------------------------------------------------------------------------
def test_case_03_correct_document():
    valid_income_text = (
        "OFFICE OF THE TEHSILDAR, DISTRICT REVENUE ADMINISTRATION\n"
        "ANNUAL INCOME CERTIFICATE FOR STATUTORY SCHOLARSHIP\n"
        "Certificate No: INC/JH/2026/88341\n"
        "This is to certify that Shri Arun Kumar son of Shri Ramesh Kumar,\n"
        "resident of Ranchi, Jharkhand has a certified annual income of Rs. 1,80,000\n"
        "(Rupees One Lakh Eighty Thousand Only) per annum from all sources.\n"
        "Valid until: 31/03/2027\n"
        "Issued by: Tehsildar, Revenue Department\n"
    )
    valid_pdf = create_sample_pdf(valid_income_text)
    res3 = validate_document_explainable(
        file_bytes=valid_pdf,
        filename="income_valid.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE",
        applicant_name="Arun Kumar",
        current_reference_date=date(2026, 9, 28)
    )
    assert res3["status"] == "VALID"
    assert res3["is_acceptable"] is True
    assert "Verified" in res3["provided"] or "Income Certificate" in res3["expected"]


# --------------------------------------------------------------------------
# CASE 4: File Too Large -> Show actual size + max size
# --------------------------------------------------------------------------
def test_case_04_file_too_large():
    oversized_bytes = b"%PDF-1.4 " + (b"0" * (7800 * 1024))
    res4 = validate_document_explainable(
        file_bytes=oversized_bytes,
        filename="huge_scan.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE"
    )
    assert res4["status"] == "ERROR"
    assert res4["category"] == "FILE_SIZE"
    assert res4["what_is_wrong"] == "File Too Large"
    assert "7.62" in res4["why_is_wrong"] or "7." in res4["why_is_wrong"]
    assert "5 MB" in res4["expected"]
    assert "smaller than 5 MB" in res4["action"]


# --------------------------------------------------------------------------
# CASE 5: Unsupported format (DOCX)
# --------------------------------------------------------------------------
def test_case_05_unsupported_format():
    docx_bytes = b"PK\x03\x04ThisIsFakeDocxZipStreamContent"
    res5 = validate_document_explainable(
        file_bytes=docx_bytes,
        filename="certificate.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        required_document_type="INCOME_CERTIFICATE"
    )
    assert res5["status"] == "ERROR"
    assert res5["category"] == "FILE_FORMAT"
    assert res5["what_is_wrong"] == "Unsupported File Format"
    assert "DOCX" in res5["why_is_wrong"]
    assert "PDF, JPG, JPEG, PNG" in res5["expected"]
    assert "convert or export" in res5["action"]


# --------------------------------------------------------------------------
# CASE 6: Blurry / low quality document -> Ask for clearer copy
# --------------------------------------------------------------------------
def test_case_06_blurry_document():
    blurry_pdf = create_sample_pdf("X")
    res6 = validate_document_explainable(
        file_bytes=blurry_pdf,
        filename="blurry_cert.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE"
    )
    assert res6["status"] == "ERROR"
    assert res6["category"] == "DOCUMENT_QUALITY"
    assert res6["what_is_wrong"] == "Document Cannot Be Read Clearly"
    assert "blurry, too dark, cropped" in res6["why_is_wrong"]
    assert "clear, complete scan" in res6["action"]


# --------------------------------------------------------------------------
# CASE 7: Phone number = 9 digits
# --------------------------------------------------------------------------
def test_case_07_phone_9_digits():
    p7 = validate_phone_explainable("987654321")
    assert p7 is not None
    assert p7["status"] == "ERROR"
    assert p7["category"] in ("PHONE_FORMAT", "PHONE_INVALID_LENGTH")
    assert p7["what_is_wrong"] == "Invalid Phone Number"
    assert "10 digits" in p7["why_is_wrong"]
    assert "9 digits" in p7["provided"]
    assert "10-digit mobile number" in p7["action"] or "10-digit phone number" in p7["action"]


# --------------------------------------------------------------------------
# CASE 8: Phone number already registered
# --------------------------------------------------------------------------
def test_case_08_phone_already_registered():
    p8 = validate_phone_explainable("9876543210", is_registered_check=True)
    assert p8 is not None
    assert p8["status"] == "ERROR"
    assert p8["category"] == "PHONE_DUPLICATE"
    assert p8["what_is_wrong"] == "Phone Number Already Registered"
    assert "already associated with an existing account" in p8["why_is_wrong"]


# --------------------------------------------------------------------------
# CASE 9: Invalid email format (student@gmail)
# --------------------------------------------------------------------------
def test_case_09_invalid_email_format():
    e9 = validate_email_explainable("student@gmail")
    assert e9 is not None
    assert e9["status"] == "ERROR"
    assert e9["category"] == "EMAIL_FORMAT"
    assert e9["what_is_wrong"] == "Invalid Email Address"
    assert "missing a complete domain name" in e9["why_is_wrong"]
    assert "example@gmail.com" in e9["expected"]


# --------------------------------------------------------------------------
# CASE 10: Existing email registered
# --------------------------------------------------------------------------
def test_case_10_email_already_registered():
    e10 = validate_email_explainable("student@gmail.com", is_registered_check=True)
    assert e10 is not None
    assert e10["status"] == "ERROR"
    assert e10["category"] == "EMAIL_DUPLICATE"
    assert e10["what_is_wrong"] == "Email Already Registered"
    assert "already exists" in e10["why_is_wrong"]


# --------------------------------------------------------------------------
# CASE 11: Name Mismatch (Arun Kumar vs Ravi Kumar)
# --------------------------------------------------------------------------
def test_case_11_name_mismatch():
    ravi_income_text = (
        "OFFICE OF THE TEHSILDAR, DISTRICT REVENUE ADMINISTRATION\n"
        "ANNUAL INCOME CERTIFICATE\n"
        "Certificate No: INC/JH/2026/10294\n"
        "This is to certify that Shri Ravi Kumar son of Shri Mohan Kumar,\n"
        "resident of Ranchi, Jharkhand has a certified annual income of Rs. 1,60,000\n"
        "per annum from all sources.\n"
        "Valid until: 31/03/2027\n"
        "Tehsildar Signature & Seal\n"
    )
    ravi_pdf = create_sample_pdf(ravi_income_text)
    res11 = validate_document_explainable(
        file_bytes=ravi_pdf,
        filename="income_ravi.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE",
        applicant_name="Arun Kumar",
        current_reference_date=date(2026, 9, 28)
    )
    assert res11["status"] == "WARNING"
    assert res11["category"] == "NAME_MISMATCH"
    assert "Applicant Details Do Not Match" in res11["what_is_wrong"]
    assert "Arun Kumar" in res11["expected"]
    assert "Ravi Kumar" in res11["provided"]


# --------------------------------------------------------------------------
# CASE 12: DOB Mismatch (12/04/2005 vs 14/04/2005)
# --------------------------------------------------------------------------
def test_case_12_dob_mismatch():
    dob_text = (
        "GOVERNMENT OF JHARKHAND\n"
        "OFFICE OF THE SUB-DIVISIONAL OFFICER\n"
        "SCHEDULED TRIBE COMMUNITY CERTIFICATE\n"
        "Certificate No: ST/JH/2024/77401\n"
        "This is to certify that Shri Arun Kumar,\n"
        "Date of Birth: 14/04/2005\n"
        "belongs to the Santhal Scheduled Tribe Community under Presidential Order 1950.\n"
        "Sub-Divisional Magistrate Signature & Seal\n"
    )
    dob_pdf = create_sample_pdf(dob_text)
    res12 = validate_document_explainable(
        file_bytes=dob_pdf,
        filename="st_cert_dob.pdf",
        content_type="application/pdf",
        required_document_type="ST_CERTIFICATE",
        applicant_name="Arun Kumar",
        applicant_dob="12/04/2005"
    )
    assert res12["status"] == "WARNING"
    assert res12["category"] == "DOB_MISMATCH"
    assert "Date of Birth Mismatch" in res12["what_is_wrong"]
    assert "12/04/2005" in res12["expected"]
    assert "14/04/2005" in res12["provided"]


# --------------------------------------------------------------------------
# CASE 13: Missing Required Document
# --------------------------------------------------------------------------
def test_case_13_missing_required_document():
    res13 = validate_missing_document_explainable("INCOME_CERTIFICATE", "Income Certificate")
    assert res13["status"] == "ERROR"
    assert res13["category"] == "MISSING_DOCUMENT"
    assert res13["what_is_wrong"] == "Required Document Missing"
    assert "This application requires an Income Certificate" in res13["why_is_wrong"]
    assert res13["action"] == "Please upload: Income Certificate"


# --------------------------------------------------------------------------
# CASE 14: Multiple Mistakes (Phone 9 digits + wrong Income doc + blurry Marksheet)
# --------------------------------------------------------------------------
def test_case_14_multiple_mistakes():
    scheme_docs = [
        {"code": "ST_CERTIFICATE", "name": "ST Certificate", "required": True},
        {"code": "INCOME_CERTIFICATE", "name": "Income Certificate", "required": True},
        {"code": "MARKSHEET", "name": "Qualifying Marksheet", "required": True}
    ]
    multi_res = validate_application_dossier(
        scheme_required_documents=scheme_docs,
        personal_details={
            "phone": "987654321", # Error: 9 digits
            "email": "student@gmail.com",
            "fullName": "Arun Kumar",
            "dob": "12/04/2005",
            "category": "ST",
            "state": "Jharkhand",
            "district": "Ranchi",
            "pincode": "834001"
        },
        uploaded_documents=[
            {"document_code": "ST_CERTIFICATE", "status": "TYPE_MATCH"},
            {"document_code": "INCOME_CERTIFICATE", "verification_status": "TYPE_MISMATCH", "detected_type": "Caste Certificate"},
            {"document_code": "MARKSHEET", "verification_status": "DOCUMENT_QUALITY", "detected_type": "Unclear"}
        ]
    )
    assert multi_res["is_valid"] is False
    assert multi_res["total_issues"] == 3
    assert "3 issues need your attention" in multi_res["summary_message"]
    issue_categories = [i["category"] for i in multi_res["issues"]]
    assert any(c in issue_categories for c in ("PHONE_FORMAT", "PHONE_INVALID_LENGTH"))
    assert "DOCUMENT_TYPE_MISMATCH" in issue_categories
    assert "DOCUMENT_QUALITY" in issue_categories


# --------------------------------------------------------------------------
# CASE 15: AI Uncertain / Validity clause without confident date
# --------------------------------------------------------------------------
def test_case_15_ai_uncertain():
    uncertain_income_text = (
        "OFFICE OF THE TEHSILDAR, DISTRICT REVENUE ADMINISTRATION\n"
        "ANNUAL INCOME CERTIFICATE\n"
        "Certificate No: INC/JH/2026/55419\n"
        "This is to certify that Shri Arun Kumar has a certified annual income of Rs. 1,50,000.\n"
        "Valid until the period prescribed under state revenue code: --/--/----\n"
        "Issued by: Tehsildar Office\n"
    )
    uncertain_pdf = create_sample_pdf(uncertain_income_text)
    res15 = validate_document_explainable(
        file_bytes=uncertain_pdf,
        filename="income_uncertain.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE",
        applicant_name="Arun Kumar",
        current_reference_date=date(2026, 9, 28)
    )
    assert res15["status"] == "WARNING"
    assert res15["category"] == "UNABLE_TO_VERIFY_VALIDITY"
    assert "Unable to Verify Document Validity" in res15["what_is_wrong"]
    assert "could not be read clearly" in res15["why_is_wrong"]
    assert "authorized officer verification" in res15["action"]


# --------------------------------------------------------------------------
# CASE 16: Exact Demo PDF Document (Moulika FY2026-27 CURRENT OCR SAMPLE)
# --------------------------------------------------------------------------
def test_case_16_demo_income_certificate_moulika_valid():
    sample_path = Path(r"C:\Users\dharanesh\Downloads\02_income_certificate_Moulika_FY2026-27_CURRENT_OCR_SAMPLE.pdf")
    if sample_path.exists():
        pdf_bytes = sample_path.read_bytes()
    else:
        # Fallback to authentic synthetic representation of the demo document
        demo_text = (
            "SAMPLE / DEMO DOCUMENT\n"
            "INCOME CERTIFICATE\n"
            "Certificate Details\n"
            "Applicant Name\n"
            "Moulika\n"
            "Certificate Type\n"
            "Income Certificate\n"
            "Financial Year\n"
            "2026-27\n"
            "Annual Family Income\n"
            "INR 2,00,000 (Two Lakh Rupees Only)\n"
            "Certificate Number\n"
            "DEMO-TN-INC-2026-0011680\n"
            "Issue Date\n"
            "15 September 2026\n"
            "Valid From\n"
            "01 April 2026\n"
            "Valid Until\n"
            "31 March 2027\n"
            "Validity / Applicable Period\n"
            "01/04/2026 to 31/03/2027\n"
            "Issuing Authority\n"
            "Sample Competent Revenue Authority / Tehsildar\n"
        )
        pdf_bytes = create_sample_pdf(demo_text)

    ref_date = date(2026, 9, 30)
    res = validate_document_explainable(
        file_bytes=pdf_bytes,
        filename="02_income_certificate_Moulika_FY2026-27_CURRENT_OCR_SAMPLE.pdf",
        content_type="application/pdf",
        required_document_type="INCOME_CERTIFICATE",
        applicant_name="Moulika",
        current_reference_date=ref_date
    )

    assert res["status"] == "VALID", f"Expected VALID, got {res['status']}: {res.get('what_is_wrong')}"
    assert res["category"] == "DOCUMENT_VALIDATED"
    assert "Unable to Verify Document Validity" not in res.get("what_is_wrong", "")
    assert "Document Expired" not in res.get("what_is_wrong", "")

    # Check extracted fields
    fields = res.get("extracted_fields", {})
    assert fields.get("applicant_name") == "Moulika"
    assert fields.get("valid_until") == "2027-03-31"
    assert fields.get("valid_from") == "2026-04-01"
    assert fields.get("financial_year") == "2026-27"

    # Check structured verification result
    val_res = fields.get("validity_details", {})
    assert val_res.get("validity_status") == "VALID"
    assert val_res.get("valid_until") == "2027-03-31"
    assert val_res.get("valid_from") == "2026-04-01"


# --------------------------------------------------------------------------
# CASE 17: Robust Date Extraction & Multi-Format Validity (Requirements 3-12)
# --------------------------------------------------------------------------
def test_case_17_multi_pattern_date_extraction_all_cases():
    ref_date = date(2026, 9, 30)

    # Test 1: 31/03/2027 -> VALID
    t1 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nIncome: Rs. 1,00,000\nValid Until: 31/03/2027")
    r1 = validate_document_explainable(t1, "i1.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r1["status"] == "VALID", f"Test 1 failed: {r1}"

    # Test 2: 30/09/2026 -> VALID (reference date is <= expiry date)
    t2 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nIncome: Rs. 1,00,000\nValid Until: 30/09/2026")
    r2 = validate_document_explainable(t2, "i2.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r2["status"] == "VALID", f"Test 2 failed: {r2}"

    # Test 3: 31/03/2026 -> EXPIRED
    t3 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nIncome: Rs. 1,00,000\nValid Until: 31/03/2026")
    r3 = validate_document_explainable(t3, "i3.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r3["status"] == "ERROR" and r3["category"] == "DOCUMENT_EXPIRED", f"Test 3 failed: {r3}"

    # Test 4: "01/04/2026 to 31/03/2027" -> VALID
    t4 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nValidity / Applicable Period: 01/04/2026 to 31/03/2027")
    r4 = validate_document_explainable(t4, "i4.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r4["status"] == "VALID", f"Test 4 failed: {r4}"
    assert r4["extracted_fields"]["valid_until"] == "2027-03-31"

    # Test 5: "Validity clause present but no readable date" -> REQUIRES_MANUAL_REVIEW
    t5 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nValid until the period prescribed under state revenue code: --/--/----")
    r5 = validate_document_explainable(t5, "i5.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r5["status"] == "WARNING" and r5["category"] == "UNABLE_TO_VERIFY_VALIDITY" and r5["is_acceptable"] is True

    # Test 6: No validity information -> VALIDITY_NOT_FOUND (WARNING, is_acceptable=True)
    t6 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nGross Family Income: Rs. 1,00,000\nTehsildar Revenue Office")
    r6 = validate_document_explainable(t6, "i6.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r6["status"] == "WARNING" and r6["category"] == "VALIDITY_NOT_FOUND" and r6["is_acceptable"] is True

    # Test 7: Written month format: "31 March 2027" -> VALID
    t7 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nValid Until: 31 March 2027")
    r7 = validate_document_explainable(t7, "i7.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r7["status"] == "VALID"
    assert r7["extracted_fields"]["valid_until"] == "2027-03-31"

    # Test 8: OCR spaces variant: "31 / 03 / 2027" -> VALID
    t8 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nValid Upto: 31 / 03 / 2027")
    r8 = validate_document_explainable(t8, "i8.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r8["status"] == "VALID"
    assert r8["extracted_fields"]["valid_until"] == "2027-03-31"

    # Test 9: Financial Year inference: "Financial Year: 2026-27" -> VALID (ending 31/03/2027)
    t9 = create_sample_pdf("INCOME CERTIFICATE\nApplicant: Arun Kumar\nFinancial Year: 2026-27\nGross Family Income: 1,50,000")
    r9 = validate_document_explainable(t9, "i9.pdf", "application/pdf", "INCOME_CERTIFICATE", "Arun Kumar", current_reference_date=ref_date)
    assert r9["status"] == "VALID"
    assert r9["extracted_fields"]["valid_until"] == "2027-03-31"


def run_all_explainable_engine_tests():
    print("=" * 80)
    print("STARTING EXPLAINABLE APPLICATION VALIDATION ENGINE TEST SUITE")
    print("=" * 80)
    test_case_01_document_type_mismatch()
    print("  [OK] CASE 1: Income Certificate required -> Caste Certificate uploaded")
    test_case_02_expired_document()
    print("  [OK] CASE 2: Expired Income Certificate uploaded")
    test_case_03_correct_document()
    print("  [OK] CASE 3: Correct Document -> Show successful validation")
    test_case_04_file_too_large()
    print("  [OK] CASE 4: File too large")
    test_case_05_unsupported_format()
    print("  [OK] CASE 5: Unsupported format")
    test_case_06_blurry_document()
    print("  [OK] CASE 6: Blurry / low quality document")
    test_case_07_phone_9_digits()
    print("  [OK] CASE 7: Phone number = 9 digits")
    test_case_08_phone_already_registered()
    print("  [OK] CASE 8: Phone number already registered")
    test_case_09_invalid_email_format()
    print("  [OK] CASE 9: Invalid email format")
    test_case_10_email_already_registered()
    print("  [OK] CASE 10: Email already registered")
    test_case_11_name_mismatch()
    print("  [OK] CASE 11: Name mismatch")
    test_case_12_dob_mismatch()
    print("  [OK] CASE 12: DOB mismatch")
    test_case_13_missing_required_document()
    print("  [OK] CASE 13: Missing required document")
    test_case_14_multiple_mistakes()
    print("  [OK] CASE 14: Multiple mistakes")
    test_case_15_ai_uncertain()
    print("  [OK] CASE 15: AI uncertain")
    test_case_16_demo_income_certificate_moulika_valid()
    print("  [OK] CASE 16: Demo Income Certificate (Moulika FY2026-27 CURRENT OCR SAMPLE)")
    test_case_17_multi_pattern_date_extraction_all_cases()
    print("  [OK] CASE 17: Robust multi-pattern date extraction and validation hierarchy")
    print("=" * 80)
    print("ALL CORE EXPLAINABLE ENGINE TEST CASES PASSED WITH 100% SUCCESS!")
    print("=" * 80)

if __name__ == "__main__":
    run_all_explainable_engine_tests()

