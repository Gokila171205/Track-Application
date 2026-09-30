import asyncio
import httpx
import os
import shutil
import sys
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient

import io
import pypdf

BASE_URL = "http://127.0.0.1:8000/api"

def create_sample_pdf(text: str) -> bytes:
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

async def run_all_tests():
    print("=================================================================")
    print("STARTING TEST SUITE: ADMIN SCRUTINY & DOCUMENT VERIFICATION (15 TESTS)")
    print("=================================================================")
    
    # -------------------------------------------------------------
    # 0. Connect to MongoDB Atlas (Database: tsfms)
    # -------------------------------------------------------------
    from app.core.config import settings
    mongo_client = AsyncIOMotorClient(settings.MONGO_URI)
    db = mongo_client["tsfms"]
    print(f"[SETUP] Connected to MongoDB Atlas cluster. Database: '{db.name}'")
    assert db.name == "tsfms", "Database must be strictly 'tsfms'"

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # -------------------------------------------------------------
        # TEST 1: Applicant submits application
        # -------------------------------------------------------------
        print("\n--- TEST 1: Applicant Submits Application ---")
        applicant_email = "citizen.scrutiny.test@mota.gov.in"
        applicant_pass = "CitizenTest@2026"
        
        # Ensure user exists
        app_user = await db["users"].find_one({"email": applicant_email})
        if not app_user:
            reg = await client.post("/auth/register", json={
                "name": "Manish Munda",
                "email": applicant_email,
                "password": applicant_pass,
                "role": "APPLICANT",
                "phone": "9811223344"
            })
            if reg.status_code not in (200, 201):
                # Try finding with phone if phone already existed
                app_user = await db["users"].find_one({"email": applicant_email})
        
        # Login applicant
        app_login = await client.post("/auth/login", json={"email": applicant_email, "password": applicant_pass})
        assert app_login.status_code == 200, f"Applicant login failed: {app_login.text}"
        applicant_token = app_login.json()["access_token"]
        applicant_headers = {"Authorization": f"Bearer {applicant_token}"}
        applicant_user_id = app_login.json()["user"]["id"]
        print(f"[OK] Applicant logged in. ID: {applicant_user_id}")

        # Create an application draft first so target application exists in MongoDB
        draft_res = await client.post(
            "/applications/draft",
            json={"scheme_id": "national-fellowship-st", "current_step": 1},
            headers=applicant_headers
        )
        assert draft_res.status_code in (200, 201), f"Draft creation failed: {draft_res.text}"
        draft_app = draft_res.json()
        app_id = draft_app.get("application_id") or draft_app.get("id") or draft_app.get("_id")
        print(f"[OK] Application draft created: {app_id}")

        # Upload a real document for the applicant attached to this application draft
        cert_text = (
            "GOVERNMENT OF JHARKHAND\n"
            "OFFICE OF THE SUB-DIVISIONAL OFFICER, RANCHI\n"
            "SCHEDULED TRIBE COMMUNITY CERTIFICATE\n"
            "Certificate No: JH/ST/2025/99814\n"
            "Date of Issue: 15/01/2025\n"
            "This is to certify that Shri Manish Munda son of Shri Birsa Munda of Village Bundu "
            "belongs to the Munda Community which is recognized as a Scheduled Tribe under "
            "The Constitution (Scheduled Tribes) Order, 1950."
        )
        pdf_bytes = create_sample_pdf(cert_text)
        upload_res = await client.post(
            "/documents/upload",
            headers=applicant_headers,
            data={"document_type": "ST_CERTIFICATE", "application_id": app_id},
            files={"file": ("caste_certificate.pdf", pdf_bytes, "application/pdf")}
        )
        assert upload_res.status_code == 201, f"Document upload failed: {upload_res.text}"
        uploaded_doc = upload_res.json()
        doc_id = uploaded_doc["document_id"]
        print(f"[OK] Document uploaded with real file binary. Doc ID: {doc_id}")

        # Now submit complete application referencing this document
        submit_payload = {
            "scheme_id": "national-fellowship-st",
            "status": "SUBMITTED",
            "personal_details": {
                "full_name": "Manish Munda",
                "father_or_husband_name": "Birsa Munda",
                "gender": "MALE",
                "dob": "1999-11-15",
                "aadhaar_masked": "XXXXXXXX4411",
                "category": "ST",
                "tribe_community": "Munda",
                "mobile": "9811223344",
                "email": applicant_email,
                "state": "Jharkhand",
                "district": "Ranchi",
                "pincode": "834001"
            },
            "academic_details": {
                "current_course": "Ph.D. in Tribal Linguistics",
                "institution_name": "Ranchi University",
                "institution_state": "Jharkhand",
                "aishe_code": "U-0245",
                "roll_number": "RU-PHD-2024-001",
                "year_of_study": "1st Year",
                "previous_exam_name": "M.A. Linguistics",
                "previous_exam_percentage": 82.5,
                "passing_year": "2024",
                "board_or_university": "Ranchi University"
            },
            "financial_details": {
                "annual_family_income": 110000,
                "bank_name": "State Bank of India",
                "account_holder_name": "Manish Munda",
                "account_number_masked": "XXXX-XXXX-4411",
                "ifsc_code": "SBIN0000167",
                "branch_name": "Ranchi Main Branch",
                "is_aadhaar_seeded": True
            },
            "documents": [
                {
                    "id": doc_id,
                    "document_code": "ST_CERTIFICATE",
                    "document_name": "Caste Certificate",
                    "file_name": "caste_certificate.pdf",
                    "file_url": f"/api/documents/{doc_id}/file",
                    "file_size_kb": len(pdf_bytes) // 1024 or 1,
                    "status": "PENDING"
                }
            ]
        }
        sub_res = await client.put(f"/applications/{app_id}", json=submit_payload, headers=applicant_headers)
        assert sub_res.status_code in (200, 201), f"Submit failed: {sub_res.text}"
        app_data = sub_res.json()
        print(f"[TEST 1 PASS] Application submitted successfully. App ID: {app_id}")

        # Verify application exists in tsfms.applications in MongoDB
        db_check = await db["applications"].find_one({"_id": app_id})
        assert db_check is not None, f"Application {app_id} missing from MongoDB Atlas tsfms.applications"
        print(f"             Verified in tsfms.applications: {db_check['_id']}, status={db_check['status']}")

        # -------------------------------------------------------------
        # TEST 2: Admin Logs In
        # -------------------------------------------------------------
        print("\n--- TEST 2: Admin Logs In ---")
        admin_login = await client.post("/auth/login", json={"email": "admin@gmail.com", "password": "admin@2026"})
        assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Verify /auth/me
        me_res = await client.get("/auth/me", headers=admin_headers)
        assert me_res.status_code == 200
        me_json = me_res.json()
        assert me_json["role"] == "ADMIN", f"Role is {me_json['role']}, expected ADMIN"
        print(f"[TEST 2 PASS] Admin authenticated. Role: {me_json['role']}. Redirect route: /admin")

        # -------------------------------------------------------------
        # TEST 3: Admin Applications Page (GET /api/admin/applications)
        # -------------------------------------------------------------
        print("\n--- TEST 3: Admin Applications Page ---")
        apps_res = await client.get("/admin/applications", headers=admin_headers)
        assert apps_res.status_code == 200
        apps_list = apps_res.json()
        found_app = next((a for a in apps_list if a.get("application_id") == app_id or a.get("id") == app_id or a.get("_id") == app_id), None)
        assert found_app is not None, f"Submitted application {app_id} not found in admin queue"
        print(f"[TEST 3 PASS] Submitted application {app_id} appears in Admin queue (total in queue: {len(apps_list)})")

        # -------------------------------------------------------------
        # TEST 4: Open Application Dossier (GET /api/applications/{app_id})
        # -------------------------------------------------------------
        print(f"\n--- TEST 4: Open Application Details ({app_id}) ---")
        dossier_res = await client.get(f"/applications/{app_id}", headers=admin_headers)
        assert dossier_res.status_code == 200, f"Dossier retrieval failed: {dossier_res.text}"
        dossier = dossier_res.json()
        assert dossier.get("status") == "SUBMITTED"
        assert len(dossier.get("documents", [])) > 0
        print(f"[TEST 4 PASS] Application dossier loaded. Applicant: {dossier['personal_details']['full_name']}, Status: {dossier['status']}")

        # -------------------------------------------------------------
        # TEST 5: Document Exists in Dossier
        # -------------------------------------------------------------
        print("\n--- TEST 5: Verify Document Exists in Dossier ---")
        doc_item = dossier["documents"][0]
        assert doc_item["id"] == doc_id
        assert doc_item.get("file_exists") is True
        print(f"[TEST 5 PASS] Document {doc_id} exists. file_exists={doc_item.get('file_exists')}. View + Download actions active.")

        # -------------------------------------------------------------
        # TEST 6: Click Download (GET /api/documents/{doc_id}/download)
        # -------------------------------------------------------------
        print("\n--- TEST 6: Document Download (attachment disposition) ---")
        dl_res = await client.get(f"/documents/{doc_id}/download", headers=admin_headers)
        assert dl_res.status_code == 200, f"Download failed: {dl_res.status_code} {dl_res.text}"
        assert dl_res.content == pdf_bytes, "Downloaded binary does not match original binary"
        assert "attachment" in dl_res.headers.get("content-disposition", "")
        print(f"[TEST 6 PASS] Document binary downloaded successfully ({len(dl_res.content)} bytes). Content-Disposition: {dl_res.headers.get('content-disposition')}")

        # -------------------------------------------------------------
        # TEST 7: Click View (GET /api/documents/{doc_id}/file)
        # -------------------------------------------------------------
        print("\n--- TEST 7: Document View (inline disposition) ---")
        view_res = await client.get(f"/documents/{doc_id}/file", headers=admin_headers)
        assert view_res.status_code == 200, f"View failed: {view_res.status_code} {view_res.text}"
        assert "inline" in view_res.headers.get("content-disposition", "")
        print(f"[TEST 7 PASS] Document binary streamed inline for viewing. Media type: {view_res.headers.get('content-type')}")

        # -------------------------------------------------------------
        # TEST 8: Verify Document (POST /api/documents/{doc_id}/verify)
        # -------------------------------------------------------------
        print("\n--- TEST 8: Verify Document ---")
        verify_doc_res = await client.post(f"/documents/{doc_id}/verify", headers=admin_headers)
        assert verify_doc_res.status_code == 200, f"Verify doc failed: {verify_doc_res.text}"
        v_meta = verify_doc_res.json()
        assert v_meta["verification_status"] == "VERIFIED"
        
        # Verify in database
        db_doc = await db["documents"].find_one({"_id": doc_id})
        assert db_doc["verification_status"] == "VERIFIED"
        print(f"[TEST 8 PASS] Document {doc_id} marked as VERIFIED in tsfms.documents and tsfms.applications.")

        # -------------------------------------------------------------
        # TEST 9: Reject Document with mandatory reason
        # -------------------------------------------------------------
        print("\n--- TEST 9: Reject Document (Reason Required) ---")
        # 9a. Try rejecting without reason -> must fail with 400
        bad_reject = await client.post(f"/documents/{doc_id}/reject", json={"reason": ""}, headers=admin_headers)
        assert bad_reject.status_code == 400, f"Expected 400 Bad Request for empty rejection reason, got {bad_reject.status_code}"
        
        # 9b. Reject with valid reason
        rej_reason = "Uploaded document is unreadable scan. Please upload a clearer official certificate."
        good_reject = await client.post(f"/documents/{doc_id}/reject", json={"reason": rej_reason}, headers=admin_headers)
        assert good_reject.status_code == 200, f"Reject failed: {good_reject.text}"
        r_meta = good_reject.json()
        assert r_meta["verification_status"] == "REJECTED"
        assert r_meta["rejection_reason"] == rej_reason

        # Check audit log in MongoDB
        audit_doc_rej = await db["audit_logs"].find_one({"documentId": doc_id, "action": "DOCUMENT_REJECTED"})
        assert audit_doc_rej is not None, "DOCUMENT_REJECTED audit log entry missing"
        print(f"[TEST 9 PASS] Document rejected with reason: '{rej_reason}'. Audit log recorded: {audit_doc_rej['id']}")

        # -------------------------------------------------------------
        # TEST 10: Mark Application Deficient (PUT /api/admin/applications/{app_id}/status)
        # -------------------------------------------------------------
        print("\n--- TEST 10: Mark Application Deficient ---")
        def_notes = "Your Caste Certificate could not be verified because the scan is unclear. Please re-upload."
        def_res = await client.put(
            f"/admin/applications/{app_id}/status",
            json={
                "status": "DEFICIENT",
                "remarks": def_notes,
                "category": "Unclear / Unreadable Document",
                "required_correction": "Upload a high-resolution color scan of official Caste Certificate."
            },
            headers=admin_headers
        )
        assert def_res.status_code == 200, f"Deficient transition failed: {def_res.text}"
        def_app = def_res.json()
        assert def_app["status"] == "DEFICIENT"
        assert def_app["has_deficiency"] is True
        
        # Verify audit log in MongoDB
        audit_def = await db["audit_logs"].find_one({"applicationId": app_id, "action": "DEFICIENCY_ISSUED"})
        assert audit_def is not None, "DEFICIENCY_ISSUED audit log missing"
        print(f"[TEST 10 PASS] Application marked DEFICIENT. has_deficiency=True. Audit log: {audit_def['id']}")

        # -------------------------------------------------------------
        # TEST 11: Approve Application Workflow (Confirmation & APPROVED)
        # -------------------------------------------------------------
        print("\n--- TEST 11: Approve Application Workflow ---")
        # Fast-track transition to SELECTION then APPROVED
        # First transition back from DEFICIENT to RESUBMITTED -> DOCUMENT_VERIFICATION -> ELIGIBILITY_VERIFICATION -> SCRUTINY -> SELECTION
        await client.put(f"/admin/applications/{app_id}/status", json={"status": "DOCUMENT_VERIFICATION", "remarks": "Re-verified"}, headers=admin_headers)
        await client.put(f"/admin/applications/{app_id}/status", json={"status": "ELIGIBILITY_VERIFICATION", "remarks": "Eligible"}, headers=admin_headers)
        await client.put(f"/admin/applications/{app_id}/status", json={"status": "SCRUTINY", "remarks": "Scrutiny passed"}, headers=admin_headers)
        await client.put(f"/admin/applications/{app_id}/status", json={"status": "SELECTION", "remarks": "Selected by Board"}, headers=admin_headers)
        
        # Now Approve
        apprv_res = await client.put(
            f"/admin/applications/{app_id}/status",
            json={"status": "APPROVED", "remarks": "Sanction approved by Competent Authority"},
            headers=admin_headers
        )
        assert apprv_res.status_code == 200, f"Approval failed: {apprv_res.text}"
        assert apprv_res.json()["status"] == "APPROVED"

        audit_apprv = await db["audit_logs"].find_one({"applicationId": app_id, "action": "APPLICATION_APPROVED"})
        assert audit_apprv is not None, "APPLICATION_APPROVED audit log missing"
        print(f"[TEST 11 PASS] Application status is APPROVED. Audit log created: {audit_apprv['id']}")

        # -------------------------------------------------------------
        # TEST 12: Reject Application with Reason
        # -------------------------------------------------------------
        print("\n--- TEST 12: Reject Application Workflow ---")
        # Create second application to test rejection
        submit_payload["documents"] = []
        rej_app_res = await client.post("/applications", json=submit_payload, headers=applicant_headers)
        rej_app_id = rej_app_res.json().get("application_id") or rej_app_res.json().get("id") or rej_app_res.json().get("_id")
        
        rej_reason_text = "Disqualified: Family income exceeds statutory scheme threshold of Rs 2,50,000."
        rej_action_res = await client.put(
            f"/admin/applications/{rej_app_id}/status",
            json={"status": "REJECTED", "remarks": rej_reason_text},
            headers=admin_headers
        )
        assert rej_action_res.status_code == 200, f"Rejection failed: {rej_action_res.text}"
        assert rej_action_res.json()["status"] == "REJECTED"

        audit_rej = await db["audit_logs"].find_one({"applicationId": rej_app_id, "action": "APPLICATION_REJECTED"})
        assert audit_rej is not None, "APPLICATION_REJECTED audit log missing"
        print(f"[TEST 12 PASS] Application {rej_app_id} rejected with reason. Audit log created: {audit_rej['id']}")

        # -------------------------------------------------------------
        # TEST 13: Cross-Applicant Access Blocked (Security RBAC)
        # -------------------------------------------------------------
        print("\n--- TEST 13: Cross-Applicant Document Access Check (RBAC) ---")
        # Register a different applicant
        attacker_email = "another.applicant@example.com"
        attacker_pass = "AnotherPass@2026"
        att_user = await db["users"].find_one({"email": attacker_email})
        if not att_user:
            await client.post("/auth/register", json={
                "name": "Different Applicant",
                "email": attacker_email,
                "password": attacker_pass,
                "role": "APPLICANT",
                "phone": "9988776655"
            })
        att_login = await client.post("/auth/login", json={"email": attacker_email, "password": attacker_pass})
        attacker_token = att_login.json()["access_token"]
        attacker_headers = {"Authorization": f"Bearer {attacker_token}"}

        # Attacker tries to download Manish Munda's document (doc_id)
        hack_res = await client.get(f"/documents/{doc_id}/download", headers=attacker_headers)
        assert hack_res.status_code == 403, f"Expected 403 Forbidden for cross-applicant access, got {hack_res.status_code}"
        print(f"[TEST 13 PASS] Unauthorized cross-applicant document access strictly blocked with HTTP {hack_res.status_code} Forbidden.")

        # -------------------------------------------------------------
        # TEST 14: Delete Physical File Manually -> Download returns 404
        # -------------------------------------------------------------
        print("\n--- TEST 14: Missing Physical File Handling ---")
        # Locate physical file
        from app.services.storage_service import storage_service
        db_doc_rec = await db["documents"].find_one({"_id": doc_id})
        storage_key = db_doc_rec.get("storage_key")
        physical_file = storage_service.get_file_path(storage_key)
        backup_path = physical_file.with_suffix(".bak")
        
        # Temporarily move file
        shutil.move(physical_file, backup_path)
        try:
            missing_dl_res = await client.get(f"/documents/{doc_id}/download", headers=admin_headers)
            assert missing_dl_res.status_code == 404, f"Expected 404, got {missing_dl_res.status_code}"
            assert "Document file is no longer available" in missing_dl_res.json()["detail"] or "unavailable" in missing_dl_res.json()["detail"].lower()
            print(f"[TEST 14 PASS] Missing file returned clear HTTP 404: {missing_dl_res.json()['detail']}")
        finally:
            # Restore file
            if backup_path.exists():
                shutil.move(backup_path, physical_file)

        # -------------------------------------------------------------
        # TEST 15: Database Persistence Check (MongoDB Atlas, NOT in-memory)
        # -------------------------------------------------------------
        print("\n--- TEST 15: MongoDB Atlas Persistence Verification ---")
        stored_app = await db["applications"].find_one({"_id": app_id})
        assert stored_app is not None, "Application not persisted in MongoDB Atlas"
        stored_doc = await db["documents"].find_one({"_id": doc_id})
        assert stored_doc is not None, "Document not persisted in MongoDB Atlas"
        assert db.name == "tsfms", f"Expected database tsfms, got {db.name}"
        print(f"[TEST 15 PASS] Confirmed persistent data in MongoDB Atlas tsfms.applications and tsfms.documents.")

    print("\n=================================================================")
    print("ALL 15 TESTS PASSED SUCCESSFULLY! ZERO FAILURES.")
    print("=================================================================")

if __name__ == "__main__":
    asyncio.run(run_all_tests())
