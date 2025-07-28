// Global variables
const API_BASE_URL = 'http://localhost:8081';

// DOM elements
const documentForm = document.getElementById('documentForm');
const queryForm = document.getElementById('queryForm');
const fileInput = document.getElementById('fileInput');
const fileNameSpan = document.getElementById('fileName');
const networkStatus = document.getElementById('networkStatus');
const documentDisplay = document.getElementById('documentDisplay');

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("Initializing application...");
    setupEventListeners();
    checkNetworkStatus();
    setInterval(checkNetworkStatus, 15000); // Check status periodically
});

// Setup all event listeners
function setupEventListeners() {
    fileInput.addEventListener('change', (e) => {
        fileNameSpan.textContent = e.target.files.length > 0 ? e.target.files[0].name : 'No file selected';
    });
    documentForm.addEventListener('submit', handleDocumentSubmission);
    queryForm.addEventListener('submit', handleDocumentQuery);

    // This new listener handles clicks on Approve/Reject buttons
    documentDisplay.addEventListener('click', (e) => {
        // Find the closest button element to where the user clicked
        const target = e.target.closest('button');
        
        // If the click wasn't on a button, do nothing
        if (!target) return;

        // Get the document ID from the button's data attribute
        const docID = target.dataset.docId; 

        if (target.classList.contains('approve-btn')) {
            approveDocument(docID);
        } else if (target.classList.contains('reject-btn')) {
            rejectDocument(docID);
        }
    });
}

