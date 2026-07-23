import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.config import settings
from app.routers import ai_router, agent_router
from app.database import engine

from app.core.rabbitmq import rabbitmq_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service starting up...")
    await rabbitmq_client.connect()
    await rabbitmq_client.start_consuming()
    
    yield
    
    logger.info("AI Service shutting down...")
    await rabbitmq_client.disconnect()
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "AsistCell AI Service — talep kategori sınıflandırma, sentiment analizi ve "
        "akıllı temsilci ataması. Hibrit yaklaşım: Gemini (LLM) birincil, kendi "
        "eğittiğimiz TF-IDF + Logistic Regression modeli fallback. Detaylar için "
        "bkz. repo kökü `AI_APPROACH.md`."
    ),
    version="1.0.0",
    lifespan=lifespan,
    # Kong route'u strip_path:false ile `/api/v1/ai/**`'i olduğu gibi upstream'e
    # iletir; Swagger UI/OpenAPI şeması da bu yüzden aynı prefix altında
    # yayınlanır — aksi halde Kong arkasından (http://localhost:8000/...) erişilemez.
    openapi_url="/api/v1/ai/openapi.json",
    docs_url="/api/v1/ai/docs",
    redoc_url="/api/v1/ai/redoc",
    openapi_tags=[
        {"name": "AI", "description": "Kategori sınıflandırma, sentiment analizi, atama, doğruluk istatistikleri"},
        {"name": "Agents", "description": "Temsilci (agent) kaydı — uzmanlık, kapasite, performans"},
    ],
)

app.include_router(ai_router.router)
app.include_router(agent_router.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
