import { Request } from 'express';
import Course from '../models/Course';
import UserCourse from '../models/UserCourse';
import Lesson from '../models/Lesson';
import Module from '../models/Module';
import UserLessonProgress from '../models/UserLessonProgress';
import { presignDownload } from '../config/s3';
import { env } from '../config/env';

// POST /courses/:id/enroll
export const enrollToCourse = async (req: any, res: any) => {
  const userId = req.user.id; // Asegurate de usar un middleware auth
  const { courseId } = req.params;

  try {
    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ message: 'Curso no encontrado' });

    if (course.price > 0) {
      return res.status(400).json({ message: 'Este curso requiere pago para ser asignado' });
    }

    // Ya tiene el curso?
    const already = await UserCourse.findOne({ where: { userId, courseId } });
    if (already) return res.status(400).json({ message: 'Ya estás inscripto en este curso' });

    const userCourse = await UserCourse.create({
      userId,
      courseId,
      grantedAt: new Date(),
    });

    return res.status(201).json({ message: 'Inscripción exitosa', userCourse });
  } catch (error) {
    return res.status(500).json({ message: 'Error al inscribirse' });
  }
};


export const createCourse = async (req: any, res: any) => {
  try {
    const { title, description, thumbnailUrl, price } = req.body;

    // Validaciones básicas
    if (!title || !description) {
      return res.status(400).json({ message: 'Título y descripción son obligatorios.' });
    }

    const newCourse = await Course.create({
      title,
      description,
      price,
      thumbnailUrl: thumbnailUrl || null,
    });

    res.status(201).json(newCourse);
  } catch (error) {
    console.error('Error al crear el curso:', error);
    res.status(500).json({ message: 'Error al crear el curso' });
  }
};

export const getAllCourses = async (req: Request, res: any) => {
  try {
    const courses = await Course.findAll({
      include: [Module]
    });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los cursos' });
  }
};

export const getCourseCatalog = async (req: Request, res: any) => {
  try {
    const courses = await Course.findAll();
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los cursos' });
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
      return res.status(404).json({ message: 'Aun no tenés cursos asignados' });
    }

    const courses = assignedCourses.map((c) => {
      return {
        id: c.Course.id,
        title: c.Course.title,
        description: c.Course.description,
        thumbnailUrl: c.Course.thumbnailUrl,
        grantedAt: c.grantedAt
      }

    });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener tus cursos' });
  }
};

export const getMyCourseById = async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;

    const assignedCourse = await UserCourse.findOne({
      where: { userId, courseId },
      include: [{
        model: Course,
        include: [{
          model: Module,
          include: [{
            model: Lesson,
            include: [
              {
                model: UserLessonProgress,
                where: { userId },
                required: false,
              },
            ],
          }],
        }],
      }],
      order: [
        [Course, Module, 'order', 'ASC'],  // Ordenar módulos por el campo "order"
        [Course, Module, Lesson, 'order', 'ASC'] // Si también querés ordenar las lecciones por un campo "order"
      ]
    });

    if (!assignedCourse) {
      return res.status(404).json({ message: 'No tenés cursos asignados' });
    }

    res.json(assignedCourse.Course);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener tus cursos' });
  }
};


export const getMyCoursesAndLessonsById = async (req: any, res: any) => {
  const userId = req.user.id;
  const { courseId, lessonId, moduleId } = req.params;

  try {
    // Verificar inscripción al curso
    const userCourse = await UserCourse.findOne({
      where: { userId, courseId },
    });

    if (!userCourse) {
      return res.status(400).json({ message: 'No estás inscripto a este curso.' });
    }

    // Buscar la lección con progreso del usuario
    const lesson = await Lesson.findOne({
      where: { id: lessonId, moduleId },
      include: [
        {
          model: UserLessonProgress,
          where: { userId },
          required: false,
        },
      ],
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lección no encontrada.' });
    }

    // Extraer progreso (viene como array o objeto)
    const progress = lesson.UserLessonProgress?.[0] || null;

    // youtubeUrl guarda un link de YouTube o la clave del video en S3 (subido desde el admin).
    const isExternal = /^https?:\/\//.test(lesson.youtubeUrl);
    const youtubeId = isExternal ? extractYoutubeId(lesson.youtubeUrl) : null;
    const videoUrl = youtubeId
      ? `https://www.youtube.com/embed/${youtubeId}`
      : isExternal
        ? lesson.youtubeUrl
        : env.videoBucket
          ? await presignDownload(env.videoBucket, lesson.youtubeUrl, 4 * 3600)
          : null;

    return res.json({
      ...lesson.toJSON(),
      progress: progress ? {
        watchedDuration: progress.watchedDuration,
        completed: progress.completed,
        updatedAt: progress.updatedAt,
      } : null,
      videoUrl,
    });
  } catch (error) {
    console.error('Error al obtener lección:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

// Función para extraer el ID de un link Youtube
function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/);
  return match ? match[1] : null;
}

export const getCourseById = async (req: Request, res: any) => {
  try {
    const { id } = req.params
    const course = await Course.findByPk(id, {
      include: [{
        model: Module,
        include: [Lesson]
      }]
    });
    if (!course) {
      return res.status(404).json({ message: 'Curso no encontrado' });
    }
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los cursos' });
  }
};

export const updateCourse = async (req: Request, res: any) => {
  try {
    const { id } = req.params;
    const { title, description, thumbnailUrl, price } = req.body;

    const course = await Course.findByPk(id);
    if (!course) {
      return res.status(404).json({ message: 'Curso no encontrado' });
    }

    course.title = title ?? course.title;
    course.description = description ?? course.description;
    course.thumbnailUrl = thumbnailUrl ?? course.thumbnailUrl;
    course.price = price ?? course.price;

    await course.save();

    res.json({ message: 'Curso actualizado correctamente', course });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el curso' });
  }
};

export const getCourseCatalogueById = async (req: Request, res: any) => {
  try {
    const { id } = req.params
    const course = await Course.findByPk(id, {
      include: [{
        model: Module,
        include: [{
          model: Lesson,
          attributes: ['title', 'description']
        }]
      }]
    });
    if (!course) {
      return res.status(404).json({ message: 'Curso no encontrado' });
    }
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los cursos' });
  }
};