from typing import Optional
from pydantic import BaseModel

class AnalysisRequest(BaseModel):
    ticket_id: str
    title: str
    description: str

class AnalysisResult(BaseModel):
    ticket_id: str
    category: str
    confidence: float
    sentiment: str
    priority: str
    
    assigned_agent_id: Optional[str] = None
    manual_queue: bool = False
    
    fallback_used: bool = False
    fallback_reason: Optional[str] = None
