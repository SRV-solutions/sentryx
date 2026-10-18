import Lesson from '../models/Lesson';
import UserCourse from '../models/UserCourse';
import LessonComment from '../models/LessonComment';
import User from '../models/User';
import { sequelize } from '../config/database';
import UserLessonProgress from '../models/UserLessonProgress';
import Module from '../models/Module';
import { presignUpload } from '../config/s3';
import { env } from '../config/env';



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
    res.status(500).json({ message: 'Error del servidor' });
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

    // Lesson no tiene courseId: se filtra a través del módulo (antes esta consulta fallaba siempre).
    const lessons = await Lesson.findAll({
      include: [{ model: Module, where: { courseId }, attributes: [] }],
      order: [['order', 'ASC']],
    });

    res.json(lessons);
  } catch (error) {
    console.error('Error al obtener las lecciones', error);
    res.status(500).json({ message: 'Error del servidor' });
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
    res.status(500).json({ message: 'Error al actualizar la clase' });
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


/**
 * Devuelve una URL firmada para que el admin suba el video DIRECTO a S3 y guarda la clave en la lección.
 * Antes el video completo (hasta 1 GB) pasaba por la memoria del servidor: dos subidas simultáneas lo tiraban.
 */
export const presignLessonVideo = async (req: any, res: any) => {
  const lesson = await Lesson.findByPk(req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Lección no encontrada' });
  const { fileName, contentType } = req.body ?? {};
  if (typeof fileName !== 'string' || typeof contentType !== 'string' || !contentType.startsWith('video/')) {
    return res.status(400).json({ error: 'Solo se permiten archivos de video' });
  }
  if (!env.videoBucket) return res.status(500).json({ error: 'Bucket de videos no configurado' });
  const { key, url } = await presignUpload({ bucket: env.videoBucket, prefix: `lessons/${lesson.id}`, fileName, contentType });
  res.json({ key, uploadUrl: url });
};

/** Confirma la subida: asocia la clave S3 a la lección. */
export const confirmLessonVideo = async (req: any, res: any) => {
  const lesson = await Lesson.findByPk(req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Lección no encontrada' });
  const { key } = req.body ?? {};
  if (typeof key !== 'string' || !key.startsWith(`lessons/${lesson.id}/`)) return res.status(400).json({ error: 'Clave inválida' });
  lesson.youtubeUrl = key;
  await lesson.save();
  res.json({ message: 'Video subido con éxito', key });
};
