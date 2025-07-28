#!/bin/bash

function one_line_pem {
    # This function converts a PEM file into a single-line string for JSON embedding
    # Improved version that properly handles special characters and escaping
    awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' "$1" | sed 's/"/\\"/g'
}

function json_ccp {
    local ORG_NAME=$1
    local ORG_MSP=$2
    local PEER_HOST=$3
    local PEER_PORT=$4
    local CA_HOST=$5
    local CA_PORT=$6
    local CA_NAME=$7
    local PEERPEM_PATH=$8
    local CAPEM_PATH=$9

    # Check if the certificate files exist before proceeding
    if [ ! -f "$PEERPEM_PATH" ]; then
        echo "ERROR: Peer's TLS CA certificate not found at $PEERPEM_PATH"
        exit 1
    fi
    if [ ! -f "$CAPEM_PATH" ]; then
        echo "ERROR: CA's root certificate not found at $CAPEM_PATH"
        exit 1
    fi

    local PP=$(one_line_pem "$PEERPEM_PATH")
    local CP=$(one_line_pem "$CAPEM_PATH")

    # Use 'g' flag in sed to replace all occurrences
    sed -e "s/\${ORG_NAME}/$ORG_NAME/g" \
        -e "s/\${ORG_MSP}/$ORG_MSP/g" \
        -e "s/\${PEER_HOST}/$PEER_HOST/g" \
        -e "s/\${PEER_PORT}/$PEER_PORT/g" \
        -e "s/\${CA_HOST}/$CA_HOST/g" \
        -e "s/\${CA_PORT}/$CA_PORT/g" \
        -e "s/\${CA_NAME}/$CA_NAME/g" \
        -e "s#\${PEERPEM}#$PP#g" \
        -e "s#\${CAPEM}#$CP#g" \
        ./ccp-template.json
}

# --- Generate Connection Profile for OriginOrg ---
echo "Generating connection profile for OriginOrg..."
json_ccp "origin" \
    "OriginOrgMSP" \
    "origin-station.origin.com" \
    "7051" \
    "ca.origin.com" \
    "7054" \
    "ca.origin.com" \
    "../../artifacts/channel/crypto-config/peerOrganizations/origin.com/peers/origin-station.origin.com/tls/ca.crt" \
    "../../artifacts/channel/crypto-config/peerOrganizations/origin.com/ca/ca.origin.com-cert.pem" > connection-origin.json
echo "Generated connection-origin.json"
echo ""

# --- Generate Connection Profile for DestOrg ---
echo "Generating connection profile for DestOrg..."
json_ccp "dest" \
    "DestOrgMSP" \
    "dest-station.dest.com" \
    "11051" \
    "ca.dest.com" \
    "8054" \
    "ca.dest.com" \
    "../../artifacts/channel/crypto-config/peerOrganizations/dest.com/peers/dest-station.dest.com/tls/ca.crt" \
    "../../artifacts/channel/crypto-config/peerOrganizations/dest.com/ca/ca.dest.com-cert.pem" > connection-dest.json
echo "Generated connection-dest.json"
echo ""

echo "Script completed."
