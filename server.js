const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SABNZB_BASE_URL = process.env.SABNZB_BASE_URL && process.env.SABNZB_BASE_URL.trim();
const SABNZB_API_KEY = process.env.SABNZB_API_KEY && process.env.SABNZB_API_KEY.trim();
const SABNZB_DEFAULT_CATEGORY = (process.env.SABNZB_DEFAULT_CATEGORY || '').trim();

const NZBGEEK_API_URL = (process.env.NZBGEEK_API_URL || 'https://api.nzbgeek.info/api').replace(/\/$/, '');
const NZBGEEK_API_KEY = process.env.NZBGEEK_API_KEY && process.env.NZBGEEK_API_KEY.trim();
const NZBGEEK_SEARCH_CAT = (process.env.NZBGEEK_SEARCH_CAT || '6000').trim();
const NZBGEEK_SEARCH_LIMIT = parseInt(process.env.NZBGEEK_SEARCH_LIMIT || '200', 10) || 200;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

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

// SabNZB integration: status (is it configured?)
app.get('/api/sabnzb/status', (req, res) => {
    const configured = !!(SABNZB_BASE_URL && SABNZB_API_KEY);
    res.json({ configured });
});

// Performer thumbnail lookup. Scrapes thumbnailseries.com's performer page for
// up to 10 distinct gallery thumbnail URLs and hands them back to the client,
// which hotlinks whichever one is chosen directly - we never download or
// store the image ourselves, only the resolved URL strings (in-memory,
// cleared on restart).
const THUMBNAIL_SOURCE_BASE = 'https://www.thumbnailseries.com';
const THUMBNAIL_OPTION_COUNT = 10;
const performerThumbnailsCache = new Map(); // lowercased name -> array of image URLs

function slugifyPerformerName(name) {
    return name
        .toLowerCase()
        .replace(/\./g, ' ') // NZB-style names use dots as separators
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

app.get('/api/performer-thumbnails', async (req, res) => {
    const name = req.query.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
    }

    const cacheKey = name.trim().toLowerCase();
    if (performerThumbnailsCache.has(cacheKey)) {
        return res.json({ imageUrls: performerThumbnailsCache.get(cacheKey) });
    }

    const slug = slugifyPerformerName(name);
    if (!slug) {
        return res.json({ imageUrls: [] });
    }

    try {
        const pageUrl = `${THUMBNAIL_SOURCE_BASE}/pornstars/${slug}/`;
        const response = await fetch(pageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSParser/1.0)' }
        });

        if (!response.ok) {
            // A stable "no such performer page" result is worth caching;
            // don't cache below on genuine network errors so those can retry
            performerThumbnailsCache.set(cacheKey, []);
            return res.json({ imageUrls: [] });
        }

        const html = await response.text();
        const matches = html.matchAll(/["'](\/tgpx\/thumbs\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi);
        const seen = new Set();
        const imageUrls = [];
        for (const m of matches) {
            const url = `${THUMBNAIL_SOURCE_BASE}${m[1]}`;
            if (seen.has(url)) continue;
            seen.add(url);
            imageUrls.push(url);
            if (imageUrls.length >= THUMBNAIL_OPTION_COUNT) break;
        }

        performerThumbnailsCache.set(cacheKey, imageUrls);
        res.json({ imageUrls });
    } catch (err) {
        console.error('Performer thumbnail lookup error:', err.message);
        res.json({ imageUrls: [] });
    }
});

// Performer / NZBGeek search (Newznab-compatible API)
app.get('/api/search', async (req, res) => {
    if (!NZBGEEK_API_KEY) {
        return res.status(503).json({ error: 'Search API not configured. Add NZBGEEK_API_KEY (and optionally NZBGEEK_API_URL) to .env' });
    }
    const q = req.query.q;
    if (!q || typeof q !== 'string' || !q.trim()) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const params = new URLSearchParams({
        t: 'search',
        q: q.trim(),
        cat: NZBGEEK_SEARCH_CAT,
        limit: String(Math.min(500, Math.max(1, NZBGEEK_SEARCH_LIMIT))),
        extended: '1',
        o: 'json',
        apikey: NZBGEEK_API_KEY
    });
    const url = `${NZBGEEK_API_URL}?${params.toString()}`;
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'RSSParser/1.0 (https://github.com)' }
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const msg = (data && (data.message || data.error || data.description)) || response.statusText;
            console.error('Search API upstream error:', response.status, msg, 'URL:', `${NZBGEEK_API_URL}?t=search&q=${encodeURIComponent(q.trim())}&cat=${NZBGEEK_SEARCH_CAT}&limit=...&apikey=***`);
            return res.status(response.status).json({
                error: response.status === 404
                    ? 'Indexer returned 404. Check NZBGEEK_API_URL and NZBGEEK_API_KEY in .env (use the API key from your NZBGeek profile).'
                    : msg
            });
        }
        res.json(data);
    } catch (err) {
        console.error('Search API error:', err.message);
        res.status(500).json({ error: err.message || 'Failed to reach search API' });
    }
});