// Handle the document form submission
async function handleDocumentSubmission(e) {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) {
        showNotification('Please select a file to submit.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const submitBtn = documentForm.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
        const response = await fetch(`${API_BASE_URL}/documents`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            showNotification(`Document submitted! ID: ${result.docID}`, 'success');
            document.getElementById('docIdInput').value = result.docID; // Auto-fill the query input
            documentForm.reset();
            fileNameSpan.textContent = 'No file selected';
            handleDocumentQuery(); // Automatically query the new document
        } else {
            throw new Error(result.error || 'Failed to submit document');
        }
    } catch (error) {
        console.error('Submission Error:', error);
        showNotification(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Document';
    }
}

// Handle the document query form submission
async function handleDocumentQuery(e) {
    if (e) e.preventDefault();
    const docID = document.getElementById('docIdInput').value;

    if (!docID || docID.length !== 32) {
        showNotification('Please enter a valid 32-character document ID.', 'error');
        return;
    }

    documentDisplay.innerHTML = `<p class="loading"><i class="fas fa-spinner fa-spin"></i> Fetching document...</p>`;

    try {
        const response = await fetch(`${API_BASE_URL}/documents/${docID}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Document not found');
        }
        const result = await response.json();
        renderDocumentDetails(result.document);
    } catch (error) {
        console.error('Query Error:', error);
        showNotification(error.message, 'error');
        documentDisplay.innerHTML = `<p class="loading"><i class="fas fa-exclamation-triangle"></i> Error fetching document.</p>`;
    }
}

// Render the details of a single queried document
function renderDocumentDetails(doc) {
    // Replaced onclick="..." with data-doc-id="..." for better event handling
    documentDisplay.innerHTML = `
        <table class="documents-table">
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                <tr><td><strong>Document ID</strong></td><td><code>${doc.docID}</code></td></tr>
                <tr><td><strong>File Name</strong></td><td>${doc.fileName}</td></tr>
                <tr><td><strong>IPFS Hash</strong></td><td><code>${doc.ipfsHash}</code></td></tr>
                <tr><td><strong>Owner</strong></td><td>${doc.owner}</td></tr>
                <tr><td><strong>Timestamp</strong></td><td>${new Date(doc.timestamp).toLocaleString()}</td></tr>
                <tr>
                    <td><strong>Status</strong></td>
                    <td><span class="status-badge status-${doc.status.toLowerCase()}">${doc.status}</span></td>
                </tr>
                <tr>
                    <td><strong>Actions</strong></td>
                    <td>
                        <div class="action-buttons">
                            ${doc.status === 'Submitted' ? `
                                <button class="action-btn approve-btn" data-doc-id="${doc.docID}"><i class="fas fa-check"></i> Approve</button>
                                <button class="action-btn reject-btn" data-doc-id="${doc.docID}"><i class="fas fa-times"></i> Reject</button>
                            ` : 'No actions available'}
                            <a href="${API_BASE_URL}/documents/${doc.docID}/download" class="action-btn download-btn" download>
                               <i class="fas fa-download"></i> Download
                            </a>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>`;
}

// Approve a document
async function approveDocument(docID) {
    showNotification(`Approving document ${docID.substring(0,8)}...`, 'info');
    try {
        const response = await fetch(`${API_BASE_URL}/documents/${docID}/approve`, { method: 'PUT' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Approval failed');

        showNotification('Document approved successfully!', 'success');
        handleDocumentQuery(); // Re-query the document to show updated status
    } catch (error) {
        showNotification(`Failed to approve document: ${error.message}`, 'error');
    }
}

// Reject a document
async function rejectDocument(docID) {
    showNotification(`Rejecting document ${docID.substring(0,8)}...`, 'info');
    try {
        const response = await fetch(`${API_BASE_URL}/documents/${docID}/reject`, { method: 'PUT' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Rejection failed');

        showNotification('Document rejected successfully!', 'success');
        handleDocumentQuery(); // Re-query the document to show updated status
    } catch (error) {
        showNotification(`Failed to reject document: ${error.message}`, 'error');
    }
}

// Show a notification message
function showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notifications.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Check the network status using the /health endpoint
async function checkNetworkStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        const result = await response.json();
        if (result.status === 'OK') {
             networkStatus.className = 'status-indicator';
             networkStatus.style.background = '#d4edda';
             networkStatus.style.color = '#155724';
             networkStatus.innerHTML = '<i class="fas fa-circle"></i> Connected';
        } else {
            throw new Error('Health check failed');
        }
    } catch (error) {
        networkStatus.className = 'status-indicator';
        networkStatus.style.background = '#f8d7da';
        networkStatus.style.color = '#721c24';
        networkStatus.innerHTML = '<i class="fas fa-circle"></i> Disconnected';
    }
}

// Enhanced file handling
function setupEventListeners() {
    // Improved file input handling with validation
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        const fileNameElement = document.getElementById('fileName');
        
        if (file) {
            // File size validation (25MB limit)
            const maxSize = 25 * 1024 * 1024; // 25MB in bytes
            if (file.size > maxSize) {
                showNotification('File size must be less than 25MB', 'error');
                fileInput.value = '';
                fileNameElement.textContent = 'No file selected';
                fileNameElement.classList.remove('selected');
                return;
            }
            
            // File type validation
            const allowedTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
                'image/jpeg',
                'image/jpg',
                'image/png',
                'application/zip',
                'text/csv',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            ];
            
            const fileExtension = file.name.split('.').pop().toLowerCase();
            const allowedExtensions = ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'zip', 'csv', 'xlsx', 'xls', 'ppt', 'pptx'];
            
            if (!allowedExtensions.includes(fileExtension)) {
                showNotification('File type not supported. Please upload: PDF, DOC, DOCX, TXT, JPG, PNG, ZIP, CSV, XLSX, PPT', 'error');
                fileInput.value = '';
                fileNameElement.textContent = 'No file selected';
                fileNameElement.classList.remove('selected');
                return;
            }
            
            // Show selected file info
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            const fileSizeKB = (file.size / 1024).toFixed(0);
            const displaySize = file.size > 1024 * 1024 ? `${fileSize} MB` : `${fileSizeKB} KB`;
            
            fileNameElement.innerHTML = `
                <strong>${file.name}</strong><br>
                <div class="file-size-info">
                    Size: ${displaySize} | Type: ${fileExtension.toUpperCase()} | 
                    Modified: ${new Date(file.lastModified).toLocaleDateString()}
                </div>
            `;
            fileNameElement.classList.add('selected');
            
            console.log('File selected:', {
                name: file.name,
                size: file.size,
                type: file.type,
                extension: fileExtension,
                lastModified: new Date(file.lastModified)
            });
            
            showNotification(`File "${file.name}" selected successfully!`, 'success');
        } else {
            fileNameElement.textContent = 'No file selected';
            fileNameElement.classList.remove('selected');
        }
    });

    // Rest of your existing event listeners...
    documentForm.addEventListener('submit', handleDocumentSubmission);
    queryForm.addEventListener('submit', handleDocumentQuery);
    
    documentDisplay.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const docID = target.dataset.docId;
        if (target.classList.contains('approve-btn')) {
            approveDocument(docID);
        } else if (target.classList.contains('reject-btn')) {
            rejectDocument(docID);
        }
    });
}
