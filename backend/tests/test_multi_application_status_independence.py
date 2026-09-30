import pytest
import uuid
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.mongodb import db_manager
from app.core.security import create_access_token

@pytest.mark.asyncio
async def test_multi_application_status_independence():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Connect to DB
        connected = False
        try:
            connected = await db_manager.init_connection()
        except Exception:
            connected = False

        if not connected or db_manager.db is None:
            from mongomock_motor import AsyncMongoMockClient
            mock_client = AsyncMongoMockClient()
            db_manager.client = mock_client
            db_manager.db = mock_client["tsfms"]
            db_manager.is_connected = True
            from app.database.mongodb import get_database
            app.dependency_overrides[get_database] = lambda: db_manager.db
        db = db_manager.db
        assert db is not None, "MongoDB instance must be active"

        # Unique IDs for test
        test_uid_1 = f"usr_test_{uuid.uuid4().hex[:8]}"
        test_uid_2 = f"usr_test_{uuid.uuid4().hex[:8]}"
        applicant_id_1 = "ST-2026-000123"
        applicant_id_2 = f"ST-2026-{uuid.uuid4().hex[:6].upper()}"

        app_id_a = f"APP-TEST-A-{uuid.uuid4().hex[:6].upper()}"
        app_id_b = f"APP-TEST-B-{uuid.uuid4().hex[:6].upper()}"

        now = datetime.now(timezone.utc)

        # 1. Setup User 1 (Applicant 1)
        user_1 = {
            "_id": test_uid_1,
            "name": "Dharanesh Beneficiary",
            "email": f"applicant1_{uuid.uuid4().hex[:6]}@mota.gov.in",
            "phone": "9876543210",
            "role": "APPLICANT",
            "applicant_id": applicant_id_1,
            "created_at": now
        }
        await db["users"].insert_one(user_1)

        # 2. Setup Profile 1 (Profile must NOT contain application status)
        profile_1 = {
            "_id": f"prof_{test_uid_1}",
            "user_id": test_uid_1,
            "applicant_id": applicant_id_1,
            "full_name": "Dharanesh Beneficiary",
            "phone": "9876543210",
            "email": user_1["email"],
            "category": "ST",
            "tribe_community": "Santhal",
            "state": "Odisha",
            "district": "Mayurbhanj",
            "pincode": "757001",
            "created_at": now,
            "updated_at": now
        }
        await db["applicant_profiles"].insert_one(profile_1)

        # 3. Setup User 2 (Applicant 2 - for cross-user isolation test)
        user_2 = {
            "_id": test_uid_2,
            "name": "Different Citizen",
            "email": f"applicant2_{uuid.uuid4().hex[:6]}@mota.gov.in",
            "phone": "9876543211",
            "role": "APPLICANT",
            "applicant_id": applicant_id_2,
            "created_at": now
        }
        await db["users"].insert_one(user_2)

        # Create JWT Tokens
        token_user_1 = create_access_token({"sub": test_uid_1, "role": "APPLICANT"})
        token_user_2 = create_access_token({"sub": test_uid_2, "role": "APPLICANT"})
        headers_1 = {"Authorization": f"Bearer {token_user_1}"}
        headers_2 = {"Authorization": f"Bearer {token_user_2}"}

        # Setup Officer user
        officer_uid = f"off_{uuid.uuid4().hex[:6]}"
        user_officer = {
            "_id": officer_uid,
            "name": "Verification Officer",
            "email": f"officer_{uuid.uuid4().hex[:6]}@mota.gov.in",
            "phone": "9999988888",
            "role": "OFFICER",
            "created_at": now
        }
        await db["users"].insert_one(user_officer)
        token_officer = create_access_token({"sub": officer_uid, "role": "OFFICER"})
        headers_officer = {"Authorization": f"Bearer {token_officer}"}

        # 4. Insert Application A (Scheme A: NFST, Status: APPROVED)
        app_doc_a = {
            "_id": app_id_a,
            "application_id": app_id_a,
            "applicant_id": applicant_id_1,
            "user_id": test_uid_1,
            "scheme_id": "NFST",
            "scheme_name": "National Fellowship for ST Students",
            "status": "APPROVED",
            "current_step": 8,
            "personal_details": {"full_name": "Dharanesh Beneficiary", "category": "ST"},
            "documents": [
                {"id": f"doc_a_{uuid.uuid4().hex[:4]}", "document_code": "ST_CERTIFICATE", "status": "VERIFIED"}
            ],
            "has_deficiency": False,
            "created_at": now,
            "updated_at": now
        }
        await db["applications"].insert_one(app_doc_a)

        # 5. Insert Application B (Scheme B: NOS, Status: REJECTED)
        app_doc_b = {
            "_id": app_id_b,
            "application_id": app_id_b,
            "applicant_id": applicant_id_1,
            "user_id": test_uid_1,
            "scheme_id": "NOS",
            "scheme_name": "National Overseas Scholarship",
            "status": "REJECTED",
            "rejection_reason": "Statutory qualification criteria not met.",
            "current_step": 8,
            "personal_details": {"full_name": "Dharanesh Beneficiary", "category": "ST"},
            "documents": [
                {"id": f"doc_b_{uuid.uuid4().hex[:4]}", "document_code": "INCOME_CERTIFICATE", "status": "REJECTED"}
            ],
            "has_deficiency": False,
            "created_at": now,
            "updated_at": now
        }
        await db["applications"].insert_one(app_doc_b)

        try:
            # ================================================================
            # VERIFICATION 1: SINGLE SOURCE OF TRUTH (tsfms.applications)
            # ================================================================
            stored_a = await db["applications"].find_one({"_id": app_id_a})
            stored_b = await db["applications"].find_one({"_id": app_id_b})
            stored_prof = await db["applicant_profiles"].find_one({"user_id": test_uid_1})

            assert stored_a["status"] == "APPROVED", "Application A status must be APPROVED"
            assert stored_b["status"] == "REJECTED", "Application B status must be REJECTED"
            assert stored_a["applicant_id"] == applicant_id_1
            assert stored_b["applicant_id"] == applicant_id_1
            assert "status" not in stored_prof, "applicant_profiles must NOT store application status"

            # ================================================================
            # VERIFICATION 2: TRACKING API RETURNS BOTH WITH INDEPENDENT STATUS
            # ================================================================
            track_res = await client.get("/api/applications/tracking", headers=headers_1)
            assert track_res.status_code == 200, f"Tracking failed: {track_res.text}"
            track_data = track_res.json()

            assert track_data["applicant_id"] == applicant_id_1
            apps_tracked = {a["application_id"]: a for a in track_data["applications"]}

            assert app_id_a in apps_tracked, f"Application {app_id_a} missing in tracking"
            assert app_id_b in apps_tracked, f"Application {app_id_b} missing in tracking"
            assert apps_tracked[app_id_a]["status"] == "APPROVED"
            assert apps_tracked[app_id_b]["status"] == "REJECTED"

            # Check /applications/my as well
            my_res = await client.get("/api/applications/my", headers=headers_1)
            assert my_res.status_code == 200
            my_apps = {a["application_id"]: a for a in my_res.json()}
            assert my_apps[app_id_a]["status"] == "APPROVED"
            assert my_apps[app_id_b]["status"] == "REJECTED"

            # ================================================================
            # VERIFICATION 3: CHANGE APPLICATION B FROM REJECTED -> RESUBMITTED
            # ================================================================
            update_b_res = await client.patch(
                f"/api/applications/{app_id_b}/status",
                headers=headers_1,
                json={"status": "RESUBMITTED", "remarks": "Updated supporting qualification proof."}
            )
            assert update_b_res.status_code == 200, f"Updating B failed: {update_b_res.text}"
            assert update_b_res.json()["status"] == "RESUBMITTED"

            # VERIFY APPLICATION A MUST NOT CHANGE!
            stored_a_after = await db["applications"].find_one({"_id": app_id_a})
            stored_b_after = await db["applications"].find_one({"_id": app_id_b})
            assert stored_a_after["status"] == "APPROVED", "CRITICAL: Application A must remain APPROVED!"
            assert stored_b_after["status"] == "RESUBMITTED", "Application B must be RESUBMITTED"

            # Verify via Tracking API
            track_res_2 = await client.get("/api/applications/tracking", headers=headers_1)
            apps_tracked_2 = {a["application_id"]: a for a in track_res_2.json()["applications"]}
            assert apps_tracked_2[app_id_a]["status"] == "APPROVED", "Tracking: App A must be APPROVED"
            assert apps_tracked_2[app_id_b]["status"] == "RESUBMITTED", "Tracking: App B must be RESUBMITTED"

            # ================================================================
            # VERIFICATION 4: CHANGE APPLICATION A FROM APPROVED -> SELECTION
            # ================================================================
            update_a_res = await client.patch(
                f"/api/admin/applications/{app_id_a}/status",
                headers=headers_officer,
                json={"status": "SELECTION", "remarks": "Re-evaluating quota slots."}
            )
            assert update_a_res.status_code == 200, f"Updating A failed: {update_a_res.text}"
            assert update_a_res.json()["status"] == "SELECTION"

            # VERIFY APPLICATION B MUST NOT CHANGE!
            stored_a_after_2 = await db["applications"].find_one({"_id": app_id_a})
            stored_b_after_2 = await db["applications"].find_one({"_id": app_id_b})
            assert stored_a_after_2["status"] == "SELECTION", "Application A must be SELECTION"
            assert stored_b_after_2["status"] == "RESUBMITTED", "CRITICAL: Application B must remain RESUBMITTED!"

            # ================================================================
            # VERIFICATION 5: AUDIT LOGS ARE APPLICATION-SPECIFIC
            # ================================================================
            logs_cursor = db["audit_logs"].find({"$or": [{"applicationId": app_id_a}, {"applicationId": app_id_b}]})
            audit_logs = await logs_cursor.to_list(length=50)

            for log in audit_logs:
                assert log.get("applicationId") in [app_id_a, app_id_b]
                assert log.get("applicantId") == applicant_id_1

            logs_a = [l for l in audit_logs if l.get("applicationId") == app_id_a]
            logs_b = [l for l in audit_logs if l.get("applicationId") == app_id_b]

            assert any(l.get("newStatus") == "SELECTION" for l in logs_a)
            assert not any(l.get("newStatus") == "SELECTION" for l in logs_b), "App A status must not leak into App B audit logs"
            assert any(l.get("newStatus") == "RESUBMITTED" for l in logs_b)
            assert not any(l.get("newStatus") == "RESUBMITTED" for l in logs_a), "App B status must not leak into App A audit logs"

            # ================================================================
            # VERIFICATION 6: NOTIFICATIONS ARE APPLICATION-SPECIFIC
            # ================================================================
            notifs_cursor = db["notifications"].find({"user_id": test_uid_1})
            notifs = await notifs_cursor.to_list(length=50)

            notifs_a = [n for n in notifs if n.get("application_id") == app_id_a]
            notifs_b = [n for n in notifs if n.get("application_id") == app_id_b]

            assert len(notifs_a) > 0, "Application A notifications must exist"
            assert len(notifs_b) > 0, "Application B notifications must exist"
            assert any(app_id_a in n.get("message", "") for n in notifs_a)
            assert any(app_id_b in n.get("message", "") for n in notifs_b)

            # ================================================================
            # VERIFICATION 7: CROSS-USER SECURITY
            # ================================================================
            # Applicant 2 should NOT be able to view Applicant 1's application
            hacker_get = await client.get(f"/api/applications/{app_id_a}", headers=headers_2)
            assert hacker_get.status_code == 403, f"Expected 403 Forbidden for cross-user get, got {hacker_get.status_code}"

            # Applicant 2 should NOT be able to update Applicant 1's application
            hacker_put = await client.put(
                f"/api/applications/{app_id_a}",
                headers=headers_2,
                json={"status": "RESUBMITTED"}
            )
            assert hacker_put.status_code == 403, f"Expected 403 Forbidden for cross-user put, got {hacker_put.status_code}"

            hacker_patch = await client.patch(
                f"/api/applications/{app_id_a}/status",
                headers=headers_2,
                json={"status": "RESUBMITTED"}
            )
            assert hacker_patch.status_code == 403, f"Expected 403 Forbidden for cross-user patch, got {hacker_patch.status_code}"

        finally:
            # Clean up test documents
            await db["applications"].delete_many({"_id": {"$in": [app_id_a, app_id_b]}})
            await db["users"].delete_many({"_id": {"$in": [test_uid_1, test_uid_2]}})
            await db["applicant_profiles"].delete_many({"user_id": {"$in": [test_uid_1, test_uid_2]}})
            await db["audit_logs"].delete_many({"applicationId": {"$in": [app_id_a, app_id_b]}})
            await db["notifications"].delete_many({"user_id": test_uid_1})
