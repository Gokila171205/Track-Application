import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from fastapi import HTTPException, status
from app.core.config import settings

logger = logging.getLogger("tsfms.database")

class DatabaseManager:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    is_connected: bool = False
    last_error: Optional[str] = None

    def connect(self) -> None:
        """
        Initialize the MongoDB Motor client connected to MongoDB Atlas.
        Enforces that MONGO_URI is configured.
        Never logs or prints the raw connection string to protect credentials.
        """
        settings.validate_config()
        
        try:
            self.client = AsyncIOMotorClient(
                settings.MONGO_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=10000,
                retryWrites=True
            )
            self.db = self.client[settings.MONGO_DB_NAME]
            self.is_connected = False
            logger.info("MongoDB Motor client initialized for database: %s", settings.MONGO_DB_NAME)
        except Exception as e:
            logger.error("Failed to initialize MongoDB client: %s", str(e))
            self.client = None
            self.db = None
            self.is_connected = False
            self.last_error = str(e)
            raise

    async def init_connection(self) -> bool:
        """
        Connect to MongoDB Atlas and verify connectivity via ping command.
        NO in-memory or mock fallback. If connection fails, reports failure directly.
        """
        if self.client is None:
            self.connect()

        try:
            await self.client.admin.command('ping')
            self.is_connected = True
            self.last_error = None
            logger.info(
                "Successfully connected to live MongoDB Atlas instance (database: %s).",
                settings.MONGO_DB_NAME
            )
            return True
        except Exception as e:
            self.is_connected = False
            self.last_error = f"{type(e).__name__}: {str(e)}"
            logger.error(
                "MongoDB connection failed: Could not reach live MongoDB Atlas instance (%s).",
                str(e)
            )
            return False

    async def ping(self) -> bool:
        """
        Ping database to verify live cluster connectivity.
        """
        if self.client is None or self.db is None:
            return False
        try:
            await self.client.admin.command('ping')
            self.is_connected = True
            self.last_error = None
            return True
        except Exception as e:
            self.is_connected = False
            self.last_error = f"{type(e).__name__}: {str(e)}"
            return False

    def close(self) -> None:
        """
        Close connection pool on application shutdown.
        """
        if self.client:
            self.client.close()
            self.client = None
            self.db = None
            self.is_connected = False
            logger.info("MongoDB connection closed.")

db_manager = DatabaseManager()

async def get_database() -> AsyncIOMotorDatabase:
    """
    Dependency to access the active MongoDB Atlas database instance.
    Guarantees that requests only execute against the verified persistent database.
    """
    if db_manager.db is None:
        db_manager.connect()

    if not db_manager.is_connected or db_manager.db is None:
        if db_manager.client is not None:
            try:
                await db_manager.client.admin.command('ping')
                db_manager.is_connected = True
            except Exception:
                db_manager.is_connected = False

        if not db_manager.is_connected or db_manager.db is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service unavailable. Backend is not connected to MongoDB Atlas."
            )

    return db_manager.db

