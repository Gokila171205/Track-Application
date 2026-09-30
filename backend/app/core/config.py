import os
import sys
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Explicitly load .env from backend directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    load_dotenv()

class Settings:
    PROJECT_NAME: str = "MoTA TSFMS - Scholarship & Fellowship Management System"
    API_V1_STR: str = "/api"
    
    # MongoDB Config
    MONGO_URI: str = os.getenv("MONGO_URI", "").strip()
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "tsfms").strip()
    
    # JWT Security Config
    JWT_SECRET: str = os.getenv("JWT_SECRET", "").strip()
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256").strip()
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # CORS
    CORS_ORIGINS_RAW: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:3000,http://127.0.0.1:3000,http://[::1]:5173").strip()
    
    @property
    def cors_origins(self) -> List[str]:
        configured = [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]
        defaults = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:5173"]
        return list(dict.fromkeys(configured + defaults))

    def validate_config(self) -> None:
        """
        Validate critical configuration parameters.
        Fails with a clear, informative error message instead of an opaque crash.
        """
        if not self.MONGO_URI:
            error_msg = (
                "\n" + "=" * 70 + "\n"
                "CONFIGURATION ERROR: 'MONGO_URI' is missing or empty in environment.\n"
                "Please configure a valid MongoDB connection string in 'backend/.env'.\n"
                "Example: MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/tsfms\n"
                "Or local: MONGO_URI=mongodb://localhost:27017\n"
                + "=" * 70 + "\n"
            )
            print(error_msg, file=sys.stderr)
            raise RuntimeError(
                "CONFIGURATION ERROR: 'MONGO_URI' is not set in backend/.env. "
                "The application cannot start without database configuration."
            )

        if not self.JWT_SECRET:
            self.JWT_SECRET = "tsfms_default_dev_secret_key_change_in_production"
            print("Notice: JWT_SECRET was not configured. Using temporary development key.", file=sys.stderr)

settings = Settings()
