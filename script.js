// RSS Parser - Full Functionality Built on Working Foundation
console.log('Loading RSS Parser...');

class RSSParser {
    constructor() {
        console.log('RSSParser constructor called');
        
        // Initialize core properties
        this.brands = new Map();
        this.excludedFiles = [];
        this.timeFilter = 0;
        
        // Load saved data safely
        this.favoriteBrands = this.loadArray('rssParserFavoriteBrands');
        this.antiFavoriteBrands = this.loadArray('rssParserAntiFavoriteBrands'); 
        this.keywords = this.loadArray('rssParserKeywords');
        this.excludeKeywords = this.loadArray('rssParserExcludeKeywords');
        
        // Load default RSS URL
        const savedUrl = localStorage.getItem('rssParserDefaultUrl');
        if (savedUrl) {
            const urlInput = document.getElementById('rss-url');
            if (urlInput) urlInput.value = savedUrl;
        }
        
        // Initialize UI
        this.initializeBasicEvents();
        this.initializeSimpleTabs();
        this.initializeTimeFilter();
        this.initializeKeywordManagement();
        this.initializeSearchFilter();
        
        // Display saved favorites and keywords
        setTimeout(() => {
            console.log('Displaying favorites and keywords...');
            console.log('Favorite brands:', this.favoriteBrands);
            console.log('Keywords:', this.keywords);
            console.log('Exclude keywords:', this.excludeKeywords);
            this.displayFavoritesAndKeywords();
        }, 100);
        
        console.log('RSSParser initialized successfully');
    }
    
    loadArray(key) {
        try {
            const saved = localStorage.getItem(key);
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error(`Error loading ${key}:`, error);
            return [];
        }
    }
    
    saveArray(key, array) {
        try {
            localStorage.setItem(key, JSON.stringify(Array.isArray(array) ? array : []));
        } catch (error) {
            console.error(`Error saving ${key}:`, error);
        }
    }
    
    initializeBasicEvents() {
        console.log('Setting up basic events...');
        
        // Fetch button
        const fetchBtn = document.getElementById('fetch-btn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', () => {
                console.log('Fetch button clicked!');
                this.fetchRSS();
            });
            console.log('Fetch button ready');
        }
        
