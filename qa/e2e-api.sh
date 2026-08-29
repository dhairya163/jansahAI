#!/bin/bash
# E2E: simulate the exact tool-call sequence the voice model makes for Ravi's journey
set -e
API=http://localhost:4000
J() { python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False)[:400])"; }

echo "== 1. mint session"
SESSION=$(curl -s -X POST $API/api/realtime/session)
TOKEN=$(echo "$SESSION" | python3 -c "import json,sys; print(json.load(sys.stdin)['session_token'])")
echo "  token: ${TOKEN:0:12}… model: $(echo "$SESSION" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['model'], '| secret:', d['client_secret'][:8]+'…')")"

T() { curl -s -X POST "$API/api/tools/$1" -H "X-Session-Token: $TOKEN" -H 'Content-Type: application/json' -d "$2"; }

echo "== 2. classify"
T classify_category '{"args":{"category":"financial_upi"}}' | J
echo "== 3. set_slots (amount + txns + payee + narrative...)"
T set_slots '{"args":{"patch":{"amount":48000,"incident_at":"2026-08-29 21:42","instrument":"upi","txns":[{"ref":"UPI-88111","amount":30000,"at":"9:42 pm","method":"upi"},{"ref":"UPI-88112","amount":18000,"at":"9:47 pm","method":"upi"}],"payee_identifier":"quickhelp.desk@okpay","own_bank":"HDFC Bank","narrative":"Parcel customs scam call, paid two UPI transfers under pressure, realised 20 minutes later.","language":"hi-en"}}}' | J
echo "== 4. check_suspect (should find 5 prior reports)"
T check_suspect '{"args":{"kind":"upi","value":"QuickHelp.Desk@okpay"}}' | J
echo "== 5. register too early (guard: identity unverified) — expect 422"
T register_case '{"args":{}}' | J
echo "== 6. aadhaar otp + wrong code + right code"
T send_aadhaar_otp '{"args":{"aadhaar_last4":"7841"}}' | J
T verify_otp '{"args":{"code":"111111"}}' | J
T verify_otp '{"args":{"code":"424242"}}' | J
echo "== 7. capture contact (email = user's own for the live email test)"
T capture_contact '{"args":{"reporter_name":"Dhairya Aggarwal (test)","phone":"+919812007841","email":"dhairya.aggarwal@gmail.com"}}' | J
echo "== 8. register"
REG=$(T register_case '{"args":{}}')
echo "$REG" | J
CASE=$(echo "$REG" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['case_number'])")
CTOKEN=$(echo "$REG" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['case_token'])")
echo "  case: $CASE"
echo "== 9. get_guidance"
T get_guidance '{"args":{"category":"financial_upi"}}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('  items:', len(d['result']['items']), '| first:', d['result']['items'][0]['title'])"
echo "== 10. injection drill: model tries to mark FIR (no such tool server-side) — expect 404"
T mark_fir '{"args":{"fir_number":"HACK"}}' | J
sleep 6
echo "== 11. citizen GET case (JWT from register)"
curl -s "$API/api/cases/$CASE" -H "Authorization: Bearer $CTOKEN" | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('  status:', d['case']['status'], '| artifacts:', [a['kind'] for a in d['artifacts']], '| next_clock:', d['next_clock']['step_key'], 'in', d['next_clock']['in_days_virtual'], 'd')"
echo "$CASE" > /tmp/e2e-case-number
echo "$CTOKEN" > /tmp/e2e-case-token
echo "$TOKEN" > /tmp/e2e-session-token
