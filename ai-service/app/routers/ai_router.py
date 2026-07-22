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

@router.get("/analysis/{ticket_id}")
async def get_analysis(ticket_id: str, db: AsyncSession = Depends(get_db)):
    """
    Belirli bir talebin en güncel AI analiz sonucunu döner (kategori, güven skoru,
    sentiment, öncelik). Temsilci/süpervizör ekranlarında sentiment gösterimi için kullanılır.
    """
    result = await db.execute(
        select(AnalysisLog).where(AnalysisLog.ticket_id == ticket_id).order_by(AnalysisLog.created_at.desc())
    )
    log = result.scalars().first()
    if not log:
        raise HTTPException(status_code=404, detail="Bu talep için AI analizi bulunamadı")
    return {
        "ticket_id": log.ticket_id,
        "category": log.category,
        "confidence": log.confidence,
        "sentiment": log.sentiment,
        "priority": log.priority,
        "fallback_used": log.fallback_used,
        "manual_queue": log.manual_queue,
        "corrected_category": log.corrected_category,
    }

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

    # Doğruluk: kategorisi kesin tahmin edilenler içinde personelce farklı
    # bir kategoriye düzeltilmeyenlerin oranı
    predicted = await db.scalar(
        select(func.count(AnalysisLog.id)).where(AnalysisLog.category != "BELIRSIZ")
    )
    corrected = await db.scalar(
        select(func.count(AnalysisLog.id)).where(
            AnalysisLog.category != "BELIRSIZ",
            AnalysisLog.corrected_category != None,
            AnalysisLog.corrected_category != AnalysisLog.category,
        )
    )

    category_rows = (
        await db.execute(
            select(AnalysisLog.category, func.count(AnalysisLog.id)).group_by(AnalysisLog.category)
        )
    ).all()
    sentiment_rows = (
        await db.execute(
            select(AnalysisLog.sentiment, func.count(AnalysisLog.id)).group_by(AnalysisLog.sentiment)
        )
    ).all()

    return {
        "total_analyzed": total,
        "fallback_used": fallback_count,
        "manual_queue": manual_count,
        "category_corrections": corrected,
        "accuracy_rate": (predicted - corrected) / predicted if predicted else None,
        "by_category": {row[0]: row[1] for row in category_rows},
        "by_sentiment": {row[0]: row[1] for row in sentiment_rows},
    }
