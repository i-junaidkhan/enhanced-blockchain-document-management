###############################################################################
#  Logistics-Network – chaincode one-shot deployment script (8 peers, 2 orgs) #
###############################################################################
set -euo pipefail

# --------------------------------------------------------------------------- #
# Global constants                                                            #
# --------------------------------------------------------------------------- #
export CHANNEL_NAME="logistics-channel"
export CC_NAME="document_cc"
export CC_SRC_PATH="./artifacts/src/github.com/document_cc/go"
export CC_RUNTIME_LANGUAGE="golang"
export CC_VERSION="1"
export CC_SEQUENCE="1"

export FABRIC_CFG_PATH=${PWD}/artifacts/channel/config/
export CORE_PEER_TLS_ENABLED=true

# --------------------------------------------------------------------------- #
# TLS roots (orderer + one peer TLS CA per org is enough – they’re identical) #
# --------------------------------------------------------------------------- #
export ORDERER_CA=${PWD}/artifacts/channel/crypto-config/ordererOrganizations/logistics.com/orderers/orderer1.logistics.com/msp/tlscacerts/tlsca.logistics.com-cert.pem
export ORIGIN_ORG_CA=${PWD}/artifacts/channel/crypto-config/peerOrganizations/origin.com/peers/origin-station.origin.com/tls/ca.crt
export DEST_ORG_CA=${PWD}/artifacts/channel/crypto-config/peerOrganizations/dest.com/peers/dest-station.dest.com/tls/ca.crt

# --------------------------------------------------------------------------- #
# Helper – orderer MSP context                                                #
# --------------------------------------------------------------------------- #
setGlobalsForOrderer() {
    export CORE_PEER_LOCALMSPID="OrdererMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$ORDERER_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/ordererOrganizations/logistics.com/users/Admin@logistics.com/msp
}

# --------------------------------------------------------------------------- #
# Helper – peer MSP contexts (8 peers)                                        #
# --------------------------------------------------------------------------- #
# OriginOrg (Org 1)
setGlobalsForOriginStation() { export CORE_PEER_LOCALMSPID="OriginOrgMSP"; export CORE_PEER_TLS_ROOTCERT_FILE=$ORIGIN_ORG_CA; export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/origin.com/users/Admin@origin.com/msp; export CORE_PEER_ADDRESS=localhost:7051; }
setGlobalsForOriginRail()    { setGlobalsForOriginStation; export CORE_PEER_ADDRESS=localhost:8051; }
setGlobalsForOriginCustoms() { setGlobalsForOriginStation; export CORE_PEER_ADDRESS=localhost:9051; }
setGlobalsForOriginBorder()  { setGlobalsForOriginStation; export CORE_PEER_ADDRESS=localhost:10051; }

# DestOrg (Org 2)
setGlobalsForDestStation()   { export CORE_PEER_LOCALMSPID="DestOrgMSP";   export CORE_PEER_TLS_ROOTCERT_FILE=$DEST_ORG_CA;   export CORE_PEER_MSPCONFIGPATH=${PWD}/artifacts/channel/crypto-config/peerOrganizations/dest.com/users/Admin@dest.com/msp;   export CORE_PEER_ADDRESS=localhost:11051; }
setGlobalsForDestRail()      { setGlobalsForDestStation; export CORE_PEER_ADDRESS=localhost:12051; }
setGlobalsForDestCustoms()   { setGlobalsForDestStation; export CORE_PEER_ADDRESS=localhost:13051; }
setGlobalsForDestBorder()    { setGlobalsForDestStation; export CORE_PEER_ADDRESS=localhost:14051; }

# Convenience arrays for loops
ORIGIN_PEERS=(setGlobalsForOriginStation setGlobalsForOriginRail setGlobalsForOriginCustoms setGlobalsForOriginBorder)
DEST_PEERS=(setGlobalsForDestStation setGlobalsForDestRail setGlobalsForDestCustoms setGlobalsForDestBorder)

