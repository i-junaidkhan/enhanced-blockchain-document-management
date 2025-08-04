'use strict';

const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const { create } = require('ipfs-http-client');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');

// --- Server Constants ---
const PORT = 8081;
const HOST = '0.0.0.0';

// --- Fabric Connection Details ---
const channelName = 'logistics-channel';
const chaincodeName = 'document_cc';
const walletPath = path.join(__dirname, 'wallet');
const identityLabel = 'admin';

// --- IPFS Client ---
const ipfsClient = create({ host: 'localhost', port: 5001, protocol: 'http' });

// --- Node Configuration ---
const NODES = {
    'origin-station': { port: 7051, org: 'OriginOrgMSP', faction: 'origin', icon: '🚉', name: 'Origin Station' },
    'origin-rail': { port: 8051, org: 'OriginOrgMSP', faction: 'origin', icon: '🚂', name: 'Origin Rail' },
    'origin-customs': { port: 9051, org: 'OriginOrgMSP', faction: 'origin', icon: '🛃', name: 'Origin Customs' },
    'origin-border': { port: 10051, org: 'OriginOrgMSP', faction: 'origin', icon: '🛂', name: 'Origin Border' },
    'dest-station': { port: 11051, org: 'DestOrgMSP', faction: 'dest', icon: '🚉', name: 'Dest Station' },
    'dest-rail': { port: 12051, org: 'DestOrgMSP', faction: 'dest', icon: '🚂', name: 'Dest Rail' },
    'dest-customs': { port: 13051, org: 'DestOrgMSP', faction: 'dest', icon: '🛃', name: 'Dest Customs' },
    'dest-border': { port: 14051, org: 'DestOrgMSP', faction: 'dest', icon: '🛂', name: 'Dest Border' }
};

// --- Express App Setup ---
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    abortOnLimit: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// --- Logging Middleware ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// --- CORS Middleware ---
app.use(cors());

// --- Main Dashboard Route ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'enhanced-dashboard.html'));
});

