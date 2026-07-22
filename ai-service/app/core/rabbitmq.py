import os
import json
import asyncio
import logging
import aio_pika
from typing import Optional

from app.database import AsyncSessionLocal
from app.services.analysis_service import analyze_and_assign
from app.schemas.analysis import AnalysisCreate

logger = logging.getLogger(__name__)

RABBITMQ_URL = os.getenv("RABBITMQ_URI", "amqp://asistcell:asistcell_secret@rabbitmq:5672/")

class RabbitMQClient:
    def __init__(self):
        self.connection: Optional[aio_pika.RobustConnection] = None
        self.channel: Optional[aio_pika.RobustChannel] = None
        self.consume_task: Optional[asyncio.Task] = None

    async def connect(self):
        logger.info(f"Connecting to RabbitMQ at {RABBITMQ_URL}")
        self.connection = await aio_pika.connect_robust(RABBITMQ_URL)
        self.channel = await self.connection.channel()
        await self.channel.set_qos(prefetch_count=10)
        logger.info("RabbitMQ Connected.")

    async def disconnect(self):
        if self.consume_task:
            self.consume_task.cancel()
        if self.connection:
            await self.connection.close()
        logger.info("RabbitMQ Disconnected.")

    async def publish_analyzed_ticket(self, data: dict):
        if not self.channel:
            return
        
        # NestJS @MessagePattern('ticket.analyzed') formatını kullanabilmesi için pattern wrapper ekliyoruz.
        # NestJS, mesajın yapısını { pattern: string, data: any } olarak bekler.
        message_body = json.dumps({
            "pattern": "ticket.analyzed",
            "data": data
        }).encode()

        exchange = self.channel.default_exchange
        await exchange.publish(
            aio_pika.Message(
                body=message_body,
                content_type="application/json"
            ),
            routing_key="ticket_updates_queue"
        )
        logger.info(f"Published ticket.analyzed for ticket {data.get('ticketId')} to ticket_updates_queue")

    async def process_message(self, message: aio_pika.IncomingMessage):
        async with message.process():
            try:
                body_str = message.body.decode()
                payload = json.loads(body_str)
                
                # NestJS'ten gelen mesaj formatı: { "pattern": "ticket.created", "data": { ticketId: "...", title: "...", description: "..." } }
                if "data" in payload and "pattern" in payload:
                    data = payload["data"]
                else:
                    data = payload

                ticket_id = data.get("ticketId")
                title = data.get("title")
                description = data.get("description")
                
                if not ticket_id or not title or not description:
                    logger.error(f"Missing required fields in RMQ message: {data}")
                    return

                logger.info(f"Received ticket.created for ticket {ticket_id}")

                analysis_req = AnalysisCreate(
                    ticketId=ticket_id,
                    title=title,
                    description=description
                )

                async with AsyncSessionLocal() as session:
                    result = await analyze_and_assign(session, analysis_req)
                    
                    # Sonucu Ticket Service'e geri gönder
                    response_payload = {
                        "ticketId": result.ticket_id,
                        "category": result.category,
                        "sentiment": result.sentiment,
                        "priority": result.priority,
                        "assignedAgentId": result.assigned_agent_id
                    }
                    await self.publish_analyzed_ticket(response_payload)

            except Exception as e:
                logger.error(f"Error processing RabbitMQ message: {e}")
                # Hatalı mesajları red et ve DQL'e (Dead Letter Queue) girmesi veya düşmesi için process bloğu hata fırlatacak.
                raise

    async def start_consuming(self):
        if not self.channel:
            await self.connect()

        # NestJS queue adıyla eşleşmeli (ai_analysis_queue)
        queue = await self.channel.declare_queue("ai_analysis_queue", durable=True)
        
        async def _consume():
            logger.info("Started consuming from ai_analysis_queue")
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    await self.process_message(message)

        self.consume_task = asyncio.create_task(_consume())

rabbitmq_client = RabbitMQClient()
