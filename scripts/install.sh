#!/bin/bash
# Quantcept installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Fincept-Corporation/Quantcept/main/scripts/install.sh | bash

set -e

BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}Installing Quantcept...${RESET}"
echo ""

# Check for Node.js or Bun
if command -v bun &> /dev/null; then
    RUNTIME="bun"
    echo -e "${GREEN}Found Bun$(bun --version)${RESET}"
elif command -v node &> /dev/null; then
    RUNTIME="node"
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}Node.js 18+ required (found v${NODE_VERSION})${RESET}"
        exit 1
    fi
    echo -e "${GREEN}Found Node.js $(node --version)${RESET}"
else
    echo -e "${RED}Node.js 18+ or Bun is required.${RESET}"
    echo "Install Node.js: https://nodejs.org"
    echo "Install Bun: https://bun.sh"
    exit 1
fi

# Install via npm
if [ "$RUNTIME" = "bun" ]; then
    bun install -g quantcept
else
    npm install -g quantcept
fi

echo ""
echo -e "${GREEN}${BOLD}Quantcept installed successfully!${RESET}"
echo ""
echo "Get started:"
echo "  quantcept"
echo ""
echo "Set your LLM credentials:"
echo "  export LLM_API_KEY=\"your-api-key\""
echo "  export LLM_BASE_URL=\"https://your-llm-provider.com/api\""
