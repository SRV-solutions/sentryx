import { Request } from 'express';
import Course from '../models/Course';
import UserCourse from '../models/UserCourse';
import Lesson from '../models/Lesson';


export const getAllCourses = async (req: Request, res: any) => {
  try {
    const courses = await Course.findAll();
    if (!courses.length) {
      return res.status(404).json({ message: 'No hay usuarios disponibles' });
    }
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los usuarios', error });
  }
};

export const getCourseCatalog = async (req: Request, res: any) => {
  try {
    const courses = await Course.findAll();
    if (!courses.length) {
      return res.status(404).json({ message: 'No hay cursos disponibles' });
    }
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los cursos', error });
  }
};

export const getMyCourses = async (req: any, res: any) => {
  try {
    
    const userId = req.user.id;

    const assignedCourses = await UserCourse.findAll({
      where: { userId },
      include: [Course],
    });

    if (!assignedCourses.length) {
      return res.status(404).json({ message: 'No tenés cursos asignados' });
    }

    const courses = assignedCourses.map((c) => c.Course);
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener tus cursos', error });
  }
};

export const getMyCourseById = async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId
    const assignedCourse = await UserCourse.findOne({
      where: { userId, courseId },
      include: [{
        model: Course,
        include: [Lesson]
      }],
    });

    if (!assignedCourse) {
      return res.status(404).json({ message: 'No tenés cursos asignados' });
    }

    const courses = assignedCourse.Course
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener tus cursos', error });
  }
};

export const getMyCoursesAndLessonsById = async (req: any, res: any) => {
  
  const userId = (req as any).user.id; // asumimos que isAuth ya setea req.user
  const { courseId, lessonId } = req.params;

  try {
    // Verificar que el usuario esté inscripto al curso
    const userCourse = await UserCourse.findOne({
      where: {
        userId,
        courseId,
      },
    });

    if (!userCourse) {
      return res.status(403).json({ message: 'No estás inscripto a este curso.' });
    }
    
    // Buscar la lección dentro del curso
    const lesson = await Lesson.findOne({
      where: {
        id: lessonId,
        courseId,
      },
    });
    

    if (!lesson) {
      return res.status(404).json({ message: 'Lección no encontrada.' });
    }    
    return res.json(lesson);
  } catch (error) {
    console.error('Error al obtener lección:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
};