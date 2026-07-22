from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.schemas.agent import AgentCreate, AgentResponse, AgentUpdate
from app.models.agent import Agent

router = APIRouter(prefix="/api/v1/ai/agents", tags=["Agents"])

@router.post("", response_model=AgentResponse)
async def create_agent(agent_in: AgentCreate, db: AsyncSession = Depends(get_db)):
    # Check email exists
    result = await db.execute(select(Agent).where(Agent.email == agent_in.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Identity user id ile eslestirilmis kayit varsa cakismayi engelle
    if agent_in.id:
        result = await db.execute(select(Agent).where(Agent.id == agent_in.id))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="Agent id already registered")

    agent = Agent(**agent_in.model_dump(exclude_none=True))
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent

@router.get("", response_model=List[AgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).order_by(Agent.name))
    return result.scalars().all()

@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, agent_in: AgentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalars().first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    update_data = agent_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)
        
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent
