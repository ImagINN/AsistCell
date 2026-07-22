from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.schemas.analysis import AnalysisRequest, AnalysisResult
from app.services.analysis_service import analysis_service
from app.models.analysis_log import AnalysisLog
from app.core.circuit_breaker import circuit_breaker

router = APIRouter(prefix="/api/v1/ai", tags=["AI"])

@router.post("/analyze", response_model=AnalysisResult)
async def analyze_ticket(request: AnalysisRequest, db: AsyncSession = Depends(get_db)):
    """
    Ticket sınıflandırma, duygu analizi ve temsilci atamasını çalıştırır.
    Gemini çökerse otomatik olarak manuel kuyruğa atar (fallback).
    """
    return await analysis_service.process_ticket(db, request)

@router.get("/health")
async def health_check():
    """
    AI Service ve Gemini API durumunu döner.
    """
    return {
        "status": "UP",
        "circuit_breaker_state": circuit_breaker.state.value,
        "circuit_breaker_failures": circuit_breaker.failure_count
    }

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """
    Basit bir istatistik tablosu
    """
    total = await db.scalar(select(func.count(AnalysisLog.id)))
    fallback_count = await db.scalar(select(func.count(AnalysisLog.id)).where(AnalysisLog.fallback_used == True))
    manual_count = await db.scalar(select(func.count(AnalysisLog.id)).where(AnalysisLog.manual_queue == True))
    
    return {
        "total_analyzed": total,
        "fallback_used": fallback_count,
        "manual_queue": manual_count
    }
