// Simple icon generator for AgentID extension
// Creates PNG icons from SVG

const fs = require('fs');
const path = require('path');

const SVG_TEMPLATE = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bg)"/>
  <g transform="translate(${size * 0.15}, ${size * 0.15}) scale(${size * 0.029})">
    <path fill="#10b981" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
  </g>
</svg>`;

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG files (browsers can use SVG for icons)
sizes.forEach(size => {
  const svg = SVG_TEMPLATE(size);
  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Generated ${filename}`);
});

// Create a simple PNG placeholder message
console.log('\nNote: For production, convert SVGs to PNGs using a tool like:');
console.log('  - sharp (npm install sharp)');
console.log('  - imagemagick (convert icon.svg icon.png)');
console.log('  - online converter');
console.log('\nFor testing, some browsers accept SVG icons.');
