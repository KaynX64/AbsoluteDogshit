#!/usr/bin/env bash
# Super Admin / admin-permission RBAC smoke test — Valetudo HealthLink
#
# Needs: bash, curl, jq, and the API running.
# Usage:
#   SUPER_EMAIL='your-admin@email' SUPER_PASS='your-password' ./superadmin-test.sh
# Optional env: BASE (default https://localhost:5000; self-signed certs are accepted), TEST_PW, DOMAIN
#
# It creates throwaway accounts named sa_test_*@$DOMAIN on first run (safe to re-run).
# It never calls the retention SWEEP or any destructive DB Studio delete.

set -u
BASE="${BASE:-https://localhost:5000}"   # your app defaults to HTTPS; check desktop/app-config.json
PW="${TEST_PW:-TestPass#2026ab}"
DOMAIN="${DOMAIN:-test.local}"
: "${SUPER_EMAIL:?Set SUPER_EMAIL}"
: "${SUPER_PASS:?Set SUPER_PASS}"
command -v jq >/dev/null || { echo "jq is required (apt install jq / brew install jq)"; exit 1; }

BODY="$(mktemp)"
PASS_N=0; FAIL_N=0

# ---------- helpers ----------
call() { # METHOD TOKEN PATH [JSON]  -> prints HTTP status, body in $BODY
  local m=$1 t=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then
    curl -sk -o "$BODY" -w '%{http_code}' -X "$m" "$BASE$p" \
      -H "Authorization: Bearer $t" -H 'Content-Type: application/json' -d "$d"
  else
    curl -sk -o "$BODY" -w '%{http_code}' -X "$m" "$BASE$p" -H "Authorization: Bearer $t"
  fi
}

expect() { # LABEL WANT_STATUS METHOD TOKEN PATH [JSON]
  local label=$1 want=$2; shift 2
  local got; got=$(call "$@")
  if [ "$got" = "$want" ]; then
    PASS_N=$((PASS_N+1)); printf '  \033[32mPASS\033[0m %s (%s)\n' "$label" "$got"
  else
    FAIL_N=$((FAIL_N+1)); printf '  \033[31mFAIL\033[0m %s — wanted %s, got %s: %s\n' \
      "$label" "$want" "$got" "$(head -c 200 "$BODY")"
  fi
}

expect_jq() { # LABEL TOKEN PATH JQ_EXPR WANT_VALUE
  local label=$1 tok=$2 path=$3 expr=$4 want=$5
  call GET "$tok" "$path" >/dev/null
  local got; got=$(jq -r "$expr" "$BODY" 2>/dev/null)
  if [ "$got" = "$want" ]; then
    PASS_N=$((PASS_N+1)); printf '  \033[32mPASS\033[0m %s (%s)\n' "$label" "$got"
  else
    FAIL_N=$((FAIL_N+1)); printf '  \033[31mFAIL\033[0m %s — wanted %s, got %s\n' "$label" "$want" "$got"
  fi
}

login() { # EMAIL PASSWORD -> token
  curl -sk -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "$(jq -n --arg e "$1" --arg p "$2" '{email:$e,password:$p}')" | jq -r '.token // empty'
}

