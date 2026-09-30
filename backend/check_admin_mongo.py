import asyncio
import sys
from pathlib import Path
from datetime import datetime, timezone
import bcrypt

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.core.config import settings
from app.database.mongodb import db_manager
from app.core.security import hash_password

async def inspect_mongo_and_admin():
    print(f"Connecting to MongoDB Atlas...")
    print(f"Configured Database: {settings.MONGO_DB_NAME}")
    assert settings.MONGO_DB_NAME == "tsfms", f"Database must be tsfms, but found: {settings.MONGO_DB_NAME}"
    
    connected = await db_manager.init_connection()
    if not connected or db_manager.db is None:
        print("[FAIL] Could not connect to MongoDB Atlas.")
        sys.exit(1)
        
    db = db_manager.db
    print("[SUCCESS] Successfully connected to MongoDB Atlas.")
    
    # Check collections
    collections = await db.list_collection_names()
    print(f"Collections found in '{settings.MONGO_DB_NAME}': {collections}")
    
    # Query users collection for admin or officer users
    cursor = db["users"].find({})
    all_users = await cursor.to_list(100)
    print(f"Total users in tsfms.users: {len(all_users)}")
    
    admin_users = []
    for u in all_users:
        role = u.get("role", "")
        # Safe info only
        user_info = {
            "user_id": str(u.get("_id")),
            "email": u.get("email"),
            "role": role,
            "is_active": u.get("is_active", True),
            "created_at": str(u.get("created_at"))
        }
        if str(role).upper() in ["ADMIN", "OFFICER"]:
            admin_users.append(user_info)
            
    print(f"Admin/Officer users found: {len(admin_users)}")
    for au in admin_users:
        print(f"  - User ID: {au['user_id']} | Email: {au['email']} | Role: {au['role']} | Active: {au['is_active']}")
        
    # Check if target dev admin account exists: admin@gmail.com
    target_admin = await db["users"].find_one({"email": "admin@gmail.com"})
    if target_admin:
        print(f"\n[FOUND] Admin user 'admin@gmail.com' already exists.")
        print(f"  User ID: {target_admin.get('_id')}")
        print(f"  Role: {target_admin.get('role')}")
        print(f"  Active: {target_admin.get('is_active')}")
    else:
        print(f"\n[NOT FOUND] 'admin@gmail.com' does not exist yet. Creating dev admin account...")
        hashed = hash_password("admin@2026")
        admin_id = "USR-ADMIN-0001"
        now = datetime.now(timezone.utc)
        doc = {
            "_id": admin_id,
            "name": "MoTA System Administrator",
            "email": "admin@gmail.com",
            "phone": "9999999999",
            "hashed_password": hashed,
            "role": "ADMIN",
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
        res = await db["users"].insert_one(doc)
        print(f"[CREATED] Dev admin account created in tsfms.users with ID: {res.inserted_id}")
        
    # Verify target admin can be authenticated
    verified_admin = await db["users"].find_one({"email": "admin@gmail.com"})
    assert verified_admin is not None, "Failed to verify admin account in tsfms.users"
    print(f"[VERIFIED] Dev admin account successfully verified in MongoDB Atlas (tsfms.users).")
    print(f"  - User ID: {verified_admin.get('_id')}")
    print(f"  - Email: {verified_admin.get('email')}")
    print(f"  - Role: {verified_admin.get('role')}")
    print(f"  - Status: {'Active' if verified_admin.get('is_active') else 'Inactive'}")

    db_manager.close()

if __name__ == "__main__":
    asyncio.run(inspect_mongo_and_admin())
