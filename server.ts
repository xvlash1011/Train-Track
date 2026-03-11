import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import cors from 'cors';

import { TrainEstimatorService } from './trainEstimator';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Set up databases
const trainsDb = new Database('trains.db');
const configDb = new Database('config.db');

// Initialize tables
trainsDb.exec(`
  CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_station_id INTEGER,
    to_station_id INTEGER,
    total_segments INTEGER,
    path_json TEXT, -- JSON array of [lat, lng] for drawing
    FOREIGN KEY(from_station_id) REFERENCES stations(id),
    FOREIGN KEY(to_station_id) REFERENCES stations(id)
  );

  CREATE TABLE IF NOT EXISTS trains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    current_route_id INTEGER,
    current_segment REAL, -- Float to represent progress between segments
    velocity REAL, -- segments per second
    status TEXT,
    last_updated INTEGER,
    FOREIGN KEY(current_route_id) REFERENCES routes(id)
  );
`);

configDb.exec(`
  CREATE TABLE IF NOT EXISTS server_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO server_config (key, value) VALUES ('external_api_fetch_interval_ms', '60000');
`);

// Seed data if empty
const stationCount = trainsDb.prepare('SELECT COUNT(*) as count FROM stations').get() as { count: number };
if (stationCount.count === 0) {
  const insertStation = trainsDb.prepare('INSERT INTO stations (name, lat, lng) VALUES (?, ?, ?)');
  const hanoiId = insertStation.run('Hà Nội', 21.0245, 105.84117).lastInsertRowid;
  const vinhId = insertStation.run('Vinh', 18.6733, 105.6744).lastInsertRowid;
  const hueId = insertStation.run('Huế', 16.4586, 107.5758).lastInsertRowid;
  const danangId = insertStation.run('Đà Nẵng', 16.0683, 108.2136).lastInsertRowid;
  const saigonId = insertStation.run('Sài Gòn', 10.7803, 106.6778).lastInsertRowid;

  const insertRoute = trainsDb.prepare('INSERT INTO routes (from_station_id, to_station_id, total_segments, path_json) VALUES (?, ?, ?, ?)');
  
  // Simple straight lines for now, in reality this would be a detailed polyline
  const hn_vinh = [[21.0245, 105.84117], [18.6733, 105.6744]];
  const hn_vinh_id = insertRoute.run(hanoiId, vinhId, 100, JSON.stringify(hn_vinh)).lastInsertRowid;

  const vinh_hue = [[18.6733, 105.6744], [16.4586, 107.5758]];
  const vinh_hue_id = insertRoute.run(vinhId, hueId, 150, JSON.stringify(vinh_hue)).lastInsertRowid;

  const hue_danang = [[16.4586, 107.5758], [16.0683, 108.2136]];
  const hue_danang_id = insertRoute.run(hueId, danangId, 50, JSON.stringify(hue_danang)).lastInsertRowid;

  const danang_saigon = [[16.0683, 108.2136], [10.7803, 106.6778]];
  const danang_saigon_id = insertRoute.run(danangId, saigonId, 300, JSON.stringify(danang_saigon)).lastInsertRowid;

  const insertTrain = trainsDb.prepare('INSERT INTO trains (code, current_route_id, current_segment, velocity, status, last_updated) VALUES (?, ?, ?, ?, ?, ?)');
  const now = Date.now();
  insertTrain.run('SE1', hn_vinh_id, 10.5, 0.5, 'running', now); // 0.5 segments per second
  insertTrain.run('SE3', vinh_hue_id, 50.0, 0.6, 'running', now);
  insertTrain.run('SE5', danang_saigon_id, 150.2, 0.4, 'running', now);
}

// Service to estimate train positions
const estimatorService = new TrainEstimatorService(trainsDb);

// Run internal estimation periodically
setInterval(() => {
  estimatorService.tickInternalEstimation();
}, 1000);

// Example of external API fetch simulation
function fetchExternalData() {
  const config = configDb.prepare("SELECT value FROM server_config WHERE key = 'external_api_fetch_interval_ms'").get() as any;
  const interval = config ? parseInt(config.value, 10) : 60000;

  console.log('Fetching external data...');
  
  // 1. Try to fetch from external API (simulated)
  let apiSuccess = false;
  try {
    // In a real app, this would be a fetch() call
    // const response = await fetch('https://api.railway.vn/trains');
    // if (response.ok) { ... apiSuccess = true; }
  } catch (e) {
    console.error('External API fetch failed, falling back to file.');
  }

  // 2. Fallback to sample text file if API fails or for preview
  if (!apiSuccess) {
    estimatorService.processFileData('train_data.txt');
  }

  setTimeout(fetchExternalData, interval);
}
fetchExternalData();

// API Routes
app.get('/api/stations', (req, res) => {
  const stations = trainsDb.prepare('SELECT * FROM stations').all();
  res.json(stations);
});

app.get('/api/routes', (req, res) => {
  const routes = trainsDb.prepare('SELECT * FROM routes').all();
  res.json(routes.map((r: any) => ({ ...r, path_json: JSON.parse(r.path_json) })));
});

app.get('/api/trains', (req, res) => {
  const trains = trainsDb.prepare('SELECT * FROM trains').all();
  res.json(trains);
});

app.get('/api/config', (req, res) => {
  const configs = configDb.prepare('SELECT * FROM server_config').all();
  res.json(configs);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