// SabNZB integration: add NZB by URL
app.post('/api/sabnzb/add', async (req, res) => {
    if (!SABNZB_BASE_URL || !SABNZB_API_KEY) {
        return res.status(503).json({ ok: false, error: 'SabNZB not configured (set SABNZB_BASE_URL and SABNZB_API_KEY)' });
    }

    const { nzbUrl, category, nzbname } = req.body || {};
    if (!nzbUrl || typeof nzbUrl !== 'string') {
        return res.status(400).json({ ok: false, error: 'nzbUrl is required' });
    }

    const base = SABNZB_BASE_URL.replace(/\/$/, '');
    const params = new URLSearchParams({
        mode: 'addurl',
        name: nzbUrl.trim(),
        apikey: SABNZB_API_KEY
    });
    if (category && String(category).trim()) {
        params.set('cat', String(category).trim());
    } else if (SABNZB_DEFAULT_CATEGORY) {
        params.set('cat', SABNZB_DEFAULT_CATEGORY);
    }
    if (nzbname && String(nzbname).trim()) {
        params.set('nzbname', String(nzbname).trim());
    }

    const sabUrl = `${base}/api?${params.toString()}`;

    try {
        const response = await fetch(sabUrl);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return res.status(response.status).json({
                ok: false,
                error: data.error || data.message || response.statusText
            });
        }
        if (data.status === false || data.error) {
            return res.status(400).json({
                ok: false,
                error: data.error || data.message || 'SabNZB returned an error'
            });
        }
        res.json({ ok: true, message: data.message || 'Added to queue' });
    } catch (err) {
        console.error('SabNZB add error:', err.message);
        res.status(500).json({ ok: false, error: err.message || 'Failed to reach SabNZB' });
    }
});

// SabNZB integration: clear history (delete all history entries in SABnzbd)
app.post('/api/sabnzb/history/clear', async (req, res) => {
    if (!SABNZB_BASE_URL || !SABNZB_API_KEY) {
        return res.status(503).json({ ok: false, error: 'SabNZB not configured (set SABNZB_BASE_URL and SABNZB_API_KEY)' });
    }

    const base = SABNZB_BASE_URL.replace(/\/$/, '');

    function sabFetch(params) {
        const q = new URLSearchParams({ ...params, output: 'json', apikey: SABNZB_API_KEY });
        return fetch(`${base}/api?${q.toString()}`, { method: 'GET' });
    }

    try {
        // First try: delete all in one call (supported by most SABnzbd versions)
        const deleteAllParams = { mode: 'history', name: 'delete', value: 'all' };
        const deleteAllRes = await sabFetch(deleteAllParams);
        const deleteAllData = await deleteAllRes.json().catch(() => ({}));

        if (deleteAllRes.ok && deleteAllData.status !== false && !deleteAllData.error) {
            return res.json({ ok: true, message: 'History cleared' });
        }

        if (deleteAllRes.status === 404) {
            // Fallback: fetch history slots then delete by nzo_id (works when value=all is not supported)
            const historyRes = await sabFetch({ mode: 'history', limit: '500' });
            const historyData = await historyRes.json().catch(() => ({}));

            if (!historyRes.ok || !historyData.history || !Array.isArray(historyData.history.slots)) {
                const msg = historyData.error || historyData.message || historyRes.statusText;
                console.error('SabNZB clear history: delete all 404, history fetch failed:', historyRes.status, msg);
                return res.status(404).json({
                    ok: false,
                    error: 'Not Found. Use the full API key from SABnzbd Config → General (not the NZB-only key). If SABnzbd uses a subpath (e.g. /sabnzbd), set SABNZB_BASE_URL to include it.'
                });
            }

            const slots = historyData.history.slots;
            if (slots.length === 0) {
                return res.json({ ok: true, message: 'History cleared (already empty)' });
            }

            const nzoIds = slots.map(s => s.nzo_id).filter(Boolean);
            // Delete in one call with comma-separated ids (per wiki: value=NZO_ID_1,NZO_ID_2,NZO_ID_3)
            const value = nzoIds.join(',');
            const deleteRes = await sabFetch({ mode: 'history', name: 'delete', value, archive: '0' });
            const deleteData = await deleteRes.json().catch(() => ({}));

            if (!deleteRes.ok || deleteData.status === false || deleteData.error) {
                const msg = deleteData.error || deleteData.message || deleteRes.statusText;
                console.error('SabNZB clear history: delete by ids failed:', deleteRes.status, msg);
                return res.status(deleteRes.ok ? 400 : deleteRes.status).json({
                    ok: false,
                    error: msg
                });
            }
            return res.json({ ok: true, message: 'History cleared' });
        }

        // Non-404 error from delete all
        const message = deleteAllData.error || deleteAllData.message || deleteAllRes.statusText;
        console.error('SabNZB clear history failed:', deleteAllRes.status, message);
        return res.status(deleteAllRes.status).json({
            ok: false,
            error: message
        });
    } catch (err) {
        console.error('SabNZB clear history error:', err.message);
        res.status(500).json({ ok: false, error: err.message || 'Failed to reach SabNZB' });
    }
});

// Restart server (closes this process and spawns a new one after a short delay)
function handleRestart(req, res) {
    res.json({ ok: true, message: 'Restarting...' });
    const cwd = process.cwd();
    const delayScript = `setTimeout(() => {
        const { spawn } = require('child_process');
        const path = require('path');
        const c = spawn(process.execPath, [path.join(${JSON.stringify(cwd)}, 'server.js')], { detached: true, stdio: 'ignore', cwd: ${JSON.stringify(cwd)} });
        c.unref();
    }, 2500);`;
    const child = spawn(process.execPath, ['-e', delayScript], { detached: true, stdio: 'ignore', cwd });
    child.unref();
    server.close(() => process.exit(0));
}
app.post('/api/restart', handleRestart);
app.get('/api/restart', handleRestart);

const server = app.listen(PORT, () => {
    console.log(`RSS Parser server running at http://localhost:${PORT}`);
    console.log(`Proxy endpoint: http://localhost:${PORT}/proxy/rss?url=YOUR_RSS_URL`);
    if (SABNZB_BASE_URL && SABNZB_API_KEY) {
        console.log('SabNZB integration enabled');
    }
    if (NZBGEEK_API_KEY) {
        console.log('Performer search (NZBGeek) enabled');
    }
});
