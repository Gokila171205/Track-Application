import sys
import os
import httpx
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.core.config import settings

BASE_URL = "http://127.0.0.1:8000/api"

def run_all_phone_validation_tests():
    print("=" * 80)
    print("RUNNING COMPLETE PHONE VALIDATION TEST SUITE (10 CASES)")
    print("=" * 80)

    client_db = MongoClient(settings.MONGO_URI)
    db = client_db[settings.MONGO_DB_NAME]

    # Setup baseline user in MongoDB for duplicate testing
    baseline_email = "baseline.phone.test@mota.gov.in"
    baseline_phone = "9876543210"

    print(f"Setting up baseline user: {baseline_email} / {baseline_phone} in tsfms.users...")
    db.users.delete_many({"$or": [{"email": baseline_email}, {"phone": baseline_phone}]})

    client = httpx.Client(timeout=15.0)

    # Register baseline user
    reg_base = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Baseline Scholar",
        "email": baseline_email,
        "phone": baseline_phone,
        "password": "Password@123",
        "role": "APPLICANT"
    })
    assert reg_base.status_code == 201, f"Failed setting up baseline user: {reg_base.text}"
    print(f"  [SETUP] Baseline user registered with phone: {baseline_phone}\n")

    # --------------------------------------------------------------------------
    # TEST 1: Empty Phone Number
    # --------------------------------------------------------------------------
    print("[TEST 1] Empty Phone Number")
    res1 = client.post(f"{BASE_URL}/auth/check-availability", json={"phone": ""})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["available"] is False
    assert data1["issue"]["category"] in ("PHONE_REQUIRED", "FIELD_REQUIRED")
    assert data1["issue"]["code"] == "PHONE_REQUIRED"
    assert "Phone Number Required" in data1["issue"]["what_is_wrong"]
    assert "Already Registered" not in data1["issue"]["what_is_wrong"]

    # Also test registration route directly with empty phone
    reg1 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Test User",
        "email": "test.empty.phone@example.com",
        "phone": "",
        "password": "Password@123"
    })
    assert reg1.status_code == 400
    detail1 = reg1.json()["detail"]
    assert detail1.get("code") == "PHONE_REQUIRED"
    print("  [OK] TEST 1: Empty -> PHONE_REQUIRED ('Phone Number Required', not 'Already Registered')\n")

    # --------------------------------------------------------------------------
    # TEST 2: 9 Digits (123456789)
    # --------------------------------------------------------------------------
    print("[TEST 2] 9 Digits: '123456789'")
    res2 = client.post(f"{BASE_URL}/auth/check-availability", json={"phone": "123456789"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["available"] is False
    assert data2["issue"]["category"] in ("PHONE_INVALID_LENGTH", "PHONE_FORMAT")
    assert data2["issue"]["code"] == "PHONE_INVALID_LENGTH"
    assert data2["issue"]["what_is_wrong"] == "Invalid Phone Number"
    assert "9 digits" in data2["issue"]["provided"]
    assert "Already Registered" not in data2["issue"]["what_is_wrong"]

    reg2 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Test User",
        "email": "test.short.phone@example.com",
        "phone": "123456789",
        "password": "Password@123"
    })
    assert reg2.status_code == 400
    detail2 = reg2.json()["detail"]
    assert detail2.get("code") == "PHONE_INVALID_LENGTH"
    print("  [OK] TEST 2: 9 digits -> PHONE_INVALID_LENGTH ('Invalid Phone Number', not 'Already Registered')\n")

    # --------------------------------------------------------------------------
    # TEST 3: 11 Digits (12345678901)
    # --------------------------------------------------------------------------
    print("[TEST 3] 11 Digits: '12345678901'")
    res3 = client.post(f"{BASE_URL}/auth/check-availability", json={"phone": "12345678901"})
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["available"] is False
    assert data3["issue"]["category"] in ("PHONE_INVALID_LENGTH", "PHONE_FORMAT")
    assert data3["issue"]["code"] == "PHONE_INVALID_LENGTH"
    assert data3["issue"]["what_is_wrong"] == "Invalid Phone Number"
    assert "11 digits" in data3["issue"]["provided"]
    assert "Already Registered" not in data3["issue"]["what_is_wrong"]

    reg3 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Test User",
        "email": "test.long.phone@example.com",
        "phone": "12345678901",
        "password": "Password@123"
    })
    assert reg3.status_code == 400
    detail3 = reg3.json()["detail"]
    assert detail3.get("code") == "PHONE_INVALID_LENGTH"
    print("  [OK] TEST 3: 11 digits -> PHONE_INVALID_LENGTH ('Invalid Phone Number', not 'Already Registered')\n")

    # --------------------------------------------------------------------------
    # TEST 4: Non-digit characters: 98765abc10
    # --------------------------------------------------------------------------
    print("[TEST 4] Letters/Alphanumeric: '98765abc10'")
    res4 = client.post(f"{BASE_URL}/auth/check-availability", json={"phone": "98765abc10"})
    assert res4.status_code == 200
    data4 = res4.json()
    assert data4["available"] is False
    assert data4["issue"]["category"] == "PHONE_INVALID_FORMAT"
    assert data4["issue"]["code"] == "PHONE_INVALID_FORMAT"
    assert data4["issue"]["what_is_wrong"] == "Invalid Phone Number"
    assert "digits only" in data4["issue"]["why_is_wrong"]
    assert "Already Registered" not in data4["issue"]["what_is_wrong"]

    reg4 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Test User",
        "email": "test.letters.phone@example.com",
        "phone": "98765abc10",
        "password": "Password@123"
    })
    assert reg4.status_code == 400
    detail4 = reg4.json()["detail"]
    assert detail4.get("code") == "PHONE_INVALID_FORMAT"
    print("  [OK] TEST 4: Letters -> PHONE_INVALID_FORMAT ('digits only', not 'Already Registered')\n")

    # --------------------------------------------------------------------------
    # TEST 5: Special characters/hyphens: 98765-3210
    # --------------------------------------------------------------------------
    print("[TEST 5] Special Characters: '98765-3210'")
    res5 = client.post(f"{BASE_URL}/auth/check-availability", json={"phone": "98765-3210"})
    assert res5.status_code == 200
    data5 = res5.json()
    assert data5["available"] is False
    assert data5["issue"]["category"] == "PHONE_INVALID_FORMAT"
    assert data5["issue"]["code"] == "PHONE_INVALID_FORMAT"
    assert "digits only" in data5["issue"]["why_is_wrong"]
    assert "Already Registered" not in data5["issue"]["what_is_wrong"]

    reg5 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Test User",
        "email": "test.hyphen.phone@example.com",
        "phone": "98765-3210",
        "password": "Password@123"
    })
    assert reg5.status_code == 400
    detail5 = reg5.json()["detail"]
    assert detail5.get("code") == "PHONE_INVALID_FORMAT"
    print("  [OK] TEST 5: Hyphen -> PHONE_INVALID_FORMAT ('digits only', not 'Already Registered')\n")

    # --------------------------------------------------------------------------
    # TEST 6: Valid New Number (9845112233)
    # --------------------------------------------------------------------------
    new_valid_phone = "9845112233"
    print(f"[TEST 6] New Valid Number: '{new_valid_phone}'")
    db.users.delete_many({"phone": new_valid_phone})
    res6 = client.post(f"{BASE_URL}/auth/check-availability", json={"phone": new_valid_phone})
    assert res6.status_code == 200
    data6 = res6.json()
    assert data6["available"] is True
    assert data6["issue"] is None
    print(f"  [OK] TEST 6: Valid new number -> Available: True, issue: None\n")

    # --------------------------------------------------------------------------
    # TEST 7: Valid Existing Number (9876543210)
    # --------------------------------------------------------------------------
    print(f"[TEST 7] Existing Number: '{baseline_phone}'")
    res7 = client.post(f"{BASE_URL}/auth/check-availability", json={"phone": baseline_phone})
    assert res7.status_code == 200
    data7 = res7.json()
    assert data7["available"] is False
    assert data7["issue"]["category"] == "PHONE_DUPLICATE"
    assert data7["issue"]["code"] == "PHONE_DUPLICATE"
    assert data7["issue"]["what_is_wrong"] == "Phone Number Already Registered"
    assert "98******10" in data7["issue"]["provided"]  # Masked!
    print(f"  [OK] TEST 7: Existing number -> PHONE_DUPLICATE with masked '{data7['issue']['provided']}'\n")

    # --------------------------------------------------------------------------
    # TEST 8: Existing email + New valid phone -> EMAIL_DUPLICATE ONLY
    # --------------------------------------------------------------------------
    print(f"[TEST 8] Existing Email ({baseline_email}) + New Phone ({new_valid_phone})")
    reg8 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Duplicate Email Tester",
        "email": baseline_email,
        "phone": new_valid_phone,
        "password": "Password@123"
    })
    assert reg8.status_code == 409
    detail8 = reg8.json()["detail"]
    assert detail8.get("code") == "EMAIL_DUPLICATE"
    assert detail8.get("field") == "email"
    assert "phone" not in detail8.get("message", "").lower()
    print("  [OK] TEST 8: Existing email + new phone -> EMAIL_DUPLICATE only (HTTP 409)\n")

    # --------------------------------------------------------------------------
    # TEST 9: New email + Existing phone -> PHONE_DUPLICATE ONLY
    # --------------------------------------------------------------------------
    fresh_email = "fresh.scholar.test9@mota.res.in"
    print(f"[TEST 9] New Email ({fresh_email}) + Existing Phone ({baseline_phone})")
    db.users.delete_many({"email": fresh_email})
    reg9 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Duplicate Phone Tester",
        "email": fresh_email,
        "phone": baseline_phone,
        "password": "Password@123"
    })
    assert reg9.status_code == 409
    detail9 = reg9.json()["detail"]
    assert detail9.get("code") == "PHONE_DUPLICATE"
    assert detail9.get("field") == "phone"
    assert "This phone number is already registered" in detail9.get("message", "")
    print("  [OK] TEST 9: New email + existing phone -> PHONE_DUPLICATE only (HTTP 409)\n")

    # --------------------------------------------------------------------------
    # TEST 10: Both Email and Phone already exist
    # --------------------------------------------------------------------------
    print(f"[TEST 10] Both Email and Phone already exist ({baseline_email} + {baseline_phone})")
    reg10 = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Both Duplicate Tester",
        "email": baseline_email,
        "phone": baseline_phone,
        "password": "Password@123"
    })
    assert reg10.status_code == 409
    detail10 = reg10.json()["detail"]
    assert detail10.get("code") == "BOTH_DUPLICATE"
    assert len(detail10.get("errors", [])) == 2
    error_codes = [e["code"] for e in detail10["errors"]]
    assert "EMAIL_DUPLICATE" in error_codes
    assert "PHONE_DUPLICATE" in error_codes
    print(f"  [OK] TEST 10: Both duplicates -> BOTH_DUPLICATE containing both error records\n")

    # --------------------------------------------------------------------------
    # BONUS: Existing User Login Verification
    # --------------------------------------------------------------------------
    print("[LOGIN CHECK] Verifying existing user authentication is preserved...")
    login_resp = client.post(f"{BASE_URL}/auth/login", json={
        "email": baseline_email,
        "password": "Password@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token_data = login_resp.json()
    assert "access_token" in token_data
    assert token_data["user"]["phone"] == baseline_phone
    print(f"  [OK] Existing authentication confirmed intact! User logged in successfully.\n")

    print("=" * 80)
    print("ALL 10 PHONE VALIDATION TEST CASES VERIFIED WITH 100% SUCCESS!")
    print("=" * 80)

if __name__ == "__main__":
    run_all_phone_validation_tests()
