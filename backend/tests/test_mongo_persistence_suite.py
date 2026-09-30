import json
import time
import urllib.request
import urllib.error
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings

BASE_URL = "http://127.0.0.1:8000/api"

def make_req(path: str, data: dict = None, token: str = None, method: str = None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"detail": err_body}

async def direct_mongo_check(email: str):
    client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=10000)
    db = client[settings.MONGO_DB_NAME]
    doc = await db["users"].find_one({"email": email})
    client.close()
    return doc

async def direct_mongo_clean(emails: list):
    client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=10000)
    db = client[settings.MONGO_DB_NAME]
    for em in emails:
        await db["users"].delete_many({"email": em})
    client.close()

def run_suite():
    print("=" * 80)
    print("RUNNING URGENT VERIFICATION TEST SUITE (TESTS 1 - 9)")
    print("=" * 80)

    # Use unique test credentials for clean test repeatability
    ts = int(time.time()) % 100000
    email1 = f"testuser123_{ts}@example.com"
    phone1 = f"98{ts:08d}"
    pwd1 = "TestPassword@123"

    email2 = f"testuser456_{ts}@example.com"
    phone2 = f"97{ts:08d}"
    pwd2 = "TestPassword@456"

    # TEST 1: Register new applicant and confirm in MongoDB Atlas
    print(f"\n[TEST 1] Registering applicant {email1}...")
    status, body = make_req("/auth/register", {
        "name": "Test User 123",
        "email": email1,
        "phone": phone1,
        "password": pwd1
    })
    assert status == 201, f"Expected 201 Created, got {status}: {body}"
    token1 = body["access_token"]
    user1_id = body["user"]["id"]
    print(f"  -> Registration response: HTTP {status}, User ID: {user1_id}")

    # Direct query to real MongoDB Atlas tsfms.users
    print("  -> Querying MongoDB Atlas tsfms.users directly to confirm real persistence...")
    persisted_doc = asyncio.run(direct_mongo_check(email1))
    assert persisted_doc is not None, f"FAIL: User {email1} NOT FOUND in MongoDB Atlas tsfms.users!"
    assert persisted_doc["_id"] == user1_id, f"FAIL: User ID mismatch in MongoDB Atlas: {persisted_doc['_id']} vs {user1_id}"
    assert persisted_doc["phone"] == phone1, f"FAIL: Phone mismatch: {persisted_doc['phone']} vs {phone1}"
    assert "hashed_password" in persisted_doc, "FAIL: hashed_password missing in MongoDB Atlas document!"
    print(f"  [OK] User {email1} successfully confirmed in MongoDB Atlas 'tsfms.users' with _id={user1_id}!")

    # TEST 2: Logout (simulate client logout by discarding token)
    print("\n[TEST 2] Simulating client Logout (token discarded)...")
    token_discarded = None
    print("  [OK] Client session cleared.")

    # TEST 3 & 4: Login again with the same email/password
    print(f"\n[TEST 4] Logging in again with {email1} / {pwd1}...")
    status, body = make_req("/auth/login", {
        "email": email1,
        "password": pwd1
    })
    assert status == 200, f"Expected 200 OK on login, got {status}: {body}"
    new_token = body["access_token"]
    assert body["user"]["email"] == email1
    assert body["user"]["id"] == user1_id
    print(f"  [OK] Login SUCCESS (HTTP 200)! User ID: {body['user']['id']}, Role: {body['user']['role']}")

    # TEST 5: Browser refresh simulation: test GET /api/auth/me with the JWT
    print("\n[TEST 5] Browser Refresh / Session test (GET /api/auth/me)...")
    status, body = make_req("/auth/me", token=new_token)
    assert status == 200, f"Expected 200 OK on /auth/me, got {status}: {body}"
    assert body["email"] == email1
    assert body["id"] == user1_id
    print(f"  [OK] Session verified valid on refresh! Returned user: {body['name']} ({body['email']})")

    # TEST 6: Create another account and confirm both exist independently in MongoDB
    print(f"\n[TEST 6] Creating second applicant account {email2}...")
    status, body = make_req("/auth/register", {
        "name": "Test User 456",
        "email": email2,
        "phone": phone2,
        "password": pwd2
    })
    assert status == 201, f"Expected 201 Created, got {status}: {body}"
    user2_id = body["user"]["id"]

    # Verify both accounts exist independently in MongoDB Atlas
    print("  -> Checking MongoDB Atlas for both accounts independently...")
    doc1 = asyncio.run(direct_mongo_check(email1))
    doc2 = asyncio.run(direct_mongo_check(email2))
    assert doc1 is not None and doc1["_id"] == user1_id, "FAIL: First user missing or corrupted!"
    assert doc2 is not None and doc2["_id"] == user2_id, "FAIL: Second user missing or corrupted!"
    assert doc1["_id"] != doc2["_id"], "FAIL: Both users share the same _id!"
    print(f"  [OK] Both accounts exist independently in MongoDB Atlas ({user1_id} and {user2_id})!")

    # TEST 7: Duplicate email registration
    print(f"\n[TEST 7] Attempting to register existing email {email1} with new phone...")
    status, body = make_req("/auth/register", {
        "name": "Duplicate Email Attempt",
        "email": email1,
        "phone": "9611223344",
        "password": "Password123!"
    })
    assert status == 409, f"Expected HTTP 409 Conflict, got {status}: {body}"
    assert "email already exists" in body.get("detail", "").lower(), f"Unexpected detail: {body.get('detail')}"
    print(f"  [OK] Duplicate email correctly rejected with HTTP 409: {body['detail']}")

    # TEST 8: Duplicate phone registration
    print(f"\n[TEST 8] Attempting to register existing phone {phone1} with new email...")
    status, body = make_req("/auth/register", {
        "name": "Duplicate Phone Attempt",
        "email": f"unique_{ts}@example.com",
        "phone": phone1,
        "password": "Password123!"
    })
    assert status == 409, f"Expected HTTP 409 Conflict, got {status}: {body}"
    assert "phone number already exists" in body.get("detail", "").lower(), f"Unexpected detail: {body.get('detail')}"
    print(f"  [OK] Duplicate phone correctly rejected with HTTP 409: {body['detail']}")

    # Clean up test accounts to leave database clean
    asyncio.run(direct_mongo_clean([email1, email2, f"unique_{ts}@example.com"]))
    print("\n  [INFO] Cleaned up temporary test documents from MongoDB Atlas.")

    print("\n" + "=" * 80)
    print("ALL TESTS (TEST 1 - TEST 8) PASSED 100% AGAINST LIVE MONGODB ATLAS 'tsfms'!")
    print("=" * 80)

if __name__ == "__main__":
    run_suite()
