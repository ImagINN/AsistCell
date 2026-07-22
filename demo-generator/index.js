// AsistCell Demo Generator
// Sabit bir test müşteri havuzu üzerinden her INTERVAL_MS'de bir rastgele
// talep açar. Amaç: demo/canlı test sırasında sistemi sürekli hareketli
// tutmak (yeni talep akışı, AI analizi, atama, gamification event'leri).

const API_BASE_URL = process.env.API_BASE_URL || 'http://kong:8000/api/v1';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 5000);
const CUSTOMER_POOL_SIZE = Number(process.env.CUSTOMER_POOL_SIZE || 8);
const OTP_CODE = process.env.OTP_CODE || '1234';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoMusteri!2026';

// Kategori bazlı gerçekçi Türkçe talep şablonları — bazıları öfkeli tonlu
// (AI sentiment/öncelik yükseltmesini tetiklemesi için), bazıları nötr.
const TEMPLATES = [
  { title: 'Faturamda anlamadığım bir ek ücret var', description: 'Bu ay faturama daha önce hiç görmediğim bir yurtdışı paket ücreti yansıtılmış, açıklama istiyorum.' },
  { title: 'Faturam bu ay iki katına çıktı', description: 'Faturam bu ay iki katı geldi, açıklama istiyorum. Bu kabul edilemez, hemen düzeltilmesini istiyorum!' },
  { title: 'Evde şebeke çekimi çok düşük', description: 'Evde çekim gücü çok düşük, sürekli kesiliyor. Görüşme yaparken sürekli düşüyor, çok sinir bozucu.' },
  { title: 'Şehir dışında hiç çekmiyor', description: 'Şehir dışına çıktığımda hattım tamamen çekmiyor, acil bir durumda ulaşılamıyorum, bu çok tehlikeli.' },
  { title: 'Telefonum şarj olurken ısınıyor', description: 'Cihazım şarj olurken aşırı ısınıyor ve bazen kendiliğinden kapanıyor, garanti kapsamında değişim istiyorum.' },
  { title: 'Yeni aldığım cihaz açılmıyor', description: 'Geçen hafta aldığım telefon bu sabah açılmadı, ekranı tamamen kararmış durumda, çok rezil bir durum.' },
  { title: 'Tarife değişikliği talebim', description: 'Mevcut tarifemi daha uygun bir pakete geçirmek istiyorum, hangi seçenekler uygun olur öğrenebilir miyim?' },
  { title: 'Kullanmadığım pakete para ödüyorum', description: 'İnternet paketimi hiç kullanmıyorum ama her ay ücretlendiriliyorum, tarifemi değiştirmek istiyorum acilen.' },
  { title: 'Hattımı iptal ettirmek istiyorum', description: 'Artık kullanmayacağım için hattımı iptal ettirmek istiyorum, süreç nasıl işliyor bilgi almak istiyorum.' },
  { title: 'İptal talebim işleme alınmadı', description: 'Geçen ay iptal talebi oluşturmuştum ama hâlâ ücret kesiliyor, bu tam bir rezalet, derhal çözülmesini istiyorum!' },
  { title: 'Destek talebim hakkında bilgi istiyorum', description: 'Geçtiğimiz günlerde oluşturduğum talebimin durumu hakkında güncel bilgi almak istiyorum, teşekkürler.' },
  { title: 'Uygulama sürekli hata veriyor', description: 'Mobil uygulamayı her açtığımda beklenmedik bir hata alıyorum ve giriş yapamıyorum, çözüm bekliyorum.' },
];

const CHANNELS = ['WEB'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

const gsmForIndex = (i) => `05009900${String(i).padStart(3, '0')}`;

async function apiPost(path, body, token) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function login(gsmNumber, password) {
  const data = await apiPost('/auth/login', { gsmNumber, password });
  return data.tokens.access_token;
}

// Müşteriyi kaydeder; zaten kayıtlıysa (409) doğrudan giriş yapar.
async function ensureCustomer(index) {
  const gsmNumber = gsmForIndex(index);
  const firstName = 'Demo';
  const lastName = `Musteri${index}`;

  try {
    await apiPost('/auth/otp/request', { gsmNumber });
    const data = await apiPost('/auth/register', {
      firstName,
      lastName,
      gsmNumber,
      password: DEMO_PASSWORD,
      otpCode: OTP_CODE,
    });
    log(`Demo müşteri kaydedildi: ${gsmNumber}`);
    return { gsmNumber, accessToken: data.tokens.access_token, tokenIssuedAt: Date.now() };
  } catch (err) {
    if (err.status === 409) {
      const accessToken = await login(gsmNumber, DEMO_PASSWORD);
      log(`Demo müşteri zaten kayıtlı, giriş yapıldı: ${gsmNumber}`);
      return { gsmNumber, accessToken, tokenIssuedAt: Date.now() };
    }
    throw err;
  }
}

// Access token 15 dakika geçerli; 10 dakikayı geçmişse taze giriş yap.
const TOKEN_REFRESH_MS = 10 * 60 * 1000;

async function ensureFreshToken(customer) {
  if (Date.now() - customer.tokenIssuedAt < TOKEN_REFRESH_MS) return customer;
  customer.accessToken = await login(customer.gsmNumber, DEMO_PASSWORD);
  customer.tokenIssuedAt = Date.now();
  return customer;
}

async function createRandomTicket(customer) {
  const template = randomOf(TEMPLATES);
  const channel = randomOf(CHANNELS);
  const ticket = await apiPost('/tickets', {
    title: template.title,
    description: template.description,
    channel,
  }, customer.accessToken);
  log(`Talep oluşturuldu: ${ticket.ticketNumber} — "${template.title}" (${customer.gsmNumber})`);
}

// identity-service /auth/health, JWT doğrulamasından muaf tek public endpoint
// olduğu için hazır olup olmadığını anlamak için bunu kullanıyoruz
// (ticket-service /health Kong'un JWT eklentisi arkasında olduğundan 401 döner).
async function waitForGateway() {
  for (;;) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/health`);
      if (res.ok) return;
    } catch {
      // henüz ayakta değil
    }
    log('API Gateway bekleniyor...');
    await sleep(3000);
  }
}

async function main() {
  log(`Demo generator başlatılıyor — her ${INTERVAL_MS}ms'de bir talep açılacak (${CUSTOMER_POOL_SIZE} müşteri havuzu)`);
  await waitForGateway();

  const pool = [];
  for (let i = 1; i <= CUSTOMER_POOL_SIZE; i++) {
    try {
      pool.push(await ensureCustomer(i));
    } catch (err) {
      log(`Müşteri hazırlanamadı (${gsmForIndex(i)}):`, err.message);
    }
    await sleep(300); // OTP/login rate limitine takılmamak için
  }

  if (pool.length === 0) {
    log('Hiç müşteri hazırlanamadı, çıkılıyor.');
    process.exit(1);
  }

  log(`${pool.length} müşteri hazır, talep üretimi başlıyor.`);

  for (;;) {
    await sleep(INTERVAL_MS);
    try {
      const customer = randomOf(pool);
      await ensureFreshToken(customer);
      await createRandomTicket(customer);
    } catch (err) {
      log('Talep oluşturulamadı:', err.message);
    }
  }
}

main();
