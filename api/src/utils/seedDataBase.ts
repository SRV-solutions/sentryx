import bcrypt from 'bcrypt';
import Role from '../models/Role';
import Permission from '../models/Permission';
import RolePermission from '../models/RolePermission';
import User from '../models/User';
import { Action, Entity } from '../models/enums'; // Asegurate de tener esto
import Course from '../models/Course';
import Module from '../models/Module';
import Lesson from '../models/Lesson';
import UserCourse from '../models/UserCourse';

export const seedDatabase = async () => {
    try {

        const [adminRole, userRole] = await Promise.all([
            Role.create({ roleName: 'admin', description: 'Administrador con acceso total' }),
            Role.create({ roleName: 'user', description: 'Usuario con permisos limitados' }),
        ]);

        const entities = Object.values(Entity);
        const actions = Object.values(Action);

        const permissions = await Promise.all(
            entities.flatMap(entity =>
                actions.map(action =>
                    Permission.create({ entity, action })
                )
            )
        );

        await Promise.all(
            permissions.map(permission =>
                RolePermission.create({
                    roleId: adminRole.id,
                    permissionId: permission.id,
                })
            )
        );

        const userPermissionIds = [2, 6, 10, 14, 18, 21, 22];

        await Promise.all(
            userPermissionIds.map(id =>
                RolePermission.create({
                    roleId: userRole.id,
                    permissionId: id,
                })
            )
        );

        const hashedPassword = await bcrypt.hash('123456789', 10);

        const newUser = await User.create({
            username: 'MCosta',
            email: 'marcos.costa@wearesrv.com',
            password: hashedPassword,
            roleId: adminRole.id,
            fistName: 'Marcos',
            lastName: 'Costa',
        });

        const course = await Course.create({
            title: 'Curso Básico de Python',
            description: `Hola.`,
            thumbnailUrl: 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/imagotipo.png',
        });

        const module = await Module.create({
            courseId: course.id,
            title: '1- INTRODUCCION',
            order: 1,
        });

        await Lesson.create({
            //courseId: course.id, // ya no es necesario si usás módulo
            moduleId: module.id,
            title: '1 Introducción al Curso',
            description: `Hola`,
            youtubeUrl: 'https://youtu.be/5Qtied7NNTo',
            order: 1,
        });

        await UserCourse.create({
            userId: newUser.id,
            courseId: course.id,
            grantedAt: new Date(),  // o podés omitirlo si querés que use el default (NOW)
        });

        console.log('✅ Seed ejecutado correctamente.');
    } catch (error) {
        console.error('❌ Error en el seed:', error);
    }
};
