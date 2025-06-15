import bcrypt from 'bcrypt';
import Role from '../models/Role';
import Permission from '../models/Permission';
import RolePermission from '../models/RolePermission';
import User from '../models/User';
import { Action, Entity } from '../models/enums';
import Course from '../models/Course';
import Module from '../models/Module';
import Lesson from '../models/Lesson';
import UserCourse from '../models/UserCourse';

import { PYTHON_COURSE, BACKEND_AVANZADO, INTRODUCCION_BACKEND } from './courses';

const createModulesAndLessons = async (courseId: number, data: any[]) => {
    for (let i = 0; i < data.length; i++) {
        const mod = data[i];
        const newModule = await Module.create({
            courseId,
            title: mod.moduleTitle,
            order: i + 1,
        });

        for (let j = 0; j < mod.lessons.length; j++) {
            const lesson = mod.lessons[j];
            await Lesson.create({
                moduleId: newModule.id,
                title: lesson.title,
                description: '',
                youtubeUrl: lesson.url,
                order: j + 1,
            });
        }
    }
};

export const seedDatabase = async () => {
    try {
        // Roles
        const [adminRole, userRole] = await Promise.all([
            Role.create({ roleName: 'admin', description: 'Administrador con acceso total' }),
            Role.create({ roleName: 'user', description: 'Usuario con permisos limitados' }),
        ]);

        // Permisos
        const permissions = await Promise.all(
            Object.values(Entity).flatMap(entity =>
                Object.values(Action).map(action =>
                    Permission.create({ entity, action })
                )
            )
        );

        // Asignar permisos
        await Promise.all(
            permissions.map(p => RolePermission.create({ roleId: adminRole.id, permissionId: p.id }))
        );

        const userPermissionIds = [2, 6, 10, 14, 18, 21, 22];
        await Promise.all(
            userPermissionIds.map(id =>
                RolePermission.create({ roleId: userRole.id, permissionId: id })
            )
        );

        // Usuario admin
        const hashedPassword = await bcrypt.hash('123456789', 10);
        const newUser = await User.create({
            username: 'MCosta',
            email: 'marcos.costa@wearesrv.com',
            password: hashedPassword,
            roleId: adminRole.id,
            fistName: 'Marcos',
            lastName: 'Costa',
        });

        // Cursos
        const courses = [
            {
                title: 'Python desde Cero',
                description: 'APRENDÉ PYTHON DESDE CERO Y DESBLOQUEÁ UN MUNDO DE POSIBILIDADES',
                thumbnailUrl: 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/LOGOPYTHONGRANDE.png',
                content: PYTHON_COURSE,
            },
            {
                title: 'Fundamentos de Backend',
                description: '¡CONVERTITE EN DESARROLLADOR WEB EN 9 SEMANAS!',
                thumbnailUrl: 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/LOGOFUNDAMENTOSBACKENDGRANDE.png',
                content: INTRODUCCION_BACKEND,
            },
            {
                title: 'Backend Avanzado',
                description: 'Llevá tus habilidades al siguiente nivel: Dominá el Backend Profesional.',
                thumbnailUrl: 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/LOGOBACKENDAVANZADOGRANDE.png',
                content: BACKEND_AVANZADO,
            },
        ];

        for (const courseData of courses) {
            const course = await Course.create({
                title: courseData.title,
                description: courseData.description,
                thumbnailUrl: courseData.thumbnailUrl,
            });

            await UserCourse.create({
                userId: newUser.id,
                courseId: course.id,
                grantedAt: new Date(),
            });

            await createModulesAndLessons(course.id, courseData.content);
        }

        console.log('✅ Seed ejecutado correctamente.');
    } catch (error) {
        console.error('❌ Error en el seed:', error);
    }
};
