#!/bin/bash

# Get session token from magic link verification
TOKEN="$1"

if [ -z "$TOKEN" ]; then
  echo "Usage: $0 <magic-link-token>"
  exit 1
fi

echo "🧪 Testing Full API Flow with Authentication"
echo ""

# Step 1: Verify token and get session cookie
echo "Step 1: Verifying magic link token..."
COOKIE_RESPONSE=$(curl -s -i "http://localhost:4000/api/auth/magic-link/verify?token=$TOKEN" 2>&1)
SESSION_COOKIE=$(echo "$COOKIE_RESPONSE" | grep -i "set-cookie: better-auth.session_token=" | sed 's/.*better-auth.session_token=\([^;]*\).*/\1/' | sed 's/%2B/+/g' | sed 's/%3D/=/g')

if [ -z "$SESSION_COOKIE" ]; then
  echo "❌ Failed to get session cookie"
  exit 1
fi

echo "✅ Session cookie received"
echo ""

# Step 2: Create chat session
echo "Step 2: Creating chat session..."
SESSION_RESPONSE=$(curl -s -X POST http://localhost:4000/api/chat/sessions \
  -H "Content-Type: application/json" \
  -H "Cookie: better_auth.session_token=$SESSION_COOKIE")

echo "$SESSION_RESPONSE" | python3 -m json.tool

if echo "$SESSION_RESPONSE" | grep -q "error"; then
  echo "❌ Failed to create chat session"
  echo "Cookie used: $SESSION_COOKIE"
  exit 1
fi

SESSION_ID=$(echo "$SESSION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['session']['id'])" 2>/dev/null)

if [ -z "$SESSION_ID" ]; then
  echo "❌ Could not extract session ID"
  exit 1
fi

echo ""
echo "✅ Chat session created: $SESSION_ID"
echo ""

# Step 3: Send message to Claude
echo "Step 3: Sending message to Claude Agent..."
MESSAGE="Add a special promotion banner at the top of the homepage that says 'WINTER SPECIAL: 20% OFF All Services! Book Now!' in a bright yellow background"
echo "Message: $MESSAGE"
echo ""
echo "⏳ Waiting for Claude to process (may take 30-60 seconds)..."
echo ""

MESSAGE_RESPONSE=$(curl -s -X POST "http://localhost:4000/api/chat/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Cookie: better_auth.session_token=$SESSION_COOKIE" \
  -d "{\"content\":\"$MESSAGE\"}")

python3 << 'PYEOF'
import sys, json

response = '''$MESSAGE_RESPONSE'''
try:
    data = json.loads(response)
    if 'error' in data:
        print('❌ Error:', data['error'])
        sys.exit(1)
    else:
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
        print('✅ Full API test completed successfully!')
except json.JSONDecodeError as e:
    print('❌ Failed to parse response:', e)
    print('Response:', response[:200])
    sys.exit(1)
PYEOF
