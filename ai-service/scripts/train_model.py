"""Kategori sınıflandırma modeli eğitimi (TF-IDF + Logistic Regression).

Veri seti: data/training_data.csv (elle etiketlenmiş gerçekçi Türkçe talep metinleri).
Çıktı: app/ml/model.joblib — LocalClassifier tarafından yüklenir ve Gemini
erişilemediğinde hibrit fallback olarak kullanılır.

Çalıştırma:  python scripts/train_model.py
(Docker imajı build edilirken otomatik çalışır, model imaja gömülür.)
"""
import csv
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "training_data.csv"
MODEL_PATH = ROOT / "app" / "ml" / "model.joblib"


def load_dataset() -> tuple[list[str], list[str]]:
    texts, labels = [], []
    with open(DATA_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            texts.append(row["text"].strip())
            labels.append(row["category"].strip())
    return texts, labels


def main() -> None:
    texts, labels = load_dataset()
    print(f"Veri seti: {len(texts)} örnek, {len(set(labels))} kategori")

    pipeline = Pipeline([
        # Türkçe için kelime + 2-gram TF-IDF; küçük veri setinde min_df=1
        ("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)),
        # predict_proba güven skoru (0.0-1.0) olarak kullanılır
        ("clf", LogisticRegression(max_iter=1000, C=10.0)),
    ])

    # 5-katlı çapraz doğrulama (küçük veri setinde tek split'ten daha güvenilir)
    cv_scores = cross_val_score(pipeline, texts, labels, cv=5)
    print(f"5-fold CV doğruluk: {cv_scores.mean():.3f} (±{cv_scores.std():.3f})")

    # Rapor için ayrık test kümesi
    x_train, x_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, stratify=labels, random_state=42,
    )
    pipeline.fit(x_train, y_train)
    y_pred = pipeline.predict(x_test)
    print(f"Test doğruluğu: {accuracy_score(y_test, y_pred):.3f}")
    print(classification_report(y_test, y_pred))

    # Nihai model tüm veriyle eğitilir
    pipeline.fit(texts, labels)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    print(f"Model kaydedildi: {MODEL_PATH}")


if __name__ == "__main__":
    main()
