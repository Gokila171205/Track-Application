import re
import hashlib
from typing import Tuple
from fastapi import HTTPException, status

# ==============================================================================
# Verhoeff Checksum Algorithm Implementation for 12-digit UIDAI Aadhaar Validation
# ==============================================================================

# Multiplication table (d)
_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
]

# Permutation table (p)
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
]

# Inverse table (inv)
_VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]

def verhoeff_checksum_validate(number_str: str) -> bool:
    """
    Validates a number string using the Verhoeff checksum algorithm.
    Valid Aadhaar numbers always evaluate to checksum c == 0.
    """
    c = 0
    # Process digits in reverse order
    for i, ch in enumerate(reversed(number_str)):
        if not ch.isdigit():
            return False
        digit = int(ch)
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][digit]]
    return c == 0

def generate_verhoeff_check_digit(eleven_digit_str: str) -> int:
    """
    Computes the 12th Verhoeff checksum digit for any valid 11-digit base.
    Used for verifying or constructing valid test Aadhaar numbers.
    """
    c = 0
    for i, ch in enumerate(reversed(eleven_digit_str)):
        digit = int(ch)
        c = _VERHOEFF_D[c][_VERHOEFF_P[(i + 1) % 8][digit]]
    return _VERHOEFF_INV[c]

def normalize_aadhaar(raw_aadhaar: str) -> str:
    """
    Remove spaces, hyphens, and whitespace.
    """
    if not raw_aadhaar:
        return ""
    return re.sub(r"[\s\-_]", "", str(raw_aadhaar).strip())

def mask_aadhaar(normalized_aadhaar: str) -> str:
    """
    Converts 12-digit Aadhaar to safe masked representation:
    XXXX-XXXX-1234
    """
    if len(normalized_aadhaar) == 12:
        return f"XXXX-XXXX-{normalized_aadhaar[-4:]}"
    elif len(normalized_aadhaar) > 4:
        return f"XXXX-XXXX-{normalized_aadhaar[-4:]}"
    return "XXXX-XXXX-XXXX"

def hash_aadhaar(normalized_aadhaar: str) -> str:
    """
    Computes a cryptographic SHA-256 hash for database uniqueness assertions.
    Ensures raw Aadhaar numbers are never indexed or searchable in plaintext.
    """
    return hashlib.sha256(f"mota_aadhaar_salt_{normalized_aadhaar}".encode("utf-8")).hexdigest()

def validate_aadhaar(raw_aadhaar: str) -> Tuple[str, str, str]:
    """
    Comprehensive statutory Aadhaar validation:
    1. Check exactly 12 digits
    2. Check no non-numeric characters
    3. Check cannot start with 0 or 1 (UIDAI specifications)
    4. Check cannot be repeating digits (e.g. 000000000000, 222222222222)
    5. Check Verhoeff checksum algorithm

    Returns:
        (normalized_12_digits, masked_aadhaar, aadhaar_hash)
    """
    cleaned = normalize_aadhaar(raw_aadhaar)

    # 1 & 2. Format and length
    if not cleaned.isdigit() or len(cleaned) != 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Aadhaar format: Must be exactly 12 numeric digits."
        )

    # 3. UIDAI rule: Aadhaar numbers never begin with 0 or 1
    if cleaned[0] in ("0", "1"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Aadhaar number: Aadhaar numbers cannot begin with 0 or 1."
        )

    # 4. Check for repeating identical digits
    if len(set(cleaned)) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Aadhaar number: Trivial repeating sequences are not permitted."
        )

    # 5. Verhoeff checksum
    if not verhoeff_checksum_validate(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aadhaar checksum validation failed: The entered number fails statutory Verhoeff authenticity check."
        )

    masked = mask_aadhaar(cleaned)
    hashed = hash_aadhaar(cleaned)
    return cleaned, masked, hashed

def normalize_phone(raw_phone: str) -> str:
    """
    Normalize Indian phone numbers by stripping country code (+91, 0) and non-digits.
    """
    if not raw_phone:
        return ""
    digits = re.sub(r"\D", "", str(raw_phone).strip())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits

def validate_phone(raw_phone: str) -> str:
    """
    Validate Indian mobile number with structured explainable codes:
    - Empty -> PHONE_REQUIRED
    - Non-digits -> PHONE_INVALID_FORMAT
    - Length != 10 -> PHONE_INVALID_LENGTH
    """
    val = str(raw_phone or "").strip()
    if not val:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "field": "phone",
                "code": "PHONE_REQUIRED",
                "message": "Phone number is required."
            }
        )

    # Check for non-digit characters (letters, spaces, special chars, dashes)
    if not val.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "field": "phone",
                "code": "PHONE_INVALID_FORMAT",
                "message": "The mobile number can contain digits only."
            }
        )

    # Check exact 10 digits
    if len(val) != 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "field": "phone",
                "code": "PHONE_INVALID_LENGTH",
                "message": f"Phone number must contain exactly 10 digits. Provided: {len(val)} digits."
            }
        )

    return val
