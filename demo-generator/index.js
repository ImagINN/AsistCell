// AsistCell Demo Generator
//
// Üç bağımsız döngü çalıştırır:
//   1. Müşteri botları — her INTERVAL_MS'de rastgele bir talep açar.
//   2. Temsilci botları — kendilerine atanan talepleri otomatik ilerletir
//      (ATANDI -> ISLEMDE -> COZULDU). Bu olmadan AI'ın atadığı temsilciler
//      hiç kapasite boşaltmaz ve yeni talepler atanamaz hale gelir.
//   3. Süpervizör botu — kapasite/güven skoru yüzünden kimseye atanamayan
//      (YENI) veya uzun süredir ilerlemeyen talepleri uygun temsilciye atar.
//   4. Müşteri botları ayrıca COZULDU olan kendi taleplerini onaylayıp
//      (KAPANDI) puanlar — böylece açılan her talep gerçekten kapanır.

const API_BASE_URL = process.env.API_BASE_URL || 'http://kong:8000/api/v1';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 5000);
const CUSTOMER_POOL_SIZE = Number(process.env.CUSTOMER_POOL_SIZE || 8);
const AGENT_TICK_MS = Number(process.env.AGENT_TICK_MS || 4000);
const SUPERVISOR_TICK_MS = Number(process.env.SUPERVISOR_TICK_MS || 6000);
const STALE_ASSIGNMENT_MS = Number(process.env.STALE_ASSIGNMENT_MS || 90000);
const OTP_CODE = process.env.OTP_CODE || '1234';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoMusteri!2026';
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || 'DemoTemsilci!2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const CATEGORIES = ['FATURA', 'SEBEKE', 'CIHAZ', 'TARIFE', 'IPTAL'];

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

const RESOLUTION_NOTES = [
  'Müşteri ile görüşüldü, ilgili işlem sistemde düzeltildi ve talep çözüldü.',
  'Sorunun kaynağı tespit edildi, gerekli teknik müdahale yapılarak giderildi.',
  'Talep incelendi, hesap üzerinde gerekli güncelleme yapılarak çözüme kavuşturuldu.',
  'Müşteriye bilgilendirme yapıldı ve talep edilen değişiklik uygulandı.',
  'Arıza kaydı kapatıldı, hizmet normale döndü, müşteri bilgilendirildi.',
];

const RATING_COMMENTS = [
  'Hızlı ve net bir çözüm oldu, teşekkürler.',
  'İlgi için teşekkür ederim, sorunum çözüldü.',
  'Temsilci çok yardımcı oldu.',
  '',
  '',
];

