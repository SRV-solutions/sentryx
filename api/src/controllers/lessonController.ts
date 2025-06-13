import Lesson from '../models/Lesson';
import UserCourse from '../models/UserCourse';

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
