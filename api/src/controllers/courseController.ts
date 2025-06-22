import { Request } from 'express';
import Course from '../models/Course';
import UserCourse from '../models/UserCourse';
import Lesson from '../models/Lesson';
import Module from '../models/Module';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

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
        include: [{
          model: Module,
          include: [Lesson]
        }]
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
  const userId = (req as any).user.id;
  const { courseId, lessonId, moduleId } = req.params;

  try {
    // Verificar inscripción al curso
    const userCourse = await UserCourse.findOne({
      where: { userId, courseId },
    });

    if (!userCourse) {
      return res.status(403).json({ message: 'No estás inscripto a este curso.' });
    }

    // Buscar la lección
    const lesson = await Lesson.findOne({
      where: { id: lessonId, moduleId },
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lección no encontrada.' });
    }

    // Generar URL firmada si videoPath existe
    let signedVideoUrl = null;
    if (lesson.youtubeUrl) {
      const command = new GetObjectCommand({
        Bucket: process.env.S3_VIDEO_BUCKET_NAME!,
        Key: lesson.youtubeUrl,
      });

      signedVideoUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hora de validez
    }

    return res.json({
      ...lesson.toJSON(),
      videoUrl: signedVideoUrl,
    });
  } catch (error) {
    console.error('Error al obtener lección:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
};
