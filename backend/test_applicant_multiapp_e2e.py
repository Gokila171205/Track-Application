import sys
import os
import asyncio
import time
from datetime import datetime, timezone
import httpx
from pymongo import MongoClient

# Ensure app can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.services.identity_validator import generate_verhoeff_check_digit
from app.core.config import settings

BASE_URL = "http://127.0.0.1:8000/api"

def make_valid_aadhaar(seed: int) -> str:
    base = f"28{seed:09d}"[:11]
    check = generate_verhoeff_check_digit(base)
    return f"{base}{check}"

def run_test():
    print("=" * 70)
    print("RUNNING END-TO-END MULTI-APPLICATION ARCHITECTURE TEST")
    print("ONE APPLICANT PROFILE + MULTIPLE SCHOLARSHIP APPLICATIONS")
    print("=" * 70)

    ts = int(time.time() * 1000) % 1000000
    email = f"arun_{ts}@gmail.com"
    phone = f"98{ts:08d}"[:10]
    aadhaar = make_valid_aadhaar(ts)
    password = "Password@123"
    target_applicant_id = f"ST-2026-{ts:06d}"

    client = httpx.Client(timeout=30.0)

    print(f"\n[STEP 1] Registering citizen: {email} (Phone: {phone})")
    reg_resp = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Arun Kumar",
        "email": email,
        "phone": phone,
        "password": password,
        "role": "APPLICANT"
    })
    assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.text}"
    token_data = reg_resp.json()
    token = token_data["access_token"]
    user_id = token_data["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"Registered successfully! user_id = {user_id}")

    print(f"\n[STEP 2] Creating Applicant Profile with Applicant ID: {target_applicant_id}")
    profile_payload = {
        "applicant_id": target_applicant_id,
        "full_name": "Arun Kumar",
        "father_or_husband_name": "R. Kumar",
        "gender": "MALE",
        "dob": "1998-05-12",
        "aadhaar": aadhaar,
        "phone": phone,
        "category": "ST",
        "tribe_community": "Irular",
        "state": "Tamil Nadu",
        "district": "Chennai",
        "pincode": "600001",
        "address_line": "12 Anna Salai, Chennai"
    }
    prof_resp = client.post(f"{BASE_URL}/applicant/profile", json=profile_payload, headers=headers)
    assert prof_resp.status_code == 201, f"Profile creation failed: {prof_resp.text}"
    profile_data = prof_resp.json()
    assert profile_data["applicant_id"] == target_applicant_id, f"Expected {target_applicant_id}, got {profile_data['applicant_id']}"
    print(f"Profile created successfully! Permanent Applicant ID: {profile_data['applicant_id']}")

    print(f"\n[STEP 3] First Application: Apply for Scheme 1 (NFST / national-fellowship-st)")
    app1_payload = {
        "scheme_id": "national-fellowship-st",
        "applicant_id": target_applicant_id,
        "personal_details": {
            "full_name": "Arun Kumar",
            "father_or_husband_name": "R. Kumar",
            "gender": "MALE",
            "dob": "1998-05-12",
            "aadhaar_masked": profile_data["aadhaar_masked"],
            "category": "ST",
            "tribe_community": "Irular",
            "mobile": phone,
            "email": email,
            "state": "Tamil Nadu",
            "district": "Chennai",
            "pincode": "600001"
        },
        "academic_details": {
            "current_course": "Ph.D. in Tribal Studies",
            "institution_name": "Madras University",
            "institution_state": "Tamil Nadu",
            "aishe_code": "U-0465",
            "roll_number": "PHD-2026-01",
            "year_of_study": "1st Year",
            "previous_exam_name": "Master of Arts",
            "previous_exam_percentage": 78.5,
            "passing_year": "2024",
            "board_or_university": "Madras University"
        },
        "financial_details": {
            "annual_family_income": 160000,
            "bank_name": "State Bank of India",
            "account_holder_name": "Arun Kumar",
            "account_number_masked": "XXXX5678",
            "ifsc_code": "SBIN0000843",
            "branch_name": "Chennai Main",
            "is_aadhaar_seeded": True
        },
        "documents": [
            {
                "id": f"DOC-ST-{ts}",
                "document_code": "ST_CERTIFICATE",
                "document_name": "ST_Certificate_Revenue_Divisional_Officer.pdf",
                "file_name": "ST_Certificate_Revenue_Divisional_Officer.pdf",
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            },
            {
                "id": f"DOC-INC-{ts}",
                "document_code": "INCOME_CERTIFICATE",
                "document_name": "Income_Certificate_FY2024-25.pdf",
                "file_name": "Income_Certificate_FY2024-25.pdf",
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            }
        ],
        "status": "SUBMITTED"
    }

    create1_resp = client.post(f"{BASE_URL}/applications", json=app1_payload, headers=headers)
    assert create1_resp.status_code == 201, f"Application 1 creation failed: {create1_resp.text}"
    app1_data = create1_resp.json()
    app1_id = app1_data["application_id"]
    assert app1_id.startswith("APP-2026-"), f"Expected APP-2026-XXXXXX, got {app1_id}"
    assert app1_data["applicant_id"] == target_applicant_id, f"Expected {target_applicant_id}, got {app1_data['applicant_id']}"
    assert "Chennai" in app1_data["applicant_snapshot"]["address"] or "Chennai" in app1_data["applicant_snapshot"]["district"], "Snapshot should record Chennai"
    print(f"Application 1 submitted: {app1_id} for NFST with Applicant ID: {app1_data['applicant_id']}")
    print(f"Application 1 Snapshot Address: {app1_data['applicant_snapshot']['address']}")

    print(f"\n[STEP 4] Testing Duplicate Application Protection for the SAME scheme (NFST)")
    dup_resp = client.post(f"{BASE_URL}/applications", json=app1_payload, headers=headers)
    assert dup_resp.status_code == 400, f"Expected 400 Bad Request for duplicate, got {dup_resp.status_code}: {dup_resp.text}"
    dup_detail = dup_resp.json().get("detail", {})
    assert "already have an application" in str(dup_detail).lower(), f"Expected duplicate warning message, got: {dup_detail}"
    print(f"Duplicate application properly prevented with HTTP 400! Message: {dup_detail.get('message')}")

    print(f"\n[STEP 5] Testing Document Reuse & Validity Checking for Next Scheme")
    reusable_resp = client.get(f"{BASE_URL}/applicant/reusable-documents?scheme_id=national-overseas-scholarship-st", headers=headers)
    assert reusable_resp.status_code == 200, f"Failed getting reusable documents: {reusable_resp.text}"
    reusable_docs = reusable_resp.json()
    print(f"Found {len(reusable_docs)} document categories in repository.")

    st_doc = next((d for d in reusable_docs if d["document_type"] == "ST_CERTIFICATE"), None)
    assert st_doc is not None, "ST Certificate should be discovered in reusable documents"
    assert st_doc["is_reusable"] is True, "ST Certificate should be reusable (permanent caste validity)"
    print(f"ST Certificate: is_reusable = {st_doc['is_reusable']} (Offered [Use Existing])")

    inc_doc = next((d for d in reusable_docs if d["document_type"] == "INCOME_CERTIFICATE"), None)
    assert inc_doc is not None, "Income Certificate should be discovered"
    assert inc_doc["is_reusable"] is False, "Older FY 2024-25 Income Certificate must NOT be reusable for FY 2025-26"
    assert "FY 2025-26" in inc_doc["ineligibility_reason"], f"Reason should state required FY 2025-26, got: {inc_doc['ineligibility_reason']}"
    print(f"Income Certificate: is_reusable = {inc_doc['is_reusable']}")
    print(f"Explanation: {inc_doc['ineligibility_reason']}")

    print(f"\n[STEP 6] Updating Applicant Profile Address from Chennai to Coimbatore")
    update_prof_resp = client.put(f"{BASE_URL}/applicant/profile", json={
        "district": "Coimbatore",
        "address_line": "88 Gandhipuram, Coimbatore"
    }, headers=headers)
    assert update_prof_resp.status_code == 200, f"Profile update failed: {update_prof_resp.text}"
    updated_prof = update_prof_resp.json()
    assert updated_prof["district"] == "Coimbatore"
    assert updated_prof["applicant_id"] == target_applicant_id, "Applicant ID must never change upon update"
    print(f"Current profile updated to: {updated_prof['address_line']} (Applicant ID: {updated_prof['applicant_id']})")

    print(f"\n[STEP 7] Verifying Historical Application 1 Record is PRESERVED (Snapshot Immutability)")
    get_app1 = client.get(f"{BASE_URL}/applications/{app1_id}", headers=headers).json()
    assert "Chennai" in get_app1["applicant_snapshot"]["address"] or "Chennai" in get_app1["applicant_snapshot"]["district"], "Historical application 1 snapshot must continue showing Chennai!"
    print(f"Application 1 historical snapshot correctly preserved with Address: {get_app1['applicant_snapshot']['address']}")

    print(f"\n[STEP 8] Second Application: Apply for Scheme 2 (NOS / national-overseas-scholarship-st)")
    app2_payload = {
        "scheme_id": "national-overseas-scholarship-st",
        "applicant_id": target_applicant_id,
        "personal_details": {
            "full_name": updated_prof["full_name"],
            "father_or_husband_name": updated_prof["father_or_husband_name"],
            "gender": updated_prof["gender"],
            "dob": updated_prof["dob"],
            "aadhaar_masked": updated_prof["aadhaar_masked"],
            "category": updated_prof["category"],
            "tribe_community": updated_prof["tribe_community"],
            "mobile": updated_prof["phone"],
            "email": email,
            "state": updated_prof["state"],
            "district": updated_prof["district"],
            "pincode": updated_prof["pincode"]
        },
        "academic_details": {
            "current_course": "M.Sc. in Data Science",
            "institution_name": "University of Edinburgh",
            "institution_state": "United Kingdom",
            "aishe_code": "INTL-091",
            "roll_number": "EDIN-2026-99",
            "year_of_study": "1st Year",
            "previous_exam_name": "B.Tech Computer Science",
            "previous_exam_percentage": 82.0,
            "passing_year": "2024",
            "board_or_university": "Anna University"
        },
        "financial_details": {
            "annual_family_income": 160000,
            "bank_name": "State Bank of India",
            "account_holder_name": "Arun Kumar",
            "account_number_masked": "XXXX5678",
            "ifsc_code": "SBIN0000843",
            "branch_name": "Chennai Main",
            "is_aadhaar_seeded": True
        },
        "documents": [
            # Reuse ST Certificate
            {
                "id": st_doc["document_id"],
                "document_code": "ST_CERTIFICATE",
                "document_name": st_doc["file_name"],
                "file_name": st_doc["file_name"],
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            },
            # Fresh replacement Income Certificate for FY 2025-26
            {
                "id": f"DOC-INC-REPLACE-{ts}",
                "document_code": "INCOME_CERTIFICATE",
                "document_name": "Income_Certificate_FY2025-26_New.pdf",
                "file_name": "Income_Certificate_FY2025-26_New.pdf",
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            }
        ],
        "status": "SUBMITTED"
    }

    create2_resp = client.post(f"{BASE_URL}/applications", json=app2_payload, headers=headers)
    assert create2_resp.status_code == 201, f"Application 2 creation failed: {create2_resp.text}"
    app2_data = create2_resp.json()
    app2_id = app2_data["application_id"]
    assert app2_id != app1_id, "Application 2 must have a unique, distinct Application ID"
    assert app2_data["applicant_id"] == target_applicant_id, f"Application 2 must have the SAME permanent Applicant ID: {target_applicant_id}"
    assert "Coimbatore" in app2_data["applicant_snapshot"]["address"] or "Coimbatore" in app2_data["applicant_snapshot"]["district"], "Application 2 snapshot must use updated address Coimbatore!"
    print(f"Application 2 submitted: {app2_id} for NOS with Applicant ID: {app2_data['applicant_id']}")
    print(f"Application 2 Snapshot Address: {app2_data['applicant_snapshot']['address']}")

    print(f"\n[STEP 9] Querying GET /api/applications/my (Applicant Dashboard Applications List)")
    my_apps_resp = client.get(f"{BASE_URL}/applications/my", headers=headers)
    assert my_apps_resp.status_code == 200
    my_apps = my_apps_resp.json()
    assert len(my_apps) >= 2, f"Expected at least 2 applications, got {len(my_apps)}"
    app_ids = [a["application_id"] for a in my_apps]
    assert app1_id in app_ids, f"{app1_id} should be in my applications"
    assert app2_id in app_ids, f"{app2_id} should be in my applications"
    for a in my_apps:
        if a["application_id"] in [app1_id, app2_id]:
            assert a["applicant_id"] == target_applicant_id, f"Application {a['application_id']} has wrong applicant_id {a.get('applicant_id')}"
            print(f"Verified Application {a['application_id']}: Scheme = {a['scheme_id']}, Applicant ID = {a['applicant_id']}, Status = {a['status']}")

    print(f"\n[STEP 10] Direct MongoDB Verification in 'tsfms' Database")
    client = MongoClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]

    profile_doc = db["applicant_profiles"].find_one({"user_id": user_id})
    assert profile_doc is not None, "Profile document must exist in tsfms.applicant_profiles"
    assert profile_doc["applicant_id"] == target_applicant_id
    # Ensure ONLY ONE profile exists for this citizen
    profile_count = db["applicant_profiles"].count_documents({"user_id": user_id})
    assert profile_count == 1, f"Expected exactly 1 profile in tsfms.applicant_profiles, found {profile_count}"
    print(f"MongoDB Verified: tsfms.applicant_profiles contains exactly 1 profile for user {user_id} with applicant_id {target_applicant_id}")

    # Ensure multiple applications reference the SAME applicant_id
    user_apps = list(db["applications"].find({"user_id": user_id}))
    assert len(user_apps) >= 2, f"Expected at least 2 application records in tsfms.applications, found {len(user_apps)}"
    for db_app in user_apps:
        assert db_app["applicant_id"] == target_applicant_id, f"Application {db_app['_id']} applicant_id mismatch"
        print(f"MongoDB Verified Application: ID={db_app['_id']}, Scheme={db_app['scheme_id']}, Applicant ID={db_app['applicant_id']}")

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! ARCHITECTURE VERIFIED 100%!")
    print("=" * 70)

if __name__ == "__main__":
    run_test()
