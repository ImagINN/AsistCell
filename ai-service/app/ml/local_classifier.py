"""Yerel kategori sınıflandırıcısı (TF-IDF + Logistic Regression).

Kendi oluşturduğumuz etiketli veri setiyle (data/training_data.csv) eğitilir
(scripts/train_model.py). Gemini API erişilemediğinde hibrit fallback olarak
kullanılır; ayrıca tamamen çevrimdışı çalışabilir.
"""
import logging
from pathlib import Path

import joblib

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "model.joblib"


class LocalClassifier:
    def __init__(self):
        self._model = None
        self._load_attempted = False

    def _ensure_loaded(self) -> bool:
        if self._model is None and not self._load_attempted:
            self._load_attempted = True
            try:
                self._model = joblib.load(MODEL_PATH)
                logger.info(f"Local classifier loaded from {MODEL_PATH}")
            except Exception as e:
                logger.error(f"Local classifier could not be loaded: {e}")
        return self._model is not None

    @property
    def available(self) -> bool:
        return self._ensure_loaded()

    def classify(self, text: str) -> tuple[str, float]:
        """Metni sınıflandırır: (kategori, güven skoru 0.0-1.0)."""
        if not self._ensure_loaded():
            raise RuntimeError("Local classifier model is not available")
        probabilities = self._model.predict_proba([text])[0]
        best_index = probabilities.argmax()
        return str(self._model.classes_[best_index]), float(probabilities[best_index])


local_classifier = LocalClassifier()


# Kural tabanlı duygu analizi — yerel fallback'te sentiment için kullanılır
# (hibrit yaklaşımın kural tabanlı bileşeni).
ANGRY_KEYWORDS = [
    "rezalet", "berbat", "bıktım", "kabul edilemez", "öfke", "yeter artık",
    "saçmalık", "mağdur", "derhal", "skandal", "çıldıracağım", "sinir",
    "şikayetçiyim", "artık dayanamıyorum", "en kötü", "kandırıldım",
]
HAPPY_KEYWORDS = [
    "teşekkür", "memnunum", "harika", "çok iyi", "mükemmel", "başarılı",
]


def rule_based_sentiment(text: str) -> str:
    lowered = text.lower()
    if any(keyword in lowered for keyword in ANGRY_KEYWORDS):
        return "OFKELI"
    if any(keyword in lowered for keyword in HAPPY_KEYWORDS):
        return "MEMNUN"
    return "NOTR"
