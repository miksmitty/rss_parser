// RSS Parser - Full Functionality Built on Working Foundation
console.log('Loading RSS Parser...');

class RSSParser {
    constructor() {
        console.log('RSSParser constructor called');
        
        // Initialize core properties
        this.brands = new Map();
        this.excludedFiles = [];
        this.timeFilter = 0;
        // Size filter boundaries in bytes (0 = no bound)
        this.minSizeBytes = 0;
        this.maxSizeBytes = 0;
        // Target size for the "preferred" highlight (defaults to 1 GB)
        this.preferredSizeBytes = 1024 * 1024 * 1024;

        // Load saved data safely
        this.favoriteBrands = this.loadArray('rssParserFavoriteBrands');
        this.antiFavoriteBrands = this.loadArray('rssParserAntiFavoriteBrands');
        this.keywords = this.loadArray('rssParserKeywords');
        this.performers = this.loadArray('rssParserPerformers');
        this.excludeKeywords = this.loadArray('rssParserExcludeKeywords');
        this.downloadedFiles = this.loadDownloadedFiles();
        this.ignoredFiles = this.loadIgnoredFiles();
        this.urlHistory = this.loadArray('rssParserUrlHistory');
        this.sabnzbConfigured = false;
        // Favorites/Performers tab sort mode (persisted); "custom" keeps the
        // user's own favourites order / alphabetical match order
        this.favoritesSortMode = localStorage.getItem('rssParserFavoritesSort') || 'custom';
        this.performersSortMode = localStorage.getItem('rssParserPerformersSort') || 'custom';
        // Session-only cache of performer name -> candidate thumbnail URLs,
        // so re-rendering the tag list doesn't re-fetch every performer
        this.performerThumbnailCache = new Map();
        // Persisted: performer name (lowercased) -> the thumbnail URL the user
        // picked. Takes priority over the auto-fetched default once set.
        this.performerThumbnails = this.loadObject('rssParserPerformerThumbnails') || {};

        // One-time split of the old mixed keywords list into Keywords vs
        // Performers, based on name shape ("Firstname Lastname"-style entries
        // move to Performers; everything else stays a keyword)
        this.migratePerformersFromKeywords();
        
        // Load default RSS URL (most recent from history or saved default)
        const savedUrl = localStorage.getItem('rssParserDefaultUrl');
        if (savedUrl) {
            const urlInput = document.getElementById('rss-url');
            if (urlInput) urlInput.value = savedUrl;
        } else if (this.urlHistory.length > 0) {
            const urlInput = document.getElementById('rss-url');
            if (urlInput) urlInput.value = this.urlHistory[0];
        }
        
        // Initialize UI
        this.initializeBasicEvents();
        this.initializeSimpleTabs();
        this.initializeTimeFilter();
        this.initializeHideFullyReviewed();
        this.initializeKeywordManagement();
        this.initializeSearchFilter();
        this.initializeUrlHistoryDropdown();
        this.initializeQuickSearchToggle();
        this.initializeSizeFilter();
        this.initializeTagListTools();
        this.initializeFavoritesTools();
        this.initializePerformersTools();

        // Display saved favorites and keywords
        setTimeout(() => {
            console.log('Displaying favorites and keywords...');
            console.log('Favorite brands:', this.favoriteBrands);
            console.log('Keywords:', this.keywords);
            console.log('Exclude keywords:', this.excludeKeywords);
            this.displayFavoritesAndKeywords();
            this.fetchSabNZBStatus();
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

    // "Firstname Lastname[ Lastname]" shape - 2-3 capitalised words, letters
    // only. Used both for the one-time keyword/performer migration and to
    // guess a default category while searching. Never authoritative - always
    // overridable by the user.
    looksLikePerformerName(text) {
        return /^[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){1,2}$/.test((text || '').trim());
    }

    // Default pick for the search box's Performer/Keyword/Do not add
    // selector. A term matching an existing favourite brand should never be
    // filed as a performer or keyword - that's what bit "nancylove" (a
    // brand) getting auto-added as a performer when searched from its
    // Quick Search chip.
    guessSearchSaveType(text) {
        const trimmed = (text || '').trim();
        if (!trimmed) return 'performer';
        const isFavoriteBrand = this.favoriteBrands.some(b => b.toLowerCase() === trimmed.toLowerCase());
        if (isFavoriteBrand) return 'none';
        return this.looksLikePerformerName(trimmed) ? 'performer' : 'keyword';
    }

    /**
     * Runs once. Keywords used to double as performer names, so any existing
     * entry that looks like a person's name ("Firstname Lastname[ Lastname]",
     * 2-3 capitalised words, letters only) is moved into the new Performers
     * list. Single-word or non-name-shaped entries stay as general keywords.
     * The heuristic won't always be right — misclassified tags can be moved
     * with the ↔ button on their tag in either list.
     */
    migratePerformersFromKeywords() {
        if (localStorage.getItem('rssParserPerformersMigrated') === '1') return;

        const remainingKeywords = [];

        this.keywords.forEach(keyword => {
            const trimmed = keyword.trim();
            const isPerformerLike = this.looksLikePerformerName(trimmed) &&
                !this.performers.some(p => p.toLowerCase() === trimmed.toLowerCase());
            if (isPerformerLike) {
                this.performers.push(keyword);
            } else {
                remainingKeywords.push(keyword);
            }
        });

        this.keywords = remainingKeywords;
        this.saveArray('rssParserKeywords', this.keywords);
        this.saveArray('rssParserPerformers', this.performers);
        localStorage.setItem('rssParserPerformersMigrated', '1');
        console.log(`Migrated ${this.performers.length} performer-looking keyword(s) into the new Performers list`);
    }

    loadObject(key) {
        try {
            const saved = localStorage.getItem(key);
            const parsed = saved ? JSON.parse(saved) : null;
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (error) {
            console.error(`Error loading ${key}:`, error);
            return null;
        }
    }

    saveObject(key, obj) {
        try {
            localStorage.setItem(key, JSON.stringify(obj || {}));
        } catch (error) {
            console.error(`Error saving ${key}:`, error);
        }
    }

    loadDownloadedFiles() {
        try {
            const saved = localStorage.getItem('rssParserDownloadedFiles');
            const parsed = saved ? JSON.parse(saved) : {};
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch (error) {
            console.error('Error loading downloaded files:', error);
            return {};
        }
    }
    
    saveDownloadedFiles() {
        try {
            localStorage.setItem('rssParserDownloadedFiles', JSON.stringify(this.downloadedFiles));
        } catch (error) {
            console.error('Error saving downloaded files:', error);
        }
    }
    
    loadIgnoredFiles() {
        try {
            const saved = localStorage.getItem('rssParserIgnoredFiles');
            const parsed = saved ? JSON.parse(saved) : {};
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch (error) {
            console.error('Error loading ignored files:', error);
            return {};
        }
    }
    
    saveIgnoredFiles() {
        try {
            localStorage.setItem('rssParserIgnoredFiles', JSON.stringify(this.ignoredFiles));
        } catch (error) {
            console.error('Error saving ignored files:', error);
        }
    }
    
    markFileAsIgnored(fileLink, fileName) {
        const fileId = this.getFileId(fileLink);
        const baseName = this.extractBaseName(fileName);
        this.ignoredFiles[fileId] = {
            fileName: fileName,
            baseName: baseName,
            ignoredAt: new Date().toISOString()
        };
        this.saveIgnoredFiles();
        console.log('Marked file as ignored:', fileName, 'baseName:', baseName);
    }
    
    unignoreFile(fileLink) {
        const fileId = this.getFileId(fileLink);
        if (this.ignoredFiles.hasOwnProperty(fileId)) {
            delete this.ignoredFiles[fileId];
            this.saveIgnoredFiles();
            console.log('Unignored file:', fileLink);
        }
    }
    
    isFileIgnored(fileLink) {
        const fileId = this.getFileId(fileLink);
        return this.ignoredFiles.hasOwnProperty(fileId);
    }
    
    hasSiblingIgnored(baseName) {
        // Check if any file with the same baseName has been ignored
        const groupKey = this.getBaseNameGroupKey(baseName);
        for (const fileId in this.ignoredFiles) {
            const ignoredFile = this.ignoredFiles[fileId];
            const storedBaseName = ignoredFile.baseName || 
                (ignoredFile.fileName ? this.extractBaseName(ignoredFile.fileName) : null);
            if (storedBaseName != null && this.getBaseNameGroupKey(storedBaseName) === groupKey) {
                return true;
            }
        }
        return false;
    }
    
    markFileAsDownloaded(fileLink, fileName) {
        // Use the file link as a unique identifier
        const fileId = this.getFileId(fileLink);
        const baseName = this.extractBaseName(fileName);
        this.downloadedFiles[fileId] = {
            fileName: fileName,
            baseName: baseName,
            link: fileLink, // kept so a later "redownload recent files" can reissue the NZB
            downloadedAt: new Date().toISOString()
        };
        this.saveDownloadedFiles();
        console.log('Marked file as downloaded:', fileName, 'baseName:', baseName);
    }
    
    isFileDownloaded(fileLink) {
        const fileId = this.getFileId(fileLink);
        return this.downloadedFiles.hasOwnProperty(fileId);
    }
    
    hasSiblingDownloaded(baseName) {
        // Check if any file with the same baseName has been downloaded
        const groupKey = this.getBaseNameGroupKey(baseName);
        for (const fileId in this.downloadedFiles) {
            const downloadedFile = this.downloadedFiles[fileId];
            // For files downloaded before baseName was stored, compute it from fileName
            const storedBaseName = downloadedFile.baseName || 
                (downloadedFile.fileName ? this.extractBaseName(downloadedFile.fileName) : null);
            if (storedBaseName != null && this.getBaseNameGroupKey(storedBaseName) === groupKey) {
                return true;
            }
        }
        return false;
    }
    
    getDownloadedSiblingInfo(baseName) {
        // Get info about the downloaded sibling file
        const groupKey = this.getBaseNameGroupKey(baseName);
        for (const fileId in this.downloadedFiles) {
            const downloadedFile = this.downloadedFiles[fileId];
            // For files downloaded before baseName was stored, compute it from fileName
            const storedBaseName = downloadedFile.baseName || 
                (downloadedFile.fileName ? this.extractBaseName(downloadedFile.fileName) : null);
            if (storedBaseName != null && this.getBaseNameGroupKey(storedBaseName) === groupKey) {
                return downloadedFile;
            }
        }
        return null;
    }
    
    isBrandFullyDownloaded(brandFiles, cutoffTime = null) {
        // Check if all files in a brand have been downloaded, ignored, or have a sibling downloaded/ignored
        // Returns true if every baseName group has at least one download or all files are ignored
        let hasAnyFiles = false;
        
        for (const [baseName, files] of brandFiles) {
            // Filter files based on cutoff time (if provided) and size bounds
            const filteredFiles = files.filter(file =>
                (!cutoffTime || file.pubDate >= cutoffTime) && this.fileWithinSizeBounds(file)
            );
            
            // Skip if no files match the filter
            if (filteredFiles.length === 0) {
                continue;
            }
            
            hasAnyFiles = true;
            
            // Check if any file in this baseName group is downloaded or has sibling downloaded
            const hasDownload = filteredFiles.some(file => this.isFileDownloaded(file.link));
            const hasSiblingDownload = this.hasSiblingDownloaded(baseName);
            
            // Check if all files in this group are ignored (or sibling ignored)
            const allIgnored = filteredFiles.every(file => this.isFileIgnored(file.link));
            const hasSiblingIgnored = this.hasSiblingIgnored(baseName);
            
            // Group is "reviewed" if it has a download, sibling download, or all files are ignored
            if (!hasDownload && !hasSiblingDownload && !allIgnored && !hasSiblingIgnored) {
                return false; // Found a baseName group with no downloads and not all ignored
            }
        }
        
        // Return true only if there were files and all were reviewed
        return hasAnyFiles;
    }
    
    getFileId(fileLink) {
        // Create a simple hash/id from the file link
        // Remove any query parameters that might change between sessions
        try {
            const url = new URL(fileLink, window.location.origin);
            // Use pathname + key search params as the identifier
            return url.pathname + (url.searchParams.get('id') || '');
        } catch {
            // Fallback to using the full link
            return fileLink;
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
        
        // Clear SABnzb history button
        const clearSabnzbHistoryBtn = document.getElementById('clear-sabnzb-history-btn');
        if (clearSabnzbHistoryBtn) {
            clearSabnzbHistoryBtn.addEventListener('click', () => this.clearSabNZBHistory());
        }

        // Redownload recent files (e.g. after an accidental local deletion)
        const redownloadBtn = document.getElementById('redownload-btn');
        if (redownloadBtn) {
            redownloadBtn.addEventListener('click', () => this.openRedownloadPicker(redownloadBtn));
        }
        
        // Scroll to top button
        const scrollToTopBtn = document.getElementById('scroll-to-top-btn');
        if (scrollToTopBtn) {
            scrollToTopBtn.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            // Only show once the page is actually scrolled down a bit
            const toggleScrollBtn = () => {
                scrollToTopBtn.classList.toggle('visible', window.scrollY > 300);
            };
            window.addEventListener('scroll', toggleScrollBtn, { passive: true });
            toggleScrollBtn();
        }
        
        // Performer search
        const performerSearchBtn = document.getElementById('performer-search-btn');
        const performerSearchInput = document.getElementById('performer-search');
        if (performerSearchBtn && performerSearchInput) {
            performerSearchBtn.addEventListener('click', () => this.fetchPerformerSearch());
            performerSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.fetchPerformerSearch();
            });
        }

        // Guess Performer / Keyword / Do not add from the term's shape as the
        // user types (this search box isn't performer-only), but stop
        // guessing the moment they pick a category themselves - that choice
        // sticks until the box is cleared and a new term is started
        const searchTypeSelect = document.getElementById('save-search-term-type');
        if (performerSearchInput && searchTypeSelect) {
            let searchTypeManuallySet = false;
            searchTypeSelect.addEventListener('change', () => {
                searchTypeManuallySet = true;
            });
            performerSearchInput.addEventListener('input', () => {
                const value = performerSearchInput.value;
                if (!value.trim()) {
                    searchTypeManuallySet = false;
                }
                if (!searchTypeManuallySet) {
                    searchTypeSelect.value = this.guessSearchSaveType(value);
                }
            });
        }
        
        // Restart server
        const restartServerBtn = document.getElementById('restart-server-btn');
        if (restartServerBtn) {
            restartServerBtn.addEventListener('click', () => this.restartServer());
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
                    } else if (tabName === 'performers') {
                        this.displayPerformers();
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

    initializeSizeFilter() {
        const minEl = document.getElementById('size-min');
        const maxEl = document.getElementById('size-max');
        const unitEl = document.getElementById('size-unit');
        const prefEl = document.getElementById('size-preferred');
        const clearBtn = document.getElementById('size-filter-clear');
        if (!minEl || !maxEl || !unitEl) return;

        const ONE_GB = 1024 * 1024 * 1024;

        // Restore saved values
        const saved = this.loadObject('rssParserSizeFilter');
        if (saved && typeof saved === 'object') {
            if (saved.min != null) minEl.value = saved.min;
            if (saved.max != null) maxEl.value = saved.max;
            if (saved.unit) unitEl.value = saved.unit;
            if (prefEl && saved.preferred != null) prefEl.value = saved.preferred;
        }

        const apply = () => {
            const unitBytes = unitEl.value === 'MB' ? 1024 * 1024 : ONE_GB;
            const min = parseFloat(minEl.value);
            const max = parseFloat(maxEl.value);
            const pref = prefEl ? parseFloat(prefEl.value) : NaN;
            this.minSizeBytes = (!isNaN(min) && min > 0) ? min * unitBytes : 0;
            this.maxSizeBytes = (!isNaN(max) && max > 0) ? max * unitBytes : 0;
            // Blank preferred falls back to 1 GB (original behaviour)
            this.preferredSizeBytes = (!isNaN(pref) && pref > 0) ? pref * unitBytes : ONE_GB;

            this.saveObject('rssParserSizeFilter', {
                min: minEl.value, max: maxEl.value, unit: unitEl.value,
                preferred: prefEl ? prefEl.value : ''
            });
            this.updateSizeFilterInfo();
            if (this.brands.size > 0) this.displayResults();
        };

        minEl.addEventListener('input', apply);
        maxEl.addEventListener('input', apply);
        unitEl.addEventListener('change', apply);
        if (prefEl) prefEl.addEventListener('input', apply);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                minEl.value = '';
                maxEl.value = '';
                if (prefEl) prefEl.value = '';
                apply();
            });
        }

        // Apply restored values on load
        apply();
    }

    updateSizeFilterInfo() {
        const info = document.getElementById('size-filter-info');
        if (!info) return;
        const fmt = b => this.formatBytes(b);
        if (this.minSizeBytes > 0 && this.maxSizeBytes > 0) {
            info.textContent = `Showing ${fmt(this.minSizeBytes)} – ${fmt(this.maxSizeBytes)}`;
        } else if (this.minSizeBytes > 0) {
            info.textContent = `Showing ≥ ${fmt(this.minSizeBytes)}`;
        } else if (this.maxSizeBytes > 0) {
            info.textContent = `Showing ≤ ${fmt(this.maxSizeBytes)}`;
        } else {
            info.textContent = 'Showing all sizes';
        }
    }

    // True if a file's size is within the active min/max bounds. Files with an
    // unparseable/unknown size (0 bytes) are never hidden by the size filter.
    fileWithinSizeBounds(file) {
        const bytes = this.parseSizeToBytes(file && file.size);
        if (bytes <= 0) return true;
        if (this.minSizeBytes > 0 && bytes < this.minSizeBytes) return false;
        if (this.maxSizeBytes > 0 && bytes > this.maxSizeBytes) return false;
        return true;
    }

    initializeHideFullyReviewed() {
        const checkbox = document.getElementById('hide-fully-reviewed');
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                if (this.brands.size > 0) {
                    this.displayResults();
                }
            });
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

        // Add performer button
        const addPerformerBtn = document.getElementById('add-performer-btn');
        if (addPerformerBtn) {
            addPerformerBtn.addEventListener('click', () => {
                const input = document.getElementById('add-performer-input');
                if (input && input.value.trim()) {
                    this.addPerformer(input.value.trim());
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

        const performerInput = document.getElementById('add-performer-input');
        if (performerInput) {
            performerInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addPerformerBtn.click();
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
    
    initializeUrlHistoryDropdown() {
        const dropdownBtn = document.getElementById('url-dropdown-btn');
        const dropdown = document.getElementById('url-history-dropdown');
        const urlInput = document.getElementById('rss-url');
        const clearHistoryBtn = document.getElementById('clear-url-history');
        
        if (!dropdownBtn || !dropdown || !urlInput) {
            console.log('URL history dropdown elements not found');
            return;
        }
        
        // Toggle dropdown on button click
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleUrlDropdown();
        });
        
        // Also toggle on input focus (optional, for convenience)
        urlInput.addEventListener('focus', () => {
            if (this.urlHistory.length > 0) {
                this.showUrlDropdown();
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== dropdownBtn && e.target !== urlInput) {
                this.hideUrlDropdown();
            }
        });
        
        // Clear history button
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearUrlHistory();
            });
        }
        
        // Populate the dropdown initially
        this.populateUrlHistoryDropdown();
        
        console.log('URL history dropdown ready');
    }
    
    toggleUrlDropdown() {
        const dropdown = document.getElementById('url-history-dropdown');
        if (dropdown) {
            const isVisible = dropdown.classList.contains('show');
            if (isVisible) {
                this.hideUrlDropdown();
            } else {
                this.showUrlDropdown();
            }
        }
    }
    
    showUrlDropdown() {
        const dropdown = document.getElementById('url-history-dropdown');
        if (dropdown && this.urlHistory.length > 0) {
            dropdown.classList.add('show');
        }
    }
    
    hideUrlDropdown() {
        const dropdown = document.getElementById('url-history-dropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
    }
    
    populateUrlHistoryDropdown() {
        const historyList = document.getElementById('url-history-list');
        if (!historyList) return;
        
        if (this.urlHistory.length === 0) {
            historyList.innerHTML = '<li class="url-history-empty">No recent URLs</li>';
            return;
        }
        
        let html = '';
        this.urlHistory.forEach((url, index) => {
            // Truncate long URLs for display
            const displayUrl = url.length > 60 ? url.substring(0, 57) + '...' : url;
            html += `
                <li class="url-history-item" data-url="${this.escapeHtml(url)}" title="${this.escapeHtml(url)}">
                    <span class="url-text">${this.escapeHtml(displayUrl)}</span>
                    <button type="button" class="remove-url-btn" data-index="${index}" title="Remove from history">×</button>
                </li>
            `;
        });
        
        historyList.innerHTML = html;
        
        // Add click handlers for history items
        historyList.querySelectorAll('.url-history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('remove-url-btn')) {
                    const url = item.getAttribute('data-url');
                    this.selectUrlFromHistory(url);
                }
            });
        });
        
        // Add click handlers for remove buttons
        historyList.querySelectorAll('.remove-url-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'));
                this.removeUrlFromHistory(index);
            });
        });
    }
    
    selectUrlFromHistory(url) {
        const urlInput = document.getElementById('rss-url');
        if (urlInput) {
            urlInput.value = url;
            localStorage.setItem('rssParserDefaultUrl', url);
        }
        this.hideUrlDropdown();
    }
    
    addUrlToHistory(url) {
        if (!url || url.trim() === '') return;
        
        const trimmedUrl = url.trim();
        
        // Remove if already exists (to move to top)
        const existingIndex = this.urlHistory.indexOf(trimmedUrl);
        if (existingIndex !== -1) {
            this.urlHistory.splice(existingIndex, 1);
        }
        
        // Add to beginning
        this.urlHistory.unshift(trimmedUrl);
        
        // Keep only last 10 URLs
        if (this.urlHistory.length > 10) {
            this.urlHistory = this.urlHistory.slice(0, 10);
        }
        
        this.saveArray('rssParserUrlHistory', this.urlHistory);
        this.populateUrlHistoryDropdown();
    }
    
    removeUrlFromHistory(index) {
        if (index >= 0 && index < this.urlHistory.length) {
            this.urlHistory.splice(index, 1);
            this.saveArray('rssParserUrlHistory', this.urlHistory);
            this.populateUrlHistoryDropdown();
            
            // Hide dropdown if empty
            if (this.urlHistory.length === 0) {
                this.hideUrlDropdown();
            }
        }
    }
    
    clearUrlHistory() {
        this.urlHistory = [];
        this.saveArray('rssParserUrlHistory', this.urlHistory);
        this.populateUrlHistoryDropdown();
        this.hideUrlDropdown();
    }

    async restartServer() {
        const btn = document.getElementById('restart-server-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Restarting…';
        }
        try {
            const res = await fetch('/api/restart', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || res.statusText || 'Restart failed');
            }
            setTimeout(() => {
                window.location.reload();
            }, 3500);
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Restart server';
            }
            alert('Restart: ' + err.message);
        }
    }

    /**
     * Parse Newznab/NZBGeek API JSON response into our file format and populate brands.
     * Handles channel.item[] or item[] and various attr formats for size.
     */
    parseSearchAPIResponse(data) {
        const items = (data && data.channel && data.channel.item) ? data.channel.item : (Array.isArray(data.item) ? data.item : []);
        if (!Array.isArray(items) || items.length === 0) {
            return;
        }
        this.brands.clear();
        this.excludedFiles = [];
        items.forEach(item => {
            const fileInfo = this.extractFileInfoFromSearchItem(item);
            if (fileInfo) {
                if (this.isFileExcluded(fileInfo.name)) {
                    this.excludedFiles.push(fileInfo);
                    return;
                }
                if (!this.brands.has(fileInfo.brand)) {
                    this.brands.set(fileInfo.brand, new Map());
                }
                const brandFiles = this.brands.get(fileInfo.brand);
                const groupKey = this.getBaseNameGroupKey(fileInfo.baseName);
                if (!brandFiles.has(groupKey)) {
                    brandFiles.set(groupKey, []);
                }
                brandFiles.get(groupKey).push(fileInfo);
            }
        });
    }

    extractFileInfoFromSearchItem(item) {
        const title = item.title || item.name || '';
        if (!title) return null;
        let link = item.link || '';
        const enc = item.enclosure;
        if (!link && enc) {
            link = (enc['@attributes'] && enc['@attributes'].url) ? enc['@attributes'].url : (enc.url || '');
        }
        if (!link && item.guid) {
            link = typeof item.guid === 'string' ? item.guid : (item.guid['#text'] || item.guid.value || '');
        }
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        let size = '';
        const attrs = item.attr || item.attributes || item['newznab:attr'] || [];
        const attrList = Array.isArray(attrs) ? attrs : [];
        for (const a of attrList) {
            const name = (a['@attributes'] && a['@attributes'].name) ? a['@attributes'].name : a.name;
            const value = (a['@attributes'] && a['@attributes'].value) != null ? a['@attributes'].value : a.value;
            if (name === 'size' && value != null) {
                const bytes = parseInt(value, 10);
                if (!isNaN(bytes)) size = this.formatBytes(bytes);
                break;
            }
        }
        if (!size && item.size != null) {
            const bytes = parseInt(item.size, 10);
            if (!isNaN(bytes)) size = this.formatBytes(bytes);
        }
        const brand = this.extractBrand(title);
        const baseName = this.extractBaseName(title);
        return {
            name: title,
            brand,
            baseName,
            link,
            size,
            pubDate,
            timeAgo: this.getTimeAgo(pubDate)
        };
    }

    async fetchPerformerSearch(term) {
        const input = document.getElementById('performer-search');
        // A term passed in (e.g. from a favourite/keyword chip) takes priority
        // over whatever is typed in the box.
        const raw = (typeof term === 'string' && term.trim())
            ? term.trim()
            : (input && input.value ? input.value.trim() : '');
        const q = raw.replace(/\./g, ' ');
        if (!q) {
            alert('Enter a performer name or keyword to search.');
            return;
        }
        // Reflect the chosen term in the search box for visibility
        if (input) input.value = raw;
        const btn = document.getElementById('performer-search-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Searching…';
        }
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = data.error || data.message || res.statusText || 'Search failed';
                throw new Error(msg);
            }
            this.parseSearchAPIResponse(data);
            if (this.brands.size === 0) {
                alert('No results found.');
            } else {
                const saveTermEl = document.getElementById('save-search-term');
                if (raw && (!saveTermEl || saveTermEl.checked)) {
                    // Don't reclassify a term already tracked under another
                    // list (e.g. re-running a search from an existing Keyword
                    // chip) - and a favourite BRAND is never eligible either,
                    // regardless of the dropdown's state. This is enforced
                    // here rather than only via the dropdown guess because
                    // Quick Search chip clicks (e.g. a Favourites chip) never
                    // touch the search box's typing/guess path at all.
                    const alreadyTracked =
                        this.favoriteBrands.some(b => b.toLowerCase() === raw.toLowerCase()) ||
                        this.keywords.some(k => k.toLowerCase() === raw.toLowerCase()) ||
                        this.performers.some(p => p.toLowerCase() === raw.toLowerCase());
                    if (!alreadyTracked) {
                        // Not every search is for a performer - respect the
                        // Performer/Keyword/Do-not-add choice next to the
                        // save checkbox instead of always filing it as a performer
                        const typeSelect = document.getElementById('save-search-term-type');
                        const saveAs = typeSelect ? typeSelect.value : 'performer';
                        if (saveAs === 'keyword') this.addKeyword(raw);
                        else if (saveAs === 'performer') this.addPerformer(raw);
                    }
                }
                this.displayResults();
                const resultsTab = document.querySelector('.tab-btn[data-tab="results"]');
                if (resultsTab && !resultsTab.classList.contains('active')) {
                    resultsTab.click();
                }
            }
        } catch (err) {
            alert('Search: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Search';
            }
        }
    }

    async fetchSabNZBStatus() {
        try {
            const res = await fetch('/api/sabnzb/status');
            const data = await res.json();
            this.sabnzbConfigured = !!data.configured;
            const clearHistoryBtn = document.getElementById('clear-sabnzb-history-btn');
            if (clearHistoryBtn) {
                clearHistoryBtn.style.display = this.sabnzbConfigured ? '' : 'none';
            }
            if (this.sabnzbConfigured && this.brands.size > 0) {
                this.displayResults();
            }
        } catch (e) {
            this.sabnzbConfigured = false;
        }
    }

    async sendToSabNZB(fileLink, fileName) {
        const nzbname = this.ensureFilenameHasXXX(fileName);
        const res = await fetch('/api/sabnzb/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nzbUrl: fileLink, nzbname })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
            throw new Error(data.error || res.statusText || 'Failed to add to SabNZB');
        }
    }

    // Update every button/row for this file (across all tabs) to the downloaded
    // state, plus its same-baseName siblings. Call updateBrandDownloadStatus()
    // separately (once per batch) to refresh the brand headers.
    markFileDownloadedInDOM(fileLink, fileName) {
        const allSabBtns = document.querySelectorAll(`.sabnzb-btn[data-file-link="${CSS.escape(fileLink)}"]`);
        allSabBtns.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('downloaded');
            btn.classList.remove('sibling-downloaded');
            btn.textContent = '✓ Sent to SabNZB';
        });
        const allMatchingButtons = document.querySelectorAll(`.download-btn[data-file-link="${CSS.escape(fileLink)}"]`);
        allMatchingButtons.forEach(btn => {
            btn.classList.add('downloaded');
            btn.classList.remove('sibling-downloaded');
            btn.textContent = '✓ Downloaded';
            const fileItem = btn.closest('.file-item');
            if (fileItem) {
                fileItem.classList.add('downloaded');
                fileItem.classList.remove('sibling-downloaded');
            }
        });
        const baseName = this.extractBaseName(fileName);
        this.updateSiblingDownloadStatus(baseName, fileLink);
    }

    async handleSabNZBClick(buttonElement, fileLink, fileName) {
        buttonElement.disabled = true;
        buttonElement.textContent = 'Sending…';
        try {
            await this.sendToSabNZB(fileLink, fileName);
            this.markFileAsDownloaded(fileLink, fileName);
            this.markFileDownloadedInDOM(fileLink, fileName);
            this.updateBrandDownloadStatus();
        } catch (err) {
            buttonElement.disabled = false;
            buttonElement.textContent = 'Send to SabNZB';
            alert('SabNZB: ' + err.message);
        }
    }

    /**
     * Pick one file per baseName group in a brand: the version closest to the
     * preferred size when a group has several sizes. Groups already downloaded,
     * ignored, or with a downloaded/ignored sibling are skipped, as are files
     * outside the active time/size filters.
     */
    getPreferredFilesForBrand(brandFiles, cutoffTime = null) {
        const selections = [];
        brandFiles.forEach((files, groupKey) => {
            const filteredFiles = files.filter(file =>
                (!cutoffTime || file.pubDate >= cutoffTime) && this.fileWithinSizeBounds(file)
            );
            if (filteredFiles.length === 0) return;

            const baseName = filteredFiles[0].baseName || groupKey;
            const hasDownload = filteredFiles.some(file => this.isFileDownloaded(file.link)) ||
                this.hasSiblingDownloaded(baseName);
            const allIgnored = filteredFiles.every(file => this.isFileIgnored(file.link)) ||
                this.hasSiblingIgnored(baseName);
            if (hasDownload || allIgnored) return;

            // Newest first so the fallback (no parseable sizes) takes the latest file
            filteredFiles.sort((a, b) => b.pubDate - a.pubDate);
            let index = this.getPreferredSizeIndex(filteredFiles, this.preferredSizeBytes);
            if (index < 0) index = 0;
            selections.push(filteredFiles[index]);
        });
        return selections;
    }

    triggerBrowserDownload(file) {
        const correctedFilename = this.ensureFilenameHasXXX(file.name);
        const proxyDownloadUrl = `/proxy/download?url=${encodeURIComponent(file.link)}&filename=${encodeURIComponent(correctedFilename)}`;
        const a = document.createElement('a');
        a.href = proxyDownloadUrl;
        a.download = correctedFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async downloadWholeBrand(brandName, buttonElement) {
        const brandFiles = this.brands.get(brandName);
        if (!brandFiles) return;

        const cutoffTime = this.timeFilter > 0
            ? new Date(Date.now() - (this.timeFilter * 60 * 60 * 1000))
            : null;
        const selections = this.getPreferredFilesForBrand(brandFiles, cutoffTime);

        if (selections.length === 0) {
            alert(`${brandName}: nothing left to download — every group is already downloaded, ignored, or filtered out.`);
            return;
        }

        // Newest first, so a file-count limit keeps the most recent releases
        selections.sort((a, b) => b.pubDate - a.pubDate);

        const via = this.sabnzbConfigured ? 'SabNZB' : 'browser download';
        const chosen = await this.showBrandDownloadConfirm(brandName, selections, via);
        if (!chosen || chosen.length === 0) return;

        buttonElement.disabled = true;
        const originalText = buttonElement.textContent;
        let sent = 0;
        const failures = [];

        for (const file of chosen) {
            buttonElement.textContent = `${sent + 1}/${chosen.length}…`;
            try {
                if (this.sabnzbConfigured) {
                    await this.sendToSabNZB(file.link, file.name);
                } else {
                    this.triggerBrowserDownload(file);
                    // Brief pause so the browser doesn't drop rapid-fire downloads
                    await new Promise(resolve => setTimeout(resolve, 400));
                }
                this.markFileAsDownloaded(file.link, file.name);
                this.markFileDownloadedInDOM(file.link, file.name);
                sent++;
            } catch (err) {
                failures.push(`${file.name}: ${err.message}`);
            }
        }

        this.updateBrandDownloadStatus();
        buttonElement.disabled = false;
        buttonElement.textContent = sent > 0 ? `✓ ${sent} sent` : originalText;
        if (failures.length > 0) {
            alert(`${failures.length} of ${chosen.length} failed:\n\n${failures.join('\n')}`);
        }
    }

    /**
     * Styled confirmation dialog for a whole-brand download. Shows file count,
     * total size, and a scrollable file list, with a limit control to download
     * only the newest N. Resolves with the chosen files, or null on cancel.
     */
    showBrandDownloadConfirm(brandName, selections, via) {
        return new Promise(resolve => {
            const summaryFor = (files) => {
                let totalBytes = 0;
                let unknownCount = 0;
                files.forEach(file => {
                    const bytes = this.parseSizeToBytes(file.size);
                    if (bytes > 0) totalBytes += bytes;
                    else unknownCount++;
                });
                let sizeSummary = totalBytes > 0 ? this.formatBytes(totalBytes) : 'size unknown';
                if (totalBytes > 0 && unknownCount > 0) {
                    sizeSummary += ` + ${unknownCount} unknown`;
                }
                return sizeSummary;
            };

            const rows = selections.map((file, i) => `
                <li class="bdc-file" data-index="${i}">
                    <span class="bdc-file-name">${this.escapeHtml(file.name)}</span>
                    <span class="bdc-file-size">${this.escapeHtml(file.size || '?')}</span>
                </li>
            `).join('');

            const limitControl = selections.length > 1 ? `
                <div class="bdc-limit">
                    <label for="bdc-limit-input">Limit to newest</label>
                    <input type="number" id="bdc-limit-input" min="1" max="${selections.length}" step="1" value="${selections.length}">
                    <span class="bdc-limit-of">of ${selections.length}</span>
                </div>
            ` : '';

            const overlay = document.createElement('div');
            overlay.className = 'bdc-overlay';
            overlay.innerHTML = `
                <div class="bdc-dialog" role="dialog" aria-modal="true" aria-labelledby="bdc-title">
                    <h3 id="bdc-title">Download ${this.escapeHtml(brandName)}</h3>
                    <div class="bdc-summary">
                        <div class="bdc-stat">
                            <span class="bdc-stat-value" id="bdc-count"></span>
                            <span class="bdc-stat-label">files</span>
                        </div>
                        <div class="bdc-stat">
                            <span class="bdc-stat-value" id="bdc-size"></span>
                            <span class="bdc-stat-label">total</span>
                        </div>
                        <div class="bdc-stat">
                            <span class="bdc-stat-value">${this.escapeHtml(via)}</span>
                            <span class="bdc-stat-label">via</span>
                        </div>
                    </div>
                    ${limitControl}
                    <ul class="bdc-file-list">${rows}</ul>
                    <div class="bdc-actions">
                        <button type="button" class="bdc-cancel-btn">Cancel</button>
                        <button type="button" class="bdc-confirm-btn"></button>
                    </div>
                </div>
            `;

            const limitInput = overlay.querySelector('#bdc-limit-input');
            const confirmBtn = overlay.querySelector('.bdc-confirm-btn');

            const currentLimit = () => {
                if (!limitInput) return selections.length;
                const n = parseInt(limitInput.value, 10);
                if (isNaN(n) || n < 1) return selections.length;
                return Math.min(n, selections.length);
            };

            const refresh = () => {
                const limit = currentLimit();
                const included = selections.slice(0, limit);
                overlay.querySelector('#bdc-count').textContent = limit;
                overlay.querySelector('#bdc-size').textContent = summaryFor(included);
                confirmBtn.textContent = `⬇ Download ${limit} ${limit !== 1 ? 'files' : 'file'}`;
                overlay.querySelectorAll('.bdc-file').forEach(row => {
                    const i = parseInt(row.getAttribute('data-index'), 10);
                    row.classList.toggle('bdc-excluded', i >= limit);
                });
            };

            const close = (result) => {
                document.removeEventListener('keydown', onKeydown);
                overlay.remove();
                resolve(result);
            };
            const onKeydown = (e) => {
                if (e.key === 'Escape') close(null);
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(null);
            });
            overlay.querySelector('.bdc-cancel-btn').addEventListener('click', () => close(null));
            confirmBtn.addEventListener('click', () => close(selections.slice(0, currentLimit())));
            if (limitInput) limitInput.addEventListener('input', refresh);
            document.addEventListener('keydown', onKeydown);

            refresh();
            document.body.appendChild(overlay);
            confirmBtn.focus();
        });
    }

    /**
     * Previously-downloaded files eligible for a redownload, newest first.
     * Only entries with a stored `link` can actually be reissued — older
     * history recorded before markFileAsDownloaded kept the link is counted
     * separately so that gap isn't silently hidden from the user.
     */
    getRedownloadableHistory() {
        const all = Object.values(this.downloadedFiles).filter(f => f && f.downloadedAt);
        all.sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt));

        const entries = all
            .filter(f => f.link)
            .map(f => ({ name: f.fileName, link: f.link, downloadedAt: new Date(f.downloadedAt) }));
        const missingLinkCount = all.length - entries.length;

        return { entries, missingLinkCount };
    }

    // Entry point for the "Redownload recent" action — e.g. recovering from
    // an accidental local deletion. Lets the user pick how many of their most
    // recently downloaded files to reissue, then resends them the same way
    // (SabNZB or browser download) as a normal download.
    async openRedownloadPicker(buttonElement) {
        const { entries, missingLinkCount } = this.getRedownloadableHistory();

        if (entries.length === 0) {
            alert(missingLinkCount > 0
                ? `${missingLinkCount} earlier download${missingLinkCount !== 1 ? 's are' : ' is'} recorded, but from before this feature could reissue them — nothing available to redownload automatically.`
                : "No download history yet — nothing to redownload.");
            return;
        }

        const via = this.sabnzbConfigured ? 'SabNZB' : 'browser download';
        const chosen = await this.showRedownloadConfirm(entries, missingLinkCount, via);
        if (!chosen || chosen.length === 0) return;

        if (buttonElement) buttonElement.disabled = true;
        const originalText = buttonElement ? buttonElement.textContent : '';
        let sent = 0;
        const failures = [];

        for (const file of chosen) {
            if (buttonElement) buttonElement.textContent = `${sent + 1}/${chosen.length}…`;
            try {
                if (this.sabnzbConfigured) {
                    await this.sendToSabNZB(file.link, file.name);
                } else {
                    this.triggerBrowserDownload(file);
                    // Brief pause so the browser doesn't drop rapid-fire downloads
                    await new Promise(resolve => setTimeout(resolve, 400));
                }
                this.markFileAsDownloaded(file.link, file.name);
                this.markFileDownloadedInDOM(file.link, file.name);
                sent++;
            } catch (err) {
                failures.push(`${file.name}: ${err.message}`);
            }
        }

        this.updateBrandDownloadStatus();
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.textContent = sent > 0 ? `✓ ${sent} sent` : originalText;
        }
        if (failures.length > 0) {
            alert(`${failures.length} of ${chosen.length} failed:\n\n${failures.join('\n')}`);
        }
    }

    /**
     * Confirmation dialog for redownloading recent history — mirrors
     * showBrandDownloadConfirm's shell, but the list is sourced from download
     * history rather than a brand, and the limit reads "last N" instead of
     * "newest N". Resolves with the chosen files, or null on cancel.
     */
    showRedownloadConfirm(entries, missingLinkCount, via) {
        return new Promise(resolve => {
            const rows = entries.map((file, i) => `
                <li class="bdc-file" data-index="${i}">
                    <span class="bdc-file-name">${this.escapeHtml(file.name)}</span>
                    <span class="bdc-file-size">${this.escapeHtml(this.getTimeAgo(file.downloadedAt))}</span>
                </li>
            `).join('');

            const defaultLimit = Math.min(10, entries.length);
            const limitControl = entries.length > 1 ? `
                <div class="bdc-limit">
                    <label for="rdl-limit-input">Redownload last</label>
                    <input type="number" id="rdl-limit-input" min="1" max="${entries.length}" step="1" value="${defaultLimit}">
                    <span class="bdc-limit-of">of ${entries.length} available</span>
                </div>
            ` : '';

            const overlay = document.createElement('div');
            overlay.className = 'bdc-overlay';
            overlay.innerHTML = `
                <div class="bdc-dialog" role="dialog" aria-modal="true" aria-labelledby="rdl-title">
                    <h3 id="rdl-title">Redownload recent files</h3>
                    <div class="bdc-summary">
                        <div class="bdc-stat">
                            <span class="bdc-stat-value" id="rdl-count"></span>
                            <span class="bdc-stat-label">files</span>
                        </div>
                        <div class="bdc-stat">
                            <span class="bdc-stat-value">${this.escapeHtml(via)}</span>
                            <span class="bdc-stat-label">via</span>
                        </div>
                    </div>
                    ${missingLinkCount > 0 ? `<p class="rdl-missing-note">${missingLinkCount} older download${missingLinkCount !== 1 ? 's' : ''} can't be included — recorded before this feature tracked the original link.</p>` : ''}
                    ${limitControl}
                    <ul class="bdc-file-list">${rows}</ul>
                    <div class="bdc-actions">
                        <button type="button" class="bdc-cancel-btn">Cancel</button>
                        <button type="button" class="bdc-confirm-btn"></button>
                    </div>
                </div>
            `;

            const limitInput = overlay.querySelector('#rdl-limit-input');
            const confirmBtn = overlay.querySelector('.bdc-confirm-btn');

            const currentLimit = () => {
                if (!limitInput) return entries.length;
                const n = parseInt(limitInput.value, 10);
                if (isNaN(n) || n < 1) return entries.length;
                return Math.min(n, entries.length);
            };

            const refresh = () => {
                const limit = currentLimit();
                overlay.querySelector('#rdl-count').textContent = limit;
                confirmBtn.textContent = `⬇ Redownload ${limit} ${limit !== 1 ? 'files' : 'file'}`;
                overlay.querySelectorAll('.bdc-file').forEach(row => {
                    const i = parseInt(row.getAttribute('data-index'), 10);
                    row.classList.toggle('bdc-excluded', i >= limit);
                });
            };

            const close = (result) => {
                document.removeEventListener('keydown', onKeydown);
                overlay.remove();
                resolve(result);
            };
            const onKeydown = (e) => {
                if (e.key === 'Escape') close(null);
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(null);
            });
            overlay.querySelector('.bdc-cancel-btn').addEventListener('click', () => close(null));
            confirmBtn.addEventListener('click', () => close(entries.slice(0, currentLimit())));
            if (limitInput) limitInput.addEventListener('input', refresh);
            document.addEventListener('keydown', onKeydown);

            refresh();
            document.body.appendChild(overlay);
            confirmBtn.focus();
        });
    }

    async clearSabNZBHistory() {
        const btn = document.getElementById('clear-sabnzb-history-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Clearing…';
        }
        try {
            const res = await fetch('/api/sabnzb/history/clear', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                throw new Error(data.error || res.statusText || 'Failed to clear history');
            }
        } catch (err) {
            alert('SabNZB: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Clear SABnzb history';
            }
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
        
        // Save URL to history
        this.addUrlToHistory(rssUrl);

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
                    const groupKey = this.getBaseNameGroupKey(fileInfo.baseName);
                    if (!brandFiles.has(groupKey)) {
                        brandFiles.set(groupKey, []);
                    }
                    
                    brandFiles.get(groupKey).push(fileInfo);
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
                // Normalize case: first letter uppercase, rest lowercase
                return this.normalizeBrandName(match[1]);
            }
        }
        
        return 'Unknown';
    }
    
    normalizeBrandName(brand) {
        // Normalize brand name to consistent case: first letter uppercase, rest lowercase
        if (!brand || brand.length === 0) return brand;
        return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
    }

    extractBaseName(filename) {
        // Remove file extension and common suffixes
        let baseName = filename.replace(/\.(nzb|zip|rar|mp4|mkv|avi)$/i, '');
        
        // Remove quality indicators and common suffixes (XXX, resolution, codec, etc.)
        baseName = baseName.replace(/[\.\-_](720p|1080p|480p|2160p|4K|HDRip|BDRip|DVDRip|WEBRip|HDTV|x264|x265|H264|H265|AAC|AC3|DTS|XXX)[\.\-_\s].*$/i, '');
        
        // Remove trailing group-style suffixes (e.g. -WRB, -XXX, -RARBG)
        baseName = baseName.replace(/-[A-Z0-9]+$/i, '');
        baseName = baseName.replace(/\.+/g, '.').replace(/^\.|\.$/g, '').trim();
        
        return baseName || filename;
    }
    
    /**
     * Canonical key for grouping and sibling checks. Case-insensitive so that
     * "18lust.26.02.25.nerea.porn.audition" and "18Lust.26.02.25.Nerea.Porn.Audition"
     * (same content, different resolution/XXX suffix) group as one.
     */
    getBaseNameGroupKey(baseName) {
        if (baseName == null || baseName === '') return '';
        return String(baseName).toLowerCase().trim();
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
    
    /** Parse size string (e.g. "1.19 GB", "210.17 MB") to bytes for comparison. Returns 0 if unparseable. */
    parseSizeToBytes(sizeStr) {
        if (!sizeStr || typeof sizeStr !== 'string') return 0;
        const m = sizeStr.trim().match(/^([\d.]+)\s*(\w+)/i);
        if (!m) return 0;
        const n = parseFloat(m[1]);
        if (isNaN(n)) return 0;
        const unit = (m[2] || '').toUpperCase();
        const k = 1024;
        if (unit.startsWith('T')) return n * k * k * k * k;
        if (unit.startsWith('G')) return n * k * k * k;
        if (unit.startsWith('M')) return n * k * k;
        if (unit.startsWith('K')) return n * k;
        return n;
    }
    
    /** Index in the files array whose size is closest to targetBytes (e.g. 1GB). */
    getPreferredSizeIndex(files, targetBytes) {
        if (!files.length) return -1;
        let bestIndex = -1;
        let bestDiff = Infinity;
        const ONE_GB = 1024 * 1024 * 1024;
        const target = targetBytes ?? ONE_GB;
        files.forEach((file, i) => {
            const bytes = this.parseSizeToBytes(file.size);
            if (bytes <= 0) return;
            const diff = Math.abs(bytes - target);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIndex = i;
            }
        });
        return bestIndex;
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
        const hideFullyReviewed = document.getElementById('hide-fully-reviewed')?.checked === true;
        let totalFiles = 0;
        let totalBrands = 0;
        let latestDate = null;
        
        this.brands.forEach((brandFiles, brandName) => {
            if (hideFullyReviewed && this.isBrandFullyDownloaded(brandFiles, cutoffTime)) {
                return;
            }
            let brandHasFiles = false;
            brandFiles.forEach(files => {
                files.forEach(file => {
                    // Apply time + size filters if active
                    if (cutoffTime && file.pubDate < cutoffTime) {
                        return;
                    }
                    if (!this.fileWithinSizeBounds(file)) {
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
        const hideFullyReviewed = document.getElementById('hide-fully-reviewed')?.checked === true;

        sortedBrands.forEach(([brandName, brandFiles]) => {
            const isFavorite = this.favoriteBrands.includes(brandName);
            const isAntiFavorite = this.antiFavoriteBrands.includes(brandName);
            const isExcluded = this.excludeKeywords.map(k => k.toLowerCase()).includes(brandName.toLowerCase());
            const isHighlighted = this.keywords.map(k => k.toLowerCase()).includes(brandName.toLowerCase());

            // Generate filtered files HTML
            const filesHTML = this.generateBrandFilesHTML(brandFiles, cutoffTime);
            
            // Skip this brand if no files match the filter
            if (filesHTML.filteredFileCount === 0) {
                return;
            }
            
            // Check if all content in this brand has been downloaded
            const isFullyDownloaded = this.isBrandFullyDownloaded(brandFiles, cutoffTime);
            if (hideFullyReviewed && isFullyDownloaded) {
                return;
            }
            
            // Get latest file date for this brand (from filtered files)
            let brandLatestDate = null;
            brandFiles.forEach(files => {
                files.forEach(file => {
                    // Only consider files that pass the time + size filters
                    if (cutoffTime && file.pubDate < cutoffTime) {
                        return;
                    }
                    if (!this.fileWithinSizeBounds(file)) {
                        return;
                    }
                    if (!brandLatestDate || file.pubDate > brandLatestDate) {
                        brandLatestDate = file.pubDate;
                    }
                });
            });
            
            const brandClasses = [
                'brand-item',
                isFavorite ? 'favorite' : '',
                isAntiFavorite ? 'anti-favorite' : '',
                isFullyDownloaded ? 'fully-downloaded' : ''
            ].filter(Boolean).join(' ');
            
            html += `
                <div class="${brandClasses}" data-brand="${this.escapeHtml(brandName)}">
                    <div class="brand-header">
                        <h3>${this.escapeHtml(brandName)} (${this.fileCountLabel(filesHTML)})${isFullyDownloaded ? ' <span class="fully-downloaded-badge">✓ All Reviewed</span>' : ''}</h3>
                        <div class="brand-controls">
                            <span class="brand-latest">${brandLatestDate ? this.getTimeAgo(brandLatestDate) : ''}</span>
                            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-action="favorite" data-brand="${this.escapeHtml(brandName)}">
                                ${isFavorite ? '★' : '☆'}
                            </button>
                            <button class="anti-favorite-btn ${isAntiFavorite ? 'active' : ''}" data-action="anti-favorite" data-brand="${this.escapeHtml(brandName)}">
                                ${isAntiFavorite ? '✖' : '○'}
                            </button>
                            <button class="highlight-brand-btn ${isHighlighted ? 'active' : ''}" data-action="highlight-brand" data-brand="${this.escapeHtml(brandName)}" title="${isHighlighted ? 'Remove highlight keyword' : 'Add brand as highlight keyword'}">+HL</button>
                            <button class="exclude-brand-btn ${isExcluded ? 'active' : ''}" data-action="exclude-brand" data-brand="${this.escapeHtml(brandName)}" title="${isExcluded ? 'Remove brand from exclude list' : 'Add brand to exclude list'}">Exclude</button>
                            <button class="download-brand-btn" data-action="download-brand" data-brand="${this.escapeHtml(brandName)}" title="Download the whole brand — preferred size per group">⬇ All</button>
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
            const target = e.target;
            
            // Handle download button clicks
            if (target.classList.contains('download-btn')) {
                const fileLink = target.getAttribute('data-file-link');
                const fileName = target.getAttribute('data-file-name');
                if (fileLink && fileName) {
                    this.handleDownloadClick(target, fileLink, fileName);
                }
                return;
            }
            
            // Handle Send to SabNZB button clicks
            if (target.classList.contains('sabnzb-btn')) {
                const fileLink = target.getAttribute('data-file-link');
                const fileName = target.getAttribute('data-file-name');
                if (fileLink && fileName) {
                    this.handleSabNZBClick(target, fileLink, fileName);
                }
                return;
            }
            
            // Handle ignore button clicks
            if (target.classList.contains('ignore-btn')) {
                const fileLink = target.getAttribute('data-file-link');
                const fileName = target.getAttribute('data-file-name');
                if (fileLink && fileName) {
                    this.handleIgnoreClick(target, fileLink, fileName);
                }
                return;
            }
            
            // Handle brand control buttons
            const button = target;
            const action = button.getAttribute('data-action');
            const brandName = button.getAttribute('data-brand');
            
            if (!action || !brandName) {
                return;
            }
            
            console.log('Brand button clicked:', action, brandName);
            
            switch (action) {
                case 'expand':
                    // Pass the clicked button so we can find the correct brand item
                    this.toggleBrandExpansion(brandName, button);
                    break;
                case 'download-brand':
                    this.downloadWholeBrand(brandName, button);
                    break;
                case 'favorite':
                    this.toggleFavorite(brandName);
                    break;
                case 'anti-favorite':
                    this.toggleAntiFavorite(brandName);
                    break;
                case 'exclude-brand': {
                    // Toggle the brand's exclusion on/off so an accidental
                    // click can be undone by clicking again. Update the button
                    // in place so the list doesn't jump or collapse.
                    const keyword = this.normalizeBrandName(brandName);
                    const existingIndex = this.excludeKeywords.findIndex(
                        k => k.toLowerCase() === keyword.toLowerCase()
                    );
                    if (existingIndex !== -1) {
                        // Toggle OFF — remove from exclude list
                        this.excludeKeywords.splice(existingIndex, 1);
                        this.saveArray('rssParserExcludeKeywords', this.excludeKeywords);
                        this.displayFavoritesAndKeywords();
                        button.classList.remove('active');
                        button.title = 'Add brand to exclude list';
                    } else {
                        // Toggle ON — add to exclude list
                        this.addExcludeKeyword(keyword);
                        button.classList.add('active');
                        button.title = 'Remove brand from exclude list';
                    }
                    break;
                }
                case 'highlight-brand': {
                    // Toggle the brand as a highlight keyword, in place, so an
                    // accidental click can be undone without collapsing the list.
                    const existingIndex = this.keywords.findIndex(
                        k => k.toLowerCase() === brandName.toLowerCase()
                    );
                    if (existingIndex !== -1) {
                        // Toggle OFF — remove highlight keyword
                        this.keywords.splice(existingIndex, 1);
                        this.saveArray('rssParserKeywords', this.keywords);
                        this.displayFavoritesAndKeywords();
                        button.classList.remove('active');
                        button.title = 'Add brand as highlight keyword';
                    } else {
                        // Toggle ON — add as highlight keyword (also applies highlighting)
                        this.addKeyword(brandName);
                        button.classList.add('active');
                        button.title = 'Remove highlight keyword';
                    }
                    break;
                }
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
    
    handleDownloadClick(buttonElement, fileLink, fileName) {
        // Mark the file as downloaded
        this.markFileAsDownloaded(fileLink, fileName);
        
        // Update ALL buttons with the same file link across all tabs
        const allMatchingButtons = document.querySelectorAll(`.download-btn[data-file-link="${CSS.escape(fileLink)}"]`);
        allMatchingButtons.forEach(btn => {
            btn.classList.add('downloaded');
            btn.classList.remove('sibling-downloaded');
            btn.textContent = '✓ Downloaded';
            
            // Also mark the parent file-item as downloaded
            const fileItem = btn.closest('.file-item');
            if (fileItem) {
                fileItem.classList.add('downloaded');
                fileItem.classList.remove('sibling-downloaded');
            }
        });
        
        // Also update sibling files (same baseName, different quality)
        const baseName = this.extractBaseName(fileName);
        this.updateSiblingDownloadStatus(baseName, fileLink);
        
        // Update fully-downloaded status for affected brands
        this.updateBrandDownloadStatus();
    }
    
    handleIgnoreClick(buttonElement, fileLink, fileName) {
        const isCurrentlyIgnored = this.isFileIgnored(fileLink);
        
        if (isCurrentlyIgnored) {
            // Unignore the file
            this.unignoreFile(fileLink);
            
            // Update ALL ignore buttons with the same file link across all tabs
            const allMatchingButtons = document.querySelectorAll(`.ignore-btn[data-file-link="${CSS.escape(fileLink)}"]`);
            allMatchingButtons.forEach(btn => {
                btn.classList.remove('ignored');
                btn.textContent = 'Ignore';
                
                // Also update the parent file-item
                const fileItem = btn.closest('.file-item');
                if (fileItem) {
                    fileItem.classList.remove('ignored');
                }
            });
            
            // Re-evaluate sibling-ignored state for other files in the same group
            const baseName = this.extractBaseName(fileName);
            this.updateSiblingIgnoreStatus(baseName);
        } else {
            // Ignore the file
            this.markFileAsIgnored(fileLink, fileName);
            
            // Update ALL ignore buttons with the same file link across all tabs
            const allMatchingButtons = document.querySelectorAll(`.ignore-btn[data-file-link="${CSS.escape(fileLink)}"]`);
            allMatchingButtons.forEach(btn => {
                btn.classList.add('ignored');
                btn.textContent = '✓ Ignored';
                
                // Also mark the parent file-item as ignored
                const fileItem = btn.closest('.file-item');
                if (fileItem) {
                    fileItem.classList.add('ignored');
                }
            });
            
            // Update sibling files (same baseName, different size/quality) to show as sibling-ignored
            const baseName = this.extractBaseName(fileName);
            this.updateSiblingIgnoreStatus(baseName);
        }
        
        // Update fully-downloaded status for affected brands
        this.updateBrandDownloadStatus();
    }
    
    updateSiblingIgnoreStatus(baseName) {
        const groupKey = this.getBaseNameGroupKey(baseName);
        document.querySelectorAll('.ignore-btn').forEach(btn => {
            const btnFileLink = btn.getAttribute('data-file-link');
            const btnFileName = btn.getAttribute('data-file-name');
            if (!btnFileName) return;
            if (this.getBaseNameGroupKey(this.extractBaseName(btnFileName)) !== groupKey) return;
            
            const fileItem = btn.closest('.file-item');
            if (this.isFileIgnored(btnFileLink)) {
                btn.classList.add('ignored');
                btn.classList.remove('sibling-ignored');
                btn.textContent = '✓ Ignored';
                if (fileItem) {
                    fileItem.classList.add('ignored');
                    fileItem.classList.remove('sibling-ignored');
                }
            } else if (this.hasSiblingIgnored(baseName)) {
                btn.classList.remove('ignored');
                btn.classList.add('sibling-ignored');
                btn.textContent = '↳ Other Quality';
                if (fileItem) {
                    fileItem.classList.remove('ignored');
                    fileItem.classList.add('sibling-ignored');
                }
            } else {
                btn.classList.remove('ignored', 'sibling-ignored');
                btn.textContent = 'Ignore';
                if (fileItem) {
                    fileItem.classList.remove('ignored', 'sibling-ignored');
                }
            }
        });
        // Also update download/SabNZB sibling state for same group (they may show "Other Quality" when sibling ignored)
        document.querySelectorAll('.download-btn').forEach(btn => {
            const btnFileLink = btn.getAttribute('data-file-link');
            const btnFileName = btn.getAttribute('data-file-name');
            if (!btnFileName || btn.classList.contains('downloaded')) return;
            if (this.getBaseNameGroupKey(this.extractBaseName(btnFileName)) !== groupKey) return;
            const fileItem = btn.closest('.file-item');
            if (this.hasSiblingDownloaded(baseName)) {
                btn.classList.add('sibling-downloaded');
                btn.textContent = '↳ Other Quality';
                if (fileItem) fileItem.classList.add('sibling-downloaded');
            } else if (fileItem && fileItem.classList.contains('sibling-ignored')) {
                btn.classList.remove('sibling-downloaded');
                btn.textContent = 'Download NZB';
                fileItem.classList.remove('sibling-downloaded');
            }
        });
    }
    
    updateSiblingDownloadStatus(baseName, excludeFileLink) {
        // Find and update all files with the same baseName that aren't already downloaded
        const groupKey = this.getBaseNameGroupKey(baseName);
        document.querySelectorAll('.download-btn').forEach(btn => {
            const btnFileLink = btn.getAttribute('data-file-link');
            const btnFileName = btn.getAttribute('data-file-name');
            
            // Skip if this is the file we just downloaded or if already marked as downloaded
            if (btnFileLink === excludeFileLink || btn.classList.contains('downloaded')) {
                return;
            }
            
            // Check if this file has the same baseName (case-insensitive group key)
            if (btnFileName && this.getBaseNameGroupKey(this.extractBaseName(btnFileName)) === groupKey) {
                // Mark as sibling downloaded if not already
                if (!btn.classList.contains('sibling-downloaded')) {
                    btn.classList.add('sibling-downloaded');
                    btn.textContent = '↳ Other Quality';
                    
                    const fileItem = btn.closest('.file-item');
                    if (fileItem && !fileItem.classList.contains('sibling-downloaded')) {
                        fileItem.classList.add('sibling-downloaded');
                    }
                }
            }
        });
    }
    
    updateBrandDownloadStatus() {
        // Calculate cutoff time if filter is active
        const cutoffTime = this.timeFilter > 0 
            ? new Date(Date.now() - (this.timeFilter * 60 * 60 * 1000))
            : null;
        
        // Update all brand items in all containers
        document.querySelectorAll('.brand-item').forEach(brandItem => {
            const brandName = brandItem.getAttribute('data-brand');
            if (!brandName || !this.brands.has(brandName)) return;
            
            const brandFiles = this.brands.get(brandName);
            const isFullyDownloaded = this.isBrandFullyDownloaded(brandFiles, cutoffTime);
            
            // Update the brand item classes
            if (isFullyDownloaded) {
                brandItem.classList.add('fully-downloaded');
                
                // Add badge if not present
                const header = brandItem.querySelector('.brand-header h3');
                if (header && !header.querySelector('.fully-downloaded-badge')) {
                    header.insertAdjacentHTML('beforeend', ' <span class="fully-downloaded-badge">✓ All Reviewed</span>');
                }
            } else {
                brandItem.classList.remove('fully-downloaded');

                // Remove badge if present
                const badge = brandItem.querySelector('.fully-downloaded-badge');
                if (badge) {
                    badge.remove();
                }
            }
        });

        // Keyword badges depend on download state, so recompute them too
        this.refreshBrandKeywordBadges();
    }
    
    setupDownloadEventDelegation(container) {
        // Create a handler function for download and ignore buttons
        const handleButtonClick = (e) => {
            const target = e.target;
            
            // Handle download button clicks
            if (target.classList.contains('download-btn')) {
                const fileLink = target.getAttribute('data-file-link');
                const fileName = target.getAttribute('data-file-name');
                if (fileLink && fileName) {
                    this.handleDownloadClick(target, fileLink, fileName);
                }
            }
            
            // Handle ignore button clicks
            if (target.classList.contains('ignore-btn')) {
                const fileLink = target.getAttribute('data-file-link');
                const fileName = target.getAttribute('data-file-name');
                if (fileLink && fileName) {
                    this.handleIgnoreClick(target, fileLink, fileName);
                }
                return;
            }
            
            // Handle Send to SabNZB button clicks
            if (target.classList.contains('sabnzb-btn')) {
                const fileLink = target.getAttribute('data-file-link');
                const fileName = target.getAttribute('data-file-name');
                if (fileLink && fileName) {
                    this.handleSabNZBClick(target, fileLink, fileName);
                }
                return;
            }
        };
        
        // Remove any existing listener if present
        if (container._downloadClickHandler) {
            container.removeEventListener('click', container._downloadClickHandler);
        }
        
        // Store the handler on the container and add the listener
        container._downloadClickHandler = handleButtonClick;
        container.addEventListener('click', handleButtonClick);
    }
    
    generateBrandFilesHTML(brandFiles, cutoffTime = null) {
        let html = '';
        let filteredFileCount = 0;
        let availableFileCount = 0;
        
        // Sort by base name
        const sortedFiles = Array.from(brandFiles.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        
        sortedFiles.forEach(([baseName, files]) => {
            // Sort files by date (newest first)
            files.sort((a, b) => b.pubDate - a.pubDate);
            
            // Filter files based on cutoff time (if provided) and size bounds
            const filteredFiles = files.filter(file =>
                (!cutoffTime || file.pubDate >= cutoffTime) && this.fileWithinSizeBounds(file)
            );
            
            // Skip this group if no files match the filter
            if (filteredFiles.length === 0) {
                return;
            }
            
            filteredFileCount += filteredFiles.length;
            
            const preferredIndex = this.getPreferredSizeIndex(filteredFiles, this.preferredSizeBytes);
            
            // Use first file's baseName for display (group key is lowercase for grouping only)
            const displayName = filteredFiles[0].baseName || baseName;
            html += `<div class="file-group">`;
            html += `<h4>${this.escapeHtml(displayName)} (${filteredFiles.length} versions)</h4>`;
            
            filteredFiles.forEach((file, fileIndex) => {
                const ageClass = this.getAgeClass(file.pubDate);
                const correctedFilename = this.ensureFilenameHasXXX(file.name);
                const proxyDownloadUrl = `/proxy/download?url=${encodeURIComponent(file.link)}&filename=${encodeURIComponent(correctedFilename)}`;
                const isDownloaded = this.isFileDownloaded(file.link);
                const isIgnored = this.isFileIgnored(file.link);
                const hasSiblingIgnored = !isIgnored && this.hasSiblingIgnored(baseName);
                const hasSiblingDownloaded = !isDownloaded && !isIgnored && !hasSiblingIgnored && this.hasSiblingDownloaded(baseName);
                if (!isDownloaded && !isIgnored && !hasSiblingIgnored && !hasSiblingDownloaded) {
                    availableFileCount++;
                }

                let fileItemClass = ageClass;
                if (fileIndex === preferredIndex) {
                    fileItemClass += ' preferred-size';
                }
                let downloadBtnClass = 'download-btn';
                let downloadBtnText = 'Download NZB';
                let ignoreBtnClass = 'ignore-btn';
                let ignoreBtnText = 'Ignore';
                
                if (isDownloaded) {
                    fileItemClass += ' downloaded';
                    downloadBtnClass = 'download-btn downloaded';
                    downloadBtnText = '✓ Downloaded';
                } else if (isIgnored) {
                    fileItemClass += ' ignored';
                    ignoreBtnClass = 'ignore-btn ignored';
                    ignoreBtnText = '✓ Ignored';
                } else if (hasSiblingIgnored) {
                    fileItemClass += ' sibling-ignored';
                    ignoreBtnClass = 'ignore-btn sibling-ignored';
                    ignoreBtnText = '↳ Other Quality';
                } else if (hasSiblingDownloaded) {
                    fileItemClass += ' sibling-downloaded';
                    downloadBtnClass = 'download-btn sibling-downloaded';
                    downloadBtnText = '↳ Other Quality';
                }
                
                const sabnzbBtnHtml = this.sabnzbConfigured
                    ? (() => {
                        let sabnzbClass = 'sabnzb-btn';
                        let sabnzbText = 'Send to SabNZB';
                        if (isDownloaded) {
                            sabnzbClass += ' downloaded';
                            sabnzbText = '✓ Sent to SabNZB';
                        } else if (hasSiblingDownloaded || hasSiblingIgnored) {
                            sabnzbClass += ' sibling-downloaded';
                            sabnzbText = '↳ Other Quality';
                        }
                        return `<button type="button" class="${sabnzbClass}" data-file-link="${this.escapeHtml(file.link)}" data-file-name="${this.escapeHtml(file.name)}"${isDownloaded ? ' disabled' : ''}>${sabnzbText}</button>`;
                    })()
                    : '';
                
                html += `
                    <div class="file-item ${fileItemClass}">
                        <div class="file-info">
                            <span class="file-name">${file.name}</span>
                            <div class="file-meta">
                                <span class="file-size">${file.size}</span>
                                <span class="file-age">${file.timeAgo}</span>
                            </div>
                        </div>
                        <div class="file-actions">
                            <button class="${ignoreBtnClass}" data-file-link="${this.escapeHtml(file.link)}" data-file-name="${this.escapeHtml(file.name)}">${ignoreBtnText}</button>
                            ${sabnzbBtnHtml}
                            <a href="${proxyDownloadUrl}" class="${downloadBtnClass}" data-file-link="${this.escapeHtml(file.link)}" data-file-name="${this.escapeHtml(file.name)}">${downloadBtnText}</a>
                        </div>
                    </div>
                `;
            });
            
            html += `</div>`;
        });
        
        return { html, filteredFileCount, availableFileCount };
    }

    // Brand-header file count text, e.g. "12 files, 3 available" - showing
    // only the total was misleading once most of a brand's files had already
    // been downloaded or ignored.
    fileCountLabel(filesHTML) {
        const total = filesHTML.filteredFileCount;
        return `${total} file${total !== 1 ? 's' : ''}, ${filesHTML.availableFileCount} available`;
    }
    
    getAgeClass(date) {
        const hoursAgo = (new Date() - date) / (1000 * 60 * 60);
        if (hoursAgo <= 24) return 'age-new';
        if (hoursAgo <= 48) return 'age-recent';
        if (hoursAgo <= 168) return 'age-week';
        return 'age-old';
    }
    
    toggleBrandExpansion(brandName, clickedButton) {
        console.log('toggleBrandExpansion called for:', brandName);
        
        // Find the brand item that contains the clicked button
        // This ensures we expand the correct one when the same brand appears in multiple tabs
        let brandItem;
        if (clickedButton) {
            brandItem = clickedButton.closest('.brand-item');
        } else {
            brandItem = document.querySelector(`[data-brand="${brandName}"]`);
        }
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
        const normalizedName = this.normalizeBrandName(brandName);
        const index = this.favoriteBrands.indexOf(normalizedName);
        if (index === -1) {
            this.favoriteBrands.push(normalizedName);
        } else {
            this.favoriteBrands.splice(index, 1);
        }
        this.saveArray('rssParserFavoriteBrands', this.favoriteBrands);
        this.displayResults();
        this.displayFavoritesAndKeywords();
    }
    
    addFavoriteBrand(brandName) {
        const normalizedName = this.normalizeBrandName(brandName);
        console.log('Adding favorite brand:', normalizedName);
        if (!this.favoriteBrands.includes(normalizedName)) {
            this.favoriteBrands.push(normalizedName);
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
        const normalizedName = this.normalizeBrandName(brandName);
        const index = this.favoriteBrands.indexOf(normalizedName);
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
        const normalizedName = this.normalizeBrandName(brandName);
        const index = this.antiFavoriteBrands.indexOf(normalizedName);
        if (index === -1) {
            this.antiFavoriteBrands.push(normalizedName);
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
        // Case-insensitive dedupe so "Sophie Tyler" and "sophie tyler" can't both be added
        const exists = this.keywords.some(k => k.toLowerCase() === keyword.toLowerCase());
        if (!exists) {
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

    addPerformer(name) {
        // Case-insensitive dedupe, same as addKeyword
        const exists = this.performers.some(p => p.toLowerCase() === name.toLowerCase());
        if (!exists) {
            this.performers.push(name);
            this.saveArray('rssParserPerformers', this.performers);
            this.displayFavoritesAndKeywords();
            this.applyKeywordHighlighting();
            // New performer: offer a choice of thumbnails rather than silently
            // picking whichever gallery still turns up first
            this.selectPerformerThumbnail(name);
        }
    }

    removePerformer(name) {
        const index = this.performers.indexOf(name);
        if (index !== -1) {
            this.performers.splice(index, 1);
            this.saveArray('rssParserPerformers', this.performers);
            this.displayFavoritesAndKeywords();
            this.applyKeywordHighlighting();
        }
    }

    // Fetch up to 10 candidate thumbnail URLs for a performer, caching the
    // result client-side for the session (server also caches across requests)
    async fetchPerformerThumbnailCandidates(name) {
        const key = name.toLowerCase();
        if (this.performerThumbnailCache.has(key)) {
            return this.performerThumbnailCache.get(key);
        }
        try {
            const res = await fetch(`/api/performer-thumbnails?name=${encodeURIComponent(name)}`);
            const data = await res.json().catch(() => ({}));
            const urls = Array.isArray(data && data.imageUrls) ? data.imageUrls : [];
            this.performerThumbnailCache.set(key, urls);
            return urls;
        } catch (err) {
            return [];
        }
    }

    /**
     * Resolve a performer's thumbnail and set it on the given <img>. A
     * persisted user pick (from selectPerformerThumbnail) always wins;
     * otherwise the first auto-fetched candidate is used as a default.
     * Hotlinked directly from thumbnailseries.com (a third-party gallery
     * aggregator, not a source of curated headshots) - leaves the placeholder
     * icon in place if nothing is found or the request fails.
     */
    async loadPerformerThumbnail(name, imgEl) {
        const key = name.toLowerCase();

        const chosen = this.performerThumbnails[key];
        if (chosen) {
            this.applyPerformerThumbnail(imgEl, chosen);
            return;
        }

        const urls = await this.fetchPerformerThumbnailCandidates(name);
        // The tag list may have re-rendered while this was in flight
        if (urls.length > 0 && imgEl.isConnected) this.applyPerformerThumbnail(imgEl, urls[0]);
    }

    applyPerformerThumbnail(imgEl, url) {
        imgEl.addEventListener('load', () => imgEl.classList.add('loaded'), { once: true });
        imgEl.src = url;
    }

    /**
     * Fetch up to 10 thumbnail candidates for a performer and let the user
     * pick one, upload their own photo, or paste an image URL. The choice is
     * persisted (rssParserPerformerThumbnails) and takes priority over the
     * auto-fetched default from then on. Always opens (even with zero
     * auto-fetched candidates) since uploading/pasting is always available.
     */
    async selectPerformerThumbnail(name) {
        const urls = await this.fetchPerformerThumbnailCandidates(name);
        const chosenUrl = await this.showThumbnailPicker(name, urls);
        if (!chosenUrl) return;

        this.performerThumbnails[name.toLowerCase()] = chosenUrl;
        this.saveObject('rssParserPerformerThumbnails', this.performerThumbnails);
        this.displayFavoritesAndKeywords();
    }

    // Resize/compress an uploaded image client-side before it goes into
    // localStorage as a data: URL, so one photo doesn't eat the storage quota
    compressImageFile(file, maxDimension = 320, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Could not read that file'));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('That file is not a readable image'));
                img.onload = () => {
                    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Preload a pasted image URL so a typo/dead link surfaces immediately
    // instead of silently leaving the placeholder icon showing later
    preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => reject(new Error('Could not load an image from that URL'));
            img.src = url;
        });
    }

    // Modal offering up to 10 auto-fetched thumbnail options for a performer,
    // plus an upload-your-own and paste-a-URL fallback. Resolves with the
    // chosen URL (hotlink or a compressed data: URL), or null if closed
    // without picking.
    showThumbnailPicker(name, urls) {
        return new Promise(resolve => {
            const optionsHtml = urls.length > 0
                ? urls.map((url, i) => `
                    <button type="button" class="ptp-option" data-url="${this.escapeHtml(url)}" title="Use this photo">
                        <img src="${this.escapeHtml(url)}" alt="Option ${i + 1}">
                    </button>
                `).join('')
                : '<p class="ptp-empty">No photos found automatically for this performer.</p>';

            const overlay = document.createElement('div');
            overlay.className = 'bdc-overlay';
            overlay.innerHTML = `
                <div class="bdc-dialog ptp-dialog" role="dialog" aria-modal="true" aria-labelledby="ptp-title">
                    <h3 id="ptp-title">Choose a photo for ${this.escapeHtml(name)}</h3>
                    <div class="ptp-options">${optionsHtml}</div>
                    <div class="ptp-custom">
                        <label class="ptp-upload-btn">
                            Upload your own
                            <input type="file" accept="image/*" class="ptp-file-input" hidden>
                        </label>
                        <div class="ptp-url-row">
                            <input type="url" class="ptp-url-input" placeholder="Or paste an image URL">
                            <button type="button" class="ptp-url-btn">Use</button>
                        </div>
                        <p class="ptp-hint">Tip: copy an image elsewhere and paste it (⌘V / Ctrl+V) anywhere in this window</p>
                        <p class="ptp-error" hidden></p>
                    </div>
                    <div class="bdc-actions">
                        <button type="button" class="bdc-cancel-btn">Skip</button>
                    </div>
                </div>
            `;

            const errorEl = overlay.querySelector('.ptp-error');
            const showError = (msg) => {
                errorEl.textContent = msg;
                errorEl.hidden = false;
            };

            const close = (result) => {
                document.removeEventListener('keydown', onKeydown);
                document.removeEventListener('paste', onPaste);
                overlay.remove();
                resolve(result);
            };
            const onKeydown = (e) => {
                if (e.key === 'Escape') close(null);
            };

            // Clipboard image paste (Cmd/Ctrl+V) - works anywhere while the
            // dialog is open, no need to focus a specific field first
            const onPaste = async (e) => {
                const items = e.clipboardData && e.clipboardData.items;
                if (!items) return;
                for (const item of items) {
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file) return;
                        try {
                            const dataUrl = await this.compressImageFile(file);
                            close(dataUrl);
                        } catch (err) {
                            showError(err.message);
                        }
                        return;
                    }
                }
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(null);
            });
            overlay.querySelector('.bdc-cancel-btn').addEventListener('click', () => close(null));
            overlay.querySelectorAll('.ptp-option').forEach(btn => {
                btn.addEventListener('click', () => close(btn.getAttribute('data-url')));
            });

            const fileInput = overlay.querySelector('.ptp-file-input');
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                try {
                    const dataUrl = await this.compressImageFile(file);
                    close(dataUrl);
                } catch (err) {
                    showError(err.message);
                }
            });

            const urlInput = overlay.querySelector('.ptp-url-input');
            const urlBtn = overlay.querySelector('.ptp-url-btn');
            const useUrl = async () => {
                const value = urlInput.value.trim();
                if (!value) return;
                urlBtn.disabled = true;
                urlBtn.textContent = 'Checking…';
                try {
                    await this.preloadImage(value);
                    close(value);
                } catch (err) {
                    showError(err.message);
                    urlBtn.disabled = false;
                    urlBtn.textContent = 'Use';
                }
            };
            urlBtn.addEventListener('click', useUrl);
            urlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') useUrl();
            });

            document.addEventListener('keydown', onKeydown);
            document.addEventListener('paste', onPaste);

            document.body.appendChild(overlay);
        });
    }

    applyKeywordHighlighting() {
        // Performer names highlight the same way general keywords do
        const terms = [
            ...(Array.isArray(this.keywords) ? this.keywords : []),
            ...(Array.isArray(this.performers) ? this.performers : [])
        ];
        if (terms.length === 0) return;

        document.querySelectorAll('.file-name').forEach(element => {
            const fileItem = element.closest('.file-item');
            // Entries already dealt with (downloaded, or another quality of the
            // same content downloaded) don't get keyword highlighting
            if (fileItem && (fileItem.classList.contains('downloaded') ||
                fileItem.classList.contains('sibling-downloaded'))) {
                return;
            }

            const text = element.textContent;
            let highlightedText = text;

            terms.forEach(term => {
                const regex = new RegExp(`(${term})`, 'gi');
                highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
            });

            if (highlightedText !== text) {
                element.innerHTML = highlightedText;
                if (fileItem) fileItem.classList.add('highlighted');
            }
        });

        this.refreshBrandKeywordBadges();
    }

    /**
     * Brand-level keyword highlight and match badge. Only matches that are
     * still actionable count — files already downloaded (or with another
     * quality of the same content downloaded) are excluded, so a brand stops
     * being highlighted once its keyword matches have been dealt with.
     */
    refreshBrandKeywordBadges() {
        // Strip keyword marks from rows that have since been downloaded (or had
        // another quality downloaded) so dealt-with entries stop drawing attention
        document.querySelectorAll(
            '.file-item.downloaded .file-name mark, .file-item.sibling-downloaded .file-name mark'
        ).forEach(mark => {
            mark.replaceWith(document.createTextNode(mark.textContent));
        });
        document.querySelectorAll(
            '.file-item.highlighted.downloaded, .file-item.highlighted.sibling-downloaded'
        ).forEach(item => item.classList.remove('highlighted'));

        document.querySelectorAll('.brand-item').forEach(brandItem => {
            const matchCount = brandItem.querySelectorAll(
                '.file-item.highlighted:not(.downloaded):not(.sibling-downloaded)'
            ).length;
            const brandHeader = brandItem.querySelector('.brand-header');
            let badge = brandHeader ? brandHeader.querySelector('.keyword-match-badge') : null;

            if (matchCount > 0) {
                brandItem.classList.add('has-keywords');
                if (!badge && brandHeader) {
                    badge = document.createElement('span');
                    badge.className = 'keyword-match-badge';
                    badge.title = 'This brand contains files matching your keywords';
                    const brandControls = brandHeader.querySelector('.brand-controls');
                    if (brandControls) {
                        brandControls.insertBefore(badge, brandControls.firstChild);
                    }
                }
                if (badge) {
                    badge.textContent = `${matchCount} keyword match${matchCount !== 1 ? 'es' : ''}`;
                }
            } else {
                brandItem.classList.remove('has-keywords');
                if (badge) badge.remove();
            }
        });
    }

    displayFavoritesAndKeywords() {
        this.displayFavoriteBrands();
        this.displayKeywords();
        this.displayExcludeKeywords();
        this.displayPerformersList();
        this.displayQuickSearchChips();
    }

    // Populate the collapsible "Quick search" panel with a chip per favourite
    // brand, performer, and highlight keyword. The panel is hidden entirely
    // when there is nothing to show, and stays collapsed until the user opens it.
    displayQuickSearchChips() {
        const wrapper = document.getElementById('quick-search');
        const container = document.getElementById('quick-search-chips');
        if (!wrapper || !container) return;

        const favs = Array.isArray(this.favoriteBrands) ? this.favoriteBrands : [];
        const perfs = Array.isArray(this.performers) ? this.performers : [];
        const kws = Array.isArray(this.keywords) ? this.keywords : [];
        const total = favs.length + perfs.length + kws.length;

        if (total === 0) {
            wrapper.hidden = true;
            container.innerHTML = '';
            return;
        }
        wrapper.hidden = false;

        const countEl = document.getElementById('quick-search-count');
        if (countEl) countEl.textContent = `(${total})`;

        const chip = (term, cls) =>
            `<button type="button" class="search-chip ${cls}" data-term="${this.escapeHtml(term)}" title="Search for ${this.escapeHtml(term)}">${this.escapeHtml(term)}</button>`;

        let html = '';
        if (favs.length) {
            html += `<div class="chip-row"><span class="chip-row-label">Favourites:</span>` +
                favs.map(b => chip(b, 'fav-chip')).join('') + `</div>`;
        }
        if (perfs.length) {
            html += `<div class="chip-row"><span class="chip-row-label">Performers:</span>` +
                perfs.map(p => chip(p, 'perf-chip')).join('') + `</div>`;
        }
        if (kws.length) {
            html += `<div class="chip-row"><span class="chip-row-label">Keywords:</span>` +
                kws.map(k => chip(k, 'kw-chip')).join('') + `</div>`;
        }
        container.innerHTML = html;

        container.querySelectorAll('.search-chip').forEach(el => {
            el.addEventListener('click', () => {
                this.fetchPerformerSearch(el.getAttribute('data-term'));
            });
        });
    }

    // Wire the Quick-search collapse toggle once; restores the last open/closed
    // state from storage (collapsed by default).
    initializeQuickSearchToggle() {
        const toggle = document.getElementById('quick-search-toggle');
        const container = document.getElementById('quick-search-chips');
        const chevron = toggle ? toggle.querySelector('.qs-chevron') : null;
        if (!toggle || !container) return;

        const apply = (open) => {
            container.hidden = !open;
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (chevron) chevron.textContent = open ? '▾' : '▸';
        };

        apply(localStorage.getItem('rssParserQuickSearchOpen') === '1');

        toggle.addEventListener('click', () => {
            const open = container.hidden; // about to open if currently hidden
            apply(open);
            localStorage.setItem('rssParserQuickSearchOpen', open ? '1' : '0');
        });
    }
    
    displayFavoriteBrands() {
        this.renderTagList('favorite-brands-list', 'favorite', 'No favorite brands selected.');
    }

    displayKeywords() {
        this.renderTagList('keywords-list', 'keyword', 'No highlight keywords added.');
    }

    displayExcludeKeywords() {
        this.renderTagList('exclude-keywords-list', 'exclude', 'No exclude keywords added.');
    }

    displayPerformersList() {
        this.renderTagList('performers-list', 'performer', 'No performers added yet.');
    }

    // ---- Shared tag-list rendering & management (favourites / keywords / performers / excludes) ----

    _tagArrayFor(type) {
        if (type === 'favorite') return this.favoriteBrands;
        if (type === 'exclude') return this.excludeKeywords;
        if (type === 'performer') return this.performers;
        return this.keywords;
    }

    _tagStorageKeyFor(type) {
        if (type === 'favorite') return 'rssParserFavoriteBrands';
        if (type === 'exclude') return 'rssParserExcludeKeywords';
        if (type === 'performer') return 'rssParserPerformers';
        return 'rssParserKeywords';
    }

    _tagContainerIdFor(type) {
        if (type === 'favorite') return 'favorite-brands-list';
        if (type === 'exclude') return 'exclude-keywords-list';
        if (type === 'performer') return 'performers-list';
        return 'keywords-list';
    }

    // Wire the per-list search boxes and A→Z sort buttons in the management tab
    initializeTagListTools() {
        this.tagFilters = { favorite: '', keyword: '', exclude: '', performer: '' };
        this.tagSortDirection = {}; // per-type toggle between asc and desc

        document.querySelectorAll('.tag-filter-input').forEach(input => {
            input.addEventListener('input', () => {
                const type = input.getAttribute('data-type');
                this.tagFilters[type] = input.value.trim().toLowerCase();
                this.applyTagFilter(type);
            });
        });

        document.querySelectorAll('.tag-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                this.sortTagList(type);
                btn.textContent = this.tagSortDirection[type] === 'desc' ? 'Z→A' : 'A→Z';
            });
        });
    }

    // Hide tags that don't match the list's search box. Visibility-only, so
    // the data-index attributes (used by move/remove/rename) stay valid.
    applyTagFilter(type) {
        const container = document.getElementById(this._tagContainerIdFor(type));
        if (!container) return;

        const filter = (this.tagFilters && this.tagFilters[type]) || '';
        let visible = 0;
        container.querySelectorAll('.keyword-tag').forEach(tag => {
            const label = tag.querySelector('.tag-label')?.textContent.toLowerCase() || '';
            const match = !filter || label.includes(filter);
            tag.style.display = match ? '' : 'none';
            if (match) visible++;
        });

        let emptyMsg = container.querySelector('.tag-filter-empty');
        const hasTags = container.querySelector('.keyword-tag') !== null;
        if (hasTags && visible === 0) {
            if (!emptyMsg) {
                emptyMsg = document.createElement('p');
                emptyMsg.className = 'tag-filter-empty';
                emptyMsg.textContent = 'No matches.';
                container.appendChild(emptyMsg);
            }
        } else {
            emptyMsg?.remove();
        }
    }

    // Sort the list alphabetically; clicking again toggles the direction
    sortTagList(type) {
        const arr = this._tagArrayFor(type);
        if (!Array.isArray(arr) || arr.length < 2) return;

        const dir = this.tagSortDirection[type] === 'asc' ? 'desc' : 'asc';
        this.tagSortDirection[type] = dir;
        arr.sort((a, b) => dir === 'asc'
            ? a.localeCompare(b, undefined, { sensitivity: 'base' })
            : b.localeCompare(a, undefined, { sensitivity: 'base' }));

        this.saveArray(this._tagStorageKeyFor(type), arr);
        this.displayFavoritesAndKeywords();
        if (type === 'keyword' || type === 'performer') this.applyKeywordHighlighting();
        if (type === 'favorite' && this.brands.size > 0) this.displayResults();
    }

    renderTagList(containerId, type, emptyMsg) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const items = this._tagArrayFor(type);
        if (!Array.isArray(items) || items.length === 0) {
            container.innerHTML = `<p>${emptyMsg}</p>`;
            return;
        }

        const extraClass = type === 'favorite' ? 'favorite-tag' : (type === 'exclude' ? 'exclude-tag' : (type === 'performer' ? 'performer-tag' : ''));
        const searchable = type !== 'exclude';
        // Keywords and Performers can be reclassified into each other, since the
        // initial split (auto-detected from name shape) won't always be right
        const moveTarget = type === 'keyword' ? 'performer' : (type === 'performer' ? 'keyword' : null);
        const moveTitle = moveTarget === 'performer' ? 'Move to Performers' : 'Move to Keywords';

        const thumbHtml = `
            <span class="performer-thumb-wrap">
                <svg class="performer-thumb-placeholder" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="8" r="4"></circle>
                    <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"></path>
                </svg>
                <img class="performer-thumb" alt="">
            </span>
        `;

        // Performers get a card (big photo on top, controls below) rather than
        // the compact inline pill the other tag types use — a pill has no room
        // for a photo that's actually visible. Both shapes share the same
        // .keyword-tag/data-index/.tag-label contract so filter/sort/move/
        // rename/remove wiring below works unchanged for either shape.
        const itemHtml = (val, i) => type === 'performer' ? `
            <span class="keyword-tag ${extraClass} performer-card" data-index="${i}">
                <button class="remove-tag-btn" title="Remove">×</button>
                ${thumbHtml}
                <span class="tag-label" title="Click to rename">${this.escapeHtml(val)}</span>
                <span class="performer-card-actions">
                    <span class="tag-order">
                        <button class="tag-move-btn" data-dir="up" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button class="tag-move-btn" data-dir="down" title="Move down" ${i === items.length - 1 ? 'disabled' : ''}>▼</button>
                    </span>
                    <button class="change-photo-btn" title="Change photo">⟳</button>
                    <button class="search-tag-btn" data-term="${this.escapeHtml(val)}" title="Search for ${this.escapeHtml(val)}">🔍</button>
                    <button class="move-tag-btn" title="${moveTitle}">⇄</button>
                </span>
            </span>
        ` : `
            <span class="keyword-tag ${extraClass}" data-index="${i}">
                <span class="tag-order">
                    <button class="tag-move-btn" data-dir="up" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
                    <button class="tag-move-btn" data-dir="down" title="Move down" ${i === items.length - 1 ? 'disabled' : ''}>▼</button>
                </span>
                ${searchable ? `<button class="search-tag-btn" data-term="${this.escapeHtml(val)}" title="Search for ${this.escapeHtml(val)}">🔍</button>` : ''}
                ${moveTarget ? `<button class="move-tag-btn" title="${moveTitle}">⇄</button>` : ''}
                <span class="tag-label" title="Click to rename">${this.escapeHtml(val)}</span>
                <button class="remove-tag-btn" title="Remove">×</button>
            </span>
        `;

        container.innerHTML = items.map(itemHtml).join('');

        container.querySelectorAll('.keyword-tag').forEach(tag => {
            const i = parseInt(tag.getAttribute('data-index'), 10);
            tag.querySelector('.remove-tag-btn')?.addEventListener('click', () => this.removeTagItem(type, i));
            tag.querySelector('.search-tag-btn')?.addEventListener('click', () => {
                const term = this._tagArrayFor(type)[i];
                if (term) this.fetchPerformerSearch(term);
            });
            tag.querySelector('.move-tag-btn')?.addEventListener('click', () => this.moveTagToOtherList(type, i));
            tag.querySelectorAll('.tag-move-btn').forEach(btn =>
                btn.addEventListener('click', () => this.moveTagItem(type, i, btn.getAttribute('data-dir')))
            );
            tag.querySelector('.tag-label')?.addEventListener('click', (e) => this.startTagRename(e.currentTarget, type, i));

            if (type === 'performer') {
                const img = tag.querySelector('.performer-thumb');
                const name = this._tagArrayFor(type)[i];
                if (img && name) this.loadPerformerThumbnail(name, img);
                tag.querySelector('.change-photo-btn')?.addEventListener('click', () => {
                    const currentName = this._tagArrayFor('performer')[i];
                    if (currentName) this.selectPerformerThumbnail(currentName);
                });
            }
        });

        this.applyTagFilter(type);
    }

    removeTagItem(type, index) {
        const val = this._tagArrayFor(type)[index];
        if (val === undefined) return;
        // Delegate to the existing removers so their side-effects run
        if (type === 'favorite') this.removeFavoriteBrand(val);
        else if (type === 'exclude') this.removeExcludeKeyword(val);
        else if (type === 'performer') this.removePerformer(val);
        else this.removeKeyword(val);
    }

    // Reclassify a tag between Keywords and Performers
    moveTagToOtherList(type, index) {
        const val = this._tagArrayFor(type)[index];
        if (val === undefined) return;
        if (type === 'performer') {
            this.removePerformer(val);
            this.addKeyword(val);
        } else if (type === 'keyword') {
            this.removeKeyword(val);
            this.addPerformer(val);
        }
    }

    moveTagItem(type, index, dir) {
        const arr = this._tagArrayFor(type);
        const j = dir === 'up' ? index - 1 : index + 1;
        if (j < 0 || j >= arr.length) return;
        [arr[index], arr[j]] = [arr[j], arr[index]];
        this.saveArray(this._tagStorageKeyFor(type), arr);
        this.displayFavoritesAndKeywords();
        if (type === 'keyword' || type === 'performer') this.applyKeywordHighlighting();
        if (type === 'favorite' && this.brands.size > 0) this.displayResults();
    }

    startTagRename(labelEl, type, index) {
        const arr = this._tagArrayFor(type);
        const current = arr[index];
        if (current === undefined) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tag-edit-input';
        input.value = current;
        labelEl.replaceWith(input);
        input.focus();
        input.select();

        let finished = false;
        const commit = (save) => {
            if (finished) return;
            finished = true;
            const val = input.value.trim();
            const duplicate = arr.some((x, idx) => idx !== index && x.toLowerCase() === val.toLowerCase());
            if (save && val && val.toLowerCase() !== current.toLowerCase() && !duplicate) {
                arr[index] = type === 'favorite' ? this.normalizeBrandName(val) : val;
                this.saveArray(this._tagStorageKeyFor(type), arr);
                if (type === 'keyword' || type === 'performer') this.applyKeywordHighlighting();
                if (type === 'favorite' && this.brands.size > 0) this.displayResults();
            }
            this.displayFavoritesAndKeywords();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit(true);
            else if (e.key === 'Escape') commit(false);
        });
        input.addEventListener('blur', () => commit(true));
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

        // Re-apply an active search after re-render
        this.applyBrandListSearch('favorites-tab', 'favorites-search', 'favorites-search-status');
    }

    displayPerformers() {
        this.displayPerformerMatchesSection();
        this.updatePerformersStats();
        this.applyBrandListSearch('performers-tab', 'performers-search', 'performers-search-status');
    }

    // Wire the Favorites tab search box and sort selector
    initializeFavoritesTools() {
        const searchInput = document.getElementById('favorites-search');
        if (searchInput) {
            searchInput.addEventListener('input', () =>
                this.applyBrandListSearch('favorites-tab', 'favorites-search', 'favorites-search-status'));
        }

        const sortSelect = document.getElementById('favorites-sort');
        if (sortSelect) {
            sortSelect.value = this.favoritesSortMode;
            if (sortSelect.value !== this.favoritesSortMode) {
                // Saved mode is no longer a valid option - fall back
                this.favoritesSortMode = 'custom';
                sortSelect.value = 'custom';
            }
            sortSelect.addEventListener('change', () => {
                this.favoritesSortMode = sortSelect.value;
                localStorage.setItem('rssParserFavoritesSort', this.favoritesSortMode);
                this.displayFavorites();
            });
        }
    }

    // Wire the Performers tab search box and sort selector
    initializePerformersTools() {
        const searchInput = document.getElementById('performers-search');
        if (searchInput) {
            searchInput.addEventListener('input', () =>
                this.applyBrandListSearch('performers-tab', 'performers-search', 'performers-search-status'));
        }

        const sortSelect = document.getElementById('performers-sort');
        if (sortSelect) {
            sortSelect.value = this.performersSortMode;
            if (sortSelect.value !== this.performersSortMode) {
                this.performersSortMode = 'custom';
                sortSelect.value = 'custom';
            }
            sortSelect.addEventListener('change', () => {
                this.performersSortMode = sortSelect.value;
                localStorage.setItem('rssParserPerformersSort', this.performersSortMode);
                this.displayPerformers();
            });
        }
    }

    // Order brand entries ({ name, latestDate, fileCount, cardHtml }) per a
    // sort mode ("custom" keeps the caller's order — the user's favourites
    // order, or alphabetical for keyword/performer matches).
    sortEntriesByMode(entries, mode) {
        if ((mode || 'custom') === 'custom') return entries;

        return [...entries].sort((a, b) => {
            if (mode === 'name-asc') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            if (mode === 'name-desc') return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
            if (mode === 'latest') return (b.latestDate ? b.latestDate.getTime() : 0) - (a.latestDate ? a.latestDate.getTime() : 0);
            if (mode === 'files') return b.fileCount - a.fileCount;
            return 0;
        });
    }

    sortFavoriteEntries(entries) {
        return this.sortEntriesByMode(entries, this.favoritesSortMode);
    }

    sortPerformerEntries(entries) {
        return this.sortEntriesByMode(entries, this.performersSortMode);
    }

    // Filter a rendered brand-list tab (Favorites / Performers) by brand or
    // file name. Visibility-only, same approach as the Results tab search,
    // but scoped to the given tab. A brand name match shows all of that brand's files.
    applyBrandListSearch(tabId, inputId, statusId) {
        const tab = document.getElementById(tabId);
        if (!tab) return;

        const input = document.getElementById(inputId);
        const status = document.getElementById(statusId);
        const query = (input ? input.value : '').toLowerCase().trim();

        let visibleBrands = 0;
        let visibleFiles = 0;

        tab.querySelectorAll('.brand-item').forEach(brandItem => {
            const brandName = (brandItem.getAttribute('data-brand') || '').toLowerCase();
            const brandNameMatch = !query || brandName.includes(query);
            let brandHasMatch = false;

            brandItem.querySelectorAll('.file-group').forEach(group => {
                let groupHasMatch = false;
                group.querySelectorAll('.file-item').forEach(fileItem => {
                    const fileName = fileItem.querySelector('.file-name');
                    const fileNameText = fileName ? fileName.textContent.toLowerCase() : '';
                    const matches = brandNameMatch || fileNameText.includes(query);
                    fileItem.style.display = matches ? 'flex' : 'none';
                    if (matches) {
                        groupHasMatch = true;
                        visibleFiles++;
                    }
                });
                group.style.display = groupHasMatch ? 'block' : 'none';
                if (groupHasMatch) brandHasMatch = true;
            });

            brandItem.style.display = brandHasMatch ? 'block' : 'none';
            if (brandHasMatch) visibleBrands++;
        });

        if (status) {
            if (!query) {
                status.textContent = '';
            } else if (visibleFiles === 0) {
                status.textContent = 'No matches found';
            } else {
                status.textContent = `${visibleFiles} file${visibleFiles !== 1 ? 's' : ''} in ${visibleBrands} brand${visibleBrands !== 1 ? 's' : ''}`;
            }
        }
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
        
        const entries = [];

        this.favoriteBrands.forEach(brandName => {
            console.log(`Checking brand: ${brandName}, exists: ${this.brands.has(brandName)}`);
            if (this.brands.has(brandName)) {
                const brandFiles = this.brands.get(brandName);
                const filesHTML = this.generateBrandFilesHTML(brandFiles);
                console.log(`  Brand ${brandName} has ${filesHTML.filteredFileCount} files`);

                // Check if all content in this brand has been downloaded
                const isFullyDownloaded = this.isBrandFullyDownloaded(brandFiles);

                // Get latest date for this brand
                let latestDate = null;
                brandFiles.forEach(files => {
                    files.forEach(file => {
                        if (!latestDate || file.pubDate > latestDate) {
                            latestDate = file.pubDate;
                        }
                    });
                });

                const brandClasses = [
                    'brand-item',
                    'favorite',
                    isFullyDownloaded ? 'fully-downloaded' : ''
                ].filter(Boolean).join(' ');

                const cardHtml = `
                    <div class="${brandClasses}" data-brand="${this.escapeHtml(brandName)}">
                        <div class="brand-header">
                            <h3>${this.escapeHtml(brandName)} (${this.fileCountLabel(filesHTML)})${isFullyDownloaded ? ' <span class="fully-downloaded-badge">✓ All Reviewed</span>' : ''}</h3>
                            <div class="brand-controls">
                                <span class="brand-latest">${latestDate ? this.getTimeAgo(latestDate) : ''}</span>
                                <button class="download-brand-btn" data-action="download-brand" data-brand="${this.escapeHtml(brandName)}" title="Download the whole brand — preferred size per group">⬇ All</button>
                                <button class="expand-btn" data-action="expand" data-brand="${this.escapeHtml(brandName)}">▼</button>
                            </div>
                        </div>
                        <div class="brand-files" style="display: none;">
                            ${filesHTML.html}
                        </div>
                    </div>
                `;
                entries.push({ name: brandName, latestDate, fileCount: filesHTML.filteredFileCount, cardHtml });
            }
        });

        const html = this.sortFavoriteEntries(entries).map(e => e.cardHtml).join('');

        console.log(`Found ${entries.length} favorite brands with files`);
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
        
        // Group by brand (parent category), then by baseName (file group) - same structure as results tab
        const byBrand = new Map();
        matchingFiles.forEach(file => {
            const brandName = file.brandName;
            if (!byBrand.has(brandName)) {
                byBrand.set(brandName, new Map());
            }
            const brandFiles = byBrand.get(brandName);
            const groupKey = this.getBaseNameGroupKey(file.baseName || this.extractBaseName(file.name));
            if (!brandFiles.has(groupKey)) {
                brandFiles.set(groupKey, []);
            }
            brandFiles.get(groupKey).push(file);
        });
        
        // Build brand cards with same structure as results tab (brand-item >
        // brand-header > brand-files > file-groups). "Custom" sort falls back
        // to alphabetical here since keyword matches have no manual order.
        const sortedBrands = Array.from(byBrand.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const entries = [];

        sortedBrands.forEach(([brandName, brandFiles]) => {
            const filesHTML = this.generateBrandFilesHTML(brandFiles);
            const isFullyDownloaded = this.isBrandFullyDownloaded(brandFiles);
            let latestDate = null;
            brandFiles.forEach(files => {
                files.forEach(file => {
                    if (!latestDate || file.pubDate > latestDate) {
                        latestDate = file.pubDate;
                    }
                });
            });

            const brandClasses = [
                'brand-item',
                'keyword-matches-brand',
                isFullyDownloaded ? 'fully-downloaded' : ''
            ].filter(Boolean).join(' ');

            const cardHtml = `
                <div class="${brandClasses}" data-brand="${this.escapeHtml(brandName)}">
                    <div class="brand-header">
                        <h3>${this.escapeHtml(brandName)} (${this.fileCountLabel(filesHTML)})${isFullyDownloaded ? ' <span class="fully-downloaded-badge">✓ All Reviewed</span>' : ''}</h3>
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
            entries.push({ name: brandName, latestDate, fileCount: filesHTML.filteredFileCount, cardHtml });
        });

        container.innerHTML = this.sortFavoriteEntries(entries).map(e => e.cardHtml).join('');
        this.setupBrandEventDelegation(container);
    }

    displayPerformerMatchesSection() {
        const container = document.getElementById('performer-matches-display');
        if (!container) return;

        if (!Array.isArray(this.performers) || this.performers.length === 0) {
            container.innerHTML = '<p>No performers added yet. Search for a performer, or add one below.</p>';
            return;
        }

        if (this.brands.size === 0) {
            container.innerHTML = '<p>No RSS data loaded. Fetch an RSS feed first.</p>';
            return;
        }

        // Find all files that match any performer
        const matchingFiles = [];

        this.brands.forEach((brandFiles, brandName) => {
            brandFiles.forEach((files) => {
                files.forEach(file => {
                    const fileName = file.name.toLowerCase();
                    const matchedPerformers = this.performers.filter(performer =>
                        fileName.includes(performer.toLowerCase())
                    );

                    if (matchedPerformers.length > 0) {
                        matchingFiles.push({
                            ...file,
                            brandName: brandName,
                            matchedPerformers: matchedPerformers
                        });
                    }
                });
            });
        });

        if (matchingFiles.length === 0) {
            container.innerHTML = `<p>No files match your performers: ${this.performers.join(', ')}</p>`;
            return;
        }

        // Group by brand (parent category), then by baseName (file group) - same structure as results tab
        const byBrand = new Map();
        matchingFiles.forEach(file => {
            const brandName = file.brandName;
            if (!byBrand.has(brandName)) {
                byBrand.set(brandName, new Map());
            }
            const brandFiles = byBrand.get(brandName);
            const groupKey = this.getBaseNameGroupKey(file.baseName || this.extractBaseName(file.name));
            if (!brandFiles.has(groupKey)) {
                brandFiles.set(groupKey, []);
            }
            brandFiles.get(groupKey).push(file);
        });

        // Build brand cards with same structure as results tab (brand-item >
        // brand-header > brand-files > file-groups). "Custom" sort falls back
        // to alphabetical here since performer matches have no manual order.
        const sortedBrands = Array.from(byBrand.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const entries = [];

        sortedBrands.forEach(([brandName, brandFiles]) => {
            const filesHTML = this.generateBrandFilesHTML(brandFiles);
            const isFullyDownloaded = this.isBrandFullyDownloaded(brandFiles);
            let latestDate = null;
            brandFiles.forEach(files => {
                files.forEach(file => {
                    if (!latestDate || file.pubDate > latestDate) {
                        latestDate = file.pubDate;
                    }
                });
            });

            const brandClasses = [
                'brand-item',
                'performer-matches-brand',
                isFullyDownloaded ? 'fully-downloaded' : ''
            ].filter(Boolean).join(' ');

            const cardHtml = `
                <div class="${brandClasses}" data-brand="${this.escapeHtml(brandName)}">
                    <div class="brand-header">
                        <h3>${this.escapeHtml(brandName)} (${this.fileCountLabel(filesHTML)})${isFullyDownloaded ? ' <span class="fully-downloaded-badge">✓ All Reviewed</span>' : ''}</h3>
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
            entries.push({ name: brandName, latestDate, fileCount: filesHTML.filteredFileCount, cardHtml });
        });

        container.innerHTML = this.sortPerformerEntries(entries).map(e => e.cardHtml).join('');
        this.setupBrandEventDelegation(container);
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

    updatePerformersStats() {
        const performersCountEl = document.getElementById('performers-count');
        if (performersCountEl) {
            performersCountEl.textContent = Array.isArray(this.performers) ? this.performers.length : 0;
        }

        // Count performer matches
        let matchCount = 0;
        if (Array.isArray(this.performers) && this.performers.length > 0) {
            this.brands.forEach((brandFiles) => {
                brandFiles.forEach((files) => {
                    files.forEach(file => {
                        const fileName = file.name.toLowerCase();
                        if (this.performers.some(performer => fileName.includes(performer.toLowerCase()))) {
                            matchCount++;
                        }
                    });
                });
            });
        }

        const matchesCountEl = document.getElementById('performer-matches-count');
        if (matchesCountEl) {
            matchesCountEl.textContent = matchCount;
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

        const latestUpload = document.getElementById('performers-latest-upload');
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
            const isDownloaded = this.isFileDownloaded(file.link);
            const isIgnored = this.isFileIgnored(file.link);
            const baseName = this.extractBaseName(file.name);
            const hasSiblingIgnored = !isIgnored && this.hasSiblingIgnored(baseName);
            const hasSiblingDownloaded = !isDownloaded && !isIgnored && !hasSiblingIgnored && this.hasSiblingDownloaded(baseName);
            
            let fileItemClass = `excluded ${ageClass}`;
            let downloadBtnClass = 'download-btn';
            let downloadBtnText = 'Download NZB';
            let ignoreBtnClass = 'ignore-btn';
            let ignoreBtnText = 'Ignore';
            
            if (isDownloaded) {
                fileItemClass += ' downloaded';
                downloadBtnClass = 'download-btn downloaded';
                downloadBtnText = '✓ Downloaded';
            } else if (isIgnored) {
                fileItemClass += ' ignored';
                ignoreBtnClass = 'ignore-btn ignored';
                ignoreBtnText = '✓ Ignored';
            } else if (hasSiblingIgnored) {
                fileItemClass += ' sibling-ignored';
                ignoreBtnClass = 'ignore-btn sibling-ignored';
                ignoreBtnText = '↳ Other Quality';
            } else if (hasSiblingDownloaded) {
                fileItemClass += ' sibling-downloaded';
                downloadBtnClass = 'download-btn sibling-downloaded';
                downloadBtnText = '↳ Other Quality';
            }
            
            const sabnzbBtnHtml = this.sabnzbConfigured
                ? (() => {
                    let sabnzbClass = 'sabnzb-btn';
                    let sabnzbText = 'Send to SabNZB';
                    if (isDownloaded) {
                        sabnzbClass += ' downloaded';
                        sabnzbText = '✓ Sent to SabNZB';
                    } else if (hasSiblingDownloaded || hasSiblingIgnored) {
                        sabnzbClass += ' sibling-downloaded';
                        sabnzbText = '↳ Other Quality';
                    }
                    return `<button type="button" class="${sabnzbClass}" data-file-link="${this.escapeHtml(file.link)}" data-file-name="${this.escapeHtml(file.name)}"${isDownloaded ? ' disabled' : ''}>${sabnzbText}</button>`;
                })()
                : '';
            
            html += `
                <div class="file-item ${fileItemClass}">
                    <div class="file-info">
                        <span class="file-name">${this.escapeHtml(file.name)}</span>
                        <div class="file-meta">
                            <span class="exclude-reason">Excluded for: ${this.escapeHtml(matchedKeyword)}</span>
                            <span class="file-size">${file.size || ''}</span>
                            <span class="file-age">${file.timeAgo}</span>
                        </div>
                    </div>
                    <div class="file-actions">
                        <button class="${ignoreBtnClass}" data-file-link="${this.escapeHtml(file.link)}" data-file-name="${this.escapeHtml(file.name)}">${ignoreBtnText}</button>
                        ${sabnzbBtnHtml}
                        <a href="${proxyDownloadUrl}" class="${downloadBtnClass}" data-file-link="${this.escapeHtml(file.link)}" data-file-name="${this.escapeHtml(file.name)}">${downloadBtnText}</a>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Set up event delegation for download buttons in excluded files
        this.setupDownloadEventDelegation(container);
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
