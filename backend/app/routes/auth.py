import uuid
import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError
from app.database.mongodb import get_database
from app.core.security import hash_password, verify_password, create_access_token, get_current_user_payload
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse, UserRole
from app.services.identity_validator import validate_phone, normalize_phone

logger = logging.getLogger("tsfms.auth")
router = APIRouter(prefix="/auth", tags=["Authentication"])

async def ensure_user_indexes(db: AsyncIOMotorDatabase):
    """
    Ensure database-level unique indexes on users collection for email and phone numbers.
    Phone is mandatory in the User schema; enforces a standard unique index.
    Upgrades any legacy sparse phone index to standard unique index automatically.
    """
    try:
        # Enforce unique index on email
        await db["users"].create_index("email", unique=True)

        # Check existing indexes on users to cleanly upgrade legacy sparse phone index if present
        existing_indexes = await db["users"].list_indexes().to_list(100)
        for idx in existing_indexes:
            if idx.get("name") == "phone_1" and idx.get("sparse") is True:
                logger.info("Migrating legacy sparse phone index to standard unique index...")
                await db["users"].drop_index("phone_1")
                break

        # Enforce unique index on phone
        await db["users"].create_index("phone", unique=True)
        logger.info("Database unique indexes verified on 'users' collection: email (unique), phone (unique).")
    except Exception as e:
        logger.error("Failed ensuring unique indexes on 'users' collection: %s", str(e))

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister, db: AsyncIOMotorDatabase = Depends(get_database)):
    """
    Register a new applicant citizen with hashed credentials.
    Enforces strict email and phone normalization, application-level uniqueness,
    and database-level duplicate-key race condition handling (HTTP 409).
    Never stores plain-text passwords.
    """
    # 1. Format validation FIRST before querying MongoDB
    clean_phone = validate_phone(user_in.phone)

    clean_email = (user_in.email or "").strip().lower()
    if not clean_email or "@" not in clean_email or "." not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "field": "email",
                "code": "EMAIL_INVALID_FORMAT",
                "message": "A valid email address is required."
            }
        )

    # 2. Application-level duplicate checks for friendly, specific duplicate messaging
    existing_email = await db["users"].find_one({"email": clean_email})
    existing_phone = await db["users"].find_one({"phone": clean_phone})

    if existing_email and existing_phone:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "both",
                "code": "BOTH_DUPLICATE",
                "message": "Both this email and phone number are already registered.",
                "errors": [
                    {"field": "email", "code": "EMAIL_DUPLICATE", "message": "An account with this email already exists."},
                    {"field": "phone", "code": "PHONE_DUPLICATE", "message": "This phone number is already registered."}
                ]
            }
        )
    elif existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "email",
                "code": "EMAIL_DUPLICATE",
                "message": "An account with this email already exists."
            }
        )
    elif existing_phone:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "phone",
                "code": "PHONE_DUPLICATE",
                "message": "This phone number is already registered."
            }
        )

    # Securely hash password using bcrypt
    hashed_pwd = hash_password(user_in.password)
    user_id = "USR-" + uuid.uuid4().hex[:8].upper()
    now = datetime.now(timezone.utc)

    user_doc = {
        "_id": user_id,
        "name": user_in.name.strip(),
        "email": clean_email,
        "phone": clean_phone,
        "hashed_password": hashed_pwd,
        "role": user_in.role.value if user_in.role else UserRole.APPLICANT.value,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }

    try:
        insert_result = await db["users"].insert_one(user_doc)
        if not insert_result.acknowledged or not insert_result.inserted_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist user registration in MongoDB database."
            )
    except DuplicateKeyError as dke:
        # Robust inspection of keyPattern and string representation
        key_pattern = getattr(dke, "details", {}).get("keyPattern", {}) if hasattr(dke, "details") and isinstance(dke.details, dict) else {}
        err_msg = str(dke).lower()
        if "phone" in key_pattern or "phone" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "field": "phone",
                    "code": "PHONE_DUPLICATE",
                    "message": "This phone number is already registered."
                }
            )
        elif "email" in key_pattern or "email" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "field": "email",
                    "code": "EMAIL_DUPLICATE",
                    "message": "An account with this email already exists."
                }
            )
        elif "aadhaar" in key_pattern or "aadhaar" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "field": "aadhaar",
                    "code": "AADHAAR_DUPLICATE",
                    "message": "This Aadhaar number is already registered."
                }
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "unknown",
                "code": "DUPLICATE_KEY",
                "message": "A record with this identifier already exists."
            }
        )

    # Immediately query MongoDB tsfms.users using the registered email to confirm persistence
    persisted_user = await db["users"].find_one({"email": clean_email})
    if not persisted_user or not persisted_user.get("_id"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration verification failed: user could not be verified in MongoDB."
        )

    # Generate JWT access token
    access_token = create_access_token(data={
        "sub": user_id,
        "email": user_doc["email"],
        "role": user_doc["role"],
        "name": user_doc["name"]
    })

    user_response = UserResponse(
        id=user_id,
        name=user_doc["name"],
        email=user_doc["email"],
        phone=user_doc["phone"],
        role=UserRole(user_doc["role"]),
        created_at=user_doc["created_at"],
        is_active=user_doc["is_active"]
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncIOMotorDatabase = Depends(get_database)):
    """
    Authenticate citizen credentials and issue JWT access token.
    Uses identical email normalization (strip and lower).
    """
    clean_email = credentials.email.strip().lower()
    user = await db["users"].find_one({"email": clean_email})
    if not user or not verify_password(credentials.password, user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please verify your credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Citizen account is currently deactivated. Contact helpdesk."
        )

    access_token = create_access_token(data={
        "sub": user["_id"],
        "email": user["email"],
        "role": user["role"],
        "name": user["name"]
    })

    user_response = UserResponse(
        id=user["_id"],
        name=user["name"],
        email=user["email"],
        phone=user.get("phone", ""),
        role=UserRole(user.get("role", UserRole.APPLICANT.value)),
        created_at=user.get("created_at", datetime.now(timezone.utc)),
        is_active=user.get("is_active", True)
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )

