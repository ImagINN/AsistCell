import logging
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.schemas.analysis import AnalysisRequest, AnalysisResult
from app.services.gemini_service import gemini_service
from app.services.assignment_service import assignment_service
from app.ml.local_classifier import local_classifier, rule_based_sentiment
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
            
            # Gelen veriyi güvenli al — Gemini dış bir API olduğu için sayısal
            # aralık burada zorunlu kılınır (spec: güven skoru 0.0-1.0)
            cat = gemini_res.get("category", "BELIRSIZ")
            conf = max(0.0, min(1.0, float(gemini_res.get("confidence", 0.0))))
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
            # Hibrit fallback: Gemini erişilemezse kendi veri setimizle eğitilmiş
            # yerel model (TF-IDF + Logistic Regression) sınıflandırır; sentiment
            # kural tabanlı belirlenir. Yerel model de yoksa BELIRSIZ + manuel kuyruk.
            logger.error(f"Fallback triggered for ticket {request.ticket_id} due to: {str(e)}")
            result.fallback_used = True

            # Kural tabanlı sentiment, eğitilmiş modele bağımlı değildir; kategori
            # sınıflandırması için yerel model olmasa bile OFKELI tespiti ve
            # önceliğin YUKSEK'e çekilmesi her zaman çalışmalıdır.
            text = f"{request.title} {request.description}"
            result.sentiment = rule_based_sentiment(text)
            result.priority = "YUKSEK" if result.sentiment == "OFKELI" else "ORTA"

            if local_classifier.available:
                cat, conf = local_classifier.classify(text)
                result.confidence = conf
                # Ana akışla aynı kural: güven < 0.60 ise BELIRSIZ + manuel kuyruk
                if conf < 0.60:
                    result.category = "BELIRSIZ"
                    result.manual_queue = True
                else:
                    result.category = cat
                    result.manual_queue = False
                result.fallback_reason = f"gemini: {str(e)} | local_model kullanıldı (conf={conf:.2f})"
                logger.info(
                    f"Local model classified ticket {request.ticket_id}: "
                    f"{result.category} (conf={conf:.2f}, sentiment={result.sentiment})"
                )
            else:
                result.fallback_reason = str(e)
                result.category = "BELIRSIZ"
                result.manual_queue = True

        # 3. Akıllı Temsilci Ataması
        # Kategorisi güvenle belirlenmiş talepler atanır (yerel model dahil);
        # güven < 0.60 olanlar manuel atama kuyruğunda kalır.
        if not result.manual_queue:
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
