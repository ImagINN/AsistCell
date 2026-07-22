import logging
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.schemas.analysis import AnalysisRequest, AnalysisResult
from app.services.gemini_service import gemini_service
from app.services.assignment_service import assignment_service
from app.models.analysis_log import AnalysisLog

logger = logging.getLogger(__name__)

VALID_CATEGORIES = ["FATURA", "SEBEKE", "CIHAZ", "TARIFE", "IPTAL"]
VALID_SENTIMENTS = ["OFKELI", "NOTR", "MEMNUN"]

class AnalysisService:
    async def process_ticket(self, db: AsyncSession, request: AnalysisRequest) -> AnalysisResult:
        result = AnalysisResult(
            ticket_id=request.ticket_id,
            category="BELIRSIZ",
            confidence=0.0,
            sentiment="NOTR",
            priority="ORTA",
            manual_queue=True,
            fallback_used=False
        )

        try:
            # 1. & 2. Kategori Sınıflandırma ve Duygu Analizi (Gemini)
            gemini_res = await gemini_service.analyze_ticket(request.title, request.description)
            
            # Gelen veriyi güvenli al
            cat = gemini_res.get("category", "BELIRSIZ")
            conf = float(gemini_res.get("confidence", 0.0))
            sent = gemini_res.get("sentiment", "NOTR")
            
            # Validasyon
            if cat not in VALID_CATEGORIES:
                cat = "BELIRSIZ"
            if sent not in VALID_SENTIMENTS:
                sent = "NOTR"
                
            result.category = cat
            result.confidence = conf
            result.sentiment = sent
            
            # Kategori Güven Skoru Kontrolü
            if conf < 0.60 or cat == "BELIRSIZ":
                result.category = "BELIRSIZ"
                result.manual_queue = True
            else:
                result.manual_queue = False
                
            # Duygu Analizine Göre Öncelik Artırma
            if result.sentiment == "OFKELI":
                result.priority = "YUKSEK"
            else:
                result.priority = "ORTA" # Default öncelik
                
        except Exception as e:
            # Fallback (Diskalifiye Koruması)
            logger.error(f"Fallback triggered for ticket {request.ticket_id} due to: {str(e)}")
            result.fallback_used = True
            result.fallback_reason = str(e)
            result.category = "BELIRSIZ"
            result.manual_queue = True
            result.priority = "ORTA"

        # 3. Akıllı Temsilci Ataması
        # Sadece kategorisi belli olanlar için atama yapıyoruz
        if not result.manual_queue and not result.fallback_used:
            agent = await assignment_service.get_best_agent(db, result.category)
            if agent:
                result.assigned_agent_id = agent.id
                # Agent kapasitesini bir artır
                agent.active_ticket_count += 1
                db.add(agent)
            else:
                # Uygun temsilci bulunamadıysa manuel kuyruğa at
                result.manual_queue = True

        # Sonucu veritabanına logla
        log_entry = AnalysisLog(
            ticket_id=result.ticket_id,
            category=result.category,
            confidence=result.confidence,
            sentiment=result.sentiment,
            priority=result.priority,
            assigned_agent_id=result.assigned_agent_id,
            manual_queue=result.manual_queue,
            fallback_used=result.fallback_used,
            fallback_reason=result.fallback_reason
        )
        db.add(log_entry)
        
        await db.commit()
        
        return result

analysis_service = AnalysisService()
