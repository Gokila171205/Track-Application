import sys
import os
import io

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from app.main import app



def test_full_security_and_authorization_audit():
    print("\n=======================================================")
    print("STARTING TSFMS COMPREHENSIVE SECURITY & AUDIT SUITE")
    print("=======================================================")

    with TestClient(app) as client:
        # -------------------------------------------------------------
        # TEST 1: DENIAL OF UNPROTECTED ACCESS (401 Unauthorized)
        # -------------------------------------------------------------
        print("\n[TEST 1] Testing Unauthenticated Rejection (HTTP 401)...")
        res = client.get("/api/applications/my")
        assert res.status_code == 401, f"Expected 401 for /api/applications/my, got {res.status_code}"
        print("  [OK] GET /api/applications/my without JWT -> 401 Unauthorized")

        res = client.get("/api/auth/me")
        assert res.status_code == 401, f"Expected 401 for /api/auth/me, got {res.status_code}"
        print("  [OK] GET /api/auth/me without JWT -> 401 Unauthorized")

        res = client.get("/api/admin/applications")
        assert res.status_code == 401, f"Expected 401 for /api/admin/applications, got {res.status_code}"
        print("  [OK] GET /api/admin/applications without JWT -> 401 Unauthorized")

        res = client.get("/api/admin/dashboard/stats")
        assert res.status_code == 401, f"Expected 401 for /api/admin/dashboard/stats, got {res.status_code}"
        print("  [OK] GET /api/admin/dashboard/stats without JWT -> 401 Unauthorized")

        # -------------------------------------------------------------
        # TEST 2: APPLICANT REGISTRATION & JWT ISSUANCE
        # -------------------------------------------------------------
        print("\n[TEST 2] Registering distinct applicant citizens...")
        # Register Citizen A
        res_a = client.post("/api/auth/register", json={
            "name": "Sunita Soren",
            "email": "sunita.audit@tribal.gov.in",
            "phone": "9812345670",
            "password": "SecurePass@2026",
            "role": "APPLICANT"
        })
        if res_a.status_code in [400, 409]:
            # User might exist from previous run, login instead
            res_a = client.post("/api/auth/login", json={
                "email": "sunita.audit@tribal.gov.in",
                "password": "SecurePass@2026"
            })
        assert res_a.status_code in [200, 201]
        token_a = res_a.json()["access_token"]
        user_a_id = res_a.json()["user"]["id"]
        headers_a = {"Authorization": f"Bearer {token_a}"}
        print(f"  [OK] Applicant A registered: {user_a_id} (Sunita Soren)")

        # Register Citizen B
        res_b = client.post("/api/auth/register", json={
            "name": "Mangal Oraon",
            "email": "mangal.audit@tribal.gov.in",
            "phone": "9876543210",
            "password": "SecurePass@2026",
            "role": "APPLICANT"
        })
        if res_b.status_code in [400, 409]:
            res_b = client.post("/api/auth/login", json={
                "email": "mangal.audit@tribal.gov.in",
                "password": "SecurePass@2026"
            })
        assert res_b.status_code in [200, 201]
        token_b = res_b.json()["access_token"]
        user_b_id = res_b.json()["user"]["id"]
        headers_b = {"Authorization": f"Bearer {token_b}"}
        print(f"  [OK] Applicant B registered: {user_b_id} (Mangal Oraon)")

        # -------------------------------------------------------------
        # TEST 3: FORGERY RESISTANCE (NEVER TRUST FRONTEND USER_ID)
        # -------------------------------------------------------------
        print("\n[TEST 3] Testing Server-Enforced Identity (user_id spoofing defense)...")
        app_payload_a = {
            "scheme_id": "MOTA-ST-01",
            "personal_details": {
                "full_name": "Sunita Soren",
                "father_or_husband_name": "Late Birsa Soren",
                "gender": "FEMALE",
                "dob": "2000-08-15",
                "aadhaar_masked": "XXXX-XXXX-4521",
                "category": "ST",
                "tribe_community": "Santhal",
                "mobile": "9812345670",
                "email": "sunita.audit@tribal.gov.in",
                "state": "Jharkhand",
                "district": "Ranchi",
                "pincode": "834001"
            },
            "academic_details": {
                "current_course": "Ph.D. in Linguistics",
                "institution_name": "Ranchi University",
                "institution_state": "Jharkhand",
                "aishe_code": "U-0245",
                "roll_number": "RU/PHD/2026/01",
                "year_of_study": "1st Year",
                "previous_exam_name": "MA Linguistics",
                "previous_exam_percentage": 84.5,
                "passing_year": "2024",
                "board_or_university": "Ranchi University"
            },
            "financial_details": {
                "annual_family_income": 120000,
                "bank_name": "State Bank of India",
                "account_holder_name": "Sunita Soren",
                "account_number_masked": "XXXXXX9876",
                "ifsc_code": "SBIN0001234",
                "is_aadhaar_seeded": True
            },
            "documents": [],
            "status": "SUBMITTED"
        }

        # Applicant A creates an application
        res_create = client.post("/api/applications", json=app_payload_a, headers=headers_a)
        assert res_create.status_code == 201
        app_a = res_create.json()
        app_a_id = app_a["application_id"]
        assert app_a["user_id"] == user_a_id, "Backend must derive user_id from token, not client"
        print(f"  [OK] Application created: {app_a_id} bound strictly to user_id: {app_a['user_id']}")

        # -------------------------------------------------------------
        # TEST 4: APPLICANT DATA ISOLATION (GET /api/applications/my)
        # -------------------------------------------------------------
        print("\n[TEST 4] Testing Scoped Retrieval (GET /api/applications/my)...")
        # Applicant A gets own applications
        res_my_a = client.get("/api/applications/my", headers=headers_a)
        assert res_my_a.status_code == 200
        apps_a = res_my_a.json()
        assert any(a["application_id"] == app_a_id for a in apps_a), "Applicant A must see their application"
        print(f"  [OK] Applicant A sees their application ({len(apps_a)} record(s))")

        # Applicant B must NOT see Applicant A's application in /applications/my
        res_my_b = client.get("/api/applications/my", headers=headers_b)
        assert res_my_b.status_code == 200
        apps_b = res_my_b.json()
        assert not any(a["application_id"] == app_a_id for a in apps_b), "CRITICAL: Applicant B must NEVER receive Applicant A's application"
        print("  [OK] Applicant B does NOT see Applicant A's application in /applications/my")

        # -------------------------------------------------------------
        # TEST 5: IDOR / BOLA DIRECT OBJECT ACCESS REJECTION
        # -------------------------------------------------------------
        print("\n[TEST 5] Testing IDOR/BOLA Protection (GET & PUT /api/applications/{id})...")
        # Applicant A can access own application
        res_get_owner = client.get(f"/api/applications/{app_a_id}", headers=headers_a)
        assert res_get_owner.status_code == 200
        print(f"  [OK] Owner (Applicant A) successfully retrieved {app_a_id}")

        # Applicant B attempts to access Applicant A's application
        res_get_unauth = client.get(f"/api/applications/{app_a_id}", headers=headers_b)
        assert res_get_unauth.status_code == 403, f"Expected 403 for unauthorized access, got {res_get_unauth.status_code}"
        print(f"  [OK] Unauthorized Applicant B denied access to {app_a_id} -> HTTP 403 Forbidden")

        # Applicant B attempts to modify Applicant A's application
        res_put_unauth = client.put(f"/api/applications/{app_a_id}", json={"status": "APPROVED"}, headers=headers_b)
        assert res_put_unauth.status_code == 403, f"Expected 403 for unauthorized modification, got {res_put_unauth.status_code}"
        print(f"  [OK] Unauthorized Applicant B denied modifying {app_a_id} -> HTTP 403 Forbidden")

        # -------------------------------------------------------------
        # TEST 6: DOCUMENT SECURITY & OWNERSHIP CHECK
        # -------------------------------------------------------------
        print("\n[TEST 6] Testing Document Security & Ownership Enforcement...")
        # Applicant A uploads document to Application A
        cert_text = (
            "GOVERNMENT OF JHARKHAND\n"
            "SCHEDULED TRIBE COMMUNITY CERTIFICATE\n"
            "Certificate No: ST/2026/001\n"
            "This is to certify that Sunita Soren belongs to the Santhal Community "
            "recognized as Scheduled Tribe under Constitution Order 1950."
        )
        import pypdf
        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=612, height=792)
        writer.add_metadata({"/Producer": "Government of India", "/Title": "Certificate", "/Subject": cert_text})
        page = writer.pages[0]
        stream_ops = "BT /F1 12 Tf 50 720 Td 14 TL "
        for line in cert_text.split("\n"):
            stream_ops += f"({line}) ' "
        stream_ops += "ET"
        cs = pypdf.generic.DecodedStreamObject()
        cs.set_data(stream_ops.encode("latin-1", errors="replace"))
        page[pypdf.generic.NameObject("/Contents")] = cs
        font_dict = pypdf.generic.DictionaryObject({
            pypdf.generic.NameObject("/Type"): pypdf.generic.NameObject("/Font"),
            pypdf.generic.NameObject("/Subtype"): pypdf.generic.NameObject("/Type1"),
            pypdf.generic.NameObject("/BaseFont"): pypdf.generic.NameObject("/Helvetica"),
        })
        page[pypdf.generic.NameObject("/Resources")] = pypdf.generic.DictionaryObject({
            pypdf.generic.NameObject("/Font"): pypdf.generic.DictionaryObject({pypdf.generic.NameObject("/F1"): font_dict})
        })
        pdf_out = io.BytesIO()
        writer.write(pdf_out)
        pdf_bytes = pdf_out.getvalue()

        fake_file = io.BytesIO(pdf_bytes)
        res_upload_a = client.post(
            "/api/documents/upload",
            data={"application_id": app_a_id, "document_type": "ST_CERTIFICATE"},
            files={"file": ("caste_cert.pdf", fake_file, "application/pdf")},
            headers=headers_a
        )
        assert res_upload_a.status_code == 201
        doc_a_id = res_upload_a.json()["document_id"]
        print(f"  [OK] Applicant A uploaded document {doc_a_id} to {app_a_id}")

        # Applicant B attempts to upload document into Applicant A's application
        fake_file_b = io.BytesIO(b"%PDF-1.4 Attacker file")
        res_upload_b = client.post(
            "/api/documents/upload",
            data={"application_id": app_a_id, "document_type": "INCOME_CERTIFICATE"},
            files={"file": ("malicious.pdf", fake_file_b, "application/pdf")},
            headers=headers_b
        )
        assert res_upload_b.status_code == 403, f"Expected 403 for cross-user doc upload, got {res_upload_b.status_code}"
        print(f"  [OK] Applicant B denied uploading document to {app_a_id} -> HTTP 403 Forbidden")

        # Applicant A accesses own documents
        res_docs_a = client.get(f"/api/documents/application/{app_a_id}", headers=headers_a)
        assert res_docs_a.status_code == 200
        assert len(res_docs_a.json()) >= 1
        print("  [OK] Applicant A successfully retrieved documents for own application")

        # Applicant B attempts to read Applicant A's documents
        res_docs_b = client.get(f"/api/documents/application/{app_a_id}", headers=headers_b)
        assert res_docs_b.status_code == 403, f"Expected 403 for cross-user doc access, got {res_docs_b.status_code}"
        print(f"  [OK] Applicant B denied viewing documents for {app_a_id} -> HTTP 403 Forbidden")

        # Applicant B attempts to access individual document
        res_single_doc_b = client.get(f"/api/documents/{doc_a_id}", headers=headers_b)
        assert res_single_doc_b.status_code == 403
        print(f"  [OK] Applicant B denied viewing document {doc_a_id} -> HTTP 403 Forbidden")

        # -------------------------------------------------------------
        # TEST 7: ROLE-BASED ACCESS CONTROL (APPLICANT vs ADMIN)
        # -------------------------------------------------------------
        print("\n[TEST 7] Testing RBAC: Applicant cannot access Admin/Officer endpoints...")
        res_admin_apps = client.get("/api/admin/applications", headers=headers_a)
        assert res_admin_apps.status_code == 403
        print("  [OK] Applicant A denied access to GET /api/admin/applications -> HTTP 403 Forbidden")

        res_admin_stats = client.get("/api/admin/dashboard/stats", headers=headers_a)
        assert res_admin_stats.status_code == 403
        print("  [OK] Applicant A denied access to GET /api/admin/dashboard/stats -> HTTP 403 Forbidden")

        res_admin_audit = client.get("/api/admin/audit-logs", headers=headers_a)
        assert res_admin_audit.status_code == 403
        print("  [OK] Applicant A denied access to GET /api/admin/audit-logs -> HTTP 403 Forbidden")

        # -------------------------------------------------------------
        # TEST 8: OFFICER AUTHORIZATION (PRE-SEEDED OFFICER ACCOUNT)
        # -------------------------------------------------------------
        print("\n[TEST 8] Testing Authorized Officer Access...")
        res_officer_login = client.post("/api/auth/login", json={
            "email": "officer@mota.gov.in",
            "password": "Officer@2026"
        })
        assert res_officer_login.status_code == 200, f"Officer login failed: {res_officer_login.text}"
        officer_token = res_officer_login.json()["access_token"]
        headers_officer = {"Authorization": f"Bearer {officer_token}"}
        print("  [OK] Officer logged in successfully (role: OFFICER)")

        # Officer accesses admin dashboard stats
        res_off_stats = client.get("/api/admin/dashboard/stats", headers=headers_officer)
        assert res_off_stats.status_code == 200
        print(f"  [OK] Officer accessed /api/admin/dashboard/stats -> totalApplications: {res_off_stats.json()['totalApplications']}")

        # Officer accesses applications queue
        res_off_apps = client.get("/api/admin/applications", headers=headers_officer)
        assert res_off_apps.status_code == 200
        print(f"  [OK] Officer accessed /api/admin/applications -> {len(res_off_apps.json())} applications loaded")

        # Officer accesses documents for scrutiny
        res_off_docs = client.get(f"/api/documents/application/{app_a_id}", headers=headers_officer)
        assert res_off_docs.status_code == 200
        print(f"  [OK] Officer authorized to review documents for scrutiny ({len(res_off_docs.json())} docs)")

        # Officer updates application status
        res_off_update = client.put(
            f"/api/admin/applications/{app_a_id}/status",
            json={"status": "DOCUMENT_VERIFICATION", "remarks": "Documents verified by Deputy Secretary"},
            headers=headers_officer
        )
        assert res_off_update.status_code == 200
        assert res_off_update.json()["status"] == "DOCUMENT_VERIFICATION"
        print(f"  [OK] Officer updated status of {app_a_id} to DOCUMENT_VERIFICATION")

        print("\n=======================================================")
        print("ALL 8 SECURITY AUDIT TEST CASES PASSED WITH 100% SUCCESS!")
        print("=======================================================\n")

if __name__ == "__main__":
    test_full_security_and_authorization_audit()