const CHANNELS = ['WEB'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

const gsmForIndex = (i) => `05009900${String(i).padStart(3, '0')}`;

// Kong'da iki ayrı rate-limit katmanı var: /api/v1/auth rotasına özel,
// daha sıkı bir sınır (dakikada 20 — brute-force koruması) ve tüm rotalar
// için geçerli genel bir sınır (dakikada 100). Her iki gruba giden
// çağrıları da kendi aralarında en az *_GATE_MS'de bir sıraya koyarak,
// birden çok eşzamanlı bot döngüsü (müşteri/temsilci/süpervizör) toplamda
// bu sınırları aşmasın diye seri hale getiriyoruz.
const AUTH_GATE_MS = 3300;   // 20/dk sınırı için güvenli pay: ~18/dk
const GENERAL_GATE_MS = 900; // 100/dk sınırı için güvenli pay: ~66/dk

// "readyAt" okuma + güncelleme arasında await OLMADIĞI için (JS tek
// thread'li olduğundan) bu işlem atomiktir — eşzamanlı çağıran birden
// fazla döngü olsa bile aynı sıraya (slotu) iki kez alamaz. Önceki
// sürümde okuma ile yazma arasına `await sleep` girdiği için yarış
// durumu vardı ve eşzamanlı çağrılar aynı anda geçebiliyordu.
function makeGate(gateMs) {
  let readyAt = 0;
  return async function gate() {
    const now = Date.now();
    const start = Math.max(now, readyAt);
    readyAt = start + gateMs;
    const wait = start - now;
    if (wait > 0) await sleep(wait);
  };
}

const authGate = makeGate(AUTH_GATE_MS);
const generalGate = makeGate(GENERAL_GATE_MS);

async function apiCall(method, path, body, token) {
  await (path.startsWith('/auth/') ? authGate() : generalGate());
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message ? String(data.message) : `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const apiGet = (path, token) => apiCall('GET', path, undefined, token);
const apiPost = (path, body, token) => apiCall('POST', path, body, token);
const apiPatch = (path, body, token) => apiCall('PATCH', path, body, token);

async function login(identifier, password, byGsm) {
  const body = byGsm ? { gsmNumber: identifier, password } : { email: identifier, password };
  const data = await apiPost('/auth/login', body);
  return data.tokens.access_token;
}

// ─────────────────────────────────────────────────────────────
// Müşteri havuzu
// ─────────────────────────────────────────────────────────────

async function ensureCustomer(index) {
  const gsmNumber = gsmForIndex(index);
  try {
    await apiPost('/auth/otp/request', { gsmNumber });
    const data = await apiPost('/auth/register', {
      firstName: 'Demo',
      lastName: `Musteri${index}`,
      gsmNumber,
      password: DEMO_PASSWORD,
      otpCode: OTP_CODE,
    });
    log(`Demo müşteri kaydedildi: ${gsmNumber}`);
    return { id: data.user.id, gsmNumber, accessToken: data.tokens.access_token, tokenIssuedAt: Date.now() };
  } catch (err) {
    if (err.status === 409) {
      const accessToken = await login(gsmNumber, DEMO_PASSWORD, true);
      const me = await apiGet('/auth/me', accessToken);
      log(`Demo müşteri zaten kayıtlı, giriş yapıldı: ${gsmNumber}`);
      return { id: me.id, gsmNumber, accessToken, tokenIssuedAt: Date.now() };
    }
    throw err;
  }
}

const TOKEN_REFRESH_MS = 10 * 60 * 1000;

async function ensureFreshToken(actor, byGsm) {
  if (Date.now() - actor.tokenIssuedAt < TOKEN_REFRESH_MS) return actor;
  actor.accessToken = await login(actor.gsmNumber ?? actor.email, actor.password, byGsm);
  actor.tokenIssuedAt = Date.now();
  return actor;
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

// Müşteri kendi çözülen taleplerini onaylayıp (KAPANDI) puanlar — açılan
// her talebin gerçekten kapanmasını garanti eden adım budur.
async function wrapUpCustomerTickets(customer) {
  const tickets = await apiGet(`/tickets/customer/${customer.id}`, customer.accessToken);
  for (const ticket of tickets) {
    if (ticket.status === 'COZULDU') {
      await apiPatch(`/tickets/${ticket.ticketNumber}/status`, { status: 'KAPANDI' }, customer.accessToken);
      const rating = Math.random() < 0.7 ? 5 : 4;
      await apiPost(`/tickets/${ticket.ticketNumber}/rating`, {
        rating,
        comment: randomOf(RATING_COMMENTS) || undefined,
      }, customer.accessToken);
      log(`Talep kapatıldı ve puanlandı: ${ticket.ticketNumber} (${rating}★, ${customer.gsmNumber})`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Temsilci havuzu — talepleri otomatik ilerletir
// ─────────────────────────────────────────────────────────────

const AGENT_DEFS = [
  { key: 'agent-fatura', firstName: 'Bot', lastName: 'Fatura', specialties: ['FATURA'] },
  { key: 'agent-sebeke', firstName: 'Bot', lastName: 'Sebeke', specialties: ['SEBEKE'] },
  { key: 'agent-cihaz', firstName: 'Bot', lastName: 'Cihaz', specialties: ['CIHAZ'] },
  { key: 'agent-tarife', firstName: 'Bot', lastName: 'Tarife', specialties: ['TARIFE'] },
  { key: 'agent-iptal', firstName: 'Bot', lastName: 'Iptal', specialties: ['IPTAL'] },
  { key: 'agent-genel', firstName: 'Bot', lastName: 'Genel', specialties: ['FATURA', 'SEBEKE', 'CIHAZ', 'TARIFE', 'IPTAL'] },
];

async function ensureStaffAccount(adminToken, email, firstName, lastName, role, password, specialties) {
  try {
    const data = await apiPost('/auth/users', { email, password, firstName, lastName, role, specialties }, adminToken);
    log(`Demo ${role.toLowerCase()} hesabı oluşturuldu: ${email}`);
    return data.id;
  } catch (err) {
    if (err.status === 409) {
      const accessToken = await login(email, password, false);
      const me = await apiGet('/auth/me', accessToken);
      log(`Demo ${role.toLowerCase()} zaten kayıtlı: ${email}`);
      return me.id;
    }
    throw err;
  }
}

async function ensureAgentPool(adminToken) {
  const agents = [];
  for (const def of AGENT_DEFS) {
    const email = `${def.key}@demo.asistcell.com`;
    try {
      const id = await ensureStaffAccount(adminToken, email, def.firstName, def.lastName, 'TEMSILCI', AGENT_PASSWORD, def.specialties);
      const accessToken = await login(email, AGENT_PASSWORD, false);
      agents.push({ id, email, password: AGENT_PASSWORD, specialties: def.specialties, accessToken, tokenIssuedAt: Date.now() });
    } catch (err) {
      log(`Temsilci hazırlanamadı (${email}):`, err.message);
    }
    await sleep(300);
  }
  return agents;
}

async function ensureSupervisor(adminToken) {
  const email = 'supervisor@demo.asistcell.com';
  const id = await ensureStaffAccount(adminToken, email, 'Bot', 'Supervizor', 'SUPERVIZOR', AGENT_PASSWORD, undefined);
  const accessToken = await login(email, AGENT_PASSWORD, false);
  return { id, email, password: AGENT_PASSWORD, accessToken, tokenIssuedAt: Date.now() };
}

// Kendine atanan talepleri otomatik ilerletir: ATANDI -> ISLEMDE -> COZULDU.
// Bu döngü olmadan hiçbir talep kapanmaz ve temsilci kapasitesi hep dolu kalır.
async function advanceAgentTickets(agent) {
  await ensureFreshToken(agent, false);
  const tickets = await apiGet('/tickets', agent.accessToken);
  for (const ticket of tickets) {
    if (ticket.status === 'ATANDI') {
      await apiPatch(`/tickets/${ticket.ticketNumber}/status`, { status: 'ISLEMDE' }, agent.accessToken);
      log(`${agent.email} işe başladı: ${ticket.ticketNumber}`);
    } else if (ticket.status === 'ISLEMDE') {
      await apiPatch(`/tickets/${ticket.ticketNumber}/status`, {
        status: 'COZULDU',
        resolutionNote: randomOf(RESOLUTION_NOTES),
      }, agent.accessToken);
      log(`${agent.email} çözdü: ${ticket.ticketNumber}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Süpervizör botu — atanamamış/takılı kalmış talepleri dağıtır
// ─────────────────────────────────────────────────────────────

function pickAgentForCategory(agents, category) {
  const specialists = agents.filter((a) => a.specialties.includes(category));
  const pool = specialists.length > 0 ? specialists : agents;
  return randomOf(pool);
}

async function runSupervisorPass(supervisor, agents) {
  await ensureFreshToken(supervisor, false);
  const agentIds = new Set(agents.map((a) => a.id));
  const now = Date.now();

  // 1) Henüz kimseye atanmamış (YENI) talepler — AI kapasite bulamadığında
  //    veya güven skoru düşük (BELIRSIZ) olduğunda burada birikir.
  const unassigned = await apiGet('/tickets?status=YENI', supervisor.accessToken);
  for (const ticket of unassigned) {
    const agent = pickAgentForCategory(agents, ticket.category);
    if (!agent) continue;
    await apiPatch(`/tickets/${ticket.ticketNumber}/assign`, { agentId: agent.id }, supervisor.accessToken);
    log(`Süpervizör atadı (bekleyen): ${ticket.ticketNumber} -> ${agent.email}`);
  }

  // 2) Bot havuzu dışındaki (eski/tanımadığımız) bir temsilciye atanıp
  //    uzun süredir ilerlemeyen talepler — bot pool'a devredilir ki kapanabilsin.
  const assigned = await apiGet('/tickets?status=ATANDI', supervisor.accessToken);
  for (const ticket of assigned) {
    const stale = now - new Date(ticket.createdAt).getTime() > STALE_ASSIGNMENT_MS;
    if (stale && !agentIds.has(ticket.assignedAgentId)) {
      const agent = pickAgentForCategory(agents, ticket.category);
      if (!agent) continue;
      await apiPatch(`/tickets/${ticket.ticketNumber}/assign`, { agentId: agent.id }, supervisor.accessToken);
      log(`Süpervizör devraldı (takılı kalmış): ${ticket.ticketNumber} -> ${agent.email}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Orkestrasyon
// ─────────────────────────────────────────────────────────────

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

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    log('ADMIN_EMAIL/ADMIN_PASSWORD tanımlı değil — temsilci/süpervizör botları oluşturulamaz, sadece talep üretimi çalışacak.');
  }

  const customers = [];
  for (let i = 1; i <= CUSTOMER_POOL_SIZE; i++) {
    try {
      customers.push(await ensureCustomer(i));
    } catch (err) {
      log(`Müşteri hazırlanamadı (${gsmForIndex(i)}):`, err.message);
    }
    await sleep(300);
  }
  if (customers.length === 0) {
    log('Hiç müşteri hazırlanamadı, çıkılıyor.');
    process.exit(1);
  }
  log(`${customers.length} müşteri hazır.`);

  let agents = [];
  let supervisor = null;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    try {
      const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD, false);
      agents = await ensureAgentPool(adminToken);
      supervisor = await ensureSupervisor(adminToken);
      log(`${agents.length} temsilci botu ve süpervizör botu hazır — talepler otomatik ilerletilecek.`);
    } catch (err) {
      log('Temsilci/süpervizör botları hazırlanamadı:', err.message);
    }
  }

  // Müşteri talep üretim döngüsü
  (async () => {
    for (;;) {
      await sleep(INTERVAL_MS);
      try {
        const customer = randomOf(customers);
        await ensureFreshToken(customer, true);
        await createRandomTicket(customer);
      } catch (err) {
        log('Talep oluşturulamadı:', err.message);
      }
    }
  })();

  // Müşteri kapanış/puanlama döngüsü
  (async () => {
    for (;;) {
      await sleep(INTERVAL_MS * 2);
      for (const customer of customers) {
        try {
          await ensureFreshToken(customer, true);
          await wrapUpCustomerTickets(customer);
        } catch (err) {
          log(`Kapanış işlemi başarısız (${customer.gsmNumber}):`, err.message);
        }
      }
    }
  })();

  // Temsilci ilerletme döngüsü
  if (agents.length > 0) {
    (async () => {
      for (;;) {
        await sleep(AGENT_TICK_MS);
        for (const agent of agents) {
          try {
            await advanceAgentTickets(agent);
          } catch (err) {
            log(`Temsilci işlemi başarısız (${agent.email}):`, err.message);
          }
        }
      }
    })();
  }

  // Süpervizör dağıtım döngüsü
  if (supervisor && agents.length > 0) {
    (async () => {
      for (;;) {
        await sleep(SUPERVISOR_TICK_MS);
        try {
          await runSupervisorPass(supervisor, agents);
        } catch (err) {
          log('Süpervizör turu başarısız:', err.message);
        }
      }
    })();
  }
}

main();
