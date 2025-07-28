'use strict';

const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Remove existing admin identity if it exists
        try {
            await wallet.remove('admin');
            console.log('Removed existing admin identity');
        } catch (error) {
            console.log('No existing admin identity to remove');
        }

        // Path to crypto-config admin certificates
        const cryptoPath = path.resolve(__dirname, '..', 'artifacts', 'channel', 'crypto-config', 'peerOrganizations', 'origin.com', 'users', 'Admin@origin.com', 'msp');
        console.log(`Looking for crypto-config admin at: ${cryptoPath}`);
        
        // Verify path exists
        if (!fs.existsSync(cryptoPath)) {
            throw new Error(`Crypto-config path does not exist: ${cryptoPath}`);
        }

        // Read the certificate
        const certPath = path.resolve(cryptoPath, 'signcerts', 'Admin@origin.com-cert.pem');
        console.log(`Certificate path: ${certPath}`);
        
        if (!fs.existsSync(certPath)) {
            throw new Error(`Certificate file not found: ${certPath}`);
        }
        
        const certificate = fs.readFileSync(certPath, 'utf8');
        console.log('Certificate loaded');

        // Read the private key
        const keyDir = path.resolve(cryptoPath, 'keystore');
        const keyFiles = fs.readdirSync(keyDir);
        if (keyFiles.length === 0) {
            throw new Error('No private key files found');
        }
        
        const keyPath = path.resolve(keyDir, keyFiles[0]);
        const privateKey = fs.readFileSync(keyPath, 'utf8');
        console.log('Private key loaded');

        // Create the identity object
        const x509Identity = {
            credentials: {
                certificate: certificate,
                privateKey: privateKey,
            },
            mspId: 'OriginOrgMSP',
            type: 'X.509',
        };

        // Import the identity into the wallet
        await wallet.put('admin', x509Identity);
        console.log('✅ SUCCESS: Imported crypto-config admin identity');
        
        // Verify the identity source
        if (certificate.includes('CN=fabric-ca-server')) {
            console.log('❌ ERROR: Still using CA-enrolled identity');
        } else if (certificate.includes('CN=ca.origin.com')) {
            console.log('✅ SUCCESS: Using crypto-config identity');
        } else {
            console.log('⚠️  Certificate issuer unclear, but should be crypto-config');
        }

    } catch (error) {
        console.error(`❌ Failed to import crypto-config admin: ${error.message}`);
        process.exit(1);
    }
}

main();
