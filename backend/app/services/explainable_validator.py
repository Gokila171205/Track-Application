"""
TSFMS Explainable Application Validation Engine.
Provides human-readable, 5-point explainable diagnostic results for all application errors:
1. WHAT IS WRONG?
2. WHY IS IT WRONG?
3. WHAT WAS EXPECTED?
4. WHAT DID THE APPLICANT PROVIDE?
5. WHAT SHOULD THE APPLICANT DO TO FIX IT?

Strictly adheres to validation priority:
File selected -> File existence -> File size -> File format -> File integrity ->
Image quality -> OCR text extraction -> Document classification -> Required doc comparison ->
Field extraction -> Applicant data matching -> Validity/expiry check -> Return explainable result.
"""

import re
import io
import logging
from datetime import datetime, date, timezone
from typing import Dict, Any, Optional, List, Tuple
from app.schemas.document import DocumentType, VerificationStatus

logger = logging.getLogger("tsfms.validator")
from app.services.document_classifier import (
    CLASSIFICATION_RULES,
    normalize_document_type,
    classify_document_text,
    DOCUMENT_CODE_ALIASES
)
from app.services.file_validator import (
    MAX_FILE_SIZE_BYTES,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES,
    MAGIC_SIGNATURES,
    sanitize_filename
)
from app.services.ocr_service import (
    extract_text_from_pdf,
    extract_text_from_image,
    extract_non_sensitive_fields
)

# Standard human-friendly document display names
DOCUMENT_DISPLAY_NAMES: Dict[str, str] = {
    DocumentType.ST_CERTIFICATE.value: "ST Community / Caste Certificate",
    DocumentType.INCOME_CERTIFICATE.value: "Income Certificate",
    DocumentType.MARKSHEET.value: "Qualifying Marksheet",
    DocumentType.ADMISSION_PROOF.value: "University Admission Letter / Joining Report",
    DocumentType.BANK_DOCUMENT.value: "Bank Passbook / Account Document",
    DocumentType.IDENTITY_DOCUMENT.value: "Aadhaar / Identity Document",
}

def get_doc_display_name(doc_type: Optional[str]) -> str:
    if not doc_type:
        return "Required Document"
    norm = normalize_document_type(doc_type)
    return DOCUMENT_DISPLAY_NAMES.get(norm, norm.replace("_", " ").title())

def mask_identifier(val: Optional[str]) -> str:
    """Mask sensitive identifiers like Aadhaar or account numbers."""
    if not val:
        return "Not Provided"
    clean = re.sub(r"\s+", "", str(val))
    if len(clean) >= 4:
        return ("X" * (len(clean) - 4)) + clean[-4:]
    return "XXXX"

MONTH_MAP: Dict[str, int] = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12
}

DATE_REGEX_PATTERN = (
    r"(?:"
    r"[0-3]?\d\s*[/.-]\s*[0-1]?\d\s*[/.-]\s*20\d\d"
    r"|\b[0-3]?\d(?:st|nd|rd|th)?\s+[a-zA-Z]+\s*,?\s*20\d\d"
    r"|\b[a-zA-Z]+\s+[0-3]?\d(?:st|nd|rd|th)?\s*,?\s*20\d\d"
    r"|20\d\d\s*[-/.]\s*[0-1]?\d\s*[-/.]\s*[0-3]?\d"
    r")"
)

def parse_date_string(date_str: Optional[str]) -> Optional[date]:
    """
    Parse various Indian and standard date representations:
    DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD,
    written dates (31 March 2027, 31 Mar 2027, March 31, 2027),
    and OCR spacing variations (31 / 03 / 2027).
    """
    if not date_str:
        return None
    cleaned = str(date_str).strip().rstrip(".,;")
    # Remove ordinal suffixes (1st, 2nd, 3rd, 4th, 31st)
    cleaned = re.sub(r"(\d+)\s*(?:st|nd|rd|th)\b", r"\1", cleaned, flags=re.IGNORECASE)
    # Remove whitespace around delimiters: '31 / 03 / 2027' -> '31/03/2027'
    cleaned = re.sub(r"\s*([/.-])\s*", r"\1", cleaned)
    cleaned = cleaned.replace(",", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
        "%Y-%m-%d", "%Y/%m/%d",
        "%d %B %Y", "%d %b %Y",
        "%B %d %Y", "%b %d %Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue

    # Fallback parser for written month: '31 March 2027'
    m_written = re.match(r"^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$", cleaned)
    if m_written:
        day = int(m_written.group(1))
        m_name = m_written.group(2).lower()
        year = int(m_written.group(3))
        if m_name in MONTH_MAP:
            try:
                return date(year, MONTH_MAP[m_name], day)
            except ValueError:
                pass

    # Fallback parser for written month: 'March 31 2027'
    m_written_rev = re.match(r"^([a-zA-Z]+)\s+(\d{1,2})\s+(\d{4})$", cleaned)
    if m_written_rev:
        m_name = m_written_rev.group(1).lower()
        day = int(m_written_rev.group(2))
        year = int(m_written_rev.group(3))
        if m_name in MONTH_MAP:
            try:
                return date(year, MONTH_MAP[m_name], day)
            except ValueError:
                pass

    return None

def extract_validity_details(text: str) -> Dict[str, Any]:
    """
    Robust multi-pattern validity extractor for statutory certificates.
    Adheres strictly to the specification priority:
    1. Explicit 'Valid Until' / 'Expiry Date' / 'Expires On'
    2. Explicit validity range ending date (e.g. '01/04/2026 to 31/03/2027')
    3. Explicit 'Valid Till' / 'Valid Upto' / 'Valid up to'
    4. Scheme-specific validity rule
    5. Financial-year inference (e.g. 'Financial Year 2026-27' -> valid_from: 2026-04-01, valid_until: 2027-03-31)
    """
    res: Dict[str, Any] = {
        "valid_from": None,
        "valid_until": None,
        "valid_from_str": None,
        "valid_until_str": None,
        "has_validity_clause": False,
        "validity_source": None,
        "financial_year": None,
        "reason": None,
        "is_uncertain": False
    }

    # Detect if any validity / expiry / financial year clause is mentioned in document text
    clause_pattern = r"\b(?:valid\s*(?:until|up\s*to|upto|till|for|from|period)|validity(?:\s*period)?|expires?\s*(?:on)?|expiry\s*(?:date)?|applicable\s*period|financial\s*year|fy)\b"
    res["has_validity_clause"] = bool(re.search(clause_pattern, text, re.IGNORECASE))

    # Detect explicitly obscured / placeholder dates e.g. '--/--/----', 'unreadable', 'prescribed under state'
    placeholder_uncertain = bool(re.search(r"(?:--/--/----|\b(?:unreadable|obscured)\b|valid\s+until\s+the\s+period\s+prescribed)", text, re.IGNORECASE))

    # 1. Financial Year detection
    fy_match = re.search(
        r"\b(?:financial\s*year|fy|assessment\s*year|ay)\s*[:.\s-]*((?:20\d\d)\s*[-/]\s*(\d{2,4}))\b",
        text,
        re.IGNORECASE
    )
    fy_from = None
    fy_until = None
    if fy_match:
        raw_fy = fy_match.group(1).replace(" ", "")
        res["financial_year"] = raw_fy
        start_year = int(re.search(r"20\d\d", raw_fy).group(0))
        end_part = re.split(r"[-/]", raw_fy)[1]
        end_year = int(end_part) if len(end_part) == 4 else int(str(start_year)[:2] + end_part)
        try:
            fy_from = date(start_year, 4, 1)
            fy_until = date(end_year, 3, 31)
        except ValueError:
            pass

    # Also detect 'Valid for Financial Year 2026-27'
    valid_fy_match = re.search(
        r"(?:valid\s+for\s+(?:the\s+)?(?:financial\s+year|fy))\s*[:.\s-]*((?:20\d\d)\s*[-/]\s*(\d{2,4}))",
        text,
        re.IGNORECASE
    )
    if valid_fy_match and not fy_until:
        raw_fy = valid_fy_match.group(1).replace(" ", "")
        res["financial_year"] = raw_fy
        start_year = int(re.search(r"20\d\d", raw_fy).group(0))
        end_part = re.split(r"[-/]", raw_fy)[1]
        end_year = int(end_part) if len(end_part) == 4 else int(str(start_year)[:2] + end_part)
        try:
            fy_from = date(start_year, 4, 1)
            fy_until = date(end_year, 3, 31)
        except ValueError:
            pass

    # Extract Valid From if labeled
    valid_from_match = re.search(
        rf"(?:valid\s*from|applicable\s*from)\s*[:.\s-]+({DATE_REGEX_PATTERN})",
        text,
        re.IGNORECASE
    )
    if valid_from_match:
        d_from = parse_date_string(valid_from_match.group(1))
        if d_from:
            res["valid_from"] = d_from
            res["valid_from_str"] = d_from.strftime("%Y-%m-%d")

    # Priority 1: Explicit 'Valid Until' / 'Expiry Date' / 'Expires On'
    until_match = re.search(
        rf"(?:valid\s*until|expiry\s*date|expires?\s*(?:on)?)\s*[:.\s-]+({DATE_REGEX_PATTERN})",
        text,
        re.IGNORECASE
    )
    if until_match:
        d = parse_date_string(until_match.group(1))
        if d:
            res["valid_until"] = d
            res["valid_until_str"] = d.strftime("%Y-%m-%d")
            res["validity_source"] = "explicit_valid_until"
            res["reason"] = f"Explicit expiry date identified: {d.strftime('%d/%m/%Y')}."

    # Priority 2: Explicit validity range ending date (e.g. Validity / Applicable Period: 01/04/2026 to 31/03/2027)
    if not res["valid_until"]:
        range_match = re.search(
            rf"(?:validity(?:\s*[/&]\s*applicable)?(?:\s*period)?|applicable\s*period|period\s*of\s*validity)\s*[:.\s-]+({DATE_REGEX_PATTERN})\s*(?:to|thru|through|till|-|–|—)\s*({DATE_REGEX_PATTERN})",
            text,
            re.IGNORECASE
        )
        if range_match:
            d_start = parse_date_string(range_match.group(1))
            d_end = parse_date_string(range_match.group(2))
            if d_end:
                res["valid_until"] = d_end
                res["valid_until_str"] = d_end.strftime("%Y-%m-%d")
                if d_start and not res["valid_from"]:
                    res["valid_from"] = d_start
                    res["valid_from_str"] = d_start.strftime("%Y-%m-%d")
                res["validity_source"] = "explicit_validity_period"
                start_txt = d_start.strftime('%d/%m/%Y') if d_start else ""
                end_txt = d_end.strftime('%d/%m/%Y')
                res["reason"] = f"Income Certificate validity period is {start_txt} to {end_txt}."

    # Priority 3: Explicit 'Valid Till' / 'Valid Upto' / 'Valid up to'
    if not res["valid_until"]:
        till_match = re.search(
            rf"(?:valid\s*(?:till|upto|up\s*to))\s*[:.\s-]+({DATE_REGEX_PATTERN})",
            text,
            re.IGNORECASE
        )
        if till_match:
            d = parse_date_string(till_match.group(1))
            if d:
                res["valid_until"] = d
                res["valid_until_str"] = d.strftime("%Y-%m-%d")
                res["validity_source"] = "explicit_valid_till"
                res["reason"] = f"Valid up to date identified: {d.strftime('%d/%m/%Y')}."

    # Priority 5: Financial-year inference ONLY when no explicit date was found
    if not res["valid_until"] and fy_until:
        res["valid_until"] = fy_until
        res["valid_until_str"] = fy_until.strftime("%Y-%m-%d")
        if not res["valid_from"] and fy_from:
            res["valid_from"] = fy_from
            res["valid_from_str"] = fy_from.strftime("%Y-%m-%d")
        res["validity_source"] = "financial_year_inference"
        res["reason"] = f"Validity inferred from Financial Year {res['financial_year']}: 01/04/{fy_from.year if fy_from else ''} to 31/03/{fy_until.year}."

    # Populate valid_from fallback from Financial Year if not already set
    if not res["valid_from"] and fy_from:
        res["valid_from"] = fy_from
        res["valid_from_str"] = fy_from.strftime("%Y-%m-%d")

    # If validity clause exists but no calendar date could be parsed, flag as uncertain
    if res["has_validity_clause"] and not res["valid_until"]:
        res["is_uncertain"] = True

    if placeholder_uncertain and not res["valid_until"]:
        res["is_uncertain"] = True

    return res

def extract_validity_date(text: str) -> Tuple[Optional[date], Optional[str], bool]:
    """
    Extract validity / expiry date from certificate text.
    Maintains compatibility with legacy callers.
    Returns: (parsed_date, formatted_date_str, has_validity_clause)
    """
    details = extract_validity_details(text)
    expiry_date = details.get("valid_until")
    display_str = expiry_date.strftime("%d/%m/%Y") if expiry_date else None
    return expiry_date, display_str, details.get("has_validity_clause", False)

def extract_person_name(text: str) -> Optional[str]:
    """Extract candidate name mentioned in statutory certificate text."""
    patterns = [
        r"(?:certif(?:y|ied)\s+that|this\s+is\s+to\s+certify\s+that)\s+(?:shri|smt|kumari|mr|ms)?\.?\s*([A-Za-z\s]{3,35})(?:\s+(?:son|daughter|wife|s/o|d/o|w/o|c/o|resident|bearing|belonging))",
        r"(?:name\s+of\s+(?:the)?\s*(?:candidate|applicant|student|scholar))\s*[:.\s-]+([A-Za-z\s]{3,35})(?:\n|\r|$)",
        r"(?:candidate\s+name|student\s+name|applicant\s+name)\s*[:.-]?\s*\r?\n?\s*([A-Za-z]+(?:[ \t]+[A-Za-z]+){0,4})",
        r"(?<!branch\s)(?<!bank\s)(?<!school\s)(?<!college\s)(?<!institution\s)\bname\s*[:.-]\s*([A-Za-z]+(?:[ \t]+[A-Za-z]+){0,4})"
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            clean = re.sub(r"\s+", " ", candidate).strip()
            clean = re.sub(r"\b(certificate\s+type|father\s+name|annual\s+income|details|field)\b.*", "", clean, flags=re.IGNORECASE).strip()
            lower = clean.lower()
            if len(clean) >= 3 and not any(stop in lower for stop in ["government", "ministry", "tribal", "scheduled", "tehsildar", "office", "revenue", "account", "branch", "bank", "school", "college"]):
                return clean
    return None

def extract_dob_from_text(text: str) -> Tuple[Optional[date], Optional[str]]:
    """Extract date of birth from document text."""
    m = re.search(r"(?:date\s+of\s+birth|d\.?o\.?b\.?|birth\s+date)\s*[:.\s-]+([0-3]?[0-9][-/][0-1]?[0-9][-/](?:19|20)\d\d)", text, re.IGNORECASE)
    if m:
        raw_str = m.group(1).strip()
        return parse_date_string(raw_str), raw_str
    return None, None

def names_match(name1: str, name2: str) -> bool:
    """Compare two names ignoring honorifics and case."""
    def clean(n: str) -> str:
        s = n.lower().strip()
        s = re.sub(r"\b(shri|smt|kumari|mr|mrs|ms|dr|shree)\b", "", s)
        s = re.sub(r"[^a-z\s]", "", s)
        return " ".join(s.split())

    c1, c2 = clean(name1), clean(name2)
    if not c1 or not c2:
        return True # Cannot determine mismatch if empty or unreadable
    if c1 == c2:
        return True

    tokens1 = c1.split()
    tokens2 = c2.split()
    if not tokens1 or not tokens2:
        return True

    # Check if primary given names match or initial
    first1, first2 = tokens1[0], tokens2[0]
    first_match = (
        first1 == first2
        or (len(first1) == 1 and first2.startswith(first1))
        or (len(first2) == 1 and first1.startswith(first2))
        or (first1 in tokens2)
        or (first2 in tokens1)
    )
    if not first_match:
        return False

    set1, set2 = set(tokens1), set(tokens2)
    common = set1.intersection(set2)
    if len(common) >= min(len(tokens1), len(tokens2)):
        return True

    # Check initial matches across tokens
    all_matched = True
    for t in tokens1:
        if not any(t == t2 or (len(t2) == 1 and t.startswith(t2)) or (len(t) == 1 and t2.startswith(t)) for t2 in tokens2):
            all_matched = False
            break
    if all_matched:
        return True

    return len(common) > 0 and first_match

def validate_document_explainable(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    required_document_type: str,
    applicant_name: Optional[str] = None,
    applicant_dob: Optional[str] = None,
    applicant_aadhaar: Optional[str] = None,
    current_reference_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Execute complete priority-ordered explainable validation:
    File selected -> Existence -> Size -> Format -> Integrity -> Quality ->
    OCR Extraction -> Classification -> Scheme Match -> Name Match -> DOB Match -> Expiry Check.
    """
    if current_reference_date is None:
        current_reference_date = datetime.now(timezone.utc).date()

    norm_required = normalize_document_type(required_document_type)
    required_display = get_doc_display_name(norm_required)

    # 1. FILE EXISTENCE & NON-EMPTY CHECK (Part 10)
    if not file_bytes or len(file_bytes) == 0:
        return {
            "status": "ERROR",
            "category": "CORRUPTED_FILE",
            "what_is_wrong": "File Cannot Be Read",
            "why_is_wrong": "The uploaded file appears to be empty (0 bytes) or corrupted.",
            "expected": f"A valid, readable {required_display} (PDF, JPG, or PNG under 5 MB).",
            "provided": "Empty file (0 bytes).",
            "action": f"Please select a valid copy of your {required_display} and upload it again.",
            "summary": f"File for {required_display} is empty or corrupted.",
            "is_acceptable": False,
            "detected_type": None,
            "required_type": norm_required,
            "confidence": 0.0,
            "character_count": 0,
            "extracted_fields": {}
        }

    file_size_bytes = len(file_bytes)
    file_size_mb = round(file_size_bytes / (1024 * 1024), 2)

    # 2. FILE SIZE VALIDATION (Part 8)
    if file_size_bytes > MAX_FILE_SIZE_BYTES:
        return {
            "status": "ERROR",
            "category": "FILE_SIZE",
            "what_is_wrong": "File Too Large",
            "why_is_wrong": f"Your file is {file_size_mb} MB, which exceeds the statutory portal upload limit.",
            "expected": "Maximum allowed size: 5 MB.",
            "provided": f"{file_size_mb} MB ({file_size_bytes:,} bytes).",
            "action": "Please compress the document or upload a copy smaller than 5 MB.",
            "summary": f"File for {required_display} is {file_size_mb} MB (exceeds 5 MB limit).",
            "is_acceptable": False,
            "detected_type": None,
            "required_type": norm_required,
            "confidence": 0.0,
            "character_count": 0,
            "extracted_fields": {}
        }

    # 3. FILE FORMAT / EXTENSION VALIDATION (Part 9)
    safe_filename = sanitize_filename(filename)
    extension = "." + safe_filename.split(".")[-1].lower() if "." in safe_filename else ""
    if extension not in ALLOWED_EXTENSIONS:
        return {
            "status": "ERROR",
            "category": "FILE_FORMAT",
            "what_is_wrong": "Unsupported File Format",
            "why_is_wrong": f"You uploaded a file with format '{extension.upper() or 'UNKNOWN'}'. The portal accepts only PDF and image formats.",
            "expected": "Allowed formats: PDF, JPG, JPEG, PNG.",
            "provided": f"'{extension.upper() or 'UNKNOWN'}' file format.",
            "action": "Please convert or export your document to PDF, JPG, or PNG and upload it again.",
            "summary": f"Uploaded format '{extension.upper() or 'UNKNOWN'}' is unsupported for {required_display}.",
            "is_acceptable": False,
            "detected_type": None,
            "required_type": norm_required,
            "confidence": 0.0,
            "character_count": 0,
            "extracted_fields": {}
        }

    # 4. FILE INTEGRITY & MAGIC BYTE VERIFICATION (Part 10)
    matched_mime = None
    for magic, mime in MAGIC_SIGNATURES:
        if file_bytes.startswith(magic):
            matched_mime = mime
            break

    if not matched_mime:
        return {
            "status": "ERROR",
            "category": "CORRUPTED_FILE",
            "what_is_wrong": "File Cannot Be Read",
            "why_is_wrong": "The uploaded file appears to be corrupted or does not match genuine PDF/image digital signatures.",
            "expected": "An uncorrupted, standard PDF or image document.",
            "provided": f"Corrupted or disguised binary file '{safe_filename}'.",
            "action": "Please select a clean, valid copy of the required document and upload it again.",
            "summary": f"File for {required_display} appears corrupted or unreadable.",
            "is_acceptable": False,
            "detected_type": None,
            "required_type": norm_required,
            "confidence": 0.0,
            "character_count": 0,
            "extracted_fields": {}
        }

    # 5. DOCUMENT QUALITY & OCR EXTRACTION (Part 7)
    is_pdf = matched_mime == "application/pdf" or extension == ".pdf"
    if is_pdf:
        extracted_text = extract_text_from_pdf(file_bytes)
    else:
        extracted_text = extract_text_from_image(file_bytes)

    char_count = len(extracted_text.strip())

    if char_count < 25:
        return {
            "status": "ERROR",
            "category": "DOCUMENT_QUALITY",
            "what_is_wrong": "Document Cannot Be Read Clearly",
            "why_is_wrong": "We could not reliably read the statutory text or seals in this document. The image appears blurry, too dark, cropped, or of very low resolution.",
            "expected": f"A clear, high-contrast, fully readable scan or photo of your {required_display}.",
            "provided": f"Illegible scan with only {char_count} characters detected.",
            "action": "Please upload a clear, complete scan or photograph of the required document.",
            "summary": f"{required_display} image is unclear.",
            "is_acceptable": False,
            "detected_type": None,
            "required_type": norm_required,
            "confidence": 0.0,
            "character_count": char_count,
            "extracted_fields": {}
        }

    # 6. DOCUMENT CLASSIFICATION & TYPE MISMATCH (Part 1)
    classification = classify_document_text(extracted_text, norm_required)
    detected_type = classification.get("detected_type")
    detected_display = get_doc_display_name(detected_type)
    confidence = classification.get("confidence", 0.0)

    if classification.get("match_status") == "TYPE_MISMATCH" and detected_type != norm_required:
        return {
            "status": "ERROR",
            "category": "DOCUMENT_TYPE_MISMATCH",
            "what_is_wrong": "Incorrect Document Uploaded",
            "why_is_wrong": f"This document has been identified as a {detected_display}, but this application requires {required_display}.",
            "expected": required_display,
            "provided": detected_display,
            "action": f"Please upload a valid {required_display}.",
            "summary": f"Incorrect document uploaded for {required_display}.",
            "is_acceptable": False,
            "detected_type": detected_type,
            "required_type": norm_required,
            "confidence": confidence,
            "character_count": char_count,
            "extracted_fields": extract_non_sensitive_fields(extracted_text, norm_required),
            "matched_keywords": classification.get("matched_keywords", [])
        }

    # Extract all candidate administrative metadata fields
    # Extract all candidate administrative metadata fields
    extracted_fields = extract_non_sensitive_fields(extracted_text, norm_required)
    extracted_name = extract_person_name(extracted_text)
    extracted_dob_date, extracted_dob_str = extract_dob_from_text(extracted_text)
    validity_details = extract_validity_details(extracted_text)
    parsed_validity_date = validity_details.get("valid_until")
    validity_str = parsed_validity_date.strftime("%d/%m/%Y") if parsed_validity_date else None
    has_validity_clause = validity_details.get("has_validity_clause", False)

    if extracted_name:
        extracted_fields["applicant_name"] = extracted_name
    if extracted_dob_str:
        extracted_fields["date_of_birth"] = extracted_dob_str
    if validity_str:
        extracted_fields["validity_date"] = validity_details.get("valid_until_str") or validity_str
    if validity_details.get("valid_from_str"):
        extracted_fields["valid_from"] = validity_details.get("valid_from_str")
    if validity_details.get("valid_until_str"):
        extracted_fields["valid_until"] = validity_details.get("valid_until_str")
    if validity_details.get("financial_year"):
        extracted_fields["financial_year"] = validity_details.get("financial_year")

    # 7. DOCUMENT EXPIRY / VALIDITY VALIDATION (Part 2)
    # Applied when document type is Income Certificate or validity is detected
    validity_status = "VALIDITY_NOT_FOUND"
    if parsed_validity_date is not None:
        if parsed_validity_date < current_reference_date:
            validity_status = "EXPIRED"
        else:
            validity_status = "VALID"
    elif has_validity_clause:
        validity_status = "VALIDITY_DATE_UNREADABLE"

    # Build structured verification result (Requirement 9)
    validity_verification = {
        "document_type": norm_required,
        "validity_status": validity_status,
        "valid_from": validity_details.get("valid_from_str"),
        "valid_until": validity_details.get("valid_until_str"),
        "reference_date": current_reference_date.strftime("%Y-%m-%d"),
        "validity_source": validity_details.get("validity_source"),
        "reason": validity_details.get("reason") or (
            f"Income Certificate is valid until {validity_str}." if validity_status == "VALID" else (
                f"Income Certificate expired on {validity_str}." if validity_status == "EXPIRED" else "Validity date could not be verified."
            )
        )
    }
    extracted_fields["validity_details"] = validity_verification

    # SAFE DEVELOPMENT-ONLY diagnostic logging (Requirement 2)
    if norm_required == DocumentType.INCOME_CERTIFICATE.value or has_validity_clause:
        relevant_lines = [
            line.strip() for line in extracted_text.splitlines()
            if any(k in line.lower() for k in [
                "valid", "expiry", "expire", "financial year", "fy", "period", "issue date", "income"
            ])
        ]
        safe_fields = {
            k: v for k, v in extracted_fields.items()
            if k not in ("aadhaar_number", "account_number")
        }
        logger.info(
            "[VALIDITY_DIAGNOSTIC] doc_type=%s | text_length=%d | relevant_lines=%s | "
            "extracted_fields=%s | normalized_dates=%s | final_expiry=%s | decision=%s",
            norm_required,
            char_count,
            relevant_lines,
            safe_fields,
            {"valid_from": validity_details.get("valid_from_str"), "valid_until": validity_details.get("valid_until_str")},
            validity_details.get("valid_until_str"),
            validity_status
        )

    if norm_required == DocumentType.INCOME_CERTIFICATE.value or parsed_validity_date is not None:
        if parsed_validity_date is not None:
            if parsed_validity_date < current_reference_date:
                return {
                    "status": "ERROR",
                    "category": "DOCUMENT_EXPIRED",
                    "what_is_wrong": "Document Expired",
                    "why_is_wrong": f"Your uploaded {required_display} appears to have expired on {validity_str} (current reference date is {current_reference_date.strftime('%d/%m/%Y')}).",
                    "expected": f"A current and valid {required_display} for the active academic year.",
                    "provided": f"Expired document (Validity: {validity_str}).",
                    "action": f"Please upload a current and valid {required_display}.",
                    "summary": f"{required_display} appears to have expired.",
                    "is_acceptable": False,
                    "detected_type": detected_type or norm_required,
                    "required_type": norm_required,
                    "confidence": confidence,
                    "character_count": char_count,
                    "extracted_fields": extracted_fields,
                    "validity_verification": validity_verification
                }
        elif has_validity_clause and norm_required == DocumentType.INCOME_CERTIFICATE.value:
            # Validity clause is present but date couldn't be parsed with sufficient confidence
            # Do NOT falsely claim expired! (Part 2 rule - route to manual review)
            return {
                "status": "WARNING",
                "category": "UNABLE_TO_VERIFY_VALIDITY",
                "what_is_wrong": "Unable to Verify Document Validity",
                "why_is_wrong": "The validity information could not be read clearly from this document.",
                "expected": f"A clearly legible validity date on the {required_display}.",
                "provided": "Validity clause detected, but expiry date is obscured or unreadable.",
                "action": "Please upload a clearer copy or continue to authorized officer verification.",
                "summary": f"Unable to verify validity for {required_display}.",
                "is_acceptable": True,  # Allow manual review routing
                "detected_type": detected_type or norm_required,
                "required_type": norm_required,
                "confidence": confidence,
                "character_count": char_count,
                "extracted_fields": extracted_fields,
                "validity_verification": validity_verification
            }
        elif norm_required == DocumentType.INCOME_CERTIFICATE.value and not has_validity_clause:
            # No validity information detected on Income Certificate
            return {
                "status": "WARNING",
                "category": "VALIDITY_NOT_FOUND",
                "what_is_wrong": "Validity Information Not Found",
                "why_is_wrong": "No validity period, expiry date, or financial year was detected on this Income Certificate.",
                "expected": f"A clearly legible validity period or financial year on the {required_display}.",
                "provided": "Document without identifiable validity period.",
                "action": "Please upload a certificate that displays its validity period or financial year, or continue to manual verification.",
                "summary": f"Validity information not found on {required_display}.",
                "is_acceptable": True,  # Flagged for review, NOT hard-rejected
                "detected_type": detected_type or norm_required,
                "required_type": norm_required,
                "confidence": confidence,
                "character_count": char_count,
                "extracted_fields": extracted_fields,
                "validity_verification": validity_verification
            }

    # 8. APPLICANT NAME MISMATCH (Part 3)
    if applicant_name and extracted_name:
        if not names_match(applicant_name, extracted_name):
            return {
                "status": "WARNING",
                "category": "NAME_MISMATCH",
                "what_is_wrong": "Applicant Details Do Not Match",
                "why_is_wrong": "The name found on the uploaded certificate does not match the name entered in your application.",
                "expected": f"Application Name: {applicant_name}",
                "provided": f"Document Name: {extracted_name}",
                "action": "Please verify your application details or upload the correct document belonging to the applicant.",
                "summary": f"Name mismatch on {required_display}.",
                "is_acceptable": True, # Flagged for review, NOT hard-rejected
                "detected_type": detected_type or norm_required,
                "required_type": norm_required,
                "confidence": confidence,
                "character_count": char_count,
                "extracted_fields": extracted_fields
            }

    # 9. DATE OF BIRTH MISMATCH (Part 4)
    if applicant_dob and extracted_dob_str:
        parsed_app_dob = parse_date_string(applicant_dob)
        if parsed_app_dob and extracted_dob_date and parsed_app_dob != extracted_dob_date:
            return {
                "status": "WARNING",
                "category": "DOB_MISMATCH",
                "what_is_wrong": "Date of Birth Mismatch",
                "why_is_wrong": "The date of birth on the uploaded document does not match the date of birth provided in your application.",
                "expected": f"Application DOB: {applicant_dob}",
                "provided": f"Document DOB: {extracted_dob_str}",
                "action": "Please verify your date of birth in your personal details or upload the correct document if required.",
                "summary": f"Date of birth mismatch on {required_display}.",
                "is_acceptable": True, # Flagged for review
                "detected_type": detected_type or norm_required,
                "required_type": norm_required,
                "confidence": confidence,
                "character_count": char_count,
                "extracted_fields": extracted_fields
            }

    # 10. IDENTIFICATION / AADHAAR MISMATCH (Part 5)
    extracted_aadhaar = extracted_fields.get("aadhaar_number")
    if not extracted_aadhaar:
        aadhaar_match = re.search(r"\b\d{4}\s?\d{4}\s?\d{4}\b", extracted_text)
        if aadhaar_match:
            raw_id = re.sub(r"\D", "", aadhaar_match.group(0))
            if len(raw_id) == 12:
                extracted_aadhaar = raw_id
                extracted_fields["aadhaar_number"] = mask_identifier(raw_id)

    if applicant_aadhaar and extracted_aadhaar:
        clean_app = re.sub(r"\D", "", str(applicant_aadhaar))
        clean_ext = re.sub(r"\D", "", str(extracted_aadhaar))
        if len(clean_app) == 12 and len(clean_ext) == 12 and clean_app != clean_ext:
            masked_app = mask_identifier(clean_app)
            masked_ext = mask_identifier(clean_ext)
            return {
                "status": "WARNING",
                "category": "ID_MISMATCH",
                "what_is_wrong": "Identification Details Do Not Match",
                "why_is_wrong": "The identification information found in this document does not match the information provided in your application.",
                "reason": "The identification information found in this document does not match the information provided in your application.",
                "expected": f"Aadhaar Number: {masked_app}",
                "provided": f"Document ID: {masked_ext}",
                "required": masked_app,
                "detected": masked_ext,
                "action": "Please verify the entered information and upload the correct document if necessary.",
                "summary": f"Identification details mismatch on {required_display}.",
                "is_acceptable": True,
                "detected_type": detected_type or norm_required,
                "required_type": norm_required,
                "confidence": confidence,
                "character_count": char_count,
                "extracted_fields": extracted_fields
            }

    # 11. SUCCESSFUL VALIDATION (Part 18 & Part 20)
    return {
        "status": "VALID",
        "category": "DOCUMENT_VALIDATED",
        "what_is_wrong": "",
        "why_is_wrong": "",
        "expected": required_display,
        "provided": f"Verified {required_display}",
        "action": f"✓ Correct {required_display} uploaded. You may proceed.",
        "summary": f"✓ {required_display} is valid.",
        "is_acceptable": True,
        "detected_type": detected_type or norm_required,
        "required_type": norm_required,
        "confidence": confidence,
        "character_count": char_count,
        "extracted_fields": extracted_fields,
        "validity_verification": extracted_fields.get("validity_details"),
        "matched_keywords": classification.get("matched_keywords", [])
    }

# ==============================================================================
# FIELD-LEVEL EXPLAINABLE VALIDATION (Parts 11, 12, 13)
# ==============================================================================

def validate_phone_explainable(raw_phone: str, is_registered_check: bool = False) -> Optional[Dict[str, Any]]:
    """Validate Indian mobile number with 5-point explainable error if invalid."""
    val = str(raw_phone or "").strip()
    if not val:
        return {
            "status": "ERROR",
            "category": "PHONE_REQUIRED",
            "code": "PHONE_REQUIRED",
            "field_id": "phone",
            "what_is_wrong": "Phone Number Required",
            "why_is_wrong": "A mobile number is required to create an account.",
            "expected": "10-digit Indian mobile number",
            "provided": "Empty",
            "action": "Enter your 10-digit mobile number.",
            "summary": "Phone number is required."
        }

    # Check for non-digit characters (letters, spaces, special chars, dashes)
    if not val.isdigit():
        return {
            "status": "ERROR",
            "category": "PHONE_INVALID_FORMAT",
            "code": "PHONE_INVALID_FORMAT",
            "field_id": "phone",
            "what_is_wrong": "Invalid Phone Number",
            "why_is_wrong": "The mobile number can contain digits only.",
            "expected": "Exactly 10 numeric digits",
            "provided": "A value containing letters or unsupported characters.",
            "action": "Enter exactly 10 numeric digits.",
            "summary": "The mobile number can contain digits only."
        }

    # Check length
    if len(val) != 10:
        return {
            "status": "ERROR",
            "category": "PHONE_INVALID_LENGTH",
            "code": "PHONE_INVALID_LENGTH",
            "field_id": "phone",
            "what_is_wrong": "Invalid Phone Number",
            "why_is_wrong": "A mobile number must contain exactly 10 digits.",
            "expected": "10-digit mobile number",
            "provided": f"{len(val)} digits",
            "action": "Enter a valid 10-digit mobile number.",
            "summary": "Phone number must contain exactly 10 digits."
        }

    # Only when format is 100% valid, perform duplicate check if requested
    if is_registered_check:
        masked = f"{val[:2]}******{val[-2:]}"
        return {
            "status": "ERROR",
            "category": "PHONE_DUPLICATE",
            "code": "PHONE_DUPLICATE",
            "field_id": "phone",
            "what_is_wrong": "Phone Number Already Registered",
            "why_is_wrong": "This phone number is already associated with an existing account.",
            "expected": "An unregistered phone number or login to your existing account.",
            "provided": masked,
            "action": "Please use another phone number or log in to the existing account.",
            "summary": "This phone number is already registered."
        }

    return None

def validate_email_explainable(raw_email: str, is_registered_check: bool = False) -> Optional[Dict[str, Any]]:
    """Validate email address format and duplicates with 5-point explainable error."""
    if not raw_email or not str(raw_email).strip():
        return {
            "status": "ERROR",
            "category": "FIELD_REQUIRED",
            "field_id": "email",
            "what_is_wrong": "Email Address Required",
            "why_is_wrong": "A valid email address is mandatory for receiving application tracking updates and official communications.",
            "expected": "Valid email address (e.g., student@example.com)",
            "provided": "Empty",
            "action": "Please enter your registered email address.",
            "summary": "Email address is required."
        }

    cleaned = raw_email.strip().lower()
    email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    if not re.match(email_regex, cleaned) or cleaned.endswith("@") or "." not in cleaned.split("@")[-1] or len(cleaned.split(".")[-1]) < 2:
        return {
            "status": "ERROR",
            "category": "EMAIL_FORMAT",
            "field_id": "email",
            "what_is_wrong": "Invalid Email Address",
            "why_is_wrong": "The entered email address is missing a complete domain name or top-level extension.",
            "expected": "A complete email address such as: example@gmail.com",
            "provided": cleaned,
            "action": "Please enter a valid email address such as: example@gmail.com",
            "summary": "Please enter a valid email address such as: example@gmail.com"
        }

    if is_registered_check:
        return {
            "status": "ERROR",
            "category": "EMAIL_DUPLICATE",
            "field_id": "email",
            "what_is_wrong": "Email Already Registered",
            "why_is_wrong": "An account with this email address already exists.",
            "expected": "An unregistered email address or login to your existing account.",
            "provided": cleaned,
            "action": "Please log in using this email or use another email address.",
            "summary": "An account with this email address already exists."
        }

    return None

def validate_required_field_explainable(field_id: str, label: str, value: Any, action_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Generic 5-point explainable validator for any mandatory field."""
    is_empty = False
    if value is None:
        is_empty = True
    elif isinstance(value, str) and not value.strip():
        is_empty = True
    elif isinstance(value, (int, float)) and value == "":
        is_empty = True

    if is_empty:
        return {
            "status": "ERROR",
            "category": "FIELD_REQUIRED",
            "field_id": field_id,
            "what_is_wrong": f"{label} Required",
            "why_is_wrong": f"This statutory application requires you to enter your {label.lower()} before proceeding.",
            "reason": f"This statutory application requires you to enter your {label.lower()} before proceeding.",
            "expected": f"Valid {label}",
            "provided": "Empty",
            "action": action_hint or f"Please enter your {label.lower()}.",
            "summary": f"Please enter your {label.lower()}."
        }
    return None

def validate_missing_document_explainable(required_doc_code: str, required_doc_name: Optional[str] = None) -> Dict[str, Any]:
    """Part 6: Explainable error when a scheme-mandatory document is missing."""
    norm = normalize_document_type(required_doc_code)
    display = required_doc_name or get_doc_display_name(norm)
    return {
        "status": "ERROR",
        "category": "MISSING_DOCUMENT",
        "field_id": norm,
        "what_is_wrong": "Required Document Missing",
        "why_is_wrong": f"This application requires an {display}.",
        "reason": f"This application requires an {display}.",
        "expected": display,
        "provided": "No document uploaded",
        "required": display,
        "detected": "Missing",
        "action": f"Please upload: {display}",
        "is_acceptable": False,
        "required_type": norm
    }

def validate_application_dossier(
    scheme_required_documents: List[Dict[str, Any]],
    personal_details: Dict[str, Any],
    academic_details: Optional[Dict[str, Any]] = None,
    financial_details: Optional[Dict[str, Any]] = None,
    bank_details: Optional[Dict[str, Any]] = None,
    uploaded_documents: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Validate the complete applicant dossier across all fields and scheme-required documents (Part 16 & Part 22).
    Returns structured list of explainable issues and an overall summary.
    """
    issues: List[Dict[str, Any]] = []

    # 1. Phone validation (Part 11)
    phone_val = personal_details.get("phone") or personal_details.get("mobile")
    phone_issue = validate_phone_explainable(phone_val)
    if phone_issue:
        phone_issue["step"] = 1
        phone_issue["summary"] = phone_issue["why_is_wrong"]
        issues.append(phone_issue)

    # 2. Email validation (Part 12)
    email_val = personal_details.get("email")
    email_issue = validate_email_explainable(email_val)
    if email_issue:
        email_issue["step"] = 1
        email_issue["summary"] = email_issue["why_is_wrong"]
        issues.append(email_issue)

    # 3. Required personal fields (Part 13 & 14)
    req_fields = [
        ("fullName", "Full Name", personal_details.get("fullName") or personal_details.get("full_name"), 1),
        ("dob", "Date of Birth", personal_details.get("dob"), 1),
        ("category", "Beneficiary Category", personal_details.get("category"), 1),
        ("state", "State", personal_details.get("state"), 1),
        ("district", "District", personal_details.get("district"), 1),
        ("pincode", "PIN Code", personal_details.get("pincode"), 1),
    ]
    for fid, flabel, fval, fstep in req_fields:
        req_issue = validate_required_field_explainable(fid, flabel, fval)
        if req_issue:
            req_issue["step"] = fstep
            req_issue["summary"] = req_issue["what_is_wrong"]
            issues.append(req_issue)

    # 4. Bank details
    if bank_details:
        for bfid, blabel, bval in [
            ("accountNumber", "Bank Account Number", bank_details.get("accountNumber") or bank_details.get("account_number")),
            ("ifscCode", "Bank IFSC Code", bank_details.get("ifscCode") or bank_details.get("ifsc_code"))
        ]:
            b_issue = validate_required_field_explainable(bfid, blabel, bval)
            if b_issue:
                b_issue["step"] = 4
                b_issue["summary"] = b_issue["what_is_wrong"]
                issues.append(b_issue)

    # 5. Scheme required documents (Part 6 & Part 22)
    uploaded_map = {}
    for doc in (uploaded_documents or []):
        dcode = normalize_document_type(doc.get("document_code") or doc.get("document_type"))
        uploaded_map[dcode] = doc

    for req_doc in scheme_required_documents:
        if req_doc.get("required", True):
            code = normalize_document_type(req_doc.get("code") or req_doc.get("id"))
            name = req_doc.get("name") or get_doc_display_name(code)
            if code not in uploaded_map:
                missing_issue = validate_missing_document_explainable(code, name)
                missing_issue["step"] = 5
                missing_issue["summary"] = f"Missing required document: {missing_issue['expected']}"
                issues.append(missing_issue)
            else:
                up_doc = uploaded_map[code]
                v_stat = up_doc.get("verification_status") or up_doc.get("status")
                if v_stat == "TYPE_MISMATCH":
                    issues.append({
                        "status": "ERROR",
                        "category": "DOCUMENT_TYPE_MISMATCH",
                        "field_id": code,
                        "step": 5,
                        "summary": f"Incorrect document uploaded for {name}.",
                        "what_is_wrong": "Incorrect Document Uploaded",
                        "why_is_wrong": f"The uploaded file does not match the required {name}.",
                        "reason": f"The uploaded file does not match the required {name}.",
                        "expected": name,
                        "provided": up_doc.get("detected_type") or "Incorrect Document",
                        "required": name,
                        "detected": up_doc.get("detected_type") or "Incorrect Document",
                        "action": f"Please upload a valid {name}."
                    })
                elif v_stat in ("LOW_QUALITY", "DOCUMENT_QUALITY"):
                    issues.append({
                        "status": "ERROR",
                        "category": "DOCUMENT_QUALITY",
                        "field_id": code,
                        "step": 5,
                        "summary": f"{name} scan is unclear.",
                        "what_is_wrong": "Document Cannot Be Read Clearly",
                        "why_is_wrong": "We could not reliably read the statutory text in this scan.",
                        "reason": "We could not reliably read the statutory text in this scan.",
                        "expected": f"A clear, legible scan of {name}.",
                        "provided": "Blurry or low resolution image",
                        "required": f"Clear {name}",
                        "detected": "Unclear scan",
                        "action": "Please upload a clear, complete scan or photograph of the required document."
                    })
                elif v_stat == "DOCUMENT_EXPIRED":
                    issues.append({
                        "status": "ERROR",
                        "category": "DOCUMENT_EXPIRED",
                        "field_id": code,
                        "step": 5,
                        "summary": f"{name} appears to have expired.",
                        "what_is_wrong": "Document Expired",
                        "why_is_wrong": f"Your uploaded {name} appears to have expired.",
                        "reason": f"Your uploaded {name} appears to have expired.",
                        "expected": f"A current and valid {name}.",
                        "provided": "Expired document",
                        "required": f"Current {name}",
                        "detected": "Expired document",
                        "action": f"Please upload a current and valid {name}."
                    })

    error_count = len([i for i in issues if i["status"] == "ERROR"])
    warning_count = len([i for i in issues if i["status"] == "WARNING"])

    summary_text = (
        f"{len(issues)} issue{'s' if len(issues) != 1 else ''} need{'s' if len(issues) == 1 else ''} your attention"
        if issues else "All fields and documents valid."
    )

    return {
        "is_valid": error_count == 0,
        "total_issues": len(issues),
        "error_count": error_count,
        "warning_count": warning_count,
        "summary_message": summary_text,
        "issues": issues
    }
