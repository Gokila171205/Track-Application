import json
import urllib.request
import urllib.error
import time

BASE_URL = "http://127.0.0.1:8000/api"

def make_request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    encoded_data = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"Error {e.code} on {method} {path}: {err_body}")
        raise

def run_tests():
    print("=== STARTING BACKEND FOUNDATION API VERIFICATION ===")
    
    # 1. Health checks
    print("\n--- 3 & 4. Checking Health Probes ---")
    health = make_request("/health")
    print(f"Health Probe: {health}")
    assert health.get("status") == "ok"
    
    db_health = make_request("/health/db")
    print(f"Database Health Probe: {db_health}")
    assert db_health.get("status") == "connected"

    # 2. Registration
    print("\n--- 7. Testing Registration ---")
    unique_suffix = int(time.time()) % 100000
    test_email = f"sunil.soren.{unique_suffix}@gov.in"
    test_phone = f"95{unique_suffix:08d}"
    test_pwd = "SecurePassword@123"
    reg_payload = {
        "name": "Sunil Soren",
        "email": test_email,
        "phone": test_phone,
        "password": test_pwd
    }
    try:
        reg_res = make_request("/auth/register", method="POST", data=reg_payload)
        token = reg_res["access_token"]
        print(f"Registered user: {reg_res['user']['name']} ({reg_res['user']['email']})")
    except urllib.error.HTTPError as e:
        if e.code in (400, 409):
            print("User already exists from previous run, proceeding to login...")
            login_payload = {
                "email": test_email,
                "password": test_pwd
            }
            login_res = make_request("/auth/login", method="POST", data=login_payload)
            token = login_res["access_token"]
        else:
            raise

    # 3. Login
    print("\n--- 8. Testing Login and /auth/me ---")
    login_payload = {
        "email": test_email,
        "password": test_pwd
    }
    login_res = make_request("/auth/login", method="POST", data=login_payload)
    token = login_res["access_token"]
    print(f"Login success! Access token type: {login_res['token_type']}")
    
    me = make_request("/auth/me", method="GET", token=token)
    print(f"GET /auth/me -> Name: {me['name']}, Email: {me['email']}, Role: {me['role']}")
    assert me["role"] == "APPLICANT"

    # 4. Schemes retrieval
    print("\n--- 9. Testing Scheme Retrieval ---")
    schemes = make_request("/schemes")
    print(f"Total schemes retrieved: {len(schemes)}")
    assert len(schemes) >= 6
    for s in schemes:
        print(f"  - [{s['code']}] {s['name']}")
    
    first_scheme_code = schemes[0]["code"]
    single_scheme = make_request(f"/schemes/{first_scheme_code}")
    print(f"Single scheme retrieved: {single_scheme['name']} (Category: {single_scheme['category']})")

    # 5. Application creation
    print("\n--- 10. Testing Application Creation ---")
    app_payload = {
        "scheme_id": first_scheme_code,
        "personal_details": {
            "full_name": "Sunil Soren",
            "father_or_husband_name": "Late Birsa Soren",
            "gender": "MALE",
            "dob": "2001-05-15",
            "aadhaar_masked": "XXXX-XXXX-8912",
            "category": "ST",
            "tribe_community": "Santhal",
            "mobile": "9876543210",
            "email": "sunil.soren.test@gov.in",
            "state": "Jharkhand",
            "district": "Ranchi",
            "pincode": "834001"
        },
        "academic_details": {
            "current_course": "Ph.D. in Tribal Heritage & Linguistics",
            "institution_name": "Central University of Jharkhand",
            "institution_state": "Jharkhand",
            "aishe_code": "U-0245",
            "roll_number": "CUJ/2024/ST/042",
            "year_of_study": "1st Year",
            "previous_exam_name": "Master of Arts (Anthropology)",
            "previous_exam_percentage": 82.5,
            "passing_year": "2023",
            "board_or_university": "Ranchi University"
        },
        "financial_details": {
            "annual_family_income": 180000,
            "bank_name": "State Bank of India",
            "account_holder_name": "Sunil Soren",
            "account_number_masked": "XXXXXX789012",
            "ifsc_code": "SBIN0001234",
            "branch_name": "Main Branch Ranchi",
            "is_aadhaar_seeded": True
        },
        "documents": []
    }
    created_app = make_request("/applications", method="POST", data=app_payload, token=token)
    app_id = created_app["application_id"]
    print(f"Application created successfully! App ID: {app_id}, Status: {created_app['status']}")
    assert created_app["status"] == "SUBMITTED"

    # 6. Application retrieval
    print("\n--- 11. Testing Application Retrieval ---")
    my_apps = make_request("/applications/my", method="GET", token=token)
    print(f"Applicant has {len(my_apps)} application(s) filed.")
    assert len(my_apps) >= 1
    
    single_app = make_request(f"/applications/{app_id}", method="GET", token=token)
    print(f"GET /applications/{app_id} -> Status: {single_app['status']}, Applicant: {single_app['personal_details']['full_name']}")
    assert single_app["application_id"] == app_id

    # 7. Grievance creation
    print("\n--- 12. Testing Grievance Creation & Retrieval ---")
    grievance_payload = {
        "application_id": app_id,
        "scheme_name": single_scheme["name"],
        "category": "DOCUMENT_DEFICIENCY",
        "subject": "ST Community Certificate Verification Status",
        "description": "Seeking clarification regarding ST community certificate verification timeline from Tehsildar office."
    }
    created_grievance = make_request("/grievances", method="POST", data=grievance_payload, token=token)
    grievance_id = created_grievance["grievance_id"]
    print(f"Grievance filed! ID: {grievance_id}, Status: {created_grievance['status']}")
    assert created_grievance["status"] == "SUBMITTED"

    my_grievances = make_request("/grievances/my", method="GET", token=token)
    print(f"Applicant has {len(my_grievances)} grievance(s).")
    assert len(my_grievances) >= 1

    print("\n==================================================")
    print("ALL API VERIFICATION CHECKS PASSED WITH ZERO ERRORS!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
