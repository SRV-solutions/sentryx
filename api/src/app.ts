import express, { Request, NextFunction } from 'express';
import { sequelize } from './config/database';

import userRoutes from './routes/userRoutes';
import roleRoutes from './routes/roleRoutes';
import reportRoutes from './routes/reportRoutes'
import chatRoutes from './routes/chatRoutes'
import courseRoutes from './routes/courseRoutes'
import lessonRoutes from './routes/lessonRoutes'
import embeddingRoutes from './routes/embeddingRoutes';
import notificationRoutes from './routes/notificationRoutes'
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

// import limiter from './middlewares/rateLimit';
import { seedDatabase, seedUsers } from './utils/seedDataBase';
import LessonComment from './models/LessonComment';
import Notification from './models/Notification';
import UserNotification from './models/UserNotification';
import Friendship from './models/Friendship';

User.associate();
Role.associate();
Permission.associate();
Chat.associate();
ChatMessage.associate();
Course.associate();
Lesson.associate();
UserCourse.associate();
Module.associate()
LessonComment.associate()
Notification.associate()
UserNotification.associate()
Friendship.associate()

const app = express();

app.use(express.json());
// app.use(limiter)
app.use((req: Request, res: any, next: NextFunction) => {
  const allowedOrigins = ['http://localhost:5174', 'http://localhost:5173', 'https://sentryx.wearesrv.com'];
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.get('/', (_req, res) => {
  res.send('Iam in')
});

app.use('/chats', chatRoutes);
app.use('/users', userRoutes);
app.use('/roles', roleRoutes);
app.use('/reports', reportRoutes)
app.use('/courses', courseRoutes)
app.use('/lessons', lessonRoutes)
app.use('/embedding', embeddingRoutes);
app.use('/notifications', notificationRoutes)
app.use('/friends', friendRoutes)

const forceSync = process.env.FORCE_SYNC === "true";

sequelize.sync({ force: forceSync }).then(() => {
  // if (forceSync) {
  //   seedDatabase()
  //   console.log("Seeder ejecutado con exito");
  // }
  console.log('Database connected and synchronized');
}).catch(err => {
  console.error('Unable to connect to the database:', err);
});

export default app;
