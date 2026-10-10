const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Downloaded/ignored-file tracking lives here instead of the browser's
// localStorage — that has a hard per-origin quota (~5-10MB) with no
// pruning, so it silently stopped saving once the history grew large
// enough, and it was tied to one browser profile anyway. A server-side
// file has no such ceiling and is shared across every browser/device
// that hits this server.
const DATA_DIR = path.join(__dirname, 'data');
const DOWNLOADED_FILE = path.join(DATA_DIR, 'downloaded-files.json');
const IGNORED_FILE = path.join(DATA_DIR, 'ignored-files.json');

function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return {};
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        return {};
    }
}

// Writes are chained onto this promise so concurrent requests (e.g. a
// "Download All" batch) can't interleave and corrupt the file, and each
// write lands via a temp-file rename so a crash mid-write can't either.
let historyWriteQueue = Promise.resolve();
function writeJsonFile(filePath, data) {
    const result = historyWriteQueue.then(() => new Promise((resolve, reject) => {
        fs.mkdir(DATA_DIR, { recursive: true }, (dirErr) => {
            if (dirErr) return reject(dirErr);
            const tmpPath = `${filePath}.${process.pid}.tmp`;
            fs.writeFile(tmpPath, JSON.stringify(data), (err) => {
                if (err) return reject(err);
                fs.rename(tmpPath, filePath, (renameErr) => renameErr ? reject(renameErr) : resolve());
            });
        });
    }));
    // Keep the queue itself always-resolving so one failed write doesn't
    // block every write queued after it; the caller still gets the real
    // rejection via the returned promise.
    historyWriteQueue = result.catch(() => {});
    return result;
}

const SABNZB_BASE_URL = process.env.SABNZB_BASE_URL && process.env.SABNZB_BASE_URL.trim();
const SABNZB_API_KEY = process.env.SABNZB_API_KEY && process.env.SABNZB_API_KEY.trim();
const SABNZB_DEFAULT_CATEGORY = (process.env.SABNZB_DEFAULT_CATEGORY || '').trim();

const NZBGEEK_API_URL = (process.env.NZBGEEK_API_URL || 'https://api.nzbgeek.info/api').replace(/\/$/, '');
const NZBGEEK_API_KEY = process.env.NZBGEEK_API_KEY && process.env.NZBGEEK_API_KEY.trim();
const NZBGEEK_SEARCH_CAT = (process.env.NZBGEEK_SEARCH_CAT || '6000').trim();
const NZBGEEK_SEARCH_LIMIT = parseInt(process.env.NZBGEEK_SEARCH_LIMIT || '200', 10) || 200;

// Enable CORS for all routes
app.use(cors());
// The default 100kb body limit was silently rejecting the one-time history
// migration (a long-lived download/ignore history that used to live in
// localStorage can legitimately run several MB) with a 413 on every attempt.
app.use(express.json({ limit: '50mb' }));

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

// Performer thumbnail lookup. Hands the client up to 10 candidate photo URLs
// for a name, which it hotlinks directly - we never download or store the
// images ourselves, only the resolved URL strings (in-memory, cleared on
// restart).
//
// Primary source is Babepedia's profile pictures (/pics/<Name>.jpg, then
// <Name>2.jpg, <Name>3.jpg, ...): real headshot-style portraits, and the
// image URLs are directly reachable even though its HTML pages sit behind a
// bot check. Names there are case-sensitive Title Case, and an unknown name
// 302s rather than 404ing. FreeOnes' search avatars (faces) and porn-star.com's
// scene-gallery thumbnails are appended after, for names Babepedia lacks.
const BABEPEDIA_PICS_BASE = 'https://www.babepedia.com/pics';
const GALLERY_SOURCE_BASE = 'https://www.porn-star.com';
const THUMBNAIL_OPTION_COUNT = 10;
const THUMBNAIL_FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
const performerThumbnailsCache = new Map(); // lowercased name -> array of image URLs

