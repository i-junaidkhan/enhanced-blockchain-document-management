package main

import (
    "encoding/json"
    "fmt"
    "time"
    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
    contractapi.Contract
}

type Document struct {
    DocID           string            `json:"docID"`
    FileName        string            `json:"fileName"`
    SenderNode      string            `json:"senderNode"`
    RecipientNode   string            `json:"recipientNode"`
    AllowedViewers  []string          `json:"allowedViewers"`
    IPFSHash        string            `json:"ipfsHash"`
    Status          string            `json:"status"` // pending, approved, rejected
    ApprovalNodes   []string          `json:"approvalNodes"`
    RejectionReason string            `json:"rejectionReason"`
    RejectedBy      string            `json:"rejectedBy"`
    Timestamp       string            `json:"timestamp"`
    SenderFaction   string            `json:"senderFaction"`
    RecipientFaction string           `json:"recipientFaction"`
    Messages        []NodeMessage     `json:"messages"`
}

type NodeMessage struct {
    From      string `json:"from"`
    To        string `json:"to"`
    Message   string `json:"message"`
    Type      string `json:"type"` // approval, rejection
    Timestamp string `json:"timestamp"`
}

// Initialize ledger
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
    return nil
}

// Submit document with enhanced metadata
func (s *SmartContract) SubmitDocument(ctx contractapi.TransactionContextInterface, 
    docID string, fileName string, senderNode string, recipientNode string, 
    allowedViewers string, ipfsHash string) error {
    
    var viewers []string
    json.Unmarshal([]byte(allowedViewers), &viewers)
    
    document := Document{
        DocID:           docID,
        FileName:        fileName,
        SenderNode:      senderNode,
        RecipientNode:   recipientNode,
        AllowedViewers:  viewers,
        IPFSHash:        ipfsHash,
        Status:          "pending",
        ApprovalNodes:   []string{},
        RejectionReason: "",
        RejectedBy:      "",
        Timestamp:       time.Now().Format(time.RFC3339),
        SenderFaction:   getFaction(senderNode),
        RecipientFaction: getFaction(recipientNode),
        Messages:        []NodeMessage{},
    }

    documentJSON, err := json.Marshal(document)
    if err != nil {
        return err
    }

    return ctx.GetStub().PutState(docID, documentJSON)
}

// Get document with access control
func (s *SmartContract) GetDocumentById(ctx contractapi.TransactionContextInterface, 
    docID string, requestingNode string) (string, error) {
    
    documentJSON, err := ctx.GetStub().GetState(docID)
    if err != nil {
        return "", fmt.Errorf("failed to read from world state: %v", err)
    }
    if documentJSON == nil {
        return "", fmt.Errorf("the document %s does not exist", docID)
    }

    var document Document
    err = json.Unmarshal(documentJSON, &document)
    if err != nil {
        return "", err
    }

    // Apply access control
    if !canViewDocument(requestingNode, document) {
        // Return limited metadata only
        limitedDoc := Document{
            DocID:         document.DocID,
            FileName:      document.FileName,
            SenderNode:    document.SenderNode,
            RecipientNode: document.RecipientNode,
            Status:        document.Status,
            Timestamp:     document.Timestamp,
            IPFSHash:      "RESTRICTED",
        }
        limitedJSON, _ := json.Marshal(limitedDoc)
        return string(limitedJSON), nil
    }

    return string(documentJSON), nil
}

// Approve document
func (s *SmartContract) ApproveDocument(ctx contractapi.TransactionContextInterface, 
    docID string, approverNode string, message string) error {
    
    documentJSON, err := ctx.GetStub().GetState(docID)
    if err != nil {
        return fmt.Errorf("failed to read from world state: %v", err)
    }
    if documentJSON == nil {
        return fmt.Errorf("the document %s does not exist", docID)
    }

    var document Document
    err = json.Unmarshal(documentJSON, &document)
    if err != nil {
        return err
    }

    // Update document status
    document.Status = "approved"
    document.ApprovalNodes = append(document.ApprovalNodes, approverNode)
    
    // Make viewable by all nodes after approval
    document.AllowedViewers = getAllNodes()
    
    // Add approval message
    approvalMsg := NodeMessage{
        From:      approverNode,
        To:        document.SenderNode,
        Message:   message,
        Type:      "approval",
        Timestamp: time.Now().Format(time.RFC3339),
    }
    document.Messages = append(document.Messages, approvalMsg)

    documentJSON, err = json.Marshal(document)
    if err != nil {
        return err
    }

    return ctx.GetStub().PutState(docID, documentJSON)
}

