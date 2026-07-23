#!/usr/bin/env bash
set -e

CUST_LOGIN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"gsmNumber":"05559998877","password":"Test1234!"}')
CUST_TOKEN=$(echo "$CUST_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tokens']['access_token'])")

echo "=== Talep oluştur ==="
TICKET_RESP=$(curl -s -X POST http://localhost:8000/api/v1/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CUST_TOKEN" \
  -d '{"title":"XSS Güvenlik Testi","description":"Bu talep XSS güvenlik testi için oluşturulmuştur. Minimum uzunluk test ediliyor.","channel":"WEB"}')
TICKET_NUM=$(echo "$TICKET_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ticketNumber','ERR:'+str(d)[:60]))")
echo "Test talebi: $TICKET_NUM"

echo ""
echo "=== XSS payload testi ==="

# Script tag
python3 - <<'PYEOF'
import urllib.request, json, ssl

BASE = "http://localhost:8000"
ctx = ssl.create_default_context()

# Login
req = urllib.request.Request(f"{BASE}/api/v1/auth/login",
    data=json.dumps({"gsmNumber":"05559998877","password":"Test1234!"}).encode(),
    headers={"Content-Type":"application/json"})
resp = json.loads(urllib.request.urlopen(req).read())
token = resp["tokens"]["access_token"]
print(f"TOKEN: {token[:30]}...")

# Talep oluştur
req2 = urllib.request.Request(f"{BASE}/api/v1/tickets",
    data=json.dumps({"title":"XSS Test","description":"XSS test talebi - minimum uzunluk test edilmektedir. Bu bir güvenlik testidir.","channel":"WEB"}).encode(),
    headers={"Content-Type":"application/json","Authorization":f"Bearer {token}"})
try:
    ticket = json.loads(urllib.request.urlopen(req2).read())
    ticket_num = ticket.get("ticketNumber","ERR")
except Exception as e:
    print(f"Ticket create err: {e}")
    exit(1)

print(f"Ticket: {ticket_num}")

xss_payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(document.cookie)',
    '<svg onload=alert(1)>',
]

for payload in xss_payloads:
    req3 = urllib.request.Request(
        f"{BASE}/api/v1/tickets/{ticket_num}/messages",
        data=json.dumps({"content": payload}).encode(),
        headers={"Content-Type":"application/json","Authorization":f"Bearer {token}"})
    try:
        r = json.loads(urllib.request.urlopen(req3).read())
        msgs = r.get("messages",[])
        stored = msgs[-1]["content"] if msgs else "NO_MSG"
        # Evaluate: was it stored as-is (raw HTML = XSS risk)?
        if "<script" in stored.lower() or "onerror" in stored.lower() or "onload" in stored.lower():
            status = "⚠️  RAW_STORED (XSS risk)"
        else:
            status = "✅ safe or blocked"
        print(f"  Payload: {payload[:40]!r}")
        print(f"  Stored:  {stored[:60]!r}")
        print(f"  Status:  {status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  Payload: {payload[:40]!r} → HTTP {e.code}: {body[:80]}")
PYEOF

echo ""
echo "=== Admin kilidi sıfırla ==="
docker exec asistcell-identity-postgres psql -U identity_user -d identity_db \
  -c "UPDATE users SET \"failedLoginAttempts\"=0, \"lockedUntil\"=NULL WHERE email='admin@asistcell.com';"

echo "=== Kilit sonrası admin login ==="
ADMIN_RESP=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@asistcell.com","password":"AsistCell!Admin2026"}')
python3 -c "
import sys,json
d=json.loads('$ADMIN_RESP'.replace(\"'\",\"'\"))
" 2>/dev/null || echo "$ADMIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Admin login: OK' if 'tokens' in d else 'FAIL:'+str(d)[:80])"