function slugifyPerformerName(name) {
    return name
        .toLowerCase()
        .replace(/\./g, ' ') // NZB-style names use dots as separators
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// "freya.parker" / "FREYA PARKER" -> "Freya Parker"
function titleCasePerformerName(name) {
    return name
        .replace(/[._]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/(^|[\s'-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

async function urlIsImage(url) {
    try {
        const response = await fetch(url, { method: 'HEAD', headers: THUMBNAIL_FETCH_HEADERS, redirect: 'manual' });
        return response.status === 200 && /^image\//i.test(response.headers.get('content-type') || '');
    } catch (err) {
        return false;
    }
}

async function findBabepediaPhotos(name) {
    const variants = [...new Set([titleCasePerformerName(name), name.replace(/[._]+/g, ' ').trim()])].filter(Boolean);
    for (const variant of variants) {
        const base = `${BABEPEDIA_PICS_BASE}/${encodeURIComponent(variant)}`;
        if (!(await urlIsImage(`${base}.jpg`))) continue;
        // Profile picture exists; the numbered extras are probed in parallel
        const extraSuffixes = [2, 3, 4, 5, 6, 7, 8, 9];
        const extras = await Promise.all(extraSuffixes.map(async n => (await urlIsImage(`${base}${n}.jpg`)) ? `${base}${n}.jpg` : null));
        return [`${base}.jpg`, ...extras.filter(Boolean)];
    }
    return [];
}

async function findGalleryPhotos(name) {
    const slug = slugifyPerformerName(name);
    if (!slug) return [];
    const pageUrl = `${GALLERY_SOURCE_BASE}/${slug}/`;
    // An unknown performer 302s to the home page rather than 404ing, so
    // redirects must not be followed or the home page's unrelated
    // thumbnails would be returned as if they belonged to this name.
    const response = await fetch(pageUrl, { headers: THUMBNAIL_FETCH_HEADERS, redirect: 'manual' });
    if (response.status !== 200) return [];
    const html = await response.text();
    const matches = html.matchAll(/<img[^>]+class=["']thumbnail["'][^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/gi);
    return [...matches].map(m => new URL(m[1], pageUrl).href);
}

const FREEONES_BASE = 'https://www.freeones.com';

function normalizePerformerName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// FreeOnes' performer search lists each match with a face avatar. Returns
// {exact, near}: exact = same name, near = every word of the query is the
// start of a word in the result's name (so "Kitty Wild" finds "Kitty Wilder"
// but not the unrelated results its fuzzy search pads the list with).
async function findFreeonesPhotos(name) {
    const response = await fetch(`${FREEONES_BASE}/performers?q=${encodeURIComponent(name.replace(/[._]+/g, ' ').trim())}`, {
        headers: THUMBNAIL_FETCH_HEADERS
    });
    if (!response.ok) return { exact: [], near: [] };
    const html = await response.text();

    const wanted = normalizePerformerName(name);
    const wantedWords = wanted.split(' ').filter(Boolean);
    const exact = [];
    const near = [];
    for (const block of html.split('data-test="teaser-subject"').slice(1)) {
        const img = block.match(/<img[^>]*?src="(https:\/\/thumbs\.freeones\.com[^"]+)"[^>]*?alt="([^"]*)"/s);
        if (!img) continue;
        const url = img[1].replace(/&amp;/g, '&');
        const resultName = normalizePerformerName(img[2].replace(/&#0?39;/g, "'").replace(/&amp;/g, '&'));
        if (resultName === wanted) {
            exact.push(url);
        } else {
            const resultWords = resultName.split(' ');
            if (wantedWords.length > 0 && wantedWords.every(w => resultWords.some(r => r.startsWith(w)))) near.push(url);
        }
    }
    return { exact, near: near.slice(0, 4) };
}

app.get('/api/performer-thumbnails', async (req, res) => {
    const name = req.query.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
    }

    const cacheKey = name.trim().toLowerCase();
    if (performerThumbnailsCache.has(cacheKey)) {
        return res.json(performerThumbnailsCache.get(cacheKey));
    }

    try {
        const [faces, freeones, gallery] = await Promise.all([
            findBabepediaPhotos(name),
            findFreeonesPhotos(name).catch(() => ({ exact: [], near: [] })),
            findGalleryPhotos(name).catch(() => [])
        ]);
        const exactUrls = [...new Set([...faces, ...freeones.exact, ...gallery])].slice(0, THUMBNAIL_OPTION_COUNT);

        // Only when nothing matches the name exactly are close matches
        // offered (flagged, so the client never auto-applies one as the
        // performer's photo - a different person's face as a default would
        // be worse than the placeholder).
        const approximate = exactUrls.length === 0 && freeones.near.length > 0;
        const imageUrls = approximate ? freeones.near : exactUrls;

        // Misses aren't cached: a failed probe can't be told apart from a
        // transient network error, and a stuck empty result would hide
        // photos until the next restart.
        if (imageUrls.length > 0) performerThumbnailsCache.set(cacheKey, { imageUrls, approximate });
        res.json({ imageUrls, approximate });
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
        // SABnzbd's value=all only removes completed entries; failed ones need
        // their own value=failed call. Best-effort: a failure here shouldn't
        // block clearing the rest, and the 'all' call below reports real errors.
        try {
            await sabFetch({ mode: 'history', name: 'delete', value: 'failed', del_files: '1' });
        } catch (e) {
            console.error('SabNZB clear failed-history error:', e.message);
        }

        // First try: delete all in one call (supported by most SABnzbd versions).
        // del_files=1 also removes the leftover files of failed/incomplete jobs -
        // without it, a "cleared" failed job's partial download stays on disk.
        const deleteAllParams = { mode: 'history', name: 'delete', value: 'all', del_files: '1' };
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
            // Delete in one call with comma-separated ids (per wiki: value=NZO_ID_1,NZO_ID_2,NZO_ID_3).
            // del_files=1 so failed jobs' leftover partial files are removed too, not just the history entry.
            const value = nzoIds.join(',');
            const deleteRes = await sabFetch({ mode: 'history', name: 'delete', value, archive: '0', del_files: '1' });
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

// Downloaded/ignored-file history (server-side, see comment near DATA_DIR above)
app.get('/api/history', (req, res) => {
    // Belt-and-braces: this must never be served stale from a cache — every
    // page load's "is this already downloaded?" check depends on it.
    res.set('Cache-Control', 'no-store');
    res.json({
        downloadedFiles: readJsonFile(DOWNLOADED_FILE),
        ignoredFiles: readJsonFile(IGNORED_FILE)
    });
});

app.post('/api/history/downloaded/upsert', async (req, res) => {
    const { fileId, entry } = req.body || {};
    if (!fileId || !entry || typeof entry !== 'object') {
        return res.status(400).json({ ok: false, error: 'fileId and entry are required' });
    }
    try {
        const data = readJsonFile(DOWNLOADED_FILE);
        data[fileId] = entry;
        await writeJsonFile(DOWNLOADED_FILE, data);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error saving downloaded-file entry:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/history/ignored/upsert', async (req, res) => {
    const { fileId, entry } = req.body || {};
    if (!fileId || !entry || typeof entry !== 'object') {
        return res.status(400).json({ ok: false, error: 'fileId and entry are required' });
    }
    try {
        const data = readJsonFile(IGNORED_FILE);
        data[fileId] = entry;
        await writeJsonFile(IGNORED_FILE, data);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error saving ignored-file entry:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/history/ignored/delete', async (req, res) => {
    const { fileId } = req.body || {};
    if (!fileId) return res.status(400).json({ ok: false, error: 'fileId is required' });
    try {
        const data = readJsonFile(IGNORED_FILE);
        delete data[fileId];
        await writeJsonFile(IGNORED_FILE, data);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting ignored-file entry:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// One-time migration from a browser's localStorage (see script.js
// migrateHistoryToServer): merges in whatever the server doesn't already
// have, preferring the newer of the two timestamps when both sides have the
// same fileId. Returns the merged store so the caller can adopt it directly.
app.post('/api/history/import', async (req, res) => {
    const { downloadedFiles, ignoredFiles } = req.body || {};
    const mergeInto = (existing, incoming, dateField) => {
        if (!incoming || typeof incoming !== 'object') return existing;
        for (const [fileId, entry] of Object.entries(incoming)) {
            if (!entry || typeof entry !== 'object') continue;
            const current = existing[fileId];
            if (!current || new Date(entry[dateField] || 0) >= new Date(current[dateField] || 0)) {
                existing[fileId] = entry;
            }
        }
        return existing;
    };
    try {
        const mergedDownloaded = mergeInto(readJsonFile(DOWNLOADED_FILE), downloadedFiles, 'downloadedAt');
        const mergedIgnored = mergeInto(readJsonFile(IGNORED_FILE), ignoredFiles, 'ignoredAt');
        await writeJsonFile(DOWNLOADED_FILE, mergedDownloaded);
        await writeJsonFile(IGNORED_FILE, mergedIgnored);
        res.json({ ok: true, downloadedFiles: mergedDownloaded, ignoredFiles: mergedIgnored });
    } catch (err) {
        console.error('Error importing history:', err.message);
        res.status(500).json({ ok: false, error: err.message });
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
