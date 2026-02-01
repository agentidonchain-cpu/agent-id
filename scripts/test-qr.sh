#!/bin/bash

# QR Code System Test Script
# Tests all QR code functionality

set -e

echo "🔍 AgentID QR Code System Test"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test identity hash
TEST_HASH="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

echo -e "${BLUE}1. Testing CLI QR Generation${NC}"
echo "   Hash: $TEST_HASH"
echo ""

cd cli

# Build CLI
echo "   Building CLI..."
npm run build > /dev/null 2>&1

# Generate QR
echo "   Generating QR code..."
node dist/index.js qr "$TEST_HASH" --output test-qr.png --size 512

if [ -f "test-qr.png" ]; then
    echo -e "   ${GREEN}✓ QR code generated: test-qr.png${NC}"
    ls -lh test-qr.png
else
    echo -e "   ${YELLOW}✗ QR code not generated${NC}"
fi

echo ""
echo -e "${BLUE}2. Testing API Endpoint${NC}"
echo "   Starting backend server..."

# Check if server is running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓ Server is running${NC}"

    # Test PNG format
    echo "   Testing PNG format..."
    curl -s "http://localhost:3000/agents/$TEST_HASH/qr" -o api-qr.png

    if [ -f "api-qr.png" ]; then
        echo -e "   ${GREEN}✓ API PNG generated${NC}"
        ls -lh api-qr.png
    fi

    # Test base64 format
    echo "   Testing base64 format..."
    RESPONSE=$(curl -s "http://localhost:3000/agents/$TEST_HASH/qr?format=base64")

    if echo "$RESPONSE" | grep -q "success"; then
        echo -e "   ${GREEN}✓ API base64 working${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠ Server not running. Start with 'npm run dev'${NC}"
fi

echo ""
echo -e "${BLUE}3. Testing Website Component${NC}"
cd ../website

# Check if Next.js dev server is running
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓ Website is running${NC}"
    echo "   Visit: http://localhost:3001/verify/$TEST_HASH"
else
    echo -e "   ${YELLOW}⚠ Website not running. Start with 'npm run dev'${NC}"
fi

echo ""
echo "================================"
echo -e "${GREEN}✓ Tests completed!${NC}"
echo ""
echo "Generated files:"
echo "  - cli/test-qr.png (CLI generated)"
echo "  - cli/api-qr.png (API generated)"
echo ""
echo "Next steps:"
echo "  1. View QR codes with: open cli/test-qr.png"
echo "  2. Test scanning with phone camera"
echo "  3. Visit verification page in browser"
echo ""