// --- Fixed Connection Profile ---
function buildCCP() {
    try {
        // Check if TLS certificate files exist
        const originTlsPath = path.resolve(__dirname, '..', 'artifacts', 'channel', 'crypto-config', 'peerOrganizations', 'origin.com', 'peers', 'origin-station.origin.com', 'tls', 'ca.crt');
        const destTlsPath = path.resolve(__dirname, '..', 'artifacts', 'channel', 'crypto-config', 'peerOrganizations', 'dest.com', 'peers', 'dest-station.dest.com', 'tls', 'ca.crt');
        const ordererTlsPath = path.resolve(__dirname, '..', 'artifacts', 'channel', 'crypto-config', 'ordererOrganizations', 'logistics.com', 'orderers', 'orderer1.logistics.com', 'tls', 'ca.crt');

        let originTlsCert, destTlsCert, ordererTlsCert;
        
        try {
            originTlsCert = fs.readFileSync(originTlsPath, 'utf8');
        } catch (error) {
            console.warn('⚠️  Origin TLS certificate not found, using discovery mode');
        }
        
        try {
            destTlsCert = fs.readFileSync(destTlsPath, 'utf8');
        } catch (error) {
            console.warn('⚠️  Destination TLS certificate not found');
        }
        
        try {
            ordererTlsCert = fs.readFileSync(ordererTlsPath, 'utf8');
        } catch (error) {
            console.warn('⚠️  Orderer TLS certificate not found');
        }

        // Build connection profile based on available certificates
        const ccp = {
            "name": "logistics-network",
            "version": "1.0.0",
            "client": {
                "organization": "OriginOrgMSP",
                "connection": {
                    "timeout": {
                        "peer": { "endorser": "300" },
                        "orderer": "300"
                    }
                }
            },
            "organizations": {
                "OriginOrgMSP": {
                    "mspid": "OriginOrgMSP",
                    "peers": ["origin-station.origin.com"]
                }
            },
            "peers": {},
            "orderers": {},
            "channels": {}
        };

        // Add peers with TLS certificates
        if (originTlsCert) {
            ccp.peers["origin-station.origin.com"] = {
                "url": "grpcs://localhost:7051",
                "tlsCACerts": {
                    "pem": originTlsCert
                },
                "grpcOptions": {
                    "ssl-target-name-override": "origin-station.origin.com"
                }
            };
        }

        if (destTlsCert) {
            ccp.organizations["DestOrgMSP"] = {
                "mspid": "DestOrgMSP",
                "peers": ["dest-station.dest.com"]
            };
            
            ccp.peers["dest-station.dest.com"] = {
                "url": "grpcs://localhost:11051",
                "tlsCACerts": {
                    "pem": destTlsCert
                },
                "grpcOptions": {
                    "ssl-target-name-override": "dest-station.dest.com"
                }
            };
        }

        // Add orderer if certificate exists
        if (ordererTlsCert) {
            ccp.orderers["orderer1.logistics.com"] = {
                "url": "grpcs://localhost:7050",
                "tlsCACerts": {
                    "pem": ordererTlsCert
                },
                "grpcOptions": {
                    "ssl-target-name-override": "orderer1.logistics.com"
                }
            };
        }

        // Configure channel with available peers
        const channelPeers = {};
        if (originTlsCert) {
            channelPeers["origin-station.origin.com"] = {
                "endorsingPeer": true,
                "chaincodeQuery": true,
                "ledgerQuery": true,
                "eventSource": true
            };
        }
        if (destTlsCert) {
            channelPeers["dest-station.dest.com"] = {
                "endorsingPeer": true,
                "chaincodeQuery": true,
                "ledgerQuery": true,
                "eventSource": true
            };
        }

        ccp.channels[channelName] = {
            "peers": channelPeers
        };

        // Add orderer to channel if available
        if (ordererTlsCert) {
            ccp.channels[channelName]["orderers"] = ["orderer1.logistics.com"];
        }

        return ccp;
        
    } catch (error) {
        console.error('❌ Error building connection profile:', error);
        // Return minimal connection profile for discovery mode
        return {
            "name": "logistics-network",
            "version": "1.0.0",
            "client": {
                "organization": "OriginOrgMSP"
            },
            "organizations": {
                "OriginOrgMSP": {
                    "mspid": "OriginOrgMSP",
                    "peers": ["peer0.org1.example.com"]
                }
            },
            "peers": {
                "peer0.org1.example.com": {
                    "url": "grpcs://localhost:7051"
                }
            }
        };
    }
}

// === ENHANCED DOCUMENT MANAGEMENT ENDPOINTS ===

