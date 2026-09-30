from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

class UserRole(str, Enum):
    APPLICANT = "APPLICANT"
    OFFICER = "OFFICER"
    ADMIN = "ADMIN"

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, example="Sunita Soren")
    email: EmailStr = Field(..., example="sunita.soren@research.du.ac.in")
    phone: str = Field(default="", example="9845120394")
    password: str = Field(..., min_length=6, max_length=128, example="SecurePass@2026")
    role: Optional[UserRole] = Field(default=UserRole.APPLICANT)

class UserLogin(BaseModel):
    email: EmailStr = Field(..., example="sunita.soren@research.du.ac.in")
    password: str = Field(..., example="SecurePass@2026")

class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: str
    role: UserRole
    created_at: datetime
    is_active: bool = True

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
