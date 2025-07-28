#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo -e "${RED}"
echo "=============================================================================="
echo "🛑 STOPPING IPFS-ENABLED BLOCKCHAIN NETWORK"
echo "=============================================================================="
echo -e "${NC}"

# Stop application
if [ -f "/tmp/blockchain-app.pid" ]; then
    APP_PID=$(cat /tmp/blockchain-app.pid)
    if kill -0 $APP_PID 2>/dev/null; then
        print_status "Stopping blockchain application..."
        kill $APP_PID
        rm /tmp/blockchain-app.pid
        print_success "Application stopped"
    fi
fi

# Stop Docker network
print_status "Stopping blockchain network..."
cd "/home/krri/latest-fabric-HnT-blockchain/FabricNetwork-2.x/artifacts"

docker-compose -f "IPFS-docker-compose.yaml" down

print_success "IPFS-enabled blockchain network stopped"
