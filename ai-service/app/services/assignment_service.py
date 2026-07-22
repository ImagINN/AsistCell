import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.agent import Agent

logger = logging.getLogger(__name__)

class AssignmentService:
    async def get_best_agent(self, db: AsyncSession, category: str) -> Optional[Agent]:
        """
        Formül: skor = (uzmanlik_eslesme * 0.5) + (bosluk_orani * 0.3) + (performans * 0.2)
        - uzmanlik_eslesme = 1.0 (aynı ise), 0.3 (farklı ise)
        - bosluk_orani = (max - aktif) / max
        - kapasitesi dolu (aktif >= max) veya aktif olmayan temsilciler diskalifiye edilir.
        """
        # Sadece aktif ve kapasitesi dolmamış temsilcileri getir
        query = select(Agent).where(
            Agent.is_active == True,
            Agent.active_ticket_count < Agent.max_capacity
        )
        result = await db.execute(query)
        agents = result.scalars().all()
        
        if not agents:
            logger.info(f"No available agents found for assignment. Category: {category}")
            return None
            
        best_agent = None
        best_score = -1.0
        
        for agent in agents:
            # 1. Uzmanlık Eşleşmesi
            uzmanlik_eslesme = 1.0 if agent.expertise == category else 0.3
            
            # 2. Boşluk Oranı
            bosluk_orani = (agent.max_capacity - agent.active_ticket_count) / max(1, agent.max_capacity)
            
            # 3. Performans
            performans = agent.performance_score
            
            # Skor Hesaplama
            skor = (uzmanlik_eslesme * 0.5) + (bosluk_orani * 0.3) + (performans * 0.2)
            
            if skor > best_score:
                best_score = skor
                best_agent = agent
                
        if best_agent:
            logger.info(f"Assigned ticket to agent {best_agent.id} (Score: {best_score:.2f})")
            
        return best_agent

assignment_service = AssignmentService()
