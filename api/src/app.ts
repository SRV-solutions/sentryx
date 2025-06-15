import express, { Request, NextFunction } from 'express';
import { sequelize } from './config/database';

import userRoutes from './routes/userRoutes';
import roleRoutes from './routes/roleRoutes';
import reportRoutes from './routes/reportRoute'
import chatRoutes from './routes/chatRoutes'
import courseRoutes from './routes/courseRoutes'
import lessonRotes from './routes/lessonRoutes'
import friendRoutes from './routes/friendRoutes'

import Role from './models/Role';
import User from './models/User';
import Permission from './models/Permission';
import Chat from './models/Chat';
import ChatMessage from './models/ChatMessage';
import Course from './models/Course';
import Lesson from './models/Lesson';
import UserCourse from './models/UserCourse';
import Module from './models/Module';

import limiter from './middlewares/rateLimit';
import { seedDatabase } from './utils/seedDataBase';

User.associate();
Role.associate();
Permission.associate();
Chat.associate();
ChatMessage.associate();
Course.associate();
Lesson.associate();
UserCourse.associate();
Module.associate()

const app = express();

app.use(express.json());
app.use(limiter)
app.use((req: Request, res: any, next: NextFunction) => {
  const allowedOrigins = ['http://localhost:5173', 'https://sentryx.wearesrv.com'];
  const origin: any = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.get('/hola', (_req, res) => {
  res.send('Iam in')
});

app.use('/chats', chatRoutes);
app.use('/users', userRoutes);
app.use('/roles', roleRoutes);
app.use('/reports', reportRoutes)
app.use('/courses', courseRoutes)
app.use('/lessons', lessonRotes)
// app.use('/friends', friendRoutes)


const forceSync = true

sequelize.sync({ force: forceSync }).then(() => {
  if (forceSync) {
    seedDatabase()
    console.log("Seeder ejecutado con exito");

  }
  console.log('Database connected and synchronized');
}).catch(err => {
  console.error('Unable to connect to the database:', err);
});

export default app;