@router.get("/me", response_model=UserResponse)
async def get_me(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieve profile details of the authenticated citizen / officer.
    """
    user_id = payload.get("sub")
    user = await db["users"].find_one({"_id": user_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found."
        )

    return UserResponse(
        id=user["_id"],
        name=user["name"],
        email=user["email"],
        phone=user.get("phone", ""),
        role=UserRole(user.get("role", UserRole.APPLICANT.value)),
        created_at=user.get("created_at", datetime.now(timezone.utc)),
        is_active=user.get("is_active", True)
    )

class CheckAvailabilityRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None

@router.post("/check-availability")
async def check_availability(req: CheckAvailabilityRequest, db: AsyncIOMotorDatabase = Depends(get_database)):
    """
    Real-time field level validation for applicant registration.
    Returns 5-point explainable error if format is invalid or duplicate exists.
    """
    from app.services.explainable_validator import validate_phone_explainable, validate_email_explainable
    
    if req.email:
        clean_email = req.email.strip().lower()
        format_issue = validate_email_explainable(clean_email)
        if format_issue:
            return {"available": False, "issue": format_issue}
        existing = await db["users"].find_one({"email": clean_email})
        if existing:
            duplicate_issue = validate_email_explainable(clean_email, is_registered_check=True)
            return {"available": False, "issue": duplicate_issue}

    if req.phone is not None:
        raw_p = str(req.phone).strip()
        format_issue = validate_phone_explainable(raw_p)
        if format_issue:
            return {"available": False, "issue": format_issue}
        # Format passed strictly (10 numeric digits). Now check MongoDB uniqueness.
        existing = await db["users"].find_one({"phone": raw_p})
        if existing:
            duplicate_issue = validate_phone_explainable(raw_p, is_registered_check=True)
            return {"available": False, "issue": duplicate_issue}

    return {"available": True, "issue": None}