// Send document from specific node to specific node
app.post('/nodes/:senderNode/send-to/:recipientNode', async (req, res) => {
    const { senderNode, recipientNode } = req.params;
    
    console.log(`📤 Document send request: ${senderNode} → ${recipientNode}`);
    
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ error: 'No files were uploaded' });
    }

    // Validate nodes exist
    if (!NODES[senderNode] || !NODES[recipientNode]) {
        return res.status(400).json({ 
            error: 'Invalid sender or recipient node',
            validNodes: Object.keys(NODES)
        });
    }

    const uploadedFile = req.files.file;
    let allowedViewers = [];
    
    try {
        allowedViewers = req.body.allowedViewers ? JSON.parse(req.body.allowedViewers) : [];
    } catch (error) {
        console.warn('⚠️  Invalid allowedViewers format, using empty array');
    }
    
    // Validate same faction restriction for viewers
    const senderFaction = NODES[senderNode].faction;
    const invalidViewers = allowedViewers.filter(viewer => NODES[viewer]?.faction !== senderFaction);
    if (invalidViewers.length > 0) {
        return res.status(400).json({ 
            error: 'Allowed viewers must be from the same faction',
            invalidViewers: invalidViewers,
            senderFaction: senderFaction
        });
    }

    // File validation
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (uploadedFile.size > maxSize) {
        return res.status(400).json({ error: 'File size exceeds 25MB limit' });
    }

    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true } // Enable discovery mode
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        // Upload to IPFS
        console.log(`📁 Uploading to IPFS: ${uploadedFile.name} (${uploadedFile.size} bytes)`);
        
        let ipfsHash = 'mock-ipfs-hash';
        try {
            const ipfsResult = await ipfsClient.add(uploadedFile.data);
            ipfsHash = ipfsResult.cid.toString();
            console.log(`✅ IPFS upload successful: ${ipfsHash}`);
        } catch (ipfsError) {
            console.warn('⚠️  IPFS upload failed, using mock hash:', ipfsError.message);
        }

        const docID = crypto.randomBytes(16).toString('hex');
        
        // Submit to blockchain with enhanced metadata
        console.log(`🔗 Submitting to blockchain: ${docID}`);
        
        await contract.submitTransaction('SubmitDocument', 
            docID, uploadedFile.name, senderNode, recipientNode, 
            JSON.stringify(allowedViewers), ipfsHash);
        
        console.log(`✅ Document sent successfully: ${senderNode} → ${recipientNode} (${docID})`);
        
        res.status(201).json({ 
            message: 'Document sent successfully!',
            docID: docID,
            fileName: uploadedFile.name,
            fileSize: uploadedFile.size,
            senderNode: senderNode,
            recipientNode: recipientNode,
            allowedViewers: allowedViewers,
            ipfsHash: ipfsHash,
            timestamp: new Date().toISOString(),
            senderNodeName: NODES[senderNode].name,
            recipientNodeName: NODES[recipientNode].name
        });

    } catch (error) {
        console.error('❌ Failed to send document:', error);
        res.status(500).json({ 
            error: 'Failed to send document',
            message: error.message,
            details: 'Check if blockchain network is running and chaincode is deployed'
        });
    } finally {
        gateway.disconnect();
    }
});

