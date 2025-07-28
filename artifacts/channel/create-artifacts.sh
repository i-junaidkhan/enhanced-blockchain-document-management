#!/bin/bash

# Clean up previous artifacts
rm -rf ./crypto-config
rm -f genesis.block logistics-channel.tx
rm -f OriginOrgMSPanchors.tx DestOrgMSPanchors.tx

# Set the channel name
CHANNEL_NAME="logistics-channel"
# Set the system channel name
SYS_CHANNEL="sys-channel"

echo "Generating crypto material"
cryptogen generate --config=./crypto-config.yaml --output=./crypto-config/
if [ "$?" -ne 0 ]; then
  echo "Failed to generate crypto material..."
  exit 1
fi
echo "========================================================="


echo "Generating System Genesis Block"
# Note: For versions newer than v2.1, you may need to use the osnadmin bootstrap command instead.
# This command is for v2.x.
configtxgen -profile LogisticsOrdererGenesis -configPath . -channelID $SYS_CHANNEL -outputBlock ./genesis.block
if [ "$?" -ne 0 ]; then
  echo "Failed to generate orderer genesis block..."
  exit 1
fi
echo "========================================================="


echo "Generating Channel Configuration Transaction"
configtxgen -profile LogisticsChannel -configPath . -outputCreateChannelTx ./logistics-channel.tx -channelID $CHANNEL_NAME
if [ "$?" -ne 0 ]; then
  echo "Failed to generate channel configuration transaction..."
  exit 1
fi
echo "========================================================="


echo "Generating Anchor Peer Update for OriginOrgMSP"
configtxgen -profile LogisticsChannel -configPath . -outputAnchorPeersUpdate ./OriginOrgMSPanchors.tx -channelID $CHANNEL_NAME -asOrg OriginOrgMSP
if [ "$?" -ne 0 ]; then
  echo "Failed to generate anchor peer update for OriginOrgMSP..."
  exit 1
fi
echo "========================================================="


echo "Generating Anchor Peer Update for DestOrgMSP"
configtxgen -profile LogisticsChannel -configPath . -outputAnchorPeersUpdate ./DestOrgMSPanchors.tx -channelID $CHANNEL_NAME -asOrg DestOrgMSP
if [ "$?" -ne 0 ]; then
  echo "Failed to generate anchor peer update for DestOrgMSP..."
  exit 1
fi
echo "========================================================="

echo "Artifacts generated successfully!"
