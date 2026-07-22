import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.config import settings
from app.routers import ai_router, agent_router
from app.database import engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service starting up...")
    yield
    logger.info("AI Service shutting down...")
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan
)

app.include_router(ai_router.router)
app.include_router(agent_router.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
