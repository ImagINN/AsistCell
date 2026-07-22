import { Injectable, Logger } from '@nestjs/common';

interface AgentSyncData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  specialties: string[];
}

// Temsilci hesaplarını AI servisinin atama havuzuyla senkron tutar.
// Havuz senkron olmazsa AI analiz eder ama kimseye atayamaz (manuel kuyruk).
// Fire-and-forget: AI servisi kapalıysa hesap işlemleri etkilenmez.
@Injectable()
export class AiAgentClient {
  private readonly logger = new Logger(AiAgentClient.name);
  private readonly baseUrl = process.env.AI_SERVICE_URL ?? 'http://ai-service:3003';

  syncAgent(user: AgentSyncData): void {
    if (!user.email) {
      this.logger.warn(`Agent ${user.id} has no email — skipping AI pool sync`);
      return;
    }
    const body = {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      expertise: user.specialties.join(','),
    };

    fetch(`${this.baseUrl}/api/v1/ai/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (res.ok) {
          this.logger.log(`Agent ${user.id} added to AI assignment pool`);
          return;
        }
        // Kayıt zaten varsa (400) güncelle ve yeniden aktifleştir
        const patch = await fetch(`${this.baseUrl}/api/v1/ai/agents/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: body.name, expertise: body.expertise, is_active: true }),
        });
        if (patch.ok) {
          this.logger.log(`Agent ${user.id} re-activated in AI assignment pool`);
        } else {
          this.logger.warn(`AI pool sync failed for ${user.id}: HTTP ${patch.status}`);
        }
      })
      .catch((err) => this.logger.warn(`AI pool sync failed: ${err.message}`));
  }

  deactivateAgent(userId: string): void {
    fetch(`${this.baseUrl}/api/v1/ai/agents/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
      .then((res) => {
        if (res.ok) this.logger.log(`Agent ${userId} deactivated in AI assignment pool`);
      })
      .catch((err) => this.logger.warn(`AI pool deactivation failed: ${err.message}`));
  }
}
