#!/bin/bash
# Verification script for Expo/EAS configuration
# Run this after cloning the repo to verify everything is set up correctly

set -e

echo "🔍 Verifying Bunkd Mobile App - Expo/EAS Configuration"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "app.json" ]; then
    echo -e "${RED}❌ Error: app.json not found${NC}"
    echo "Please run this script from apps/mobile directory"
    exit 1
fi

echo "1️⃣  Checking app.json configuration..."

# Extract values from app.json
OWNER=$(grep -o '"owner": "[^"]*"' app.json | cut -d'"' -f4)
SLUG=$(grep -o '"slug": "[^"]*"' app.json | cut -d'"' -f4)
PROJECT_ID=$(grep -o '"projectId": "[^"]*"' app.json | cut -d'"' -f4)
IOS_BUNDLE=$(grep -o '"bundleIdentifier": "[^"]*"' app.json | cut -d'"' -f4)
ANDROID_PACKAGE=$(grep -o '"package": "[^"]*"' app.json | cut -d'"' -f4)

# Verify expected values
EXPECTED_OWNER="execom-inc"
EXPECTED_SLUG="bunkd"
EXPECTED_PROJECT_ID="13cf0542-2cdd-4642-a2b1-6a85169441c0"
EXPECTED_IOS_BUNDLE="com.execominc.bunkd"
EXPECTED_ANDROID_PACKAGE="com.execominc.bunkd"

echo "   Owner: $OWNER"
echo "   Slug: $SLUG"
echo "   Project ID: $PROJECT_ID"
echo "   iOS Bundle ID: $IOS_BUNDLE"
echo "   Android Package: $ANDROID_PACKAGE"

if [ "$OWNER" != "$EXPECTED_OWNER" ] || \
   [ "$SLUG" != "$EXPECTED_SLUG" ] || \
   [ "$PROJECT_ID" != "$EXPECTED_PROJECT_ID" ] || \
   [ "$IOS_BUNDLE" != "$EXPECTED_IOS_BUNDLE" ] || \
   [ "$ANDROID_PACKAGE" != "$EXPECTED_ANDROID_PACKAGE" ]; then
    echo -e "${RED}❌ Configuration mismatch detected!${NC}"
    echo ""
    echo "Expected values:"
    echo "   Owner: $EXPECTED_OWNER"
    echo "   Slug: $EXPECTED_SLUG"
    echo "   Project ID: $EXPECTED_PROJECT_ID"
    echo "   iOS Bundle ID: $EXPECTED_IOS_BUNDLE"
    echo "   Android Package: $EXPECTED_ANDROID_PACKAGE"
    exit 1
fi

echo -e "${GREEN}✅ app.json configuration is correct${NC}"
echo ""

echo "2️⃣  Checking eas.json configuration..."
if [ ! -f "eas.json" ]; then
    echo -e "${RED}❌ eas.json not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ eas.json exists${NC}"
echo ""

echo "3️⃣  Checking EAS CLI..."
if ! command -v eas &> /dev/null; then
    echo -e "${YELLOW}⚠️  EAS CLI not found globally${NC}"
    echo "   Checking for local installation..."
    if ! npx eas --version &> /dev/null; then
        echo -e "${RED}❌ EAS CLI not available${NC}"
        echo ""
        echo "To install: npm install -g eas-cli"
        exit 1
    else
        EAS_VERSION=$(npx eas --version | head -1)
        echo -e "${GREEN}✅ EAS CLI available (local): $EAS_VERSION${NC}"
    fi
else
    EAS_VERSION=$(eas --version | head -1)
    echo -e "${GREEN}✅ EAS CLI installed: $EAS_VERSION${NC}"
fi
echo ""

echo "4️⃣  Checking EAS authentication..."
if npx eas whoami &> /dev/null; then
    EAS_USER=$(npx eas whoami 2>/dev/null | head -1)
    echo -e "${GREEN}✅ Authenticated as: $EAS_USER${NC}"
else
    echo -e "${YELLOW}⚠️  Not authenticated with EAS${NC}"
    echo "   Run: eas login"
fi
echo ""

echo "5️⃣  Verifying project linkage..."
if npx eas project:info &> /dev/null; then
    PROJECT_INFO=$(npx eas project:info 2>/dev/null)
    LINKED_PROJECT_ID=$(echo "$PROJECT_INFO" | grep "ID" | awk '{print $2}')

    if [ "$LINKED_PROJECT_ID" = "$EXPECTED_PROJECT_ID" ]; then
        echo -e "${GREEN}✅ Project correctly linked to @execom-inc/bunkd${NC}"
        echo "   Project ID: $LINKED_PROJECT_ID"
    else
        echo -e "${RED}❌ Project ID mismatch!${NC}"
        echo "   Expected: $EXPECTED_PROJECT_ID"
        echo "   Got: $LINKED_PROJECT_ID"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Unable to verify project linkage (may need authentication)${NC}"
fi
echo ""

echo "6️⃣  Checking package.json scripts..."
if grep -q '"build:ios"' package.json && \
   grep -q '"build:android"' package.json && \
   grep -q '"project:info"' package.json; then
    echo -e "${GREEN}✅ Build scripts configured${NC}"
else
    echo -e "${YELLOW}⚠️  Some build scripts may be missing${NC}"
fi
echo ""

echo "=================================================="
echo -e "${GREEN}✅ Verification Complete!${NC}"
echo ""
echo "Your Expo/EAS setup is correctly configured for:"
echo "   Project: @execom-inc/bunkd"
echo "   iOS: com.execominc.bunkd"
echo "   Android: com.execominc.bunkd"
echo ""
echo "📚 Next steps:"
echo "   - Run 'npm run project:info' to view project details"
echo "   - Run 'npm run build:preview:ios' for iOS simulator build"
echo "   - Run 'npm run build:preview:android' for Android APK build"
echo "   - See EAS-DEPLOYMENT.md for full documentation"
echo ""