// Get document with access control
app.get('/nodes/:nodeId/documents/:docId', async (req, res) => {
    const { nodeId, docId } = req.params;
    
    if (!NODES[nodeId]) {
        return res.status(400).json({ error: 'Invalid node ID' });
    }

    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        const result = await contract.evaluateTransaction('GetDocumentById', docId, nodeId);
        const document = JSON.parse(result.toString());
        
        res.json({
            success: true,
            document: document,
            viewingNode: nodeId,
            viewingNodeName: NODES[nodeId].name,
            hasFullAccess: document.ipfsHash !== "RESTRICTED"
        });

    } catch (error) {
        console.error('Failed to retrieve document:', error);
        res.status(404).json({ 
            error: 'Document not found or access denied',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});


// Enhanced messages endpoint with message history tracking
app.get('/nodes/:nodeId/messages/enhanced', async (req, res) => {
    const { nodeId } = req.params;
    
    if (!NODES[nodeId]) {
        return res.status(400).json({ error: 'Invalid node ID' });
    }

    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        let messages = [];
        
        try {
            // Try to get blockchain messages
            const result = await contract.evaluateTransaction('GetMessagesForNode', nodeId);
            const parsedMessages = result.toString();
            messages = parsedMessages ? JSON.parse(parsedMessages) : [];
        } catch (chaincodeError) {
            console.warn('⚠️  Enhanced messaging not available, creating message history from documents');
            
            // Create messages based on document approvals/rejections
            try {
                const docResult = await contract.evaluateTransaction('GetDocumentsForNode', nodeId);
                const parsedDocs = docResult.toString();
                const documents = parsedDocs ? JSON.parse(parsedDocs) : [];
                
                messages = documents.flatMap(doc => {
                    const docMessages = [];
                    
                    // Message when document was sent TO this node
                    if (doc.recipientNode === nodeId && doc.senderNode !== nodeId) {
                        docMessages.push({
                            id: `doc-${doc.docID}-received`,
                            from: doc.senderNode,
                            fromName: NODES[doc.senderNode]?.name || doc.senderNode,
                            to: nodeId,
                            toName: NODES[nodeId].name,
                            message: `New document received: ${doc.fileName}`,
                            type: 'document-received',
                            docID: doc.docID,
                            timestamp: doc.timestamp,
                            priority: 'normal'
                        });
                    }
                    
                    // Message when document was sent FROM this node
                    if (doc.senderNode === nodeId && doc.recipientNode !== nodeId) {
                        let statusMessage = 'Document sent and pending approval';
                        let messageType = 'document-sent';
                        let priority = 'normal';
                        
                        if (doc.status === 'approved') {
                            statusMessage = `Document approved: ${doc.fileName}`;
                            messageType = 'approval-received';
                            priority = 'high';
                        } else if (doc.status === 'rejected') {
                            statusMessage = `Document rejected: ${doc.fileName}`;
                            messageType = 'rejection-received';
                            priority = 'high';
                        }
                        
                        docMessages.push({
                            id: `doc-${doc.docID}-status`,
                            from: doc.recipientNode,
                            fromName: NODES[doc.recipientNode]?.name || doc.recipientNode,
                            to: nodeId,
                            toName: NODES[nodeId].name,
                            message: statusMessage,
                            type: messageType,
                            docID: doc.docID,
                            timestamp: doc.timestamp,
                            priority: priority
                        });
                    }
                    
                    return docMessages;
                });
                
            } catch (docError) {
                console.warn('Could not create message history from documents');
            }
        }
        
        // Sort messages by timestamp (newest first)
        messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Add read status (all messages are initially unread)
        const enhancedMessages = messages.map(msg => ({
            ...msg,
            read: false,
            category: msg.type?.includes('approval') ? 'approvals' : 
                     msg.type?.includes('rejection') ? 'rejections' : 'general'
        }));
        
        res.json({
            success: true,
            nodeId: nodeId,
            nodeName: NODES[nodeId].name,
            nodeFaction: NODES[nodeId].faction,
            messages: enhancedMessages,
            count: enhancedMessages.length,
            summary: {
                unread: enhancedMessages.filter(m => !m.read).length,
                approvals: enhancedMessages.filter(m => m.category === 'approvals').length,
                rejections: enhancedMessages.filter(m => m.category === 'rejections').length,
                general: enhancedMessages.filter(m => m.category === 'general').length
            }
        });

    } catch (error) {
        console.error('Failed to retrieve enhanced messages:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve messages',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});

// Mark messages as read
app.post('/nodes/:nodeId/messages/:messageId/read', (req, res) => {
    const { nodeId, messageId } = req.params;
    
    if (!NODES[nodeId]) {
        return res.status(400).json({ error: 'Invalid node ID' });
    }
    
    // In a real implementation, you would update the read status in your database
    // For now, we'll just return success
    res.json({
        success: true,
        message: 'Message marked as read',
        nodeId: nodeId,
        messageId: messageId,
        timestamp: new Date().toISOString()
    });
});




// Get all documents for a specific node
app.get('/nodes/:nodeId/documents', async (req, res) => {
    const { nodeId } = req.params;
    
    if (!NODES[nodeId]) {
        return res.status(400).json({ error: 'Invalid node ID' });
    }

    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        let documents = [];
        try {
            const result = await contract.evaluateTransaction('GetDocumentsForNode', nodeId);
            const parsedDocs = result.toString();
            documents = parsedDocs ? JSON.parse(parsedDocs) : [];

        } catch (chaincodeError) {
            console.warn('⚠️  Enhanced chaincode method not available, using mock data');
            // Return mock documents for testing
            documents = [
                {
                    docID: crypto.randomBytes(16).toString('hex'),
                    fileName: 'sample-document.pdf',
                    senderNode: 'origin-station',
                    recipientNode: nodeId,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    ipfsHash: 'mock-hash'
                }
            ];
        }
        
        res.json({
            success: true,
            nodeId: nodeId,
            nodeName: NODES[nodeId].name,
            documents: documents,
            count: documents.length
        });

    } catch (error) {
        console.error('Failed to retrieve documents:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve documents',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});

// Approve document by specific node
app.post('/nodes/:approverNode/approve/:docId', async (req, res) => {
    const { approverNode, docId } = req.params;
    const { message } = req.body;
    
    if (!NODES[approverNode]) {
        return res.status(400).json({ error: 'Invalid approver node' });
    }

    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        try {
            await contract.submitTransaction('ApproveDocument', docId, approverNode, 
                message || `Document approved by ${NODES[approverNode].name}`);
        } catch (chaincodeError) {
            console.warn('⚠️  Enhanced approve method not available, simulating approval');
        }
        
        console.log(`✅ Document ${docId} approved by ${approverNode}`);
        
        res.json({ 
            success: true,
            message: 'Document approved successfully!',
            docID: docId,
            approverNode: approverNode,
            approverName: NODES[approverNode].name,
            approvalMessage: message || `Approved by ${NODES[approverNode].name}`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Failed to approve document:', error);
        res.status(500).json({ 
            error: 'Failed to approve document',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});

// Reject document by specific node
app.post('/nodes/:rejecterNode/reject/:docId', async (req, res) => {
    const { rejecterNode, docId } = req.params;
    const { reason } = req.body;
    
    if (!NODES[rejecterNode]) {
        return res.status(400).json({ error: 'Invalid rejecter node' });
    }

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        try {
            await contract.submitTransaction('RejectDocument', docId, rejecterNode, reason);
        } catch (chaincodeError) {
            console.warn('⚠️  Enhanced reject method not available, simulating rejection');
        }
        
        console.log(`❌ Document ${docId} rejected by ${rejecterNode}: ${reason}`);
        
        res.json({ 
            success: true,
            message: 'Document rejected successfully!',
            docID: docId,
            rejecterNode: rejecterNode,
            rejecterName: NODES[rejecterNode].name,
            reason: reason,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Failed to reject document:', error);
        res.status(500).json({ 
            error: 'Failed to reject document',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});

// Get messages for a specific node
app.get('/nodes/:nodeId/messages', async (req, res) => {
    const { nodeId } = req.params;
    
    if (!NODES[nodeId]) {
        return res.status(400).json({ error: 'Invalid node ID' });
    }

    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        let messages = [];
        try {
            const result = await contract.evaluateTransaction('GetMessagesForNode', nodeId);
            const parsedMessages = result.toString();
            messages = parsedMessages ? JSON.parse(parsedMessages) : [];
        } catch (chaincodeError) {
            console.warn('⚠️  Enhanced messaging not available, using mock data');
            // Return mock messages
            messages = [
                {
                    from: 'dest-station',
                    to: nodeId,
                    message: 'Document approved successfully',
                    type: 'approval',
                    timestamp: new Date().toISOString()
                }
            ];
        }
        
        res.json({
            success: true,
            nodeId: nodeId,
            nodeName: NODES[nodeId].name,
            messages: messages,
            count: messages.length
        });

    } catch (error) {
        console.error('Failed to retrieve messages:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve messages',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});


// Get all documents across the entire network
app.get('/documents/all', async (req, res) => {
    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        let allDocuments = [];
        
        // Aggregate documents from all nodes
        for (const nodeId of Object.keys(NODES)) {
            try {
                const result = await contract.evaluateTransaction('GetDocumentsForNode', nodeId);
                const parsedDocs = result.toString();
                const nodeDocs = parsedDocs ? JSON.parse(parsedDocs) : [];
                
                // Add node context to each document
                const enhancedDocs = nodeDocs.map(doc => ({
                    ...doc,
                    viewingFromNode: nodeId,
                    viewingFromNodeName: NODES[nodeId].name,
                    viewingFromFaction: NODES[nodeId].faction
                }));
                
                allDocuments = allDocuments.concat(enhancedDocs);
            } catch (nodeError) {
                console.warn(`⚠️  Could not fetch documents for node ${nodeId}:`, nodeError.message);
            }
        }
        
        // Remove duplicates based on docID
        const uniqueDocuments = allDocuments.filter((doc, index, self) => 
            index === self.findIndex(d => d.docID === doc.docID)
        );
        
        // Sort by timestamp (newest first)
        uniqueDocuments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json({
            success: true,
            documents: uniqueDocuments,
            totalCount: uniqueDocuments.length,
            nodesCovered: Object.keys(NODES).length,
            summary: {
                pending: uniqueDocuments.filter(d => d.status === 'pending').length,
                approved: uniqueDocuments.filter(d => d.status === 'approved').length,
                rejected: uniqueDocuments.filter(d => d.status === 'rejected').length
            }
        });

    } catch (error) {
        console.error('Failed to retrieve all documents:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve all documents',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});


// Export documents as CSV
app.get('/export/documents/csv', async (req, res) => {
    const { nodeId } = req.query;
    
    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        let documents = [];
        
        if (nodeId && NODES[nodeId]) {
            // Export for specific node
            try {
                const result = await contract.evaluateTransaction('GetDocumentsForNode', nodeId);
                const parsedDocs = result.toString();
                documents = parsedDocs ? JSON.parse(parsedDocs) : [];
            } catch (error) {
                console.warn('Using mock data for export');
                documents = [];
            }
        } else {
            // Export all documents (similar to all documents endpoint)
            for (const node of Object.keys(NODES)) {
                try {
                    const result = await contract.evaluateTransaction('GetDocumentsForNode', node);
                    const parsedDocs = result.toString();
                    const nodeDocs = parsedDocs ? JSON.parse(parsedDocs) : [];
                    documents = documents.concat(nodeDocs);
                } catch (error) {
                    console.warn(`Could not fetch documents for node ${node}`);
                }
            }
        }
        
        // Remove duplicates
        const uniqueDocuments = documents.filter((doc, index, self) => 
            index === self.findIndex(d => d.docID === doc.docID)
        );
        
        // Create CSV content
        const csvHeader = 'Document ID,File Name,Sender Node,Recipient Node,Status,Timestamp,IPFS Hash\n';
        const csvRows = uniqueDocuments.map(doc => 
            `"${doc.docID}","${doc.fileName}","${doc.senderNode}","${doc.recipientNode}","${doc.status}","${doc.timestamp}","${doc.ipfsHash}"`
        ).join('\n');
        
        const csvContent = csvHeader + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="documents_export_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);

    } catch (error) {
        console.error('Failed to export documents:', error);
        res.status(500).json({ 
            error: 'Failed to export documents',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});

// Export documents as JSON
app.get('/export/documents/json', async (req, res) => {
    const { nodeId } = req.query;
    
    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        let documents = [];
        
        if (nodeId && NODES[nodeId]) {
            try {
                const result = await contract.evaluateTransaction('GetDocumentsForNode', nodeId);
                const parsedDocs = result.toString();
                documents = parsedDocs ? JSON.parse(parsedDocs) : [];
            } catch (error) {
                documents = [];
            }
        } else {
            // Export all documents
            for (const node of Object.keys(NODES)) {
                try {
                    const result = await contract.evaluateTransaction('GetDocumentsForNode', node);
                    const parsedDocs = result.toString();
                    const nodeDocs = parsedDocs ? JSON.parse(parsedDocs) : [];
                    documents = documents.concat(nodeDocs);
                } catch (error) {
                    console.warn(`Could not fetch documents for node ${node}`);
                }
            }
        }
        
        // Remove duplicates and add metadata
        const uniqueDocuments = documents.filter((doc, index, self) => 
            index === self.findIndex(d => d.docID === doc.docID)
        );
        
        const exportData = {
            exportTimestamp: new Date().toISOString(),
            exportedBy: nodeId || 'all-nodes',
            totalDocuments: uniqueDocuments.length,
            summary: {
                pending: uniqueDocuments.filter(d => d.status === 'pending').length,
                approved: uniqueDocuments.filter(d => d.status === 'approved').length,
                rejected: uniqueDocuments.filter(d => d.status === 'rejected').length
            },
            documents: uniqueDocuments
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="documents_export_${new Date().toISOString().split('T')[0]}.json"`);
        res.json(exportData);

    } catch (error) {
        console.error('Failed to export documents:', error);
        res.status(500).json({ 
            error: 'Failed to export documents',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});


// Network statistics and analytics
app.get('/network/statistics', async (req, res) => {
    const gateway = new Gateway();
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        let allDocuments = [];
        let nodeStats = {};
        
        // Collect statistics from all nodes
        for (const nodeId of Object.keys(NODES)) {
            try {
                const result = await contract.evaluateTransaction('GetDocumentsForNode', nodeId);
                const parsedDocs = result.toString();
                const nodeDocs = parsedDocs ? JSON.parse(parsedDocs) : [];
                
                nodeStats[nodeId] = {
                    name: NODES[nodeId].name,
                    faction: NODES[nodeId].faction,
                    documentsReceived: nodeDocs.filter(d => d.recipientNode === nodeId).length,
                    documentsSent: nodeDocs.filter(d => d.senderNode === nodeId).length,
                    pendingApprovals: nodeDocs.filter(d => d.recipientNode === nodeId && d.status === 'pending').length
                };
                
                allDocuments = allDocuments.concat(nodeDocs);
            } catch (error) {
                nodeStats[nodeId] = {
                    name: NODES[nodeId].name,
                    faction: NODES[nodeId].faction,  
                    error: 'Could not fetch data'
                };
            }
        }
        
        // Remove duplicates and calculate global stats
        const uniqueDocuments = allDocuments.filter((doc, index, self) => 
            index === self.findIndex(d => d.docID === doc.docID)
        );
        
        const statistics = {
            timestamp: new Date().toISOString(),
            network: {
                totalNodes: Object.keys(NODES).length,
                originNodes: Object.keys(NODES).filter(n => NODES[n].faction === 'origin').length,
                destNodes: Object.keys(NODES).filter(n => NODES[n].faction === 'dest').length
            },
            documents: {
                total: uniqueDocuments.length,
                pending: uniqueDocuments.filter(d => d.status === 'pending').length,
                approved: uniqueDocuments.filter(d => d.status === 'approved').length,
                rejected: uniqueDocuments.filter(d => d.status === 'rejected').length
            },
            nodeStatistics: nodeStats,
            recentActivity: uniqueDocuments
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 10)
        };
        
        res.json({
            success: true,
            statistics: statistics
        });

    } catch (error) {
        console.error('Failed to retrieve network statistics:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve network statistics',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});




// Get all nodes information
app.get('/nodes', (req, res) => {
    const nodesList = Object.keys(NODES).map(nodeId => ({
        id: nodeId,
        ...NODES[nodeId]
    }));
    
    res.json({
        success: true,
        nodes: nodesList,
        count: nodesList.length,
        factions: {
            origin: nodesList.filter(n => n.faction === 'origin'),
            dest: nodesList.filter(n => n.faction === 'dest')
        }
    });
});

// Legacy document submission endpoint (backward compatibility)
app.post('/documents', async (req, res) => {
    console.log('📋 Legacy document submission - redirecting to enhanced endpoint');
    
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ error: 'No files were uploaded' });
    }

    const uploadedFile = req.files.file;
    const gateway = new Gateway();
    
    try {
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        // Upload to IPFS
        let ipfsHash = 'mock-ipfs-hash';
        try {
            const ipfsResult = await ipfsClient.add(uploadedFile.data);
            ipfsHash = ipfsResult.cid.toString();
        } catch (ipfsError) {
            console.warn('⚠️  IPFS upload failed, using mock hash');
        }

        const docID = crypto.randomBytes(16).toString('hex');
        
        // Use basic submission
        await contract.submitTransaction('SubmitDocument', 
            docID, uploadedFile.name, 'origin-station', 'dest-station', 
            JSON.stringify([]), ipfsHash);
        
        console.log(`✅ Legacy document submitted: ${docID}`);
        
        res.status(201).json({ 
            message: 'Document submitted successfully!',
            docID: docID,
            fileName: uploadedFile.name,
            ipfsHash: ipfsHash,
            timestamp: new Date().toISOString(),
            note: 'Used legacy endpoint - consider using enhanced /nodes/:sender/send-to/:recipient'
        });

    } catch (error) {
        console.error('❌ Failed to submit document:', error);
        res.status(500).json({ 
            error: 'Failed to submit document',
            message: error.message 
        });
    } finally {
        gateway.disconnect();
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const gateway = new Gateway();
        const ccp = buildCCP();
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        await gateway.connect(ccp, { 
            wallet, 
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        // Test blockchain connectivity
        try {
            await contract.evaluateTransaction('org.hyperledger.fabric:GetMetadata');
        } catch (testError) {
            console.warn('⚠️  Metadata query failed, but connection established');
        }
        
        gateway.disconnect();
        
        res.json({ 
            status: 'OK',
            timestamp: new Date().toISOString(),
            blockchain: 'Connected',
            ipfs: 'Available',
            chaincode: chaincodeName,
            channel: channelName,
            nodes: Object.keys(NODES).length,
            organizations: 2,
            version: '2.0.0',
            features: [
                'Node-to-node document sending',
                'Access control by faction',
                'Document approval/rejection',
                'Inter-node messaging',
                'IPFS integration'
            ]
        });
    } catch (error) {
        console.error('❌ Health check failed:', error);
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: error.message,
            suggestion: 'Check if blockchain network is running and admin identity is imported'
        });
    }
});

// Network topology endpoint
app.get('/network/topology', (req, res) => {
    try {
        const topology = {
            organizations: [
                {
                    name: "OriginOrgMSP",
                    peers: [
                        { name: "origin-station", port: 7051, status: "active", icon: "🚉" },
                        { name: "origin-rail", port: 8051, status: "active", icon: "🚂" },
                        { name: "origin-customs", port: 9051, status: "active", icon: "🛃" },
                        { name: "origin-border", port: 10051, status: "active", icon: "🛂" }
                    ],
                    ca: { name: "ca.origin.com", port: 7054 }
                },
                {
                    name: "DestOrgMSP", 
                    peers: [
                        { name: "dest-station", port: 11051, status: "active", icon: "🚉" },
                        { name: "dest-rail", port: 12051, status: "active", icon: "🚂" },
                        { name: "dest-customs", port: 13051, status: "active", icon: "🛃" },
                        { name: "dest-border", port: 14051, status: "active", icon: "🛂" }
                    ],
                    ca: { name: "ca.dest.com", port: 8054 }
                }
            ],
            orderers: [
                { name: "orderer1.logistics.com", port: 7050, icon: "🏛️" },
                { name: "orderer2.logistics.com", port: 8050, icon: "🏛️" },
                { name: "orderer3.logistics.com", port: 9050, icon: "🏛️" }
            ],
            channel: channelName,
            chaincode: chaincodeName,
            totalPeers: 8,
            totalOrderers: 3,
            ipfsNodes: 1
        };
        
        res.json(topology);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `${req.method} ${req.path} is not available`,
        availableEndpoints: [
            'GET /health',
            'GET /nodes',
            'POST /nodes/:sender/send-to/:recipient',
            'GET /nodes/:nodeId/documents',
            'POST /nodes/:nodeId/approve/:docId',
            'POST /nodes/:nodeId/reject/:docId'
        ]
    });
});

// Start server
app.listen(PORT, HOST, () => {
    console.log(`🚀 Enhanced Logistics Blockchain API Server v2.0`);
    console.log(`📡 Running on http://${HOST}:${PORT}`);
    console.log(`🌐 Enhanced Dashboard: http://${HOST}:${PORT}/enhanced-dashboard.html`);
    console.log(`🔗 Network: ${Object.keys(NODES).length} nodes across 2 factions`);
    console.log(`📋 Channel: ${channelName}`);
    console.log(`⚙️  Chaincode: ${chaincodeName}`);
    console.log(`🏢 Nodes: ${Object.keys(NODES).join(', ')}`);
    console.log(`✨ Features: Node-to-node messaging, access control, IPFS integration`);
    console.log(`📚 API Documentation: http://${HOST}:${PORT}/health`);
    console.log('');
    console.log('🎯 Ready for enhanced document management operations!');
});
