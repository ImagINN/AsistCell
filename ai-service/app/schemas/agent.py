from typing import Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class AgentBase(BaseModel):
    name: str
    email: str
    expertise: str
    max_capacity: int = 10
    performance_score: float = 1.0

class AgentCreate(AgentBase):
    # Identity Service'teki kullanıcı id'si verilirse temsilci uçtan uca aynı
    # kimlikle takip edilir (ticket ataması, gamification profili, kapasite).
    id: Optional[str] = None

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    expertise: Optional[str] = None
    active_ticket_count: Optional[int] = None
    max_capacity: Optional[int] = None
    performance_score: Optional[float] = None
    is_active: Optional[bool] = None

class AgentResponse(AgentBase):
    id: str
    active_ticket_count: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
