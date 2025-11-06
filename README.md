# RSS File Parser

A web-based application that parses RSS feed content and organizes files by brand in a collapsible format. Perfect for organizing large lists of files from RSS feeds, especially when dealing with multiple versions of the same content in different resolutions.

## Features

- **Brand-based Organization**: Automatically groups files by their brand name (extracted from the beginning of filenames)
- **Collapsible Interface**: Click on brand headers to expand/collapse file lists
- **File Details**: Displays file size, category, and post date for each file
- **Interactive Actions**: View files on the source website or copy filenames to clipboard
- **Responsive Design**: Works on desktop and mobile devices
- **Sample Data**: Includes sample data for testing the application

## How to Use

### Option 1: Direct RSS Fetching (Recommended)
1. **Start the server**: Run `npm install && npm start` in the project directory
2. **Open the application**: Go to `http://localhost:3000` in your browser
3. **Enter RSS URL**: Paste your RSS feed URL in the URL field
4. **Fetch and Parse**: Click "Fetch RSS Feed" to automatically download and parse the content
5. **Browse Results**: View files organized by brand, with collapsible sections

### Option 2: Manual Copy/Paste
1. **Open the Application**: Simply open `index.html` in your web browser
2. **Get RSS Content**: Open your RSS feed URL in a browser tab and copy all the content
3. **Paste RSS Content**: Paste the content into the text area
4. **Parse the Data**: Click "Parse Content" to process the content
5. **Browse Results**: View files organized by brand, with collapsible sections

### Interacting with Files
- **View Files**: Click "View" to open files on the source website
- **Copy Names**: Click "Copy Name" to copy filenames to clipboard
- **Expand/Collapse**: Click on brand headers to expand or collapse file lists

## Supported RSS Formats

The application is designed to work with RSS feeds that contain file information in the following format:
- File URLs containing `https://nzbgeek.info/geekseek.php?guid=`
- File metadata including size, category, and post date
- Filenames that follow the pattern: `Brand.Name.Resolution.XXX`

## File Structure

```
rss_parser/
├── index.html      # Main application page
├── styles.css      # CSS styles for the interface
├── script.js       # JavaScript functionality
├── server.js       # Node.js proxy server for RSS fetching
├── package.json    # Node.js dependencies
└── README.md       # This file
```

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Local Development

### With Server (Recommended for RSS Fetching)
1. Install Node.js dependencies: `npm install`
2. Start the server: `npm start`
3. Open `http://localhost:3000` in your browser
4. Use the "Fetch RSS Feed" feature to directly download RSS content

### Without Server (Manual Copy/Paste)
1. Download or clone the files to your local machine
2. Open `index.html` in your web browser
3. Copy RSS content manually and paste into the text area

## Sample Data

The application includes a "Load Sample" button that populates the text area with sample RSS content to demonstrate the functionality.

## Customization

You can customize the application by modifying:
- `styles.css` for visual appearance
- `script.js` for parsing logic and functionality
- `index.html` for the user interface structure

## Privacy

This application runs entirely in your browser and does not send any data to external servers. All processing happens locally on your device.
