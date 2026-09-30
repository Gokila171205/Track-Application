import sys
import os
import uuid
import io

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from app.main import app
from app.services.identity_validator import generate_verhoeff_check_digit


def test_applicant_profile_isolation():
    print("\n=======================================================")
    print("STARTING APPLICANT PROFILE & DOCUMENT ISOLATION AUDIT")
    print("=======================================================")

    test_suffix = uuid.uuid4().hex[:8]
    email_a = f"new.applicant.a.{test_suffix}@test.mota.gov.in"
    email_b = f"new.applicant.b.{test_suffix}@test.mota.gov.in"
    password = "SecurePassword@2026!"

    with TestClient(app) as client:
        # =========================================================================
        # PHASE 1: NEW APPLICANT A REGISTRATION & EMPTY PROFILE VERIFICATION
        # =========================================================================
        print("\n[PHASE 1] Registering New Applicant A...")
        reg_a = client.post(
            "/api/auth/register",
            json={
                "name": "Applicant Alpha",
                "email": email_a,
                "phone": f"91{uuid.uuid4().int % 100000000:08d}",
                "password": password,
            },
        )
        assert reg_a.status_code in [200, 201], f"Applicant A registration failed: {reg_a.text}"
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}
        user_a_id = reg_a.json()["user"]["id"]
        print(f"  [OK] Applicant A registered: ID={user_a_id}, Email={email_a}")

        print("\n[PHASE 1.1] Verifying Applicant A profile is EMPTY (HTTP 404)...")
        prof_a_res = client.get("/api/applicant/profile", headers=headers_a)
        assert prof_a_res.status_code == 404, (
            f"Expected 404 for new Applicant A profile, got {prof_a_res.status_code}: {prof_a_res.text}"
        )
        print("  [OK] GET /api/applicant/profile returned 404 (No seed/demo/fallback profile)")

        print("\n[PHASE 1.2] Verifying Applicant A reusable documents is EMPTY ([ ])...")
        docs_a_res = client.get("/api/applicant/documents/reusable", headers=headers_a)
        assert docs_a_res.status_code == 200, (
            f"Expected 200 for reusable documents, got {docs_a_res.status_code}: {docs_a_res.text}"
        )
        reusable_a = docs_a_res.json()
        assert reusable_a == [], f"Expected empty list [] for new Applicant A reusable documents, got: {reusable_a}"
        print("  [OK] GET /api/applicant/documents/reusable returned [] (No fallback documents)")

        print("\n[PHASE 1.3] Verifying Applicant A applications list is EMPTY ([ ])...")
        apps_a_res = client.get("/api/applications/my", headers=headers_a)
        assert apps_a_res.status_code == 200
        assert apps_a_res.json() == [], f"Expected [] applications for new user, got {apps_a_res.json()}"
        print("  [OK] GET /api/applications/my returned []")

        # =========================================================================
        # PHASE 2: APPLICANT A CREATES STATUTORY PROFILE & LODGES APPLICATION
        # =========================================================================
        print("\n[PHASE 2] Applicant A submits Statutory Profile creation...")
        base_11_a = f"99{uuid.uuid4().int % 1000000000:09d}"
        chk_a = generate_verhoeff_check_digit(base_11_a)
        valid_aadhaar_a = f"{base_11_a}{chk_a}"
        phone_a = f"91{uuid.uuid4().int % 100000000:08d}"

        create_prof_payload = {
            "full_name": "Applicant Alpha",
            "father_or_husband_name": "Father Alpha",
            "gender": "MALE",
            "dob": "2001-05-15",
            "aadhaar": valid_aadhaar_a,
            "phone": phone_a,
            "category": "ST",
            "tribe_community": "Santhal",
            "state": "Odisha",
            "district": "Mayurbhanj",
            "pincode": "757001",
        }
        create_prof_res = client.post("/api/applicant/profile", json=create_prof_payload, headers=headers_a)
        assert create_prof_res.status_code in [200, 201], f"Profile creation failed: {create_prof_res.text}"
        prof_data = create_prof_res.json()
        assert prof_data["father_or_husband_name"] == "Father Alpha"
        assert prof_data["state"] == "Odisha"
        assert prof_data["district"] == "Mayurbhanj"
        print(f"  [OK] Applicant A profile created successfully. Masked Aadhaar: {prof_data['aadhaar_masked']}")

        print("\n[PHASE 2.1] Fetching saved profile for Applicant A...")
        get_prof_a = client.get("/api/applicant/profile", headers=headers_a)
        assert get_prof_a.status_code == 200
        assert get_prof_a.json()["father_or_husband_name"] == "Father Alpha"
        assert get_prof_a.json()["district"] == "Mayurbhanj"
        print("  [OK] Profile retrieved accurately matches Applicant A data.")

        print("\n[PHASE 2.2] Applicant A creates an application dossier...")
        app_payload = {
            "scheme_id": "NFST",
            "personal_details": {
                "full_name": "Applicant Alpha",
                "father_or_husband_name": "Father Alpha",
                "gender": "MALE",
                "dob": "2001-05-15",
                "aadhaar_masked": "XXXX-XXXX-1234",
                "category": "ST",
                "tribe_community": "Santhal",
                "mobile": "9876543210",
                "email": email_a,
                "state": "Odisha",
                "district": "Mayurbhanj",
                "pincode": "757001",
            },
            "academic_details": {
                "current_course": "M.Phil / Ph.D in Tribal Studies",
                "institution_name": "North Orissa University",
                "institution_state": "Odisha",
                "aishe_code": "U-0356",
                "roll_number": "NOU/ST/2026/01",
                "year_of_study": "1st Year",
                "previous_exam_name": "Master of Arts",
                "previous_exam_percentage": 78.5,
                "passing_year": "2024",
                "board_or_university": "North Orissa University",
            },
            "financial_details": {
                "annual_family_income": 120000,
                "bank_name": "Punjab National Bank",
                "account_holder_name": "Applicant Alpha",
                "account_number_masked": "XXXXXXXX1234",
                "ifsc_code": "PUNB0123400",
                "branch_name": "Baripada Main",
                "is_aadhaar_seeded": True,
            },
            "documents": [],
            "status": "SUBMITTED",
        }
        app_res = client.post("/api/applications", json=app_payload, headers=headers_a)
        assert app_res.status_code in [200, 201], f"Application submission failed: {app_res.text}"
        app_id_a = app_res.json()["application_id"]
        print(f"  [OK] Application created: ID={app_id_a}")

        print("\n[PHASE 2.3] Applicant A uploads a statutory document...")
        cert_text = (
            "GOVERNMENT OF ODISHA\n"
            "OFFICE OF THE TAHSILDAR, BARIPADA, MAYURBHANJ\n"
            "SCHEDULED TRIBE CERTIFICATE\n"
            "Certificate No: OD/ST/2026/099\n"
            "This is to certify that Applicant Alpha son of Father Alpha of Mayurbhanj "
            "belongs to Santhal Community recognized as Scheduled Tribe."
        )
        import pypdf
        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=612, height=792)
        writer.add_metadata({"/Producer": "Government of Odisha", "/Title": "Certificate", "/Subject": cert_text})
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

        dummy_pdf = io.BytesIO(pdf_bytes)
        upload_res = client.post(
            "/api/documents/upload",
            headers=headers_a,
            data={"application_id": app_id_a, "document_type": "ST_CERTIFICATE"},
            files={"file": ("alpha_st_certificate.pdf", dummy_pdf, "application/pdf")},
        )
        assert upload_res.status_code in [200, 201], f"Document upload failed: {upload_res.text}"
        print("  [OK] Document uploaded successfully.")

        print("\n[PHASE 2.4] Verifying Applicant A reusable documents now includes the certificate...")
        docs_a_after = client.get("/api/applicant/documents/reusable", headers=headers_a)
        assert docs_a_after.status_code == 200
        reusable_a_list = docs_a_after.json()
        assert len(reusable_a_list) >= 1
        assert any(d["document_type"] == "ST_CERTIFICATE" for d in reusable_a_list)
        print(f"  [OK] Applicant A reusable documents found: {len(reusable_a_list)} doc(s)")

        # =========================================================================
        # PHASE 3: NEW APPLICANT B REGISTRATION & DATA ISOLATION VERIFICATION
        # =========================================================================
        print("\n[PHASE 3] Registering completely separate New Applicant B...")
        reg_b = client.post(
            "/api/auth/register",
            json={
                "name": "Applicant Beta",
                "email": email_b,
                "phone": f"92{uuid.uuid4().int % 100000000:08d}",
                "password": password,
            },
        )
        assert reg_b.status_code in [200, 201], f"Applicant B registration failed: {reg_b.text}"
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}
        user_b_id = reg_b.json()["user"]["id"]
        print(f"  [OK] Applicant B registered: ID={user_b_id}, Email={email_b}")

        print("\n[PHASE 3.1] [CRITICAL] Verifying Applicant B gets 404 for Profile (CANNOT see User A profile)...")
        prof_b_res = client.get("/api/applicant/profile", headers=headers_b)
        assert prof_b_res.status_code == 404, (
            f"SECURITY BREACH: Applicant B retrieved a profile when none was created! Status={prof_b_res.status_code}, Body={prof_b_res.text}"
        )
        print("  [PASS] GET /api/applicant/profile for User B returned 404 (Zero cross-user leakage).")

        print("\n[PHASE 3.2] [CRITICAL] Verifying Applicant B reusable documents is EMPTY (CANNOT see User A documents)...")
        docs_b_res = client.get("/api/applicant/documents/reusable", headers=headers_b)
        assert docs_b_res.status_code == 200
        reusable_b = docs_b_res.json()
        assert reusable_b == [], (
            f"SECURITY BREACH: Applicant B sees Applicant A's reusable documents! Reusable={reusable_b}"
        )
        print("  [PASS] GET /api/applicant/documents/reusable for User B returned [] (Zero cross-user leakage).")

        print("\n[PHASE 3.3] [CRITICAL] Verifying Applicant B cannot see User A's applications...")
        apps_b_res = client.get("/api/applications/my", headers=headers_b)
        assert apps_b_res.status_code == 200
        assert apps_b_res.json() == [], (
            f"SECURITY BREACH: Applicant B sees Applicant A's application! Apps={apps_b_res.json()}"
        )
        print("  [PASS] GET /api/applications/my for User B returned [] (Zero cross-user leakage).")

        print("\n[PHASE 3.4] [CRITICAL] Verifying Applicant B cannot access Applicant A's application directly...")
        direct_access_res = client.get(f"/api/applications/{app_id_a}", headers=headers_b)
        assert direct_access_res.status_code in [403, 404], (
            f"SECURITY BREACH: User B accessed User A application directly! Status={direct_access_res.status_code}"
        )
        print(f"  [PASS] Direct cross-user access rejected with HTTP {direct_access_res.status_code}.")

        # =========================================================================
        # PHASE 4: RETURNING APPLICANT A AUTO-FILL INTEGRITY
        # =========================================================================
        print("\n[PHASE 4] Verifying Returning Applicant A receives their own saved profile...")
        recheck_a = client.get("/api/applicant/profile", headers=headers_a)
        assert recheck_a.status_code == 200
        assert recheck_a.json()["father_or_husband_name"] == "Father Alpha"
        assert recheck_a.json()["state"] == "Odisha"
        print("  [PASS] Applicant A receives their own saved profile intact.")

    print("\n=======================================================")
    print("ALL APPLICANT ISOLATION TESTS PASSED WITH ZERO LEAKAGE!")
    print("=======================================================")


if __name__ == "__main__":
    test_applicant_profile_isolation()
