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

        // Check to see if we've already imported the admin identity.
        const identity = await wallet.get('admin');
        if (identity) {
            console.log('An identity for the admin user "admin" already exists in the wallet');
            return;
        }

        // --- Locate the admin credentials from the crypto-config directory ---
        const certPath = path.resolve(__dirname, '..', 'artifacts', 'channel', 'crypto-config', 'peerOrganizations', 'origin.com', 'users', 'Admin@origin.com', 'msp', 'signcerts', 'Admin@origin.com-cert.pem');
        const certificate = fs.readFileSync(certPath, 'utf8');
        
        const keyDir = path.resolve(__dirname, '..', 'artifacts', 'channel', 'crypto-config', 'peerOrganizations', 'origin.com', 'users', 'Admin@origin.com', 'msp', 'keystore');
        const keyFiles = fs.readdirSync(keyDir);
        const keyPath = path.resolve(keyDir, keyFiles[0]);
        const privateKey = fs.readFileSync(keyPath, 'utf8');

        // --- Create the identity object ---
        const x509Identity = {
            credentials: {
                certificate: certificate,
                privateKey: privateKey,
            },
            mspId: 'OriginOrgMSP',
            type: 'X.509',
        };

        // Import the new identity into the wallet.
        await wallet.put('admin', x509Identity);
        console.log('>>> SUCCESS: Successfully imported the crypto-config admin user into the wallet.');

    } catch (error) {
        console.error(`Failed to import admin user "admin": ${error}`);
        process.exit(1);
    }
}

main();