mk_user() { # EMAIL ROLE [PERMS_JSON]   (created by the real super admin)
  local email=$1 role=$2 perms=${3:-null}
  local body
  body=$(jq -n --arg e "$email" --arg r "$role" --arg pw "$PW" --argjson perms "$perms" '
    {first_name:"SA", last_name:"Test", email:$e, password:$pw, role_code:$r, is_active:true}
    + (if $r=="ADMIN"  then {admin_no:("T-"+$e)} else {} end)
    + (if $r=="DOCTOR" then {license_no:"TEST-LIC-1"} else {} end)
    + (if $r=="STUDENT" then {student_no:("S-"+$e), course:"BSIT", year_level:1} else {} end)
    + (if $perms==null then {} else {admin_permissions:$perms} end)')
  call POST "$SUPER" /api/admin/users "$body" >/dev/null   # duplicate on re-run is fine
}

uid() { # EMAIL -> user id
  call GET "$SUPER" /api/admin/users >/dev/null
  jq -r --arg e "$1" '(if type=="array" then . else (.users // .data // []) end)[]
                      | select(.email==$e) | .id' "$BODY"
}

# ---------- setup ----------
echo "== Setup =="
SUPER=$(login "$SUPER_EMAIL" "$SUPER_PASS")
[ -n "$SUPER" ] || { echo "Could not log in as $SUPER_EMAIL"; exit 1; }
expect_jq "Your login is a super admin" "$SUPER" /api/admin/my-permissions '.is_super' true

E_A="sa_test_a_super@$DOMAIN"      # explicit SUPER_ADMIN
E_B="sa_test_b_legacy@$DOMAIN"     # no grant rows (legacy full access)
E_C="sa_test_c_users@$DOMAIN"      # USERS_MANAGE only
E_D="sa_test_d_audit@$DOMAIN"      # AUDIT_VIEW only
E_E="sa_test_e_dbstudio@$DOMAIN"   # DATABASE_MANAGE only
E_F="sa_test_f_doctor@$DOMAIN"     # DOCTOR
E_G="sa_test_g_student@$DOMAIN"    # STUDENT

mk_user "$E_A" ADMIN '["SUPER_ADMIN"]'
mk_user "$E_B" ADMIN
mk_user "$E_C" ADMIN '["USERS_MANAGE"]'
mk_user "$E_D" ADMIN '["AUDIT_VIEW"]'
mk_user "$E_E" ADMIN '["DATABASE_MANAGE"]'
mk_user "$E_F" DOCTOR
mk_user "$E_G" STUDENT

TA=$(login "$E_A" "$PW"); TB=$(login "$E_B" "$PW"); TC=$(login "$E_C" "$PW")
TD=$(login "$E_D" "$PW"); TE=$(login "$E_E" "$PW"); TF=$(login "$E_F" "$PW"); TG=$(login "$E_G" "$PW")
for v in TA TB TC TD TE TF TG; do
  [ -n "${!v}" ] || { echo "Login failed for $v — check account creation / TEST_PW / login rate limit"; exit 1; }
done
ID_A=$(uid "$E_A"); ID_B=$(uid "$E_B"); ID_C=$(uid "$E_C"); ID_D=$(uid "$E_D"); ID_G=$(uid "$E_G")
echo "  ids: A=$ID_A B=$ID_B C=$ID_C D=$ID_D G=$ID_G"

# ---------- 1. permission resolution ----------
echo; echo "== 1. my-permissions =="
expect_jq "A explicit super"   "$TA" /api/admin/my-permissions '.is_super' true
expect_jq "B legacy super"     "$TB" /api/admin/my-permissions '.is_super' true
expect_jq "C limited"          "$TC" /api/admin/my-permissions '.is_super' false
expect_jq "C codes"            "$TC" /api/admin/my-permissions '.permissions|join(",")' USERS_MANAGE
expect_jq "D codes"            "$TD" /api/admin/my-permissions '.permissions|join(",")' AUDIT_VIEW

# ---------- 2. per-permission gating ----------
echo; echo "== 2. each permission gates its routes =="
expect "A  users"            200 GET "$TA" /api/admin/users
expect "B  users"            200 GET "$TB" /api/admin/users
expect "C  users"            200 GET "$TC" /api/admin/users
expect "D  users (denied)"   403 GET "$TD" /api/admin/users
expect "D  audit-logs"       200 GET "$TD" /api/admin/audit-logs
expect "C  audit-logs (denied)" 403 GET "$TC" /api/admin/audit-logs
expect "D  phi-access-logs"  200 GET "$TD" /api/admin/phi-access-logs
expect "D  telemetry (denied)"  403 GET "$TD" /api/admin/telemetry
expect "A  telemetry"        200 GET "$TA" /api/admin/telemetry
expect "D  db tables (denied)"  403 GET "$TD" /api/admin/db/tables
expect "E  db tables"        200 GET "$TE" /api/admin/db/tables
expect "D  retention status (denied)" 403 GET "$TD" /api/privacy/retention/status
expect "A  retention status" 200 GET "$TA" /api/privacy/retention/status
expect "D  analytics (denied)" 403 GET "$TD" /api/analytics/summary
expect "A  analytics"        200 GET "$TA" /api/analytics/summary

# ---------- 3. super-only actions, attempted by limited admin C ----------
echo; echo "== 3. limited admin C (USERS_MANAGE) must NOT touch admin accounts =="
NEWADMIN=$(jq -n --arg e "sa_test_x_$RANDOM@$DOMAIN" --arg pw "$PW" \
  '{first_name:"X",last_name:"X",email:$e,password:$pw,role_code:"ADMIN",is_active:true}')
expect "C creates ADMIN"                   403 POST  "$TC" /api/admin/users "$NEWADMIN"
expect "C promotes student -> ADMIN (PATCH)" 403 PATCH "$TC" "/api/admin/users/$ID_G/role" '{"role_code":"ADMIN"}'
expect "C promotes student -> ADMIN (PUT)"   403 PUT   "$TC" "/api/admin/users/$ID_G" \
  "$(jq -n --arg e "$E_G" '{first_name:"SA",last_name:"Test",email:$e,is_active:true,role_code:"ADMIN"}')"
expect "C demotes admin D (PATCH)"         403 PATCH "$TC" "/api/admin/users/$ID_D/role" '{"role_code":"STUDENT"}'
expect "C edits admin D (PUT)"             403 PUT   "$TC" "/api/admin/users/$ID_D" \
  "$(jq -n --arg e "$E_D" '{first_name:"Hacked",last_name:"Test",email:$e,is_active:true}')"
expect "C resets admin D password"         403 POST  "$TC" "/api/admin/users/$ID_D/reset-password" '{"newPassword":"Hacked#12345"}'
expect "C resets super A password"         403 POST  "$TC" "/api/admin/users/$ID_A/reset-password" '{"newPassword":"Hacked#12345"}'
expect "C edits admin D permissions"       403 PUT   "$TC" "/api/admin/users/$ID_D/permissions" '{"admin_permissions":["SUPER_ADMIN"]}'
expect "C edits OWN permissions"           403 PUT   "$TC" "/api/admin/users/$ID_C/permissions" '{"admin_permissions":["SUPER_ADMIN"]}'
expect "C changes OWN role"                403 PUT   "$TC" "/api/admin/users/$ID_C" \
  "$(jq -n --arg e "$E_C" '{first_name:"SA",last_name:"Test",email:$e,is_active:true,role_code:"STUDENT"}')"
expect "C suspends OWN account"            403 PUT   "$TC" "/api/admin/users/$ID_C" \
  "$(jq -n --arg e "$E_C" '{first_name:"SA",last_name:"Test",email:$e,is_active:false}')"
# sanity: C CAN still manage normal users
expect "C resets a STUDENT password (allowed)" 200 POST "$TC" "/api/admin/users/$ID_G/reset-password" "{\"newPassword\":\"$PW\"}"

# ---------- 4. DB Studio protections ----------
echo; echo "== 4. DB Studio =="
expect "E reads USERS" 200 GET "$TE" /api/admin/db/tables/USERS
if grep -Eq '\$2[aby]\$[0-9]{2}\$' "$BODY"; then
  FAIL_N=$((FAIL_N+1)); echo "  FAIL USERS response leaks a bcrypt hash"
else
  PASS_N=$((PASS_N+1)); echo "  PASS USERS response has no bcrypt hash"
fi
for T in USERS ROLES USER_ROLES ADMIN_PERMISSIONS USER_ADMIN_PERMISSIONS; do
  expect "E POST   $T (denied)" 403 POST   "$TE" "/api/admin/db/tables/$T/rows" '{"x":1}'
  expect "E PUT    $T (denied)" 403 PUT    "$TE" "/api/admin/db/tables/$T/rows" '{"x":1}'
  expect "E DELETE $T (denied)" 403 DELETE "$TE" "/api/admin/db/tables/$T/rows" '{"x":1}'
done
for T in AUDIT_LOGS PHI_ACCESS_LOGS INVENTORY_LOGS; do
  expect "A (super) POST $T (ledger, denied)" 403 POST "$TA" "/api/admin/db/tables/$T/rows" '{"x":1}'
done

# ---------- 5. super positive path + live revocation ----------
echo; echo "== 5. super admin A can manage admins; changes apply live =="
expect "D telemetry before grant (denied)" 403 GET "$TD" /api/admin/telemetry
expect "A grants D AUDIT_VIEW+TELEMETRY_VIEW" 200 PUT "$TA" "/api/admin/users/$ID_D/permissions" \
  '{"admin_permissions":["AUDIT_VIEW","TELEMETRY_VIEW"]}'
expect "D telemetry after grant, SAME token" 200 GET "$TD" /api/admin/telemetry
expect "A revokes TELEMETRY_VIEW"            200 PUT "$TA" "/api/admin/users/$ID_D/permissions" '{"admin_permissions":["AUDIT_VIEW"]}'
expect "D telemetry after revoke, SAME token (denied)" 403 GET "$TD" /api/admin/telemetry
expect "A resets admin D password"           200 POST "$TA" "/api/admin/users/$ID_D/reset-password" "{\"newPassword\":\"$PW\"}"
expect "A edits OWN permissions (denied by design)" 403 PUT "$TA" "/api/admin/users/$ID_A/permissions" '{"admin_permissions":["SUPER_ADMIN"]}'
expect "A sets grants on a non-admin (rejected)" 400 PUT "$TA" "/api/admin/users/$ID_G/permissions" '{"admin_permissions":["AUDIT_VIEW"]}'
expect "A sends unknown code (rejected)"     400 PUT "$TA" "/api/admin/users/$ID_D/permissions" '{"admin_permissions":["NOPE_CODE"]}'
expect "A sends non-array (rejected)"        400 PUT "$TA" "/api/admin/users/$ID_D/permissions" '{"admin_permissions":"AUDIT_VIEW"}'

# ---------- 6. non-admin roles ----------
echo; echo "== 6. non-admin roles =="
expect "Doctor  /api/admin/users (denied)"  403 GET "$TF" /api/admin/users
expect "Student /api/admin/users (denied)"  403 GET "$TG" /api/admin/users
expect "Doctor  analytics (allowed by design)" 200 GET "$TF" /api/analytics/summary
expect "No token (denied)"                  401 GET "" /api/admin/users

# ---------- 7. edge cases worth a human look ----------
echo; echo "== 7. edge cases (informational — read the results) =="
S=$(call PUT "$TA" "/api/admin/users/$ID_D/permissions" '{"admin_permissions":[]}')
call GET "$TD" /api/admin/my-permissions >/dev/null
echo "  Empty permission list -> HTTP $S ; D now: $(jq -c '{is_super,permissions}' "$BODY")"
echo "    (is_super:true means un-ticking every box silently makes the admin a FULL super admin)"
# put D back to limited
call PUT "$TA" "/api/admin/users/$ID_D/permissions" '{"admin_permissions":["AUDIT_VIEW"]}' >/dev/null

echo; echo "Demoted-admin token test: demote D to STUDENT, then reuse D's OLD token."
call PATCH "$TA" "/api/admin/users/$ID_D/role" '{"role_code":"STUDENT"}' >/dev/null
echo "  D old token on /api/admin/users -> HTTP $(call GET "$TD" /api/admin/users)  (403 = good; 200 = demotion not enforced until token expiry)"
echo "  D old token on /api/admin/db/tables -> HTTP $(call GET "$TD" /api/admin/db/tables)"
call PATCH "$TA" "/api/admin/users/$ID_D/role" '{"role_code":"ADMIN"}' >/dev/null
call PUT "$TA" "/api/admin/users/$ID_D/permissions" '{"admin_permissions":["AUDIT_VIEW"]}' >/dev/null

echo
echo "================  $PASS_N passed, $FAIL_N failed  ================"
echo "Also check in the DB / UI: AUDIT_LOGS rows exist for each successful super action"
echo "  (e.g. ADMIN_PERMISSION_SET_REPLACE, ADMIN_FORCE_PASSWORD_RESET)."
rm -f "$BODY"
[ "$FAIL_N" -eq 0 ]