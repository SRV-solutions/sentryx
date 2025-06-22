import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { isSocketAuth } from './middlewares/auth';

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://sentryx.wearesrv.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

io.use(isSocketAuth);

io.on('connection', (_socket:any) => {});

server.listen(PORT, () => {
  console.log(`Server corriendo en puerto ${PORT}`);
});
