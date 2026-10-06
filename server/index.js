import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static frontend
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// API router
app.use('/api', apiRouter);

// Fallback to client/index.html
app.use((req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛡️  AEGIS AI COMPLIANCE REVIEW SYSTEM RUNNING`);
  console.log(`📡 Server listening on http://localhost:${PORT}`);
  console.log(`🔒 Service 1 (PII Privacy Wall): Active`);
  console.log(`🤖 Service 2 (Inspection Agent): Active`);
  console.log(`📊 Service 3 (Absence & Precedents): Active`);
  console.log(`=======================================================`);
});

export default app;
