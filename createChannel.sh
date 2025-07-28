#!/bin/bash

# Set this to the name of the channel you want to create
export CHANNEL_NAME="logistics-channel"

# Set this to the path of your configuration files
export FABRIC_CFG_PATH=${PWD}/artifacts/channel/config/

# Set this to true if you are using TLS
export CORE_PEER_TLS_ENABLED=true

# Define the CA file for the orderer
export ORDERER_CA=${PWD}/artifacts/channel/crypto-config/ordererOrganizations/logistics.com/orderers/orderer1.logistics.com/msp/tlscacerts/tlsca.logistics.com-cert.pem

# Define the CA files for each organization's peers
export ORIGIN_ORG_CA=${PWD}/artifacts/channel/crypto-config/peerOrganizations/origin.com/peers/origin-station.origin.com/tls/ca.crt
export DEST_ORG_CA=${PWD}/artifacts/channel/crypto-config/peerOrganizations/dest.com/peers/dest-station.dest.com/tls/ca.crt

# --- Helper Functions to Set Environment for a Specific Peer ---

setGlobalsForOriginStation(){
    export CORE_PEER_LOCALMSPID="OriginOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$ORIGIN_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/origin.com/users/Admin@origin.com/msp
    export CORE_PEER_ADDRESS=localhost:7051
}

setGlobalsForOriginRail(){
    export CORE_PEER_LOCALMSPID="OriginOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$ORIGIN_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/origin.com/users/Admin@origin.com/msp
    export CORE_PEER_ADDRESS=localhost:8051
}

setGlobalsForOriginCustoms(){
    export CORE_PEER_LOCALMSPID="OriginOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$ORIGIN_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/origin.com/users/Admin@origin.com/msp
    export CORE_PEER_ADDRESS=localhost:9051
}

setGlobalsForOriginBorder(){
    export CORE_PEER_LOCALMSPID="OriginOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$ORIGIN_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/origin.com/users/Admin@origin.com/msp
    export CORE_PEER_ADDRESS=localhost:10051
}

setGlobalsForDestStation(){
    export CORE_PEER_LOCALMSPID="DestOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$DEST_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/dest.com/users/Admin@dest.com/msp
    export CORE_PEER_ADDRESS=localhost:11051
}

setGlobalsForDestRail(){
    export CORE_PEER_LOCALMSPID="DestOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$DEST_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/dest.com/users/Admin@dest.com/msp
    export CORE_PEER_ADDRESS=localhost:12051
}

setGlobalsForDestCustoms(){
    export CORE_PEER_LOCALMSPID="DestOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$DEST_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/dest.com/users/Admin@dest.com/msp
    export CORE_PEER_ADDRESS=localhost:13051
}

setGlobalsForDestBorder(){
    export CORE_PEER_LOCALMSPID="DestOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$DEST_ORG_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/dest.com/users/Admin@dest.com/msp
    export CORE_PEER_ADDRESS=localhost:14051
}

# --- Channel Operations ---

createChannel(){
    echo "Creating channel..."
    setGlobalsForOriginStation

    peer channel create -o localhost:7050 -c $CHANNEL_NAME \
    --ordererTLSHostnameOverride orderer1.logistics.com \
    -f ./artifacts/channel/${CHANNEL_NAME}.tx --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block \
    --tls $CORE_PEER_TLS_ENABLED --cafile $ORDERER_CA
    echo "Channel '$CHANNEL_NAME' created"
}

joinChannel(){
    echo "Joining all peers to channel '$CHANNEL_NAME'..."

    setGlobalsForOriginStation; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block
    setGlobalsForOriginRail; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block
    setGlobalsForOriginCustoms; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block
    setGlobalsForOriginBorder; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block

    setGlobalsForDestStation; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block
    setGlobalsForDestRail; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block
    setGlobalsForDestCustoms; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block
    setGlobalsForDestBorder; peer channel join -b ./channel-artifacts/$CHANNEL_NAME.block

    echo "All peers have joined the channel"
}

updateAnchorPeers(){
    echo "Updating anchor peers..."

    setGlobalsForOriginStation
    peer channel update -o localhost:7050 --ordererTLSHostnameOverride orderer1.logistics.com \
    -c $CHANNEL_NAME -f ./artifacts/channel/${CORE_PEER_LOCALMSPID}anchors.tx \
    --tls $CORE_PEER_TLS_ENABLED --cafile $ORDERER_CA

    setGlobalsForDestStation
    peer channel update -o localhost:7050 --ordererTLSHostnameOverride orderer1.logistics.com \
    -c $CHANNEL_NAME -f ./artifacts/channel/${CORE_PEER_LOCALMSPID}anchors.tx \
    --tls $CORE_PEER_TLS_ENABLED --cafile $ORDERER_CA

    echo "Anchor peers updated"
}

# --- Execution ---

echo "--- Starting Channel Creation ---"
createChannel
echo "--- Joining Channel ---"
joinChannel
echo "--- Updating Anchor Peers ---"
updateAnchorPeers
echo "--- Channel Setup Complete ---"


