#!/bin/bash

# Simple Blockchain Network Startup Script
# Following exact user workflow

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting Blockchain Network...${NC}"

# Base directory
BASE_DIR="$HOME/test-blockchain/testing/BasicNetwork-2.0"

# Step 0: Cleanup previous setup
echo -e "${BLUE}Step 0: Cleaning up previous setup...${NC}"
cd "$BASE_DIR/artifacts"

# Stop and remove containers
docker-compose down 2>/dev/null || true

# Remove any remaining containers
docker rm -f $(docker ps -aq) 2>/dev/null || true

# Clean up volumes and networks
docker volume prune -f 2>/dev/null || true
docker network prune -f 2>/dev/null || true

echo -e "${GREEN}✅ Cleanup completed${NC}"

# Step 1: Create crypto materials
echo -e "${BLUE}Step 1: Creating crypto materials...${NC}"
cd "$BASE_DIR/artifacts/channel"
./create-artifacts.sh

# Step 2: Start network
echo -e "${BLUE}Step 2: Starting network containers...${NC}"
cd "$BASE_DIR/artifacts"
docker-compose up -d

# Wait for network to start
echo -e "${BLUE}Waiting for network to initialize...${NC}"
sleep 15

# Step 3: Create channel
echo -e "${BLUE}Step 3: Creating channel...${NC}"
cd "$BASE_DIR"
./createChannel.sh

# Step 4: Deploy chaincode
echo -e "${BLUE}Step 4: Deploying chaincode...${NC}"
./deployDocumentCC.sh

# Step 5: Start application (optional)
if [ -d "$BASE_DIR/application" ] && [ -f "$BASE_DIR/application/index.js" ]; then
    echo -e "${BLUE}Step 5: Starting application...${NC}"
    cd "$BASE_DIR/application"
    
    # Kill existing app
    pkill -f "node index.js" 2>/dev/null || true
    
    # Import admin if script exists
    if [ -f "importAdmin.js" ]; then
        rm -rf wallet 2>/dev/null || true
        node importAdmin.js
    fi
    
    # Start app
    nohup node index.js > /tmp/blockchain-app.log 2>&1 &
    
    echo -e "${GREEN}✅ Application started on http://localhost:8081${NC}"
fi

echo -e "${GREEN}"
echo "🎉 Blockchain Network Started Successfully!"
echo "📋 Running containers: $(docker ps -q | wc -l)"
echo "🌐 Test: curl http://localhost:8081/health"
echo -e "${NC}"
