const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

async function testAPI() {
    console.log('🧪 Testing Backend API...');
    
    // Test 1: Health Check
    try {
        console.log('\n1️⃣ Testing /health endpoint...');
        const healthResponse = await fetch('http://localhost:8081/health');
        const healthResult = await healthResponse.json();
        console.log('✅ Health check:', healthResult);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
        return;
    }
    
    // Test 2: File Upload
    try {
        console.log('\n2️⃣ Testing /documents endpoint...');
        
        // Create a test file
        const testContent = 'This is a test document for blockchain upload';
        fs.writeFileSync('test-upload.txt', testContent);
        
        const formData = new FormData();
        formData.append('file', fs.createReadStream('test-upload.txt'));
        
        const response = await fetch('http://localhost:8081/documents', {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });
        
        const result = await response.json();
        console.log('📤 Upload response:', response.status, response.statusText);
        console.log('📄 Result:', result);
        
        if (response.ok) {
            console.log('🎉 API Test SUCCESS!');
        } else {
            console.log('❌ API Test FAILED!');
        }
        
        // Cleanup
        fs.unlinkSync('test-upload.txt');
        
    } catch (error) {
        console.log('💥 API test error:', error.message);
    }
}

testAPI();
