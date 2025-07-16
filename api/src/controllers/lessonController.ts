import Lesson from '../models/Lesson';
import UserCourse from '../models/UserCourse';
import LessonComment from '../models/LessonComment';
import User from '../models/User';
import { sequelize } from '../config/database';

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
      return res.status(403).json({ message: 'No estás inscripto en este curso' });
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