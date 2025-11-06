const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static('.'));

// Proxy endpoint for RSS feeds
app.get('/proxy/rss', async (req, res) => {
    const { url } = req.query;
    
    console.log('Proxy request received for URL:', url);
    
    if (!url) {
        console.log('Error: No URL provided');
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    try {
        console.log('Attempting to fetch:', url);
        const response = await fetch(url);
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            console.log('HTTP error:', response.status, response.statusText);
            return res.status(response.status).json({ 
                error: `HTTP error: ${response.status} ${response.statusText}` 
            });
        }
        
        const content = await response.text();
        console.log('Content length:', content.length);
        console.log('Content preview:', content.substring(0, 200));
        
        res.set('Content-Type', 'text/plain');
        res.send(content);
        console.log('Successfully sent content to client');
    } catch (error) {
        console.error('Proxy error:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: `Failed to fetch RSS feed: ${error.message}` });
    }
});

// Proxy endpoint for file downloads
app.get('/proxy/download', async (req, res) => {
    const { url, filename } = req.query;
    
    console.log('=== DOWNLOAD PROXY REQUEST ===');
    console.log('URL parameter:', url);
    console.log('Filename parameter:', filename);
    console.log('Full query string:', req.url);
    
    if (!url) {
        console.log('Error: No URL provided');
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    try {
        console.log('Attempting to fetch file from:', url);
        const response = await fetch(url);
        console.log('Fetch response status:', response.status);
        console.log('Fetch response statusText:', response.statusText);
        console.log('Fetch response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            console.log('HTTP error:', response.status, response.statusText);
            const errorBody = await response.text();
            console.log('Error response body:', errorBody);
            return res.status(response.status).json({ 
                error: `HTTP error: ${response.status} ${response.statusText}`,
                details: errorBody
            });
        }
        
        // Get the content as a buffer
        const buffer = await response.buffer();
        console.log('File downloaded successfully, size:', buffer.length, 'bytes');
        
        // Set headers for file download
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const finalFilename = filename || 'download';
        
        console.log('Setting Content-Type:', contentType);
        console.log('Setting filename (raw):', finalFilename);
        console.log('Filename length:', finalFilename.length);
        console.log('Filename includes extension:', finalFilename.includes('.'));
        
        // Use RFC 5987 encoding for filename with special characters
        const encodedFilename = encodeURIComponent(finalFilename);
        console.log('Setting filename (encoded):', encodedFilename);
        
        res.set('Content-Type', contentType);
        res.set('Content-Disposition', `attachment; filename="${finalFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.set('Content-Length', buffer.length);
        
        res.send(buffer);
        console.log('Successfully sent file to client');
        console.log('=== DOWNLOAD PROXY COMPLETE ===');
    } catch (error) {
        console.error('=== DOWNLOAD PROXY ERROR ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: `Failed to download file: ${error.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`RSS Parser server running at http://localhost:${PORT}`);
    console.log(`Proxy endpoint: http://localhost:${PORT}/proxy/rss?url=YOUR_RSS_URL`);
});
