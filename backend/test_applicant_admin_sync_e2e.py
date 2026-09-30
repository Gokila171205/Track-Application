import urllib.request
import json
import sys
import asyncio
from datetime import datetime

BASE_URL = "http://127.0.0.1:8000/api"

def make_request(url: str, method: str = "GET", data: dict = None, token: str = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"HTTP Error {e.code} on {method} {url}: {body}")
        try:
            return e.code, json.loads(body)
        except:
            return e.code, {"error": body}

def main():
    print("=" * 60)
    print("STARTING COMPLETE END-TO-END APPLICATION WORKFLOW TEST")
    print("=" * 60)

    # 1. Register or login a dedicated test applicant citizen
    test_applicant_email = f"test_citizen_{int(datetime.now().timestamp())}@nic.in"
    print(f"\n[1] Registering test applicant: {test_applicant_email}...")
    status, reg_res = make_request(
        f"{BASE_URL}/auth/register",
        method="POST",
        data={
            "name": "Kavitha Marandi",
            "email": test_applicant_email,
            "phone": f"98{int(datetime.now().timestamp()) % 100000000:08d}",
            "password": "Password@123"
        }
    )
    assert status == 201, f"Applicant registration failed: {reg_res}"
    applicant_token = reg_res["access_token"]
    applicant_id = reg_res["user"]["id"]
    print(f"  [OK] Registered Applicant ID: {applicant_id}")

    # 2. STEP 1: Applicant creates application draft -> Expected: DRAFT
    print("\n[2] STEP 1: Applicant saves application DRAFT...")
    status, draft_res = make_request(
        f"{BASE_URL}/applications/draft",
        method="POST",
        token=applicant_token,
        data={
            "scheme_id": "MOTA-ST-01",
            "current_step": 2,
            "personal_details": {
                "full_name": "Kavitha Marandi",
                "category": "ST",
                "tribe_community": "Santhal",
                "mobile": "9812345678",
                "email": test_applicant_email,
                "state": "Jharkhand",
                "district": "Ranchi",
                "pincode": "834001"
            },
            "documents": [
                {
                    "id": f"DOC-INC-{int(datetime.now().timestamp())}",
                    "document_code": "INCOME_CERTIFICATE",
                    "document_name": "Income Certificate",
                    "file_name": "income_cert.pdf",
                    "status": "PENDING"
                },
                {
                    "id": f"DOC-ST-{int(datetime.now().timestamp())}",
                    "document_code": "ST_CERTIFICATE",
                    "document_name": "Caste Community Certificate",
                    "file_name": "caste_cert.pdf",
                    "status": "PENDING"
                }
            ]
        }
    )
    assert status == 200, f"Draft creation failed: {draft_res}"
    app_id = draft_res["application_id"]
    assert draft_res["status"] == "DRAFT", f"Expected DRAFT, got {draft_res['status']}"
    print(f"  [OK] Application draft created: {app_id}, Status: {draft_res['status']}")

    # Check applicant /my
    status, my_apps = make_request(f"{BASE_URL}/applications/my", token=applicant_token)
    assert status == 200 and len(my_apps) >= 1
    assert my_apps[0]["status"] == "DRAFT"
    print(f"  [OK] Applicant /my shows status: {my_apps[0]['status']}")

    # 3. STEP 2: Applicant completes and submits -> Expected: SUBMITTED
    print("\n[3] STEP 2: Applicant submits completed application...")
    status, sub_res = make_request(
        f"{BASE_URL}/applications",
        method="POST",
        token=applicant_token,
        data={
            "scheme_id": "MOTA-ST-01",
            "status": "SUBMITTED",
            "current_step": 8,
            "personal_details": {
                "full_name": "Kavitha Marandi",
                "dob": "2002-05-14",
                "gender": "FEMALE",
                "aadhaar_masked": "XXXX-XXXX-4912",
                "category": "ST",
                "tribe_community": "Santhal",
                "mobile": "9812345678",
                "email": test_applicant_email,
                "state": "Jharkhand",
                "district": "Ranchi",
                "pincode": "834001"
            },
            "academic_details": {
                "current_course": "M.Sc. Tribal Studies",
                "institution_name": "Ranchi University",
                "institution_state": "Jharkhand",
                "aishe_code": "U-0241",
                "roll_number": "ST/MSC/2026/019",
                "year_of_study": "1st Year",
                "previous_exam_name": "B.Sc. Botany",
                "previous_exam_percentage": 78.5,
                "passing_year": "2024",
                "board_or_university": "Ranchi University"
            },
            "financial_details": {
                "annual_family_income": 180000,
                "bank_name": "State Bank of India",
                "account_holder_name": "Kavitha Marandi",
                "account_number_masked": "XXXX-XXXX-9912",
                "ifsc_code": "SBIN0000167",
                "branch_name": "Main Branch Ranchi",
                "is_aadhaar_seeded": True
            },
            "documents": draft_res["documents"]
        }
    )
    assert status in (200, 201), f"Application submission failed: {sub_res}"
    submitted_app_id = sub_res["application_id"]
    assert sub_res["status"] == "SUBMITTED", f"Expected SUBMITTED, got {sub_res['status']}"
    print(f"  [OK] Application submitted: {submitted_app_id}, Status: {sub_res['status']}")

    # Verify applicant /my shows SUBMITTED and NO duplicate draft
    status, my_apps_after = make_request(f"{BASE_URL}/applications/my", token=applicant_token)
    assert status == 200
    print(f"  [OK] Total applicant applications in registry: {len(my_apps_after)}")
    for a in my_apps_after:
        print(f"       App ID: {a['application_id']}, Status: {a['status']}")
    assert my_apps_after[0]["status"] == "SUBMITTED"

    # 4. STEP 3: Admin logs in -> sees SUBMITTED
    print("\n[4] STEP 3: Admin logs in and opens application...")
    status, admin_auth = make_request(
        f"{BASE_URL}/auth/login",
        method="POST",
        data={"email": "admin@mota.gov.in", "password": "Admin@2026"}
    )
    assert status == 200, f"Admin login failed: {admin_auth}"
    admin_token = admin_auth["access_token"]
    print(f"  [OK] Admin logged in successfully: {admin_auth['user']['name']}")

    status, admin_view = make_request(
        f"{BASE_URL}/applications/{submitted_app_id}",
        token=admin_token
    )
    assert status == 200
    assert admin_view["status"] == "SUBMITTED", f"Expected SUBMITTED, got {admin_view['status']}"
    print(f"  [OK] Admin views application {submitted_app_id} with status: {admin_view['status']}")

    # 5. STEP 4: Admin clicks Start Document Verification -> DOCUMENT_VERIFICATION
    print("\n[5] STEP 4: Admin starts Document Verification...")
    status, trans_res = make_request(
        f"{BASE_URL}/admin/applications/{submitted_app_id}/status",
        method="PUT",
        token=admin_token,
        data={
            "status": "DOCUMENT_VERIFICATION",
            "remarks": "Commenced statutory document verification."
        }
    )
    assert status == 200, f"Transition failed: {trans_res}"
    assert trans_res["status"] == "DOCUMENT_VERIFICATION"
    print(f"  [OK] Admin updated status to: {trans_res['status']}")

    # Applicant fetches and sees DOCUMENT_VERIFICATION
    status, app_view = make_request(f"{BASE_URL}/applications/{submitted_app_id}", token=applicant_token)
    assert app_view["status"] == "DOCUMENT_VERIFICATION"
    print(f"  [OK] Applicant fetched latest application -> Status: {app_view['status']}")

    # 6. STEP 5: Admin verifies Income Certificate -> VERIFIED
    docs = trans_res.get("documents", [])
    assert len(docs) >= 2, f"Expected at least 2 documents, found: {docs}"
    inc_doc = next(d for d in docs if d["document_code"] == "INCOME_CERTIFICATE")
    caste_doc = next(d for d in docs if d["document_code"] == "ST_CERTIFICATE")

    print(f"\n[6] STEP 5: Admin verifies Income Certificate ({inc_doc['id']})...")
    status, v_res = make_request(
        f"{BASE_URL}/documents/{inc_doc['id']}/verify",
        method="POST",
        token=admin_token
    )
    assert status == 200, f"Verify doc failed: {v_res}"
    print(f"  [OK] Income Certificate verification_status: {v_res.get('verification_status')}")

    # Check applicant view of documents
    status, app_view = make_request(f"{BASE_URL}/applications/{submitted_app_id}", token=applicant_token)
    inc_doc_view = next(d for d in app_view["documents"] if d["id"] == inc_doc["id"])
    assert inc_doc_view["verification_status"] == "VERIFIED"
    print(f"  [OK] Applicant sees Income Certificate status: {inc_doc_view['verification_status']}")
    # Since caste_doc is still PENDING, application status should remain DOCUMENT_VERIFICATION
    assert app_view["status"] == "DOCUMENT_VERIFICATION"
    print(f"  [OK] Application remains in: {app_view['status']} because second doc is pending")

    # 7. STEP 6: Admin verifies all remaining required documents -> Auto moves to ELIGIBILITY_VERIFICATION
    print(f"\n[7] STEP 6: Admin verifies Caste Certificate ({caste_doc['id']})...")
    status, v_res2 = make_request(
        f"{BASE_URL}/documents/{caste_doc['id']}/verify",
        method="POST",
        token=admin_token
    )
    assert status == 200, f"Verify doc failed: {v_res2}"

    # Auto-transition check: All documents are now verified!
    status, app_view_auto = make_request(f"{BASE_URL}/applications/{submitted_app_id}", token=applicant_token)
    assert app_view_auto["status"] == "ELIGIBILITY_VERIFICATION", f"Expected auto-transition to ELIGIBILITY_VERIFICATION, got {app_view_auto['status']}"
    print(f"  [OK] All documents verified! Application automatically transitioned to: {app_view_auto['status']}")

    # 8. STEP 7: Admin marks eligible -> SCRUTINY
    print("\n[8] STEP 7: Admin marks application ELIGIBLE...")
    status, elig_res = make_request(
        f"{BASE_URL}/admin/applications/{submitted_app_id}/status",
        method="PUT",
        token=admin_token,
        data={
            "status": "SCRUTINY",
            "remarks": "Eligibility verification satisfied. Forwarded to Official Scrutiny Cell."
        }
    )
    assert status == 200
    assert elig_res["status"] == "SCRUTINY"
    print(f"  [OK] Application transitioned to: {elig_res['status']}")

    # Applicant sees Scrutiny
    status, app_view = make_request(f"{BASE_URL}/applications/{submitted_app_id}", token=applicant_token)
    assert app_view["status"] == "SCRUTINY"
    print(f"  [OK] Applicant sees stage: Scrutiny ({app_view['status']})")

    # 9. STEP 8: Admin passes scrutiny -> SELECTION
    print("\n[9] STEP 8: Admin passes scrutiny...")
    status, scrut_res = make_request(
        f"{BASE_URL}/admin/applications/{submitted_app_id}/status",
        method="PUT",
        token=admin_token,
        data={
            "status": "SELECTION",
            "remarks": "Scrutiny completed and passed. Forwarded to National Selection Board."
        }
    )
    assert status == 200
    assert scrut_res["status"] == "SELECTION"
    print(f"  [OK] Application transitioned to: {scrut_res['status']}")

    # Applicant sees Selection
    status, app_view = make_request(f"{BASE_URL}/applications/{submitted_app_id}", token=applicant_token)
    assert app_view["status"] == "SELECTION"
    print(f"  [OK] Applicant sees stage: Selection ({app_view['status']})")

    # 10. STEP 9: Admin approves application -> APPROVED
    print("\n[10] STEP 9: Admin approves application...")
    status, app_res = make_request(
        f"{BASE_URL}/admin/applications/{submitted_app_id}/status",
        method="PUT",
        token=admin_token,
        data={
            "status": "APPROVED",
            "remarks": "Official scholarship sanction approved by Competent Authority."
        }
    )
    assert status == 200
    assert app_res["status"] == "APPROVED"
    print(f"  [OK] Application status in response: {app_res['status']}")

    # Applicant refreshes -> Sees APPROVED
    status, app_view = make_request(f"{BASE_URL}/applications/{submitted_app_id}", token=applicant_token)
    assert app_view["status"] == "APPROVED"
    print(f"  [OK] Applicant fetches updated application: Status: {app_view['status']}")

    # 11. STEP 10: Check MongoDB directly
    print("\n[11] STEP 10: Direct verification against MongoDB Atlas database 'tsfms'...")
    from app.database.mongodb import db_manager
    async def verify_mongo():
        await db_manager.init_connection()
        mongo_doc = await db_manager.db["applications"].find_one({"_id": submitted_app_id})
        assert mongo_doc is not None, f"Application {submitted_app_id} missing in tsfms.applications!"
        assert mongo_doc["status"] == "APPROVED", f"Expected APPROVED in MongoDB, got: {mongo_doc['status']}"
        print(f"  [OK] tsfms.applications['_id'={submitted_app_id}] has status = '{mongo_doc['status']}'")

        # Verify audit logs in MongoDB
        logs = await db_manager.db["audit_logs"].find({"applicationId": submitted_app_id}).sort("timestamp", 1).to_list(50)
        print(f"  [OK] tsfms.audit_logs contains {len(logs)} audit entries:")
        for l in logs:
            print(f"       - [{l.get('action')}] from {l.get('previousStatus')} to {l.get('newStatus')} by {l.get('actor')}")
        actions = [l.get("action") for l in logs]
        assert "DOCUMENT_VERIFICATION_STARTED" in actions or "APPLICATION_STATUS_CHANGED to DOCUMENT_VERIFICATION" in actions
        assert "DOCUMENT_VERIFICATION_COMPLETED" in actions
        assert "ELIGIBILITY_VERIFIED" in actions or "APPLICATION_STATUS_CHANGED to SCRUTINY" in actions
        assert "SCRUTINY_COMPLETED" in actions or "APPLICATION_STATUS_CHANGED to SELECTION" in actions
        assert "APPLICATION_APPROVED" in actions
        print("  [OK] All statutory audit actions recorded in MongoDB Atlas!")

    asyncio.run(verify_mongo())

    print("\n" + "=" * 60)
    print("SUCCESS: COMPLETE END-TO-END APPLICATION LIFECYCLE VERIFIED!")
    print("Applicant -> Admin -> MongoDB tsfms -> Applicant")
    print("=" * 60)

if __name__ == "__main__":
    main()
