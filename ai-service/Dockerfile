FROM python:3.12-slim

WORKDIR /app

# Sistem bağımlılıklarını kur (psycopg2 vb. gerekirse)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Yerel kategori sınıflandırma modelini eğit (veri seti: data/training_data.csv)
RUN python scripts/train_model.py

EXPOSE 3003

# Migrationları çalıştır ve uygulamayı başlat
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 3003"]
