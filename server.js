const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

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

// Proxy endpoint for file downloads using native Node.js HTTP/HTTPS with redirect support
app.get('/proxy/download', (req, res) => {
    const { url, filename } = req.query;
    
    console.log('=== DOWNLOAD PROXY REQUEST ===');
    console.log('URL parameter:', url);
    console.log('Filename parameter:', filename);
    
    if (!url) {
        console.log('Error: No URL provided');
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    const finalFilename = filename || 'download';
    let redirectCount = 0;
    const maxRedirects = 5;
    
    function makeRequest(currentUrl) {
        try {
            const parsedUrl = new URL(currentUrl);
            
            console.log('Downloading from:', parsedUrl.href);
            console.log('Redirect count:', redirectCount);
            
            // Choose http or https based on protocol
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            // Request options with proper headers
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            };
            
            // Make the request
            const request = client.get(options, (response) => {
                console.log('Response status:', response.statusCode);
                console.log('Response headers:', response.headers);
                
                // Handle redirects (301, 302, 303, 307, 308)
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    if (redirectCount >= maxRedirects) {
                        console.log('Too many redirects');
                        return res.status(500).json({ error: 'Too many redirects' });
                    }
                    
                    redirectCount++;
                    const redirectUrl = new URL(response.headers.location, currentUrl).href;
                    console.log('Following redirect to:', redirectUrl);
                    return makeRequest(redirectUrl);
                }
                
                if (response.statusCode !== 200) {
                    console.log('HTTP error:', response.statusCode);
                    return res.status(response.statusCode).json({ 
                        error: `HTTP error: ${response.statusCode}` 
                    });
                }
                
                // Set response headers BEFORE piping
                res.set('Content-Type', 'application/octet-stream');
                res.set('Content-Disposition', `attachment; filename="${finalFilename}"`);
                
                if (response.headers['content-length']) {
                    res.set('Content-Length', response.headers['content-length']);
                }
                
                console.log('Piping response directly to client...');
                
                // Pipe directly - pure passthrough, no processing
                response.pipe(res);
                
                response.on('end', () => {
                    console.log('Successfully piped file to client');
                    console.log('=== DOWNLOAD PROXY COMPLETE ===');
                });
                
                response.on('error', (err) => {
                    console.error('Response stream error:', err);
                });
            });
            
            request.on('error', (err) => {
                console.error('Request error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: `Failed to download file: ${err.message}` });
                }
            });
            
        } catch (error) {
            console.error('=== DOWNLOAD PROXY ERROR ===');
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            if (!res.headersSent) {
                res.status(500).json({ error: `Failed to download file: ${error.message}` });
            }
        }
    }
    
    makeRequest(url);
});

app.listen(PORT, () => {
    console.log(`RSS Parser server running at http://localhost:${PORT}`);
    console.log(`Proxy endpoint: http://localhost:${PORT}/proxy/rss?url=YOUR_RSS_URL`);
});