        // Clear button
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                console.log('Clear button clicked!');
                this.clearAll();
            });
        }
        
        // Save URL on change
        const urlInput = document.getElementById('rss-url');
        if (urlInput) {
            urlInput.addEventListener('change', () => {
                localStorage.setItem('rssParserDefaultUrl', urlInput.value);
            });
        }
    }
    
    initializeSimpleTabs() {
        console.log('Setting up simple tabs...');
        
        const tabButtons = document.querySelectorAll('.tab-btn');
        console.log(`Found ${tabButtons.length} tab buttons`);
        
        tabButtons.forEach((button, index) => {
            const tabName = button.getAttribute('data-tab');
            console.log(`Setting up tab ${index}: ${tabName}`);
            
            button.addEventListener('click', () => {
                console.log(`TAB CLICKED: ${tabName}`);
                
                // Remove active from all
                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                
                // Add active to clicked
                button.classList.add('active');
                const targetContent = document.getElementById(`${tabName}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
                    console.log(`Switched to ${tabName} tab successfully`);
                    
                    // Load content for specific tabs
                    if (tabName === 'favorites') {
                        this.displayFavorites();
                    } else if (tabName === 'excluded') {
                        this.displayExcludedFiles();
                    }
                } else {
                    console.error(`Tab content ${tabName}-tab not found`);
                }
            });
        });
        
        console.log('Tabs setup complete');
    }
    
    initializeTimeFilter() {
        const timeFilter = document.getElementById('time-filter');
        if (timeFilter) {
            timeFilter.addEventListener('change', (e) => {
                console.log('Time filter changed to:', e.target.value);
                this.timeFilter = parseInt(e.target.value);
                this.updateFilterInfo();
                this.applyTimeFilter();
            });
            console.log('Time filter ready');
        }
    }
    
    updateFilterInfo() {
        const filterInfo = document.getElementById('filter-info');
        if (!filterInfo) return;
        
        if (this.timeFilter === 0) {
            filterInfo.textContent = 'Showing all files';
        } else if (this.timeFilter === 1) {
            filterInfo.textContent = 'Showing files from last hour';
        } else if (this.timeFilter < 24) {
            filterInfo.textContent = `Showing files from last ${this.timeFilter} hours`;
        } else if (this.timeFilter === 24) {
            filterInfo.textContent = 'Showing files from last 24 hours';
        } else if (this.timeFilter < 168) {
            filterInfo.textContent = `Showing files from last ${Math.round(this.timeFilter / 24)} days`;
        } else if (this.timeFilter === 168) {
            filterInfo.textContent = 'Showing files from last week';
        } else if (this.timeFilter === 336) {
            filterInfo.textContent = 'Showing files from last 2 weeks';
        } else if (this.timeFilter === 720) {
            filterInfo.textContent = 'Showing files from last month';
        } else {
            filterInfo.textContent = `Showing files from last ${Math.round(this.timeFilter / 24)} days`;
        }
    }
    
    initializeKeywordManagement() {
        // Add brand button
        const addBrandBtn = document.getElementById('add-brand-btn');
        if (addBrandBtn) {
            addBrandBtn.addEventListener('click', () => {
                const input = document.getElementById('add-brand-input');
                if (input && input.value.trim()) {
                    this.addFavoriteBrand(input.value.trim());
                    input.value = '';
                }
            });
        }
        
        // Add keyword button
        const addKeywordBtn = document.getElementById('add-keyword-btn');
        if (addKeywordBtn) {
            addKeywordBtn.addEventListener('click', () => {
                const input = document.getElementById('add-keyword-input');
                if (input && input.value.trim()) {
                    this.addKeyword(input.value.trim());
                    input.value = '';
                }
            });
        }
        
        // Add exclude keyword button
        const addExcludeBtn = document.getElementById('add-exclude-keyword-btn');
        if (addExcludeBtn) {
            addExcludeBtn.addEventListener('click', () => {
                const input = document.getElementById('add-exclude-keyword-input');
                if (input && input.value.trim()) {
                    this.addExcludeKeyword(input.value.trim());
                    input.value = '';
                }
            });
        }
        
        // Enter key support
        const brandInput = document.getElementById('add-brand-input');
        if (brandInput) {
            brandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addBrandBtn.click();
                }
            });
        }
        
        const keywordInput = document.getElementById('add-keyword-input');
        if (keywordInput) {
            keywordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addKeywordBtn.click();
                }
            });
        }
        
        const excludeInput = document.getElementById('add-exclude-keyword-input');
        if (excludeInput) {
            excludeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addExcludeBtn.click();
                }
            });
        }
    }
    
    initializeSearchFilter() {
        const searchInput = document.getElementById('results-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.applySearchFilter(e.target.value);
            });
            console.log('Search filter ready');
        }
    }

    async fetchRSS() {
        console.log('=== fetchRSS called ===');
        const rssUrl = document.getElementById('rss-url').value.trim();
        console.log('RSS URL:', rssUrl);
        
        if (!rssUrl) {
            alert('Please enter an RSS feed URL first.');
            return;
        }

        try {
            console.log('Starting fetch process for:', rssUrl);
            
            // Show loading
            const fetchBtn = document.getElementById('fetch-btn');
            if (fetchBtn) {
                fetchBtn.textContent = 'Fetching...';
                fetchBtn.disabled = true;
            }
            
            // Use proxy server to avoid CORS issues
            const proxyUrl = `/proxy/rss?url=${encodeURIComponent(rssUrl)}`;
            console.log('Fetching via proxy:', proxyUrl);
            
            const response = await fetch(proxyUrl);
            console.log('Proxy response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Proxy error response:', errorText);
                throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
            }
            
            const rssContent = await response.text();
            console.log('RSS content received, length:', rssContent.length);
            
            // Parse the RSS content
            this.parseRSS(rssContent);
            
        } catch (error) {
            console.error('Error fetching RSS:', error);
            alert('Error fetching RSS: ' + error.message);
        } finally {
            // Reset button
            const fetchBtn = document.getElementById('fetch-btn');
            if (fetchBtn) {
                fetchBtn.textContent = 'Fetch RSS';
                fetchBtn.disabled = false;
            }
        }
    }
    
    parseRSS(rssContent) {
        console.log('Parsing RSS content...');
        
        try {
            // Clear previous data
            this.brands.clear();
            this.excludedFiles = [];
            
            // Try XML parsing first
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(rssContent, 'text/xml');
            
            if (xmlDoc.documentElement.nodeName === 'parsererror') {
                throw new Error('XML parsing failed, trying text parsing');
            }
            
            const items = xmlDoc.querySelectorAll('item');
            console.log(`Found ${items.length} items in RSS feed`);
            
            if (items.length === 0) {
                throw new Error('No items found in RSS feed');
            }
            
            // Process each item
            let totalFiles = 0;
            items.forEach(item => {
                const fileInfo = this.extractFileInfoFromXML(item);
                if (fileInfo) {
                    // Check if excluded
                    if (this.isFileExcluded(fileInfo.name)) {
                        this.excludedFiles.push(fileInfo);
                        return;
                    }
                    
                    totalFiles++;
                    
                    // Group by brand
                    if (!this.brands.has(fileInfo.brand)) {
                        this.brands.set(fileInfo.brand, new Map());
                    }
                    
                    const brandFiles = this.brands.get(fileInfo.brand);
                    if (!brandFiles.has(fileInfo.baseName)) {
                        brandFiles.set(fileInfo.baseName, []);
                    }
                    
                    brandFiles.get(fileInfo.baseName).push(fileInfo);
                }
            });
            
            console.log(`Processed ${totalFiles} files into ${this.brands.size} brands`);
            
            // Display results
            this.displayResults();
            
        } catch (error) {
            console.error('Error parsing RSS:', error);
            alert('Error parsing RSS: ' + error.message);
        }
    }
    
    extractFileInfoFromXML(item) {
        try {
            const titleElement = item.querySelector('title');
            const linkElement = item.querySelector('link');
            const enclosureElement = item.querySelector('enclosure');
            const pubDateElement = item.querySelector('pubDate');
            const descElement = item.querySelector('description');
            
            if (!titleElement) return null;
            
            const title = titleElement.textContent || '';
            // Use enclosure URL if available (actual NZB download), otherwise fall back to link
            const link = enclosureElement ? enclosureElement.getAttribute('url') : (linkElement ? linkElement.textContent : '');
            const pubDate = pubDateElement ? new Date(pubDateElement.textContent) : new Date();
            
            // Extract size - try newznab:attr first, then fall back to description
            let size = '';
            const sizeAttr = item.querySelector('attr[name="size"]');
            if (sizeAttr) {
                const sizeBytes = parseInt(sizeAttr.getAttribute('value'));
                if (sizeBytes) {
                    // Convert bytes to human-readable format
                    size = this.formatBytes(sizeBytes);
                }
            } else if (descElement) {
                // Fallback to old format
                const desc = descElement.textContent || '';
                const sizeMatch = desc.match(/Size: ([^,]+)/);
                if (sizeMatch) {
                    size = sizeMatch[1];
                }
            }
            
            // Extract brand and base name from title
            const brand = this.extractBrand(title);
            const baseName = this.extractBaseName(title);
            
            return {
                name: title,
                brand: brand,
                baseName: baseName,
                link: link,
                size: size,
                pubDate: pubDate,
                timeAgo: this.getTimeAgo(pubDate)
            };
        } catch (error) {
            console.error('Error extracting file info:', error);
            return null;
        }
    }

    extractBrand(filename) {
        // Extract brand from filename patterns
        const patterns = [
            /^([A-Za-z0-9]+(?:[A-Za-z0-9]*[A-Za-z0-9])?)[\.\-_]/,
            /([A-Z][a-z]+(?:[A-Z][a-z]*)*)/,
            /^([^\.]+)/
        ];
        
        for (const pattern of patterns) {
            const match = filename.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return 'Unknown';
    }

    extractBaseName(filename) {
        // Remove file extension and common suffixes
        let baseName = filename.replace(/\.(nzb|zip|rar|mp4|mkv|avi)$/i, '');
        
        // Remove quality indicators and common suffixes
        baseName = baseName.replace(/[\.\-_](720p|1080p|480p|2160p|4K|HDRip|BDRip|DVDRip|WEBRip|HDTV|x264|x265|H264|H265|AAC|AC3|DTS|XXX)[\.\-_].*$/i, '');
        
        return baseName || filename;
    }
    
    isFileExcluded(filename) {
        if (!Array.isArray(this.excludeKeywords)) return false;
        
        return this.excludeKeywords.some(keyword => 
            filename.toLowerCase().includes(keyword.toLowerCase())
        );
    }
    
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return `${Math.floor(diffDays / 7)}w ago`;
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }
    
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    displayResults() {
        console.log('Displaying results...');
        
        // Show results section
        document.getElementById('results-section').style.display = 'block';
        
        // Calculate cutoff time if filter is active
        const cutoffTime = this.timeFilter > 0 
            ? new Date(Date.now() - (this.timeFilter * 60 * 60 * 1000))
            : null;
        
        // Update stats (count filtered files if filter is active)
        let totalFiles = 0;
        let totalBrands = 0;
        let latestDate = null;
        
        this.brands.forEach(brandFiles => {
            let brandHasFiles = false;
            brandFiles.forEach(files => {
                files.forEach(file => {
                    // Apply time filter if active
                    if (cutoffTime && file.pubDate < cutoffTime) {
                        return;
                    }
                    
                    totalFiles++;
                    brandHasFiles = true;
                    
                    if (!latestDate || file.pubDate > latestDate) {
                        latestDate = file.pubDate;
                    }
                });
            });
            
            if (brandHasFiles) {
                totalBrands++;
            }
        });
        
        document.getElementById('total-files').textContent = totalFiles;
        document.getElementById('total-brands').textContent = totalBrands;
        
        // Update excluded count
        const excludedCountElement = document.getElementById('excluded-files-count');
        if (excludedCountElement) {
            excludedCountElement.textContent = this.excludedFiles.length;
        }
        
        if (latestDate) {
            const latestElement = document.getElementById('latest-upload-date');
            if (latestElement) {
                latestElement.textContent = this.getTimeAgo(latestDate);
            }
        }
        
        // Display brands
        this.displayBrands();
        
        // Update favorites stats if on favorites tab
        this.updateFavoritesStats();
    }
    
    displayBrands() {
        const container = document.getElementById('brands-container');
        if (!container) return;
        
        let html = '';
        
        // Calculate cutoff time if filter is active
        const cutoffTime = this.timeFilter > 0 
            ? new Date(Date.now() - (this.timeFilter * 60 * 60 * 1000))
            : null;
        
        // Sort brands by name
        const sortedBrands = Array.from(this.brands.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        sortedBrands.forEach(([brandName, brandFiles]) => {
            const isFavorite = this.favoriteBrands.includes(brandName);
            const isAntiFavorite = this.antiFavoriteBrands.includes(brandName);
            
            // Generate filtered files HTML
            const filesHTML = this.generateBrandFilesHTML(brandFiles, cutoffTime);
            
            // Skip this brand if no files match the filter
            if (filesHTML.filteredFileCount === 0) {
                return;
            }
            
            // Get latest file date for this brand (from filtered files)
            let brandLatestDate = null;
            brandFiles.forEach(files => {
                files.forEach(file => {
                    // Only consider files that pass the time filter
                    if (cutoffTime && file.pubDate < cutoffTime) {
                        return;
                    }
                    if (!brandLatestDate || file.pubDate > brandLatestDate) {
                        brandLatestDate = file.pubDate;
                    }
                });
            });
            
            html += `
                <div class="brand-item ${isFavorite ? 'favorite' : ''} ${isAntiFavorite ? 'anti-favorite' : ''}" data-brand="${this.escapeHtml(brandName)}">
                    <div class="brand-header">
                        <h3>${this.escapeHtml(brandName)} (${filesHTML.filteredFileCount} files)</h3>
                        <div class="brand-controls">
                            <span class="brand-latest">${brandLatestDate ? this.getTimeAgo(brandLatestDate) : ''}</span>
                            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-action="favorite" data-brand="${this.escapeHtml(brandName)}">
                                ${isFavorite ? '★' : '☆'}
                            </button>
                            <button class="anti-favorite-btn ${isAntiFavorite ? 'active' : ''}" data-action="anti-favorite" data-brand="${this.escapeHtml(brandName)}">
                                ${isAntiFavorite ? '✖' : '○'}
                            </button>
                            <button class="expand-btn" data-action="expand" data-brand="${this.escapeHtml(brandName)}">▼</button>
                        </div>
                    </div>
                    <div class="brand-files" style="display: none;">
                        ${filesHTML.html}
            </div>
            </div>
        `;
        });
        
        container.innerHTML = html;
        
        // Set up event delegation for brand controls
        this.setupBrandEventDelegation(container);
        
        // Apply keyword highlighting
        this.applyKeywordHighlighting();
    }
    
    setupBrandEventDelegation(container) {
        // Create a handler function for this specific container
        const handleBrandClick = (e) => {
            console.log('Click detected on:', e.target);
            const button = e.target;
            const action = button.getAttribute('data-action');
            const brandName = button.getAttribute('data-brand');
            
            console.log('Button attributes - action:', action, 'brandName:', brandName);
            
            if (!action || !brandName) {
                console.log('Missing action or brandName, ignoring click');
                return;
            }
            
            console.log('Brand button clicked:', action, brandName);
            
            switch (action) {
                case 'expand':
                    this.toggleBrandExpansion(brandName);
                    break;
                case 'favorite':
                    this.toggleFavorite(brandName);
                    break;
                case 'anti-favorite':
                    this.toggleAntiFavorite(brandName);
                    break;
            }
        };
        
        // Remove any existing listener if present (stored on container itself)
        if (container._brandClickHandler) {
            container.removeEventListener('click', container._brandClickHandler);
        }
        
        // Store the handler on the container and add the listener
        container._brandClickHandler = handleBrandClick;
        container.addEventListener('click', handleBrandClick);
    }
    
    generateBrandFilesHTML(brandFiles, cutoffTime = null) {
        let html = '';
        let filteredFileCount = 0;
        
        // Sort by base name
        const sortedFiles = Array.from(brandFiles.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        sortedFiles.forEach(([baseName, files]) => {
            // Sort files by date (newest first)
            files.sort((a, b) => b.pubDate - a.pubDate);
            
            // Filter files based on cutoff time if provided
            const filteredFiles = cutoffTime 
                ? files.filter(file => file.pubDate >= cutoffTime)
                : files;
            
            // Skip this group if no files match the filter
            if (filteredFiles.length === 0) {
                return;
            }
            
            filteredFileCount += filteredFiles.length;
            
            html += `<div class="file-group">`;
            html += `<h4>${baseName} (${filteredFiles.length} versions)</h4>`;
            
            filteredFiles.forEach(file => {
                const ageClass = this.getAgeClass(file.pubDate);
                const correctedFilename = this.ensureFilenameHasXXX(file.name);
                const proxyDownloadUrl = `/proxy/download?url=${encodeURIComponent(file.link)}&filename=${encodeURIComponent(correctedFilename)}`;
                html += `
                    <div class="file-item ${ageClass}">
            <div class="file-info">
                            <span class="file-name">${file.name}</span>
                            <div class="file-meta">
                    <span class="file-size">${file.size}</span>
                                <span class="file-age">${file.timeAgo}</span>
                </div>
            </div>
                        <a href="${proxyDownloadUrl}" class="download-btn">Download NZB</a>
            </div>
        `;
            });
            
            html += `</div>`;
        });
        
        return { html, filteredFileCount };
    }
    
    getAgeClass(date) {
        const hoursAgo = (new Date() - date) / (1000 * 60 * 60);
        if (hoursAgo <= 24) return 'age-new';
        if (hoursAgo <= 48) return 'age-recent';
        if (hoursAgo <= 168) return 'age-week';
        return 'age-old';
    }
    
    toggleBrandExpansion(brandName) {
        console.log('toggleBrandExpansion called for:', brandName);
        const brandItem = document.querySelector(`[data-brand="${brandName}"]`);
        console.log('Found brand item:', brandItem);
        
        if (!brandItem) {
            console.error('Brand item not found for:', brandName);
            return;
        }
        
        const filesDiv = brandItem.querySelector('.brand-files');
        const expandBtn = brandItem.querySelector('.expand-btn');
        
        console.log('Files div:', filesDiv);
        console.log('Expand button:', expandBtn);
        
        if (!filesDiv || !expandBtn) {
            console.error('Missing elements - filesDiv:', filesDiv, 'expandBtn:', expandBtn);
            return;
        }
        
        // Check if files are currently expanded using the CSS class
        const isExpanded = filesDiv.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse
            filesDiv.classList.remove('expanded');
            filesDiv.style.display = 'none';
            expandBtn.textContent = '▼';
            console.log('Collapsed brand:', brandName);
        } else {
            // Expand
            filesDiv.classList.add('expanded');
            filesDiv.style.display = 'block';
            expandBtn.textContent = '▲';
            console.log('Expanded brand:', brandName);
        }
    }
    
    toggleFavorite(brandName) {
        const index = this.favoriteBrands.indexOf(brandName);
        if (index === -1) {
            this.favoriteBrands.push(brandName);
        } else {
            this.favoriteBrands.splice(index, 1);
        }
        this.saveArray('rssParserFavoriteBrands', this.favoriteBrands);
        this.displayResults();
        this.displayFavoritesAndKeywords();
    }
    
    addFavoriteBrand(brandName) {
        console.log('Adding favorite brand:', brandName);
        if (!this.favoriteBrands.includes(brandName)) {
            this.favoriteBrands.push(brandName);
            this.saveArray('rssParserFavoriteBrands', this.favoriteBrands);
            console.log('Favorite brands after add:', this.favoriteBrands);
            this.displayFavoritesAndKeywords();
            
            // Also update results if they're displayed
            if (this.brands.size > 0) {
                this.displayResults();
            }
        } else {
            console.log('Brand already in favorites');
        }
    }
    
    removeFavoriteBrand(brandName) {
        const index = this.favoriteBrands.indexOf(brandName);
        if (index !== -1) {
            this.favoriteBrands.splice(index, 1);
            this.saveArray('rssParserFavoriteBrands', this.favoriteBrands);
            this.displayFavoritesAndKeywords();
            
            // Also update results if they're displayed
            if (this.brands.size > 0) {
                this.displayResults();
            }
        }
    }
    
    toggleAntiFavorite(brandName) {
        const index = this.antiFavoriteBrands.indexOf(brandName);
        if (index === -1) {
            this.antiFavoriteBrands.push(brandName);
        } else {
            this.antiFavoriteBrands.splice(index, 1);
        }
        this.saveArray('rssParserAntiFavoriteBrands', this.antiFavoriteBrands);
        this.displayResults();
        this.displayFavoritesAndKeywords();
    }
    
    applyTimeFilter() {
        // Re-display results with the filter applied
        this.displayResults();
    }
    
    applySearchFilter(searchTerm) {
        const searchStatus = document.getElementById('search-status');
        const searchLower = searchTerm.toLowerCase().trim();
        
        if (!searchLower) {
            // No search term - show all brands and files
            document.querySelectorAll('.brand-item').forEach(brandItem => {
                brandItem.style.display = 'block';
                const filesDiv = brandItem.querySelector('.brand-files');
                if (filesDiv) {
                    filesDiv.querySelectorAll('.file-group').forEach(group => {
                        group.style.display = 'block';
                        group.querySelectorAll('.file-item').forEach(file => {
                            file.style.display = 'flex';
                        });
                    });
                }
            });
            
            if (searchStatus) {
                searchStatus.textContent = '';
            }
            return;
        }
        
        let visibleBrands = 0;
        let visibleFiles = 0;
        
        // Filter brands and files
        document.querySelectorAll('.brand-item').forEach(brandItem => {
            let brandHasMatch = false;
            const filesDiv = brandItem.querySelector('.brand-files');
            
            if (filesDiv) {
                // Check each file group
                filesDiv.querySelectorAll('.file-group').forEach(group => {
                    let groupHasMatch = false;
                    
                    // Check each file in the group
                    group.querySelectorAll('.file-item').forEach(fileItem => {
                        const fileName = fileItem.querySelector('.file-name');
                        if (fileName) {
                            const fileNameText = fileName.textContent.toLowerCase();
                            const matches = fileNameText.includes(searchLower);
                            
                            fileItem.style.display = matches ? 'flex' : 'none';
                            if (matches) {
                                groupHasMatch = true;
                                visibleFiles++;
                            }
                        }
                    });
                    
                    // Show/hide the group based on whether it has matches
                    group.style.display = groupHasMatch ? 'block' : 'none';
                    if (groupHasMatch) {
                        brandHasMatch = true;
                    }
                });
            }
            
            // Show/hide the brand based on whether it has matching files
            brandItem.style.display = brandHasMatch ? 'block' : 'none';
            if (brandHasMatch) {
                visibleBrands++;
            }
        });
        
        // Update search status
        if (searchStatus) {
            if (visibleFiles === 0) {
                searchStatus.textContent = 'No matches found';
            } else {
                searchStatus.textContent = `${visibleFiles} file${visibleFiles !== 1 ? 's' : ''} in ${visibleBrands} brand${visibleBrands !== 1 ? 's' : ''}`;
            }
        }
    }
    
    addKeyword(keyword) {
        if (!this.keywords.includes(keyword)) {
            this.keywords.push(keyword);
            this.saveArray('rssParserKeywords', this.keywords);
            this.displayFavoritesAndKeywords();
            this.applyKeywordHighlighting();
        }
    }
    
    addExcludeKeyword(keyword) {
        if (!this.excludeKeywords.includes(keyword)) {
            this.excludeKeywords.push(keyword);
            this.saveArray('rssParserExcludeKeywords', this.excludeKeywords);
            this.displayFavoritesAndKeywords();
        }
    }
    
    removeKeyword(keyword) {
        const index = this.keywords.indexOf(keyword);
        if (index !== -1) {
            this.keywords.splice(index, 1);
            this.saveArray('rssParserKeywords', this.keywords);
            this.displayFavoritesAndKeywords();
            this.applyKeywordHighlighting();
        }
    }
    
    removeExcludeKeyword(keyword) {
        const index = this.excludeKeywords.indexOf(keyword);
        if (index !== -1) {
            this.excludeKeywords.splice(index, 1);
            this.saveArray('rssParserExcludeKeywords', this.excludeKeywords);
            this.displayFavoritesAndKeywords();
        }
    }
    
    applyKeywordHighlighting() {
        if (!Array.isArray(this.keywords) || this.keywords.length === 0) return;
        
        // Track which brands have keyword matches
        const brandsWithKeywords = new Set();
        
        document.querySelectorAll('.file-name').forEach(element => {
            const text = element.textContent;
            let highlightedText = text;
            let hasKeyword = false;
            
            this.keywords.forEach(keyword => {
                const regex = new RegExp(`(${keyword})`, 'gi');
                if (regex.test(text)) {
                    hasKeyword = true;
                }
                highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
            });
            
            if (highlightedText !== text) {
                element.innerHTML = highlightedText;
                element.closest('.file-item').classList.add('highlighted');
            }
            
            // If this file has a keyword, mark its brand
            if (hasKeyword) {
                const brandItem = element.closest('.brand-item');
                if (brandItem) {
                    const brandName = brandItem.getAttribute('data-brand');
                    if (brandName) {
                        brandsWithKeywords.add(brandName);
                    }
                }
            }
        });
        
        // Highlight brand headers that contain keyword matches
        brandsWithKeywords.forEach(brandName => {
            const brandItem = document.querySelector(`.brand-item[data-brand="${brandName}"]`);
            if (brandItem) {
                brandItem.classList.add('has-keywords');
                
                // Count keyword matches in this brand
                let matchCount = 0;
                brandItem.querySelectorAll('.file-item.highlighted').forEach(() => {
                    matchCount++;
                });
                
                // Add badge to brand header if it doesn't already exist
                const brandHeader = brandItem.querySelector('.brand-header');
                if (brandHeader && matchCount > 0) {
                    const existingBadge = brandHeader.querySelector('.keyword-match-badge');
                    if (!existingBadge) {
                        const badge = document.createElement('span');
                        badge.className = 'keyword-match-badge';
                        badge.textContent = `${matchCount} keyword match${matchCount !== 1 ? 'es' : ''}`;
                        badge.title = 'This brand contains files matching your keywords';
                        
                        // Insert badge after brand name
                        const brandControls = brandHeader.querySelector('.brand-controls');
                        if (brandControls) {
                            brandControls.insertBefore(badge, brandControls.firstChild);
                        }
                    }
                }
            }
        });
    }

    displayFavoritesAndKeywords() {
        this.displayFavoriteBrands();
        this.displayKeywords();
        this.displayExcludeKeywords();
    }
    
    displayFavoriteBrands() {
        const container = document.getElementById('favorite-brands-list');
        if (!container) return;
        
        if (this.favoriteBrands.length === 0) {
            container.innerHTML = '<p>No favorite brands selected.</p>';
            return;
        }
        
        let html = '';
        this.favoriteBrands.forEach((brand, index) => {
            html += `
                <span class="keyword-tag favorite-tag">
                    ${this.escapeHtml(brand)}
                    <button class="remove-tag-btn" data-type="favorite" data-index="${index}">×</button>
                </span>
            `;
        });
        
        container.innerHTML = html;
        
        // Set up event delegation for remove buttons
        container.querySelectorAll('.remove-tag-btn[data-type="favorite"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                const brand = this.favoriteBrands[index];
                if (brand) {
                    this.removeFavoriteBrand(brand);
                }
            });
        });
    }
    
    displayKeywords() {
        const container = document.getElementById('keywords-list');
        if (!container) return;
        
        if (this.keywords.length === 0) {
            container.innerHTML = '<p>No highlight keywords added.</p>';
            return;
        }
        
        let html = '';
        this.keywords.forEach((keyword, index) => {
            html += `
                <span class="keyword-tag">
                    ${this.escapeHtml(keyword)}
                    <button class="remove-tag-btn" data-type="keyword" data-index="${index}">×</button>
                </span>
            `;
        });
        
        container.innerHTML = html;
        
        // Set up event delegation for remove buttons
        container.querySelectorAll('.remove-tag-btn[data-type="keyword"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                const keyword = this.keywords[index];
                if (keyword) {
                    this.removeKeyword(keyword);
                }
            });
        });
    }
    
    displayExcludeKeywords() {
        const container = document.getElementById('exclude-keywords-list');
        if (!container) return;
        
        if (this.excludeKeywords.length === 0) {
            container.innerHTML = '<p>No exclude keywords added.</p>';
            return;
        }
        
        let html = '';
        this.excludeKeywords.forEach((keyword, index) => {
            html += `
                <span class="keyword-tag exclude-tag">
                    ${this.escapeHtml(keyword)}
                    <button class="remove-tag-btn" data-type="exclude" data-index="${index}">×</button>
                </span>
            `;
        });
        
        container.innerHTML = html;
        
        // Set up event delegation for remove buttons
        container.querySelectorAll('.remove-tag-btn[data-type="exclude"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                const keyword = this.excludeKeywords[index];
                if (keyword) {
                    this.removeExcludeKeyword(keyword);
                }
            });
        });
    }
    
    displayFavorites() {
        console.log('displayFavorites called');
        console.log('Favorite brands:', this.favoriteBrands);
        console.log('Brands size:', this.brands.size);
        
        // Display favorite brands
        this.displayFavoriteBrandsSection();
        
        // Display keyword matches
        this.displayKeywordMatchesSection();
        
        // Update stats
        this.updateFavoritesStats();
    }
    
    displayFavoriteBrandsSection() {
        console.log('displayFavoriteBrandsSection called');
        const container = document.getElementById('favorite-brands-display');
        console.log('Container found:', !!container);
        
        if (!container) {
            console.error('favorite-brands-display container not found!');
            return;
        }
        
        console.log('Favorite brands length:', this.favoriteBrands.length);
        console.log('Brands map size:', this.brands.size);
        
        if (this.favoriteBrands.length === 0 || this.brands.size === 0) {
            container.innerHTML = '<p>No favorite brands with files available.</p>';
            return;
        }
        
        let html = '';
        let foundCount = 0;
        
        this.favoriteBrands.forEach(brandName => {
            console.log(`Checking brand: ${brandName}, exists: ${this.brands.has(brandName)}`);
            if (this.brands.has(brandName)) {
                foundCount++;
                const brandFiles = this.brands.get(brandName);
                const filesHTML = this.generateBrandFilesHTML(brandFiles);
                console.log(`  Brand ${brandName} has ${filesHTML.filteredFileCount} files`);
                
                // Get latest date for this brand
                let latestDate = null;
                brandFiles.forEach(files => {
                    files.forEach(file => {
                        if (!latestDate || file.pubDate > latestDate) {
                            latestDate = file.pubDate;
                        }
                    });
                });
                
                html += `
                    <div class="brand-item favorite" data-brand="${this.escapeHtml(brandName)}">
                        <div class="brand-header">
                            <h3>${this.escapeHtml(brandName)} (${filesHTML.filteredFileCount} files)</h3>
                            <div class="brand-controls">
                                <span class="brand-latest">${latestDate ? this.getTimeAgo(latestDate) : ''}</span>
                                <button class="expand-btn" data-action="expand" data-brand="${this.escapeHtml(brandName)}">▼</button>
                            </div>
                        </div>
                        <div class="brand-files" style="display: none;">
                            ${filesHTML.html}
                        </div>
                    </div>
                `;
            }
        });
        
        console.log(`Found ${foundCount} favorite brands with files`);
        console.log('Generated HTML length:', html.length);
        
        if (html === '') {
            container.innerHTML = '<p>None of your favorite brands have files in the current results.</p>';
        } else {
            container.innerHTML = html;
            
            // Set up event delegation for favorites
            this.setupBrandEventDelegation(container);
        }
    }
    
    displayKeywordMatchesSection() {
        const container = document.getElementById('keyword-matches-display');
        if (!container) return;
        
        if (!Array.isArray(this.keywords) || this.keywords.length === 0) {
            container.innerHTML = '<p>No keywords configured. Add keywords in the Favorites & Keywords tab.</p>';
            return;
        }
        
        if (this.brands.size === 0) {
            container.innerHTML = '<p>No RSS data loaded. Fetch an RSS feed first.</p>';
            return;
        }
        
        // Find all files that match any keyword
        const matchingFiles = [];
        
        this.brands.forEach((brandFiles, brandName) => {
            brandFiles.forEach((files, baseName) => {
                files.forEach(file => {
                    // Check if file name contains any keyword
                    const fileName = file.name.toLowerCase();
                    const matchedKeywords = this.keywords.filter(keyword => 
                        fileName.includes(keyword.toLowerCase())
                    );
                    
                    if (matchedKeywords.length > 0) {
                        matchingFiles.push({
                            ...file,
                            brandName: brandName,
                            matchedKeywords: matchedKeywords
                        });
                    }
                });
            });
        });
        
        if (matchingFiles.length === 0) {
            container.innerHTML = `<p>No files match your keywords: ${this.keywords.join(', ')}</p>`;
            return;
        }
        
        // Sort by date (newest first)
        matchingFiles.sort((a, b) => b.pubDate - a.pubDate);
        
        let html = '<div class="keyword-matches-list">';
        
        matchingFiles.forEach(file => {
            const ageClass = this.getAgeClass(file.pubDate);
            const correctedFilename = this.ensureFilenameHasXXX(file.name);
            const proxyDownloadUrl = `/proxy/download?url=${encodeURIComponent(file.link)}&filename=${encodeURIComponent(correctedFilename)}`;
            html += `
                <div class="file-item ${ageClass} keyword-match">
                    <div class="file-info">
                        <span class="file-brand">[${this.escapeHtml(file.brandName)}]</span>
                        <span class="file-name">${this.highlightKeywords(file.name)}</span>
                        <div class="file-meta">
                            <span class="file-size">${file.size}</span>
                            <span class="file-age">${file.timeAgo}</span>
                            <span class="matched-keywords">Keywords: ${file.matchedKeywords.join(', ')}</span>
                        </div>
                    </div>
                    <a href="${proxyDownloadUrl}" class="download-btn">Download NZB</a>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    highlightKeywords(text) {
        let highlightedText = this.escapeHtml(text);
        
        this.keywords.forEach(keyword => {
            const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
            highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
        });
        
        return highlightedText;
    }
    
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    updateFavoritesStats() {
        // Update favorite brands count
        const favBrandsCount = document.getElementById('favorite-brands-count');
        if (favBrandsCount) {
            const activeFavBrands = this.favoriteBrands.filter(brand => this.brands.has(brand)).length;
            favBrandsCount.textContent = activeFavBrands;
        }
        
        // Count keyword matches
        let keywordMatchCount = 0;
        if (Array.isArray(this.keywords) && this.keywords.length > 0) {
            this.brands.forEach((brandFiles) => {
                brandFiles.forEach((files) => {
                    files.forEach(file => {
                        const fileName = file.name.toLowerCase();
                        if (this.keywords.some(keyword => fileName.includes(keyword.toLowerCase()))) {
                            keywordMatchCount++;
                        }
                    });
                });
            });
        }
        
        const keywordMatchesCount = document.getElementById('keyword-matches-count');
        if (keywordMatchesCount) {
            keywordMatchesCount.textContent = keywordMatchCount;
        }
        
        // Update latest upload
        let latestDate = null;
        this.brands.forEach((brandFiles) => {
            brandFiles.forEach((files) => {
                files.forEach(file => {
                    if (!latestDate || file.pubDate > latestDate) {
                        latestDate = file.pubDate;
                    }
                });
            });
        });
        
        const latestUpload = document.getElementById('favorites-latest-upload');
        if (latestUpload) {
            latestUpload.textContent = latestDate ? this.getTimeAgo(latestDate) : 'None';
        }
    }
    
    displayExcludedFiles() {
        const container = document.getElementById('excluded-files-container');
        if (!container) return;
        
        // Update the excluded total count
        const excludedTotalElement = document.getElementById('excluded-total-count');
        if (excludedTotalElement) {
            excludedTotalElement.textContent = this.excludedFiles.length;
        }
        
        if (this.excludedFiles.length === 0) {
            container.innerHTML = '<p>No files have been excluded.</p>';
            return;
        }
        
        let html = '';
        
        this.excludedFiles.forEach(file => {
            const matchedKeyword = this.getMatchedExcludeKeyword(file.name);
            const ageClass = this.getAgeClass(file.pubDate);
            const correctedFilename = this.ensureFilenameHasXXX(file.name);
            const proxyDownloadUrl = `/proxy/download?url=${encodeURIComponent(file.link)}&filename=${encodeURIComponent(correctedFilename)}`;
            
            html += `
                <div class="file-item excluded ${ageClass}">
                    <div class="file-info">
                        <span class="file-name">${this.escapeHtml(file.name)}</span>
                        <div class="file-meta">
                            <span class="exclude-reason">Excluded for: ${this.escapeHtml(matchedKeyword)}</span>
                            <span class="file-size">${file.size || ''}</span>
                            <span class="file-age">${file.timeAgo}</span>
                        </div>
                    </div>
                    <a href="${proxyDownloadUrl}" class="download-btn">Download NZB</a>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
    
    getMatchedExcludeKeyword(filename) {
        if (!Array.isArray(this.excludeKeywords)) return 'unknown';
        
        for (const keyword of this.excludeKeywords) {
            if (filename.toLowerCase().includes(keyword.toLowerCase())) {
                return keyword;
            }
        }
        return 'unknown';
    }
    
    clearAll() {
        console.log('Clearing all data');
        document.getElementById('results-section').style.display = 'none';
        document.getElementById('brands-container').innerHTML = '';
        document.getElementById('favorites-content').innerHTML = '';
        document.getElementById('excluded-content').innerHTML = '';
        this.brands.clear();
        this.excludedFiles = [];
    }
    
    ensureFilenameHasXXX(filename) {
        console.log('ensureFilenameHasXXX called with:', filename);
        
        // First, ensure the filename has .nzb extension
        let workingFilename = filename;
        if (!filename.toLowerCase().endsWith('.nzb')) {
            workingFilename = `${filename}.nzb`;
            console.log('  -> Added .nzb extension:', workingFilename);
        }
        
        // Check if filename already contains 'xxx' (case-insensitive)
        if (workingFilename.toLowerCase().includes('xxx')) {
            console.log('  -> Already contains xxx, returning:', workingFilename);
            return workingFilename;
        }
        
        // Insert xxx before the .nzb extension
        // We know it ends with .nzb now, so we can safely insert before it
        const result = workingFilename.replace(/\.nzb$/i, '.xxx.nzb');
        
        console.log('  -> Final result:', result);
        
        return result;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready, initializing RSSParser...');
    
    try {
        window.rssParser = new RSSParser();
        console.log('RSSParser ready!');
        
        // Test if elements exist
        console.log('Testing elements:');
        console.log('- fetch-btn:', !!document.getElementById('fetch-btn'));
        console.log('- time-filter:', !!document.getElementById('time-filter'));
        console.log('- tab buttons:', document.querySelectorAll('.tab-btn').length);
        
    } catch (error) {
        console.error('Failed to initialize RSSParser:', error);
    }
});

console.log('RSS Parser script loaded');
