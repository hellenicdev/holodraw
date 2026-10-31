# HoloDraw
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S6S31XB030)

> **Real-Time Collaborative Whiteboard Platform** — A multiplayer whiteboard app that feels like Miro meets Excalidraw, built with vanilla frontend tech and a real-time Node.js backend.

![HoloDraw Screenshot](https://via.placeholder.com/800x450/0a0a1a/6366f1?text=HoloDraw+Whiteboard)

## Features

### Core Whiteboard
- **Drawing Tools** — Pencil, Rectangle, Circle, Eraser with configurable stroke width
- **Infinite Canvas** — Pan and zoom infinitely with smooth rendering
- **Real-Time Collaboration** — Multiple users draw together with live cursor tracking
- **Undo/Redo** — Full history with keyboard shortcuts (Ctrl+Z / Ctrl+Y)
- **Sticky Notes** — Add, drag, edit, and delete digital sticky notes
- **Layer Management** — Create, toggle visibility, and organize layers
- **Minimap** — Navigate large boards with an overview minimap

### Collaboration
- **Room System** — Share room codes to collaborate in isolated sessions
- **Live Cursors** — See other users' cursors in real-time with name labels
- **Presence Indicators** — Online user list with color-coded avatars
- **Auto-Save** — Board state saves automatically to the database

### Export & Sharing
- **Export PNG** — Download the board as a high-resolution PNG image
- **Export SVG** — Vector export for use in design tools
- **Export PDF** — Print-ready PDF export
- **Share Link** — Copy shareable room links

### User Experience
- **Glassmorphism UI** — Modern, dark-themed interface with glass effects
- **Keyboard Shortcuts** — P, R, C, E, V, Space for quick tool switching
- **Smooth Animations** — Fluid transitions and hover effects
- **Responsive** — Works on desktop and tablet

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5 Canvas, CSS3 (Glassmorphism), Vanilla JS (ES Modules) |
| **Backend** | Node.js, Express |
| **Real-Time** | Socket.IO (WebSocket + fallback) |
| **Database** | MongoDB with Mongoose ODM |
| **Auth** | JWT (JSON Web Tokens) + bcrypt |
| **Deployment** | Render (backend), GitHub Pages (frontend) |

## Architecture

```
┌─────────────────────┐        ┌──────────────────────┐        ┌──────────┐
│   Client (Browser)  │ ◄───► │   Server (Node.js)    │ ◄───► │ MongoDB  │
│                     │  WS   │                       │        │          │
│  ┌───────────────┐  │       │  ┌─────────────────┐  │        └──────────┘
│  │ Canvas Engine │  │       │  │ Socket.IO       │  │
│  │ - Drawing     │  │       │  │ - Room Mgmt     │  │
│  │ - Shapes      │  │       │  │ - Broadcast     │  │
│  │ - Undo/Redo   │  │       │  │ - Sync State    │  │
│  └───────────────┘  │       │  └─────────────────┘  │
│                     │ HTTP  │  ┌─────────────────┐  │
│  ┌───────────────┐  │ ◄───► │  │ REST API        │  │
│  │ Auth Module   │  │       │  │ - Auth          │  │
│  │ Sidebar UI    │  │       │  │ - Boards CRUD   │  │
│  │ Minimap       │  │       │  │ - History       │  │
│  └───────────────┘  │       │  └─────────────────┘  │
└─────────────────────┘        └──────────────────────┘
```

## Installation

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Clone and Setup

```bash
git clone https://github.com/hellenicdev/holodraw.git
cd holodraw

# Install server dependencies
cd server && npm install && cd ..

# Configure environment
cp server/.env server/.env.local
# Edit .env.local with your MongoDB URI and JWT secret
```

### Run in Development

```bash
# Start MongoDB (if local)
mongod

# Start the server (with auto-reload)
cd server && npm run dev
```

The server runs on `http://localhost:5000` and serves the client at the root URL.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port. The process listens on `0.0.0.0` |
| `NODE_ENV` | | Set to `production` so auth cookies are `Secure`, `SameSite=None`, and `Partitioned` |
| `MONGO_URI` | `mongodb://localhost:27017/holodraw` | MongoDB connection string |
| `JWT_SECRET` | *(required)* | Secret key for signing 15-minute access tokens |
| `ALLOWED_ORIGINS` | `https://hellenicdev.eu` | Comma-separated browser origins allowed by CORS. Add `http://localhost:5000` for local development |

Access tokens are httpOnly cookies that expire after 15 minutes. Refresh tokens are separate httpOnly cookies, stored hashed in the database, and expire after 7 days. `POST /api/auth/refresh` rotates them and `POST /api/auth/logout` revokes the current one. Browsers must call the API with credentials included.

Room ids are 128-bit hex strings. A signed-in user who knows a room id can join it and is added as a collaborator. Saving a board requires the user to be the creator or a collaborator. Existing short room codes no longer work.

## Usage

1. Open the app — you'll see the auth screen
2. Sign up or log in. Guest mode can open the UI, but creating or joining a board requires an account
3. Create a new board or join one with its 32-character room id
4. Share the room id with collaborators. Anyone signed in who has the id is added as a collaborator
5. Start drawing in real-time together!

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `P` | Pencil tool |
| `R` | Rectangle tool |
| `C` | Circle tool |
| `E` | Eraser |
| `V` | Select tool |
| `S` | Sticky note |
| `Space` | Pan mode |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` | Remove selected sticky note |

## Deployment

### Backend (Render)

1. Push the repository to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Create a **New Web Service** and connect your GitHub repo
4. Set:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add environment variables (`MONGO_URI`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `NODE_ENV=production`)
6. Deploy!

### Frontend (GitHub Pages)

1. Update the `SERVER_URL` in `client/app.js` to your Render URL
2. Enable GitHub Pages on the `main` branch, `/client` folder

## Project Structure

```
holodraw/
├── client/                  # Frontend
│   ├── index.html          # Main HTML with all UI
│   ├── style.css           # Glassmorphism dark theme
│   ├── app.js              # Main application entry
│   └── components/
│       ├── canvas.js       # Canvas rendering engine
│       ├── toolbar.js      # Toolbar & keyboard shortcuts
│       ├── sidebar.js      # Users, layers, export
│       ├── auth.js         # Authentication & modals
│       └── minimap.js      # Navigation minimap
├── server/                  # Backend
│   ├── server.js           # Express + Socket.IO server
│   ├── config/db.js        # MongoDB connection
│   ├── models/             # Mongoose schemas
│   │   ├── User.js
│   │   ├── Board.js
│   │   └── BoardHistory.js
│   ├── routes/             # REST API routes
│   │   ├── auth.js
│   │   └── boards.js
│   ├── controllers/        # Route handlers
│   │   ├── authController.js
│   │   └── boardController.js
│   ├── sockets/            # WebSocket handlers
│   │   └── whiteboard.js
│   └── middleware/         # Auth middleware
│       └── auth.js
├── package.json            # Root package
└── README.md
```

## License

MIT © [HellenicDev](https://github.com/hellenicdev)