// Reject document
func (s *SmartContract) RejectDocument(ctx contractapi.TransactionContextInterface, 
    docID string, rejecterNode string, reason string) error {
    
    documentJSON, err := ctx.GetStub().GetState(docID)
    if err != nil {
        return fmt.Errorf("failed to read from world state: %v", err)
    }
    if documentJSON == nil {
        return fmt.Errorf("the document %s does not exist", docID)
    }

    var document Document
    err = json.Unmarshal(documentJSON, &document)
    if err != nil {
        return err
    }

    // Update document status
    document.Status = "rejected"
    document.RejectedBy = rejecterNode
    document.RejectionReason = reason
    
    // Add rejection message
    rejectionMsg := NodeMessage{
        From:      rejecterNode,
        To:        document.SenderNode,
        Message:   fmt.Sprintf("Document rejected: %s", reason),
        Type:      "rejection",
        Timestamp: time.Now().Format(time.RFC3339),
    }
    document.Messages = append(document.Messages, rejectionMsg)

    documentJSON, err = json.Marshal(document)
    if err != nil {
        return err
    }

    return ctx.GetStub().PutState(docID, documentJSON)
}

// Get all documents for a specific node
func (s *SmartContract) GetDocumentsForNode(ctx contractapi.TransactionContextInterface, 
    nodeID string) (string, error) {
    
    iterator, err := ctx.GetStub().GetStateByRange("", "")
    if err != nil {
        return "", err
    }
    defer iterator.Close()

    var documents []Document
    for iterator.HasNext() {
        queryResponse, err := iterator.Next()
        if err != nil {
            return "", err
        }

        var document Document
        err = json.Unmarshal(queryResponse.Value, &document)
        if err != nil {
            continue
        }

        // Include if node is involved or can view
        if document.SenderNode == nodeID || 
           document.RecipientNode == nodeID || 
           canViewDocument(nodeID, document) {
            documents = append(documents, document)
        }
    }

    documentsJSON, err := json.Marshal(documents)
    if err != nil {
        return "", err
    }

    return string(documentsJSON), nil
}

// Get messages for a node
func (s *SmartContract) GetMessagesForNode(ctx contractapi.TransactionContextInterface, 
    nodeID string) (string, error) {
    
    iterator, err := ctx.GetStub().GetStateByRange("", "")
    if err != nil {
        return "", err
    }
    defer iterator.Close()

    var messages []NodeMessage
    for iterator.HasNext() {
        queryResponse, err := iterator.Next()
        if err != nil {
            return "", err
        }

        var document Document
        err = json.Unmarshal(queryResponse.Value, &document)
        if err != nil {
            continue
        }

        // Collect messages for this node
        for _, msg := range document.Messages {
            if msg.To == nodeID {
                messages = append(messages, msg)
            }
        }
    }

    messagesJSON, err := json.Marshal(messages)
    if err != nil {
        return "", err
    }

    return string(messagesJSON), nil
}

// Helper functions
func canViewDocument(requestingNode string, document Document) bool {
    // If approved, all nodes can view
    if document.Status == "approved" {
        return true
    }
    
    // If sender or recipient
    if document.SenderNode == requestingNode || document.RecipientNode == requestingNode {
        return true
    }
    
    // If in allowed viewers list
    for _, viewer := range document.AllowedViewers {
        if viewer == requestingNode {
            return true
        }
    }
    
    return false
}

func getFaction(nodeID string) string {
    if nodeID[:6] == "origin" {
        return "OriginOrgMSP"
    }
    return "DestOrgMSP"
}

func getAllNodes() []string {
    return []string{
        "origin-station", "origin-rail", "origin-customs", "origin-border",
        "dest-station", "dest-rail", "dest-customs", "dest-border",
    }
}

func main() {
    assetChaincode, err := contractapi.NewChaincode(&SmartContract{})
    if err != nil {
        fmt.Printf("Error creating document chaincode: %v", err)
        return
    }

    if err := assetChaincode.Start(); err != nil {
        fmt.Printf("Error starting document chaincode: %v", err)
    }
}
