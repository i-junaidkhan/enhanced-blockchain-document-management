// Create testChaincode.js
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function testChaincode() {
    const gateway = new Gateway();
    try {
        const walletPath = path.join(__dirname, 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        const ccp = {
            "name": "test-network",
            "version": "1.0.0",
            "client": { "organization": "OriginOrgMSP" },
            "organizations": { "OriginOrgMSP": { "mspid": "OriginOrgMSP", "peers": ["origin-station.origin.com"] } },
            "peers": { "origin-station.origin.com": { "url": "grpcs://localhost:7051", "tlsCACerts": { "pem": fs.readFileSync(path.resolve(__dirname, '..', 'artifacts', 'channel', 'crypto-config', 'peerOrganizations', 'origin.com', 'peers', 'origin-station.origin.com', 'tls', 'ca.crt'), 'utf8') }, "grpcOptions": { "ssl-target-name-override": "origin-station.origin.com" } } }
        };

        await gateway.connect(ccp, { wallet, identity: 'admin', discovery: { enabled: false } });
        const network = await gateway.getNetwork('logistics-channel');
        const contract = network.getContract('document_cc');

        // Test different function names
        const testFunctions = [
            'CreateDocument',
            'StoreDocument', 
            'AddDocument',
            'SubmitDocument',
            'GetAllDocuments',
            'QueryAllDocuments',
            'ListDocuments'
        ];

        for (const func of testFunctions) {
            try {
                console.log(`Testing function: ${func}`);
                const result = await contract.evaluateTransaction(func);
                console.log(`✅ ${func} works!`);
                console.log(`Result: ${result.toString()}`);
            } catch (error) {
                console.log(`❌ ${func} failed: ${error.message}`);
            }
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        gateway.disconnect();
    }
}

testChaincode();
