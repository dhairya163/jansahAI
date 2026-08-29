# Ravi — the demo golden journey (§10.1)

**Persona:** Ravi, 34, Bengaluru delivery-business owner. "Customs parcel" call at 9:40 PM; sent two UPI
transfers (₹30,000 + ₹18,000) to `quickhelp.desk@okpay`; realised at 10:05 PM. Speaks Hinglish.

**Purpose:** live demo script + voice QA reference. The agent must sound like the excerpt below — calm, warm,
no blame, digit-by-digit read-backs, one question at a time.

## Full scripted call (speak these lines into /call)

```
Agent : Namaste, main Jansah hoon — ek independent hackathon prototype, sarkari
        1930 helpline nahin. Aap jo bhi bataayenge woh demo ke liye hai.
        Boliye, kya hua?
Ravi  : Bhaiya scam ho gaya mere saath... parcel wala call aaya tha, bola
        customs mein drugs mila hai, verification fee bharo... maine
        48 hazaar bhej diye UPI se. Abhi 20 minute pehle.
        → EXPECT: agent reassures (golden hour), classify_category(financial_upi)
        → sidebar chip flips to "UPI fraud"
Agent : Kitne transactions kiye the?
Ravi  : Do. Ek 30 ka, ek 18 ka. Thousand mein.
        → EXPECT: "पहला ₹30,000, दूसरा ₹18,000 — sahi?" (amount in words + digits)
Ravi  : Haan.
Agent : Jis UPI ID par bheja, woh boliye — spelling ke saath.
Ravi  : quickhelp dot desk at the rate okpay
        → EXPECT: digit/letter-by-letter read-back: q-u-i-c-k-h-e-l-p, dot, d-e-s-k, at, o-k-p-a-y
Ravi  : Haan bilkul.
        → EXPECT: check_suspect → "yeh UPI ID pehle 3 baar report ho chuki hai —
          aap akele nahin hain" (sidebar row turns terracotta)
Agent : Transaction ka time aur reference number... (ya screen par type kar dijiye)
Ravi  : (type-instead: UPI-417238991201) … time raat 9 baj ke 42 minute.
Agent : Aapka bank kaun sa hai?
Ravi  : SBI.
Agent : Ab identity verify karte hain — demo ke liye koi bhi kalpanik 12-digit
        Aadhaar boliye.
Ravi  : (any fictional 12 digits, e.g. "1234 5678 7841")
        → EXPECT: send_aadhaar_otp(7841) → SMS toast "424242" on screen
Ravi  : Chaar do chaar do chaar do.
        → EXPECT: verify_otp → Identity row "Aadhaar ••7841 ✓"
Agent : Email? (optional)
Ravi  : ravi.demo@example.com  (or say "nahin chahiye" — must be respected)
Agent : (FULL read-back: category, amounts, UPI, bank, time) — Sahi hai?
Ravi  : Haan, sahi hai.
        → EXPECT: register_case → case number read digit by digit, TWICE
        → registration SMS toast + ended card with PDFs
Agent : (get_guidance → reads golden_hour / bank_3day_rule / ezero_fir lines VERBATIM)
```

## After the call
1. Ended card → case number + Complaint PDF + Bank dispute notice downloads + "View case status".
2. /ops → Confirm freeze ₹31,000 → citizen page shows "₹31,000 held" live.
3. Case page ?demo=1 → **Next clock** → day 15 fires: status Stalled, FIR pack + nudge email (if email given).
4. +14 more days → SP letter, escalated L1. /ops → Mark FIR → status email. → Request restoration → Resolve.

## Pass criteria
- Every number read back digit by digit before set_slots.
- No blame language ("aapko OTP nahi dena chahiye tha" = FAIL).
- Guidance lines match `guidance/hi.ts` verbatim (no embellishment).
- Case number spoken twice, digit by digit.
