import uuid
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base

class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    expertise = Column(String, nullable=False) # e.g. FATURA, SEBEKE, CIHAZ, TARIFE, IPTAL
    active_ticket_count = Column(Integer, default=0, nullable=False)
    max_capacity = Column(Integer, default=10, nullable=False)
    performance_score = Column(Float, default=1.0, nullable=False) # 0.0 - 1.0
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