# --------------------------------------------------------------------------- #
# Step 0 – vendor Go dependencies (once)                                      #
# --------------------------------------------------------------------------- #
presetup() {
  echo "Vendoring Go dependencies …"
  pushd "${CC_SRC_PATH}" >/dev/null
  GO111MODULE=on go mod tidy
  popd >/dev/null
  echo "✅ Go modules vendored."
}

# --------------------------------------------------------------------------- #
# Step 1 – Package chaincode (run from *one* peer context)                    #
# --------------------------------------------------------------------------- #
packageChaincode() {
  echo "📦  Packaging chaincode …"
  rm -f "${CC_NAME}.tar.gz"
  setGlobalsForOriginStation                     # any peer will do
  peer lifecycle chaincode package "${CC_NAME}.tar.gz" \
      --path "${CC_SRC_PATH}" --lang "${CC_RUNTIME_LANGUAGE}" \
      --label "${CC_NAME}_${CC_VERSION}"
  echo "✅ Chaincode packaged."
}

# --------------------------------------------------------------------------- #
# Step 2 – Install on all 8 peers                                             #
# --------------------------------------------------------------------------- #
installChaincode() {
  echo "⬇️  Installing chaincode on 8 peers …"
  for f in "${ORIGIN_PEERS[@]}" "${DEST_PEERS[@]}"; do
      $f
      peer lifecycle chaincode install "${CC_NAME}.tar.gz"
  done
  echo "✅ Chaincode installed on every peer."
}

# --------------------------------------------------------------------------- #
# Step 3 – Capture PACKAGE_ID once                                            #
# --------------------------------------------------------------------------- #
queryInstalled() {
  echo "🔍 Query installed (capture PACKAGE_ID) …"
  setGlobalsForOriginStation
  peer lifecycle chaincode queryinstalled >& log.txt
  cat log.txt
  PACKAGE_ID=$(sed -n "/${CC_NAME}_${CC_VERSION}/{s/^Package ID: //; s/, Label:.*//;p;}" log.txt)
  if [[ -z "${PACKAGE_ID}" ]]; then
      echo "❌  PACKAGE_ID not found!"; exit 1
  fi
  echo "📦  PACKAGE_ID=${PACKAGE_ID}"
}

# --------------------------------------------------------------------------- #
# Step 4 – Approvals (one per org)                                            #
# --------------------------------------------------------------------------- #
approveForOriginOrg() {
  echo "✍️  Approving for OriginOrg …"
  setGlobalsForOriginStation
  peer lifecycle chaincode approveformyorg -o localhost:7050 \
      --ordererTLSHostnameOverride orderer1.logistics.com --tls \
      --cafile "$ORDERER_CA" \
      --channelID "$CHANNEL_NAME" --name "$CC_NAME" \
      --version "$CC_VERSION" --package-id "$PACKAGE_ID" \
      --sequence "$CC_SEQUENCE" --init-required
}

approveForDestOrg() {
  echo "✍️  Approving for DestOrg …"
  setGlobalsForDestStation
  peer lifecycle chaincode approveformyorg -o localhost:7050 \
      --ordererTLSHostnameOverride orderer1.logistics.com --tls \
      --cafile "$ORDERER_CA" \
      --channelID "$CHANNEL_NAME" --name "$CC_NAME" \
      --version "$CC_VERSION" --package-id "$PACKAGE_ID" \
      --sequence "$CC_SEQUENCE" --init-required
}

# --------------------------------------------------------------------------- #
# (Optional) Step 5 – Check commit readiness                                  #
# --------------------------------------------------------------------------- #
checkCommitReadiness() {
  echo "🧐 Checking commit readiness …"
  setGlobalsForOriginStation
  peer lifecycle chaincode checkcommitreadiness \
      --channelID "$CHANNEL_NAME" --name "$CC_NAME" \
      --version "$CC_VERSION" --sequence "$CC_SEQUENCE" \
      --output json --init-required
}

