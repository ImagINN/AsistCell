import json
import logging
from typing import Dict, Any
import google.generativeai as genai
from google.generativeai.types import generation_types

from app.config import settings
from app.core.circuit_breaker import circuit_breaker

logger = logging.getLogger(__name__)

# Configure Gemini
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)
else:
    logger.warning("GEMINI_API_KEY is not set. AI classification will always fallback.")

# prompt
SYSTEM_INSTRUCTION = """
Sen bir telekomünikasyon müşteri destek asistanısın. Görevin müşteri talebini analiz edip JSON formatında yanıt vermektir.

Kurallar:
1. "category" alanına şunlardan birini seç: FATURA, SEBEKE, CIHAZ, TARIFE, IPTAL
2. "confidence" alanına 0.0 ile 1.0 arasında bir güven skoru ver.
3. "sentiment" alanına şunlardan birini seç: OFKELI, NOTR, MEMNUN

Yanıtın sadece JSON olmalı. Örnek format:
{
  "category": "FATURA",
  "confidence": 0.85,
  "sentiment": "OFKELI"
}
"""

class GeminiService:
    def __init__(self):
        self.model = None
        if settings.GEMINI_API_KEY:
            self.model = genai.GenerativeModel(
                model_name=settings.GEMINI_MODEL,
                system_instruction=SYSTEM_INSTRUCTION,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                )
            )

    async def analyze_ticket(self, title: str, description: str) -> Dict[str, Any]:
        """
        Gemini API'yi çağırır. Circuit breaker kontrolü yapar.
        Eğer kapalıysa (OPEN) exception fırlatır.
        """
        if not self.model:
            raise RuntimeError("Gemini API not configured")

        if not circuit_breaker.can_request():
            raise RuntimeError("Circuit breaker is OPEN. Fast failing request.")

        prompt = f"Başlık: {title}\nAçıklama: {description}"
        
        try:
            # Gemini çağrısı (async olarak yapmak için generate_content_async kullanılır)
            response = await self.model.generate_content_async(prompt)
            
            # Başarılı olursa circuit breaker'ı sıfırla
            circuit_breaker.record_success()
            
            try:
                result_json = json.loads(response.text)
                return result_json
            except json.JSONDecodeError:
                logger.error(f"Gemini response is not valid JSON: {response.text}")
                # Kötü çıktı da bir hatadır, ama API çökmesi kadar kritik değildir.
                raise ValueError("Invalid JSON from Gemini")

        except Exception as e:
            logger.error(f"Gemini API request failed: {str(e)}")
            circuit_breaker.record_failure()
            raise e

gemini_service = GeminiService()
