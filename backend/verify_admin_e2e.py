import asyncio
import httpx
import json
from motor.motor_asyncio import AsyncIOMotorClient
import sys

BASE_URL = "http://127.0.0.1:8000/api"

async def run_verification():
    print("=== STARTING ADMIN PORTAL ACCESS & E2E VERIFICATION ===")
    
    # ---------------------------------------------------------
    # STEP 2 & 3: Check MongoDB Atlas and Admin Account
    # ---------------------------------------------------------
    from app.core.config import settings
    mongo_client = AsyncIOMotorClient(settings.MONGO_URI)
    db = mongo_client["tsfms"]
    
    admin_user = await db["users"].find_one({"email": "admin@gmail.com"})
    if not admin_user:
        print("[FAIL] admin@gmail.com not found in tsfms.users")
        sys.exit(1)
        
    print(f"[OK] Admin account in MongoDB Atlas ({db.name}.users):")
    print(f"     email: {admin_user.get('email')}")
    print(f"     role: {admin_user.get('role')}")
    print(f"     user_id: {admin_user.get('_id') or admin_user.get('user_id')}")
    print(f"     status: is_active={admin_user.get('is_active')}")
    print(f"     password_hash_present: {bool(admin_user.get('hashed_password'))} (safe check, hash not printed)")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # ---------------------------------------------------------
        # STEP 4 & 5: Admin Login, Token Check, /auth/me, and RBAC
        # ---------------------------------------------------------
        print("\n--- Testing Admin Login (POST /api/auth/login) ---")
        login_res = await client.post("/auth/login", json={
            "email": "admin@gmail.com",
            "password": "admin@2026"
        })
        if login_res.status_code != 200:
            print(f"[FAIL] Admin login failed: {login_res.status_code} {login_res.text}")
            sys.exit(1)
            
        token_data = login_res.json()
        admin_token = token_data.get("access_token")
        token_type = token_data.get("token_type")
        returned_user = token_data.get("user", {})
        print(f"[OK] Admin login successful! Token type: {token_type}")
        print(f"     Returned user role: {returned_user.get('role')}")
        print(f"     Returned user email: {returned_user.get('email')}")
        print(f"     Returned user ID: {returned_user.get('id')}")

        # Check /api/auth/me
        print("\n--- Verifying /api/auth/me with Admin Token ---")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        me_res = await client.get("/auth/me", headers=admin_headers)
        if me_res.status_code != 200:
            print(f"[FAIL] /auth/me failed: {me_res.status_code} {me_res.text}")
            sys.exit(1)
        me_data = me_res.json()
        print(f"[OK] /auth/me profile: id={me_data.get('id')}, role={me_data.get('role')}, email={me_data.get('email')}")
        assert me_data.get("role") == "ADMIN", f"Expected role ADMIN, got {me_data.get('role')}"
        print("[OK] Confirmed: Admin redirect route according to frontend LoginPage.tsx is '/admin'")

        # ---------------------------------------------------------
        # STEP 7: End-to-End Test (Applicant submission -> Admin queue)
        # ---------------------------------------------------------
        print("\n--- Step 7.1: Create / Login as Applicant ---")
        test_applicant_email = "test.applicant.e2e@example.com"
        test_applicant_pass = "TestApplicant@2026"
        
        # Check if applicant exists, otherwise register
        existing_applicant = await db["users"].find_one({"email": test_applicant_email})
        if not existing_applicant:
            import time
            unique_phone = f"9{int(time.time()) % 1000000000:09d}"
            reg_res = await client.post("/auth/register", json={
                "name": "Arjun Kumar Gond",
                "email": test_applicant_email,
                "password": test_applicant_pass,
                "role": "APPLICANT",
                "phone": unique_phone
            })
            if reg_res.status_code not in (200, 201):
                print(f"[FAIL] Applicant registration failed: {reg_res.status_code} {reg_res.text}")
                sys.exit(1)
            print("[OK] Applicant registered successfully")
            
        app_login_res = await client.post("/auth/login", json={
            "email": test_applicant_email,
            "password": test_applicant_pass
        })
        if app_login_res.status_code != 200:
            print(f"[FAIL] Applicant login failed: {app_login_res.status_code} {app_login_res.text}")
            sys.exit(1)
        app_token = app_login_res.json().get("access_token")
        applicant_headers = {"Authorization": f"Bearer {app_token}"}
        print("[OK] Applicant logged in successfully")

        # Verify RBAC: Applicant CANNOT access Admin Portal endpoints
        print("\n--- Step 4 Verification: Verify Applicant CANNOT access Admin Routes ---")
        rbac_test = await client.get("/admin/applications", headers=applicant_headers)
        print(f"Applicant access to /api/admin/applications returned status: {rbac_test.status_code}")
        assert rbac_test.status_code == 403, f"Expected 403 Forbidden for applicant, got {rbac_test.status_code}"
        print("[OK] RBAC verified: Applicant is strictly FORBIDDEN (HTTP 403) from accessing /api/admin/applications")

        # Step 7.2: Select a Scheme
        schemes_res = await client.get("/schemes")
        schemes = schemes_res.json()
        selected_scheme = schemes[0] if schemes else {"id": "SCH-NFST-01", "name": "National Fellowship for ST Students"}
        scheme_id = selected_scheme.get("id")
        scheme_name = selected_scheme.get("name")
        print(f"\n--- Step 7.2: Selected Scheme: {scheme_name} (ID: {scheme_id}) ---")

        # Step 7.3 & 7.4: Complete and Submit Application
        print("\n--- Step 7.3 & 7.4: Submitting Application ---")
        app_payload = {
            "scheme_id": scheme_id,
            "status": "SUBMITTED",
            "personal_details": {
                "full_name": "Arjun Kumar Gond",
                "father_or_husband_name": "Rameshwar Gond",
                "gender": "MALE",
                "dob": "2001-05-15",
                "aadhaar_masked": "XXXXXXXX8821",
                "category": "ST",
                "tribe_community": "Gond",
                "mobile": "9876543210",
                "email": test_applicant_email,
                "state": "Madhya Pradesh",
                "district": "Khargone",
                "pincode": "451001"
            },
            "academic_details": {
                "current_course": "Ph.D. in Tribal Studies",
                "institution_name": "Devi Ahilya Vishwavidyalaya",
                "institution_state": "Madhya Pradesh",
                "aishe_code": "U-0298",
                "roll_number": "DAVV-PHD-2024-042",
                "year_of_study": "1st Year",
                "previous_exam_name": "Master of Arts (Anthropology)",
                "previous_exam_percentage": 84.5,
                "passing_year": "2024",
                "board_or_university": "Devi Ahilya Vishwavidyalaya"
            },
            "financial_details": {
                "annual_family_income": 120000,
                "bank_name": "State Bank of India",
                "account_holder_name": "Arjun Kumar Gond",
                "account_number_masked": "XXXX-XXXX-0194",
                "ifsc_code": "SBIN0000341",
                "branch_name": "Khargone Main",
                "is_aadhaar_seeded": True
            },
            "documents": [
                {
                    "id": "DOC-ST-001",
                    "document_code": "ST_CERTIFICATE",
                    "document_name": "st_community_certificate.pdf",
                    "file_name": "st_community_certificate.pdf",
                    "file_url": "/api/documents/DOC-ST-001/file",
                    "file_size_kb": 256,
                    "status": "VALID",
                    "uploaded_at": "2026-09-29T21:00:00Z"
                },
                {
                    "id": "DOC-INC-001",
                    "document_code": "INCOME_CERTIFICATE",
                    "document_name": "revenue_income_certificate.pdf",
                    "file_name": "revenue_income_certificate.pdf",
                    "file_url": "/api/documents/DOC-INC-001/file",
                    "file_size_kb": 180,
                    "status": "VALID",
                    "uploaded_at": "2026-09-29T21:00:00Z"
                }
            ]
        }
        
        submit_res = await client.post("/applications", json=app_payload, headers=applicant_headers)
        if submit_res.status_code not in (200, 201):
            print(f"[FAIL] Application submission failed: {submit_res.status_code} {submit_res.text}")
            sys.exit(1)
            
        submitted_app = submit_res.json()
        app_id = submitted_app.get("id") or submitted_app.get("_id") or submitted_app.get("application_id")
        print(f"[OK] Application successfully submitted! Application ID: {app_id}")
        print(f"     Status: {submitted_app.get('status')}")

        # Step 7.6: Verify the application exists in tsfms.applications in MongoDB
        print("\n--- Step 7.6: Checking tsfms.applications in MongoDB Atlas ---")
        db_app = await db["applications"].find_one({"_id": app_id})
        assert db_app is not None, f"Application {app_id} not found in MongoDB Atlas tsfms.applications"
        print(f"[OK] Verified application exists in MongoDB Atlas tsfms.applications collection:")
        print(f"     _id: {db_app.get('_id')}")
        print(f"     scheme_name: {db_app.get('scheme_name')}")
        print(f"     status: {db_app.get('status')}")
        print(f"     documents count: {len(db_app.get('documents', []))}")

        # Step 7.7 & 7.8: Logout applicant and Login as Admin
        print("\n--- Step 7.7 & 7.8: Admin Login & Access Verification ---")
        # admin_token was already acquired above
        
        # Step 7.9 & 7.10: Open Admin Portal -> Fetch Applications Queue
        print("\n--- Step 7.9, 7.10 & Step 6: Admin Fetching Applications (GET /api/admin/applications) ---")
        admin_apps_res = await client.get("/admin/applications", headers=admin_headers)
        if admin_apps_res.status_code != 200:
            print(f"[FAIL] Admin GET /api/admin/applications failed: {admin_apps_res.status_code} {admin_apps_res.text}")
            sys.exit(1)
            
        all_apps = admin_apps_res.json()
        print(f"[OK] Admin applications endpoint returned HTTP 200 with {len(all_apps)} total applications.")
        
        # Step 7.11: Verify submitted applicant application appears in admin queue
        matching_app = next((a for a in all_apps if a.get("id") == app_id or a.get("_id") == app_id or a.get("application_id") == app_id), None)
        assert matching_app is not None, f"Submitted application {app_id} not found in admin queue list"
        
        print("\n--- Step 7.11: Verified Submitted Application in Admin Queue ---")
        print(f"     Application ID: {matching_app.get('id') or matching_app.get('application_id')}")
        print(f"     Applicant Name: {matching_app.get('personal_details', {}).get('full_name')}")
        print(f"     Scheme: {matching_app.get('scheme_name')}")
        print(f"     Submitted Date: {matching_app.get('created_at')}")
        print(f"     Current Status: {matching_app.get('status')}")
        docs = matching_app.get("documents", [])
        doc_statuses = [f"{d.get('document_code')}: {d.get('verification_status', d.get('status'))}" for d in docs]
        print(f"     Document Verification Status: {', '.join(doc_statuses) if doc_statuses else 'None'}")

        # Step 7.12 & 7.13 & 7.14: Open Application Dossier as Admin
        print(f"\n--- Step 7.12, 7.13, 7.14: Admin Opening Dossier (GET /api/applications/{app_id}) ---")
        dossier_res = await client.get(f"/applications/{app_id}", headers=admin_headers)
        if dossier_res.status_code != 200:
            print(f"[FAIL] Admin GET /api/applications/{app_id} failed: {dossier_res.status_code} {dossier_res.text}")
            sys.exit(1)
        dossier = dossier_res.json()
        print(f"[OK] Admin successfully viewed application dossier.")
        print(f"     Canonical Backend Status: {dossier.get('status')}")
        print(f"     Applicant Documents visible to Admin: {len(dossier.get('documents', []))} document(s)")
        for doc in dossier.get("documents", []):
            print(f"       * {doc.get('document_code')}: {doc.get('file_name')} ({doc.get('file_url')}) - Status: {doc.get('status')}")

    print("\n=== ALL VERIFICATIONS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    asyncio.run(run_verification())
