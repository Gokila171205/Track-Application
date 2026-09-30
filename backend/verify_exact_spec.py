import sys
import os
import httpx
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from app.services.identity_validator import generate_verhoeff_check_digit
from app.core.config import settings

BASE_URL = "http://127.0.0.1:8000/api"

def make_valid_aadhaar() -> str:
    base = "28991234567"[:11]
    check = generate_verhoeff_check_digit(base)
    return f"{base}{check}"

def run_exact_spec_test():
    print("\n" + "=" * 75)
    print("VERIFYING EXACT USER SPECIFICATION FLOW")
    print("=" * 75)

    client_db = MongoClient(settings.MONGO_URI)
    db = client_db[settings.MONGO_DB_NAME]

    test_email = "arun@gmail.com"
    test_phone = "9876543210"
    target_applicant_id = "ST-2026-000123"

    # Clean up prior test data for arun@gmail.com to guarantee clean slate
    print(f"Preparing clean environment for {test_email} in database '{settings.MONGO_DB_NAME}'...")
    existing_u = db["users"].find_one({"email": test_email})
    if existing_u:
        u_id = existing_u["_id"]
        db["applications"].delete_many({"user_id": u_id})
        db["applicant_profiles"].delete_many({"user_id": u_id})
        db["documents"].delete_many({"user_id": u_id})
        db["users"].delete_one({"_id": u_id})

    # Also clean if phone was used
    existing_phone = db["users"].find_one({"phone": test_phone})
    if existing_phone:
        u_id = existing_phone["_id"]
        db["applications"].delete_many({"user_id": u_id})
        db["applicant_profiles"].delete_many({"user_id": u_id})
        db["users"].delete_one({"_id": u_id})

    # Also clean target_applicant_id
    db["applicant_profiles"].delete_many({"applicant_id": target_applicant_id})
    db["applications"].delete_many({"applicant_id": target_applicant_id})

    client = httpx.Client(timeout=30.0)

    # 1. Register: arun@gmail.com
    print(f"\n[1] Registering citizen: {test_email}")
    reg_resp = client.post(f"{BASE_URL}/auth/register", json={
        "name": "Arun Kumar",
        "email": test_email,
        "phone": test_phone,
        "password": "Password@123",
        "role": "APPLICANT"
    })
    assert reg_resp.status_code == 201, f"Reg failed: {reg_resp.text}"
    auth_data = reg_resp.json()
    user_id = auth_data["user"]["id"]
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"    [OK] Registered: user_id = {user_id}")

    # 2. Create Profile with Applicant ID: ST-2026-000123
    print(f"\n[2] Creating Applicant Profile with permanent Applicant ID: {target_applicant_id}")
    prof_resp = client.post(f"{BASE_URL}/applicant/profile", json={
        "applicant_id": target_applicant_id,
        "full_name": "Arun Kumar",
        "father_or_husband_name": "R. Kumar",
        "gender": "MALE",
        "dob": "1998-05-12",
        "aadhaar": make_valid_aadhaar(),
        "phone": test_phone,
        "category": "ST",
        "tribe_community": "Irular",
        "state": "Tamil Nadu",
        "district": "Chennai",
        "pincode": "600001",
        "address_line": "12 Anna Salai, Chennai"
    }, headers=headers)
    assert prof_resp.status_code == 201, f"Profile creation failed: {prof_resp.text}"
    profile = prof_resp.json()
    assert profile["applicant_id"] == target_applicant_id
    print(f"    [OK] Profile created: Permanent Applicant ID = {profile['applicant_id']}")

    # 3. First Application: Apply for NFST
    print(f"\n[3] First Application: Apply for NFST with address 'Chennai'")
    app1_resp = client.post(f"{BASE_URL}/applications", json={
        "scheme_id": "NFST",
        "personal_details": {
            "full_name": "Arun Kumar",
            "father_or_husband_name": "R. Kumar",
            "gender": "MALE",
            "dob": "1998-05-12",
            "aadhaar_masked": profile["aadhaar_masked"],
            "category": "ST",
            "tribe_community": "Irular",
            "mobile": test_phone,
            "email": test_email,
            "state": "Tamil Nadu",
            "district": "Chennai",
            "pincode": "600001",
            "address": "12 Anna Salai, Chennai"
        },
        "academic_details": {
            "current_course": "Ph.D. in Tribal Development",
            "institution_name": "Madras University",
            "institution_state": "Tamil Nadu",
            "aishe_code": "U-0465",
            "roll_number": "PHD-2026-001",
            "year_of_study": "1st Year",
            "previous_exam_name": "Master of Arts",
            "previous_exam_percentage": 78.0,
            "passing_year": "2024",
            "board_or_university": "Madras University"
        },
        "financial_details": {
            "annual_family_income": 150000,
            "bank_name": "State Bank of India",
            "account_holder_name": "Arun Kumar",
            "account_number_masked": "XXXX1234",
            "ifsc_code": "SBIN0000843",
            "branch_name": "Chennai Main",
            "is_aadhaar_seeded": True
        },
        "documents": [
            {
                "id": "DOC-ST-001",
                "document_code": "ST_CERTIFICATE",
                "document_name": "ST_Certificate_Revenue_Officer.pdf",
                "file_name": "ST_Certificate_Revenue_Officer.pdf",
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            },
            {
                "id": "DOC-INC-001",
                "document_code": "INCOME_CERTIFICATE",
                "document_name": "Income_Certificate_FY2024-25.pdf",
                "file_name": "Income_Certificate_FY2024-25.pdf",
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            }
        ],
        "status": "SUBMITTED"
    }, headers=headers)
    assert app1_resp.status_code == 201, f"App 1 creation failed: {app1_resp.text}"
    app1 = app1_resp.json()
    app1_id = app1["application_id"]
    assert app1["applicant_id"] == target_applicant_id
    assert "Chennai" in app1["applicant_snapshot"]["address"]
    print(f"    ✓ Application 1 Submitted: Application ID = {app1_id}, Scheme = {app1['scheme_id']}")
    print(f"      Applicant ID = {app1['applicant_id']}")
    print(f"      Snapshot Address = {app1['applicant_snapshot']['address']}")

    # 4. Duplicate Check for SAME scheme (NFST)
    print(f"\n[4] Attempting Duplicate Application for SAME scheme (NFST)")
    dup_resp = client.post(f"{BASE_URL}/applications", json={
        "scheme_id": "NFST",
        "personal_details": app1["personal_details"],
        "academic_details": app1["academic_details"],
        "financial_details": app1["financial_details"]
    }, headers=headers)
    assert dup_resp.status_code == 400
    dup_msg = dup_resp.json()["detail"]["message"]
    assert "You already have an application for this scheme." in dup_msg
    print(f"    ✓ Accidental duplicate submission blocked: {dup_msg}")

    # 5. Document Reuse & Fiscal Year Validity Check
    print(f"\n[5] Checking Reusable Documents for next scheme")
    reusable_resp = client.get(f"{BASE_URL}/applicant/reusable-documents?scheme_id=NOS", headers=headers)
    assert reusable_resp.status_code == 200
    reusable_docs = reusable_resp.json()

    st_doc = next((d for d in reusable_docs if d["document_type"] == "ST_CERTIFICATE"), None)
    assert st_doc and st_doc["is_reusable"] is True
    print(f"    ✓ ST Certificate: is_reusable = True -> Actions offered: [Use Existing] [Replace]")

    inc_doc = next((d for d in reusable_docs if d["document_type"] == "INCOME_CERTIFICATE"), None)
    assert inc_doc and inc_doc["is_reusable"] is False
    assert "New Income Certificate required for FY 2025-26." in inc_doc["ineligibility_reason"]
    print(f"    ✓ Income Certificate: is_reusable = False")
    print(f"      Displayed notice: '{inc_doc['ineligibility_reason'].splitlines()[0]}'")
    print(f"      Reason: '{inc_doc['ineligibility_reason'].splitlines()[1]}'")
    print(f"      Existing: '{inc_doc['ineligibility_reason'].splitlines()[2]}'")

    # 6. Change Profile Address: Chennai -> Coimbatore
    print(f"\n[6] Changing applicant profile address: Chennai -> Coimbatore")
    upd_resp = client.put(f"{BASE_URL}/applicant/profile", json={
        "district": "Coimbatore",
        "address_line": "75 Cross Cut Road, Coimbatore"
    }, headers=headers)
    assert upd_resp.status_code == 200
    upd_profile = upd_resp.json()
    assert upd_profile["district"] == "Coimbatore"
    assert upd_profile["applicant_id"] == target_applicant_id
    print(f"    ✓ Profile updated with new Address: {upd_profile['address_line']}")

    # 7. Verify Historical Application 1 Snapshot Unchanged
    print(f"\n[7] Verifying Application 1 historical snapshot preservation")
    app1_check = client.get(f"{BASE_URL}/applications/{app1_id}", headers=headers).json()
    assert "Chennai" in app1_check["applicant_snapshot"]["address"]
    print(f"    ✓ Application 1 historical snapshot is preserved with: {app1_check['applicant_snapshot']['address']}")

    # 8. Second Application: Apply for NOS with updated address
    print(f"\n[8] Second Application: Apply for NOS with updated address 'Coimbatore'")
    app2_resp = client.post(f"{BASE_URL}/applications", json={
        "scheme_id": "NOS",
        "personal_details": {
            "full_name": "Arun Kumar",
            "father_or_husband_name": "R. Kumar",
            "gender": "MALE",
            "dob": "1998-05-12",
            "aadhaar_masked": upd_profile["aadhaar_masked"],
            "category": "ST",
            "tribe_community": "Irular",
            "mobile": test_phone,
            "email": test_email,
            "state": "Tamil Nadu",
            "district": "Coimbatore",
            "pincode": "641012",
            "address": "75 Cross Cut Road, Coimbatore"
        },
        "academic_details": {
            "current_course": "M.S. in Computer Science",
            "institution_name": "Oxford University",
            "institution_state": "United Kingdom",
            "aishe_code": "INTL-001",
            "roll_number": "OX-2026-88",
            "year_of_study": "1st Year",
            "previous_exam_name": "B.Tech",
            "previous_exam_percentage": 85.0,
            "passing_year": "2024",
            "board_or_university": "Anna University"
        },
        "financial_details": {
            "annual_family_income": 150000,
            "bank_name": "State Bank of India",
            "account_holder_name": "Arun Kumar",
            "account_number_masked": "XXXX1234",
            "ifsc_code": "SBIN0000843",
            "branch_name": "Chennai Main",
            "is_aadhaar_seeded": True
        },
        "documents": [
            {
                "id": st_doc["document_id"],
                "document_code": "ST_CERTIFICATE",
                "document_name": st_doc["file_name"],
                "file_name": st_doc["file_name"],
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            },
            {
                "id": "DOC-INC-002",
                "document_code": "INCOME_CERTIFICATE",
                "document_name": "Income_Certificate_FY2025-26.pdf",
                "file_name": "Income_Certificate_FY2025-26.pdf",
                "status": "OCR_VERIFIED",
                "verification_status": "VERIFIED"
            }
        ],
        "status": "SUBMITTED"
    }, headers=headers)
    assert app2_resp.status_code == 201, f"App 2 creation failed: {app2_resp.text}"
    app2 = app2_resp.json()
    app2_id = app2["application_id"]
    assert app2_id != app1_id
    assert app2["applicant_id"] == target_applicant_id
    assert "Coimbatore" in app2["applicant_snapshot"]["address"]
    print(f"    ✓ Application 2 Submitted: Application ID = {app2_id}, Scheme = {app2['scheme_id']}")
    print(f"      Applicant ID = {app2['applicant_id']} (Identical permanent ID)")
    print(f"      Snapshot Address = {app2['applicant_snapshot']['address']} (Uses updated address)")

    # 9. Verify Dashboard Listing
    print(f"\n[9] Querying GET /api/applications/my")
    my_resp = client.get(f"{BASE_URL}/applications/my", headers=headers)
    assert my_resp.status_code == 200
    my_list = my_resp.json()
    my_ids = [a["application_id"] for a in my_list]
    assert app1_id in my_ids and app2_id in my_ids
    print(f"    ✓ Both applications listed for citizen:")
    for a in my_list:
        if a["application_id"] in [app1_id, app2_id]:
            print(f"      • {a['scheme_id']}: Application ID={a['application_id']}, Applicant ID={a['applicant_id']}, Status={a['status']}")

    # 10. Direct MongoDB Database 'tsfms' Verification
    print(f"\n[10] Direct MongoDB Verification in 'tsfms'")
    profile_count = db["applicant_profiles"].count_documents({"user_id": user_id})
    assert profile_count == 1, f"Expected 1 profile in tsfms.applicant_profiles, found {profile_count}"
    db_profile = db["applicant_profiles"].find_one({"user_id": user_id})
    assert db_profile["applicant_id"] == target_applicant_id
    print(f"    ✓ tsfms.applicant_profiles: Exactly ONE profile found for user_id={user_id} with applicant_id={db_profile['applicant_id']}")

    db_apps = list(db["applications"].find({"user_id": user_id}))
    assert len(db_apps) >= 2, f"Expected at least 2 applications in tsfms.applications, found {len(db_apps)}"
    for a in db_apps:
        assert a["applicant_id"] == target_applicant_id
        print(f"    ✓ tsfms.applications: {a['scheme_id']} -> Application ID={a['application_id']}, Applicant ID={a['applicant_id']}")

    print("\n" + "=" * 75)
    print("ALL SPECIFICATION REQUIREMENTS VERIFIED WITH 100% SUCCESS")
    print("=" * 75)

if __name__ == "__main__":
    run_exact_spec_test()
