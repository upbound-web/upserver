#!/bin/bash

# Test API with a session cookie directly
# Usage: ./test-api-with-cookie.sh "SESSION_COOKIE_VALUE"

COOKIE="$1"

if [ -z "$COOKIE" ]; then
  echo "Usage: $0 <session-cookie-value>"
  echo ""
  echo "To get the cookie:"
  echo "1. Request magic link: curl -X POST http://localhost:4000/api/auth/sign-in/magic-link -H 'Content-Type: application/json' -d '{\"email\":\"windows@example.com\"}'"
  echo "2. Get token from backend console"
  echo "3. Verify and extract cookie: curl -v 'http://localhost:4000/api/auth/magic-link/verify?token=TOKEN' 2>&1 | grep set-cookie"
  echo "4. Run this script with the cookie value"
  exit 1
fi

echo "🧪 Testing Full API Flow"
echo ""

# Step 1: Create chat session
echo "Step 1: Creating chat session..."
SESSION_RESPONSE=$(curl -s -X POST http://localhost:4000/api/chat/sessions \
  -H "Content-Type: application/json" \
  -H "Cookie: better_auth.session_token=$COOKIE")

echo "$SESSION_RESPONSE" | python3 -m json.tool

if echo "$SESSION_RESPONSE" | grep -q "error"; then
  echo ""
  echo "❌ Failed to create chat session"
  echo "This usually means:"
  echo "  1. The cookie is invalid or expired"
  echo "  2. The auth configuration needs a baseURL setting"
  echo ""
  exit 1
fi

SESSION_ID=$(echo "$SESSION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['session']['id'])" 2>/dev/null)

echo ""
echo "✅ Chat session created: $SESSION_ID"
echo ""

# Step 2: Send message
echo "Step 2: Sending message to Claude Agent..."
MESSAGE="Add a special promotion banner at the top that says 'WINTER SPECIAL: 20% OFF! Book Now!' with a bright yellow background"
echo "Message: $MESSAGE"
echo ""
echo "⏳ Waiting for Claude (30-60 seconds)..."
echo ""

curl -s -X POST "http://localhost:4000/api/chat/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Cookie: better_auth.session_token=$COOKIE" \
  -d "{\"content\":\"$MESSAGE\"}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'error' in data:
    print('❌ Error:', data['error'])
    sys.exit(1)
print('═' * 70)
print('Claude Agent Response:')
print('═' * 70)
print()
print(data['message']['content'])
print()
print('═' * 70)
print('Metadata:')
print('═' * 70)
print('Flagged:', data['message']['flagged'])
print('Message ID:', data['message']['id'])
print()
print('✅ Full API test completed!')
"
