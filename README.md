# Investment Club Website

A modern, professional-grade website for an investment club. The site features a clean Eton Blue-inspired theme, a public-facing portfolio and stock reports area, and an authenticated Admin Panel for managing news, portfolio holdings, and uploading research reports.

## Features
- Responsive UI with accessible components and pleasant typography
- Portfolio page with per-holding values, total value, and pie chart visualization
- Stock Reports page that lists downloadable research reports from backend
- Admin Panel with tabbed navigation: News, Portfolio Editor, Reports Upload
- Admin authentication via token header
- Secure backend for file uploads with validation and metadata (ticker, members, description)

## Tech Stack
- Frontend: React, Vite, Framer Motion, modern CSS
- Backend: Node.js, Express, Multer, Helmet, CORS, Rate Limiting

## Prerequisites
- Node.js 18+ and npm
- macOS, Linux, or Windows environment

## Getting Started

### 1) Clone and install dependencies
```
git clone <your-repo-url>
cd investment-club-site
npm install
```

### 2) Configure environment
Set an admin token for secure operations (verify and uploads). Replace with a strong secret.
```
export ADMIN_TOKEN="change-this-token"
```

### 3) Start backend (Reports server)
From project root:
```
node server.js
```
This launches the reports API at http://localhost:3001.

### 4) Start frontend (Vite dev server)
In another terminal, from project root:
```
npm run dev
```
The site will be available at http://localhost:5173.

## Usage

### Admin Sign-In
- Click the Admin button (bottom-right) and enter your Admin token.
- On success, the Admin Panel with tabs will be available.

### Reports Upload
- Navigate to the Reports tab in the Admin Panel.
- Fill out all fields: Report Name, Stock Ticker, Research Members, Description, and choose a file.
- Uploads appear in the public Stock Reports section automatically.
- As an admin, you can remove reports from the Stock Reports list.

### Portfolio Editor
- Navigate to the Portfolio tab in the Admin Panel.
- Add holdings with Stock Name, Stock Ticker, and Amount.
- The portfolio page automatically calculates total value and weights per holding and renders a pie chart.

## Project Structure
- `src/App.jsx`: Main application, tabs, portfolio, reports UI
- `src/index.css`: Global styles and responsive design
- `server.js`: Express server for health check, admin verification, and report upload/list/download/delete
- `README.md`: Project documentation

## API Endpoints
- `GET /api/health` – server health
- `GET /api/admin/verify` – verify admin token (x-admin-token header)
- `GET /api/reports` – list report metadata
- `GET /api/reports/download/:filename` – download report file
- `POST /api/reports/upload` – upload a report (requires x-admin-token)
- `DELETE /api/reports/:filename` – delete a report (requires x-admin-token)

## Security Notes
- Do not commit or share your actual admin token
- Consider using environment variables and a process manager (PM2) for production
- Validate upload types and size limits (already enforced via Multer)

## Development Notes
- Admin Panel has sticky tabs and scrollable content for better UX
- UI is responsive and accessible with semantic HTML
- Reports list updates automatically after uploads and deletions

## License
MIT (replace with your preferred license as needed)

## API and Data Enhancements

- `GET /api/exchanges` – returns supported exchange codes used by the app with mapping info (code, name, suffix, currency)
- `GET /api/price/:ticker?exchange=CODE` – returns latest price in GBP for the given ticker and optional exchange code; `CASH` returns 1
- `POST /api/holdings/calc` – calculates per-holding GBP prices, values, and weights from an input holdings array; accepts optional `defaultPrice` per holding as fallback when live price is unavailable
- `GET /api/holdings` – reads persisted holdings
- `PUT /api/holdings` – updates persisted holdings (requires x-admin-token); preserves existing `defaultPrice` unless a new numeric value is provided
- `POST /api/holdings/defaults` – populates and writes `defaultPrice` for persisted holdings using real-time GBP prices (requires x-admin-token); sets `CASH` defaultPrice to 1

### Environment Variables
- `ADMIN_TOKEN` – required for admin operations (verify, uploads, holdings updates)
- `FINNHUB_KEY` – used to fetch real-time prices and FX rates; if unavailable, sensible fallbacks are used

### Currency and Formatting
- Prices and values are calculated and displayed in GBP
- London Stock Exchange (GBX) values are converted to GBP (pence to pounds) automatically

### Frontend Admin Defaults Button
- In the Portfolio Editor, an Admin-only button can trigger `POST /api/holdings/defaults` to fetch and persist default prices
- The UI falls back to `defaultPrice` when live prices are not available, ensuring consistent value display
