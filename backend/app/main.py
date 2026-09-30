import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database.mongodb import db_manager, get_database
from app.services.application_service import seed_schemes_if_empty, seed_users_if_empty, seed_applications_if_empty

# Routers
from app.routes.auth import router as auth_router, ensure_user_indexes
from app.routes.schemes import router as schemes_router
from app.routes.applications import router as applications_router
from app.routes.documents import router as documents_router
from app.routes.grievances import router as grievances_router
from app.routes.admin import router as admin_router
from app.routes.eligibility import router as eligibility_router
from app.routes.applicant_profile import router as applicant_profile_router, ensure_profile_indexes

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("tsfms.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager: connects to MongoDB Atlas on startup and cleans up on shutdown.
    """
    import asyncio
    logger.info("Initializing MoTA TSFMS Backend Service...")
    reconnect_task = None
    try:
        is_connected = await db_manager.init_connection()
        if is_connected and db_manager.db is not None:
            if db_manager.db.name != settings.MONGO_DB_NAME:
                logger.error("MongoDB connection failed: Database name mismatch (%s != %s)", db_manager.db.name, settings.MONGO_DB_NAME)
                db_manager.is_connected = False
            else:
                await seed_schemes_if_empty(db_manager.db)
                await seed_users_if_empty(db_manager.db)
                await seed_applications_if_empty(db_manager.db)
                await ensure_user_indexes(db_manager.db)
                await ensure_profile_indexes(db_manager.db)
                logger.info("MongoDB Atlas connected and verified (Database: %s). Seed data ensured, unique indexes active.", settings.MONGO_DB_NAME)
        else:
            logger.error("MongoDB connection failed: Could not connect to MongoDB Atlas database '%s'.", settings.MONGO_DB_NAME)
    except Exception as e:
        logger.error("MongoDB connection failed: Startup error: %s", str(e))

    if not db_manager.is_connected:
        async def auto_reconnect_worker():
            logger.info("Background auto-reconnect worker started: Retrying MongoDB Atlas every 5 seconds...")
            while not db_manager.is_connected:
                try:
                    await asyncio.sleep(5)
                    connected = await db_manager.init_connection()
                    if connected and db_manager.db is not None and db_manager.db.name == settings.MONGO_DB_NAME:
                        await seed_schemes_if_empty(db_manager.db)
                        await seed_users_if_empty(db_manager.db)
                        await seed_applications_if_empty(db_manager.db)
                        await ensure_user_indexes(db_manager.db)
                        await ensure_profile_indexes(db_manager.db)
                        logger.info("MongoDB Atlas auto-reconnected successfully (Database: %s).", settings.MONGO_DB_NAME)
                        break
                except asyncio.CancelledError:
                    break
                except Exception as ex:
                    logger.debug("Background reconnect attempt error: %s", str(ex))

        reconnect_task = asyncio.create_task(auto_reconnect_worker())

    yield

    if reconnect_task:
        reconnect_task.cancel()
    logger.info("Shutting down MoTA TSFMS Backend Service...")
    db_manager.close()

# FastAPI application initialization
app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "Unified AI-Enabled Scholarship & Fellowship Management System (TSFMS) "
        "Ministry of Tribal Affairs, Government of India. "
        "Provides authentication, scheme discovery, application journeys, document metadata, "
        "and grievance handling."
    ),
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# CORS Configuration (Restricted strictly to configured frontend origins, avoiding wildcard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Health Check Endpoints
@app.get("/api/health", tags=["System Health"], summary="Service Health Check")
async def health_check():
    """
    Basic system liveness probe.
    """
    return {"status": "ok"}

@app.get("/api/health/db", tags=["System Health"], summary="Database Connectivity Check")
async def health_db_check():
    """
    Verify active MongoDB Atlas cluster connectivity.
    """
    is_live = await db_manager.ping()
    if not is_live:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "error",
                "database": settings.MONGO_DB_NAME,
                "message": "MongoDB connection failed: Unable to connect to MongoDB Atlas.",
                "error_type": db_manager.last_error or "ServerSelectionTimeoutError",
                "cluster_host": "demo.8ny5aaa.mongodb.net",
                "port": 27017,
                "resolution_hint": "TCP connect to Atlas port 27017 timed out. Please ensure the client public IP is added to the MongoDB Atlas Network Access IP Whitelist (or 0.0.0.0/0 allowed)."
            }
        )
    return {
        "status": "connected",
        "database": settings.MONGO_DB_NAME,
        "mode": "live_cluster",
        "message": "MongoDB connection established and verified."
    }

# Register Sub-Routers under /api
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(schemes_router, prefix=settings.API_V1_STR)
app.include_router(applications_router, prefix=settings.API_V1_STR)
app.include_router(documents_router, prefix=settings.API_V1_STR)
app.include_router(grievances_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(eligibility_router, prefix=settings.API_V1_STR)
app.include_router(applicant_profile_router, prefix=settings.API_V1_STR)