# --------------------------------------------------------------------------- #
# Step 6 – Commit definition (reference *all 8* peers)                        #
# --------------------------------------------------------------------------- #
commitChaincodeDefinition() {
  echo "🚀 Committing chaincode definition …"
  # Build address/CA list programmatically
  ADDR_FLAGS=(
      --peerAddresses localhost:7051  --tlsRootCertFiles "$ORIGIN_ORG_CA"
      --peerAddresses localhost:8051  --tlsRootCertFiles "$ORIGIN_ORG_CA"
      --peerAddresses localhost:9051  --tlsRootCertFiles "$ORIGIN_ORG_CA"
      --peerAddresses localhost:10051 --tlsRootCertFiles "$ORIGIN_ORG_CA"
      --peerAddresses localhost:11051 --tlsRootCertFiles "$DEST_ORG_CA"
      --peerAddresses localhost:12051 --tlsRootCertFiles "$DEST_ORG_CA"
      --peerAddresses localhost:13051 --tlsRootCertFiles "$DEST_ORG_CA"
      --peerAddresses localhost:14051 --tlsRootCertFiles "$DEST_ORG_CA"
  )
  setGlobalsForOriginStation
  peer lifecycle chaincode commit -o localhost:7050 \
      --ordererTLSHostnameOverride orderer1.logistics.com \
      --tls --cafile "$ORDERER_CA" \
      --channelID "$CHANNEL_NAME" --name "$CC_NAME" \
      "${ADDR_FLAGS[@]}" \
      --version "$CC_VERSION" --sequence "$CC_SEQUENCE" --init-required
  echo "✅ Definition committed."
}

# --------------------------------------------------------------------------- #
# Step 7 – Query committed                                                    #
# --------------------------------------------------------------------------- #
queryCommitted() {
  echo "🔍 Query committed …"
  setGlobalsForOriginStation
  peer lifecycle chaincode querycommitted --channelID "$CHANNEL_NAME" --name "$CC_NAME"
}

# --------------------------------------------------------------------------- #
# Step 8 – Init invocation (endorsement from all 8 peers)                     #
# --------------------------------------------------------------------------- #
chaincodeInvokeInit() {
  echo "🏁 Invoking chaincode Init …"
  setGlobalsForOriginStation
  peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer1.logistics.com \
      --tls --cafile "$ORDERER_CA" \
      -C "$CHANNEL_NAME" -n "$CC_NAME" \
      --peerAddresses localhost:7051  --tlsRootCertFiles "$ORIGIN_ORG_CA" \
      --peerAddresses localhost:8051  --tlsRootCertFiles "$ORIGIN_ORG_CA" \
      --peerAddresses localhost:9051  --tlsRootCertFiles "$ORIGIN_ORG_CA" \
      --peerAddresses localhost:10051 --tlsRootCertFiles "$ORIGIN_ORG_CA" \
      --peerAddresses localhost:11051 --tlsRootCertFiles "$DEST_ORG_CA" \
      --peerAddresses localhost:12051 --tlsRootCertFiles "$DEST_ORG_CA" \
      --peerAddresses localhost:13051 --tlsRootCertFiles "$DEST_ORG_CA" \
      --peerAddresses localhost:14051 --tlsRootCertFiles "$DEST_ORG_CA" \
      --isInit -c '{"Args":[]}'
}

###############################################################################
# Main pipeline                                                               #
###############################################################################
echo "────────────────────  🚢  Chaincode deployment start  ────────────────────"
presetup
packageChaincode
installChaincode
queryInstalled
approveForOriginOrg
approveForDestOrg
checkCommitReadiness
commitChaincodeDefinition
queryCommitted
chaincodeInvokeInit
echo "🎉  Chaincode deployed successfully on all 8 peers!"