import uuid
from sqlalchemy import Column, String, Float, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base

class AnalysisLog(Base):
    __tablename__ = "analysis_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = Column(String, nullable=False, index=True)
    
    # Analysis results
    category = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    sentiment = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    
    # Assignment
    assigned_agent_id = Column(String, nullable=True)
    manual_queue = Column(Boolean, default=False, nullable=False)
    
    # Resilience tracking
    fallback_used = Column(Boolean, default=False, nullable=False)
    fallback_reason = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
