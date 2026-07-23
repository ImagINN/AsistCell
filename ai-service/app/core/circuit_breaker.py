import time
from enum import Enum
import logging

from app.config import settings

logger = logging.getLogger(__name__)

class CircuitState(Enum):
    CLOSED = "CLOSED"       # Normal durum, tüm isteklere izin verilir
    OPEN = "OPEN"           # Hata durumu, istekler engellenir
    HALF_OPEN = "HALF_OPEN" # Test durumu, 1 isteğe izin verilir

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.state == CircuitState.HALF_OPEN:
            # Half-open'da hata alırsak hemen tekrar OPEN'a geçer
            logger.warning("Circuit Breaker: Test request failed. State -> OPEN")
            self.state = CircuitState.OPEN
        elif self.failure_count >= self.failure_threshold and self.state == CircuitState.CLOSED:
            logger.error(f"Circuit Breaker: Failure threshold ({self.failure_threshold}) reached. State -> OPEN")
            self.state = CircuitState.OPEN

    def record_success(self):
        if self.state == CircuitState.HALF_OPEN:
            logger.info("Circuit Breaker: Test request succeeded. State -> CLOSED")
            self.state = CircuitState.CLOSED
            self.failure_count = 0
        elif self.state == CircuitState.CLOSED:
            # Normal durumda başarılı olursa sayacı sıfırlayabiliriz (veya sızan bucket kullanabiliriz)
            self.failure_count = 0

    def can_request(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
            
        if self.state == CircuitState.OPEN:
            # Bekleme süresi doldu mu?
            if time.time() - self.last_failure_time >= self.recovery_timeout:
                logger.info("Circuit Breaker: Recovery timeout reached. State -> HALF_OPEN")
                self.state = CircuitState.HALF_OPEN
                return True
            return False
            
        if self.state == CircuitState.HALF_OPEN:
            # Zaten half-open'da birine izin verdik, o sonucunu getirene kadar başkasına izin verme
            # (Basit implementasyon için False dönüyoruz, ama daha gelişmişinde semafor kullanılabilir)
            # Şimdilik True dönüyoruz ki bir istek denensin.
            return True

        return False

# Singleton instance — CB_FAILURE_THRESHOLD/CB_RECOVERY_TIMEOUT ile yapılandırılabilir
circuit_breaker = CircuitBreaker(
    failure_threshold=settings.CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.CB_RECOVERY_TIMEOUT,
)
