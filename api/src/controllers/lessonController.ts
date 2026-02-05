import Lesson from '../models/Lesson';
import UserCourse from '../models/UserCourse';
import LessonComment from '../models/LessonComment';
import User from '../models/User';
import { sequelize } from '../config/database';
import UserLessonProgress from '../models/UserLessonProgress';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";



export const saveLessonProgress = async (req: any, res: any) => {
  const userId = req.user.id;
  const lessonId = Number(req.params.lessonId); // mejor que videoId, coincide con modelo
  const { watchedDuration, completed } = req.body;

  try {
    const [progress, created] = await UserLessonProgress.findOrCreate({
      where: { userId, lessonId },
      defaults: {
        watchedDuration,
        completed: !!completed,
      },
    });

    if (!created) {
      if (watchedDuration !== undefined) progress.watchedDuration = watchedDuration;
      if (completed !== undefined) progress.completed = progress.completed ? true : completed;
      await progress.save();
    }

    res.status(200).json(progress);
  } catch (error) {
    console.error('Error al guardar progreso:', error);
    res.status(500).json({ message: 'Error del servidor', error });
  }
};

export const getCourseLessons = async (req: any, res: any) => {
  const userId = req.user.id; // asumimos que lo setea el middleware auth
  const courseId = Number(req.params.id);

  try {
    // Verificamos que el usuario esté inscripto
    const userCourse = await UserCourse.findOne({
      where: {
        userId,
        courseId,
      },
    });

    if (!userCourse) {
      return res.status(400).json({ message: 'No estás inscripto en este curso' });
    }

    // Buscamos las lecciones del curso
    const lessons = await Lesson.findAll({
      where: { courseId },
      order: [['order', 'ASC']],
    });

    res.json(lessons);
  } catch (error) {
    console.error('Error al obtener las lecciones', error);
    res.status(500).json({ message: 'Error del servidor', error });
  }
};

export const getCommentsByLesson = async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const comments = await LessonComment.findAll({
      where: { lessonId: id },
      include: [{ model: User, attributes: ['id', 'username', 'firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']],
    });

    // Podrías calcular promedio acá y devolverlo también
    const avgRating: any = await LessonComment
      .findOne({
        attributes: [[sequelize.fn('AVG', sequelize.col('rating')), 'avgRating']],
        where: { lessonId: id },
        raw: true,
      });

    res.json({ comments, avgRating: parseFloat(avgRating?.avgRating || 0).toFixed(2) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const postCommentToLesson = async (req: any, res: any) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { comment, rating } = req.body;

  if (!comment || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Comentario o rating inválidos' });
  }

  try {

    const newComment = await LessonComment.create({ lessonId: id, userId, comment, rating });
    res.status(201).json(newComment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const updateLesson = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { title, description, youtubeUrl, order } = req.body;

    const lesson = await Lesson.findByPk(id);
    if (!lesson) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }

    lesson.title = title ?? lesson.title;
    lesson.description = description ?? lesson.description;
    lesson.youtubeUrl = youtubeUrl ?? lesson.youtubeUrl;
    lesson.order = order ?? lesson.order;

    await lesson.save();

    res.json({ message: 'Clase actualizada', lesson });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar la clase', error });
  }
};

export const createLesson = async (req: any, res: any) => {
  try {
    const { title, description, youtubeUrl, order, moduleId } = req.body;

    if (!title || !description || !youtubeUrl || !moduleId || typeof order !== 'number') {
      return res.status(400).json({ message: 'Datos incompletos' });
    }

    const newLesson = await Lesson.create({
      title,
      description,
      youtubeUrl,
      order,
      moduleId,
    });

    res.status(201).json(newLesson);
  } catch (err) {
    console.error('Error al crear clase:', err);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


export const uploadLessonVideo = async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se envió ningún archivo' });
    }
    const lessonId = req.params.lessonId;
    const lesson = await Lesson.findByPk(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: 'Lección no encontrada' });
    }
    // Sacar extensión del archivo original
    const ext = path.extname(req.file.originalname);

    // Sanear título: quitar espacios y caracteres especiales
    const sanitizedTitle = lesson.title.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");

    // Crear nombre de archivo: id-title.ext
    const key = `${lesson.id}-${sanitizedTitle}${ext}`;

    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const command = new PutObjectCommand({
      Bucket: process.env.S3_VIDEO_BUCKET_NAME!,
      Key: key,
      Body: req.file.buffer, // <-- PASAR EL BUFFER, no el stream
      ContentType: "video/mp4", // Ajusta si no es mp4
    });

    await s3Client.send(command);
    lesson.youtubeUrl = `${key}`;
    await lesson.save();
    res.json({
      message: 'Video subido con éxito',
      key,
    });
  } catch (error) {
    console.error('Error subiendo video a S3:', error);
    res.status(500).json({ error: 'Error subiendo video a S3' });
  }
}

