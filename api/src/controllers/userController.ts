import { Request } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto'
import jwt from 'jsonwebtoken';
import Role from '../models/Role';
import User from '../models/User';
import Permission from '../models/Permission';
import UserCourse from '../models/UserCourse';
import Course from '../models/Course';
import { generateRandomPassword } from '../utils/users'
import { transporter } from '../config/mailer'
import PasswordResetToken from '../models/PasswordResetToken';
import { Op } from 'sequelize'; // Importante para búsquedas flexibles

import UserNotification from '../models/UserNotification';
import Notification from '../models/Notification';
// Clave secreta para JWT (colócala en un archivo .env)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
interface ValidationErrors {
  newEmail?: string;
  newUsername?: string;
}

export const getAllUsers = async (req: Request, res: any) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const search = (req.query.search as string)?.toLowerCase() || "";

    const whereCondition = search
      ? {
          [Op.or]: [
            { firstName: { [Op.iLike]: `%${search}%` } },
            { lastName: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } },
            { username: { [Op.iLike]: `%${search}%` } },
          ],
        }
      : {};

    const { count, rows: users } = await User.findAndCountAll({
      where: whereCondition,
      include: [Role],
      attributes: ["id", "username", "email", "roleId", "firstName", "lastName"],
      limit,
      offset,
      order: [["id", "ASC"]],
    });

    if (!users.length) {
      return res.status(404).json({ message: "No hay usuarios disponibles" });
    }

    const totalPages = Math.ceil(count / limit);

    return res.json({
      data: users,
      pagination: {
        totalItems: count,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ message: "Error al obtener los usuarios", error });
  }
};


export const getPublicUser = async (req: Request, res: any) => {
  const { id } = req.params;
  try {
    const user = await User.findByPk(id, {
      attributes: ['id', 'firstName', 'lastName', 'username', 'biography', 'avatar', 'email', 'phone'],
    });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el usuario', error });
  }
};

export const getUser = async (req: Request, res: any) => {
  const { id } = req.params;
  try {
    const user = await User.findByPk(id, {
      include: [{
        model: Role,
        include: [Permission]
      }]
    });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el usuario', error });
  }
};

export const createUser = async (req: Request, res: any) => {
  const { username, firstName, lastName, email, password, roleId } = req.body;

  try {
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }

    const userPassword = password || generateRandomPassword();

    const hashedPassword = await bcrypt.hash(userPassword, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      roleId,
      firstName,
      lastName,
    });

    const cuerpo = `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; font-family: Arial, sans-serif;">
    <tr>
      <td align="center" style="padding: 30px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; border-radius: 10px; box-shadow: 0 0 20px rgba(0, 255, 247, 0.1); color: #FFFFFF;">
          <tr>
            <td style="padding: 40px; text-align: center;">
              <h2 style="color: #00FFF7; margin-bottom: 10px;">¡Hola ${firstName}!</h2>
              <p style="color: #CCCCCC; font-size: 16px; margin-top: 0;">Tu usuario ha sido creado exitosamente.</p>
              
              <p style="font-size: 16px; color: #CCCCCC; margin-top: 30px;">
                Podés acceder a la plataforma en:<br>
                <a href="https://sentryx.wearesrv.com" style="color: #00FFF7; text-decoration: none;">https://sentryx.wearesrv.com</a>
              </p>
              <div style="margin: 30px 0; padding: 20px; border: 1px solid #333333; border-radius: 8px;">
                <p style="color: #FFFFFF; font-size: 16px; margin: 0;">Usuario: <b>${email}</b></p>
                <p style="color: #FFFFFF; font-size: 16px; margin: 0;">Contraseña temporal: <b>${userPassword}</b></p>
              </div>
              <p style="color: #FF6B6B; font-size: 14px; margin-top: 0;"><i>Por favor, cambiala apenas ingreses.</i></p>
              <p style="color: #CCCCCC; margin-top: 40px;">Saludos,<br><b style="color: #00FFF7;">Equipo weareSRV</b></p>
            </td>
          </tr>
        </table>
        <img src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png" alt="weareSRV Logo" width="150" style="margin-bottom: 20px;" />
      </td>
    </tr>
  </table>
`;

    await transporter.sendMail({
      from: `"weareSRV" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Tu acceso a Sentryx',
      html: cuerpo,
    });


    res.status(201).json({ message: 'Usuario creado y correo enviado.', user: { id: user.id, email: user.email, firstName, lastName, roleId } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear el usuario', error });
  }
};

export const register = async (req: Request, res: any) => {
  const { username, email, password, roleId } = req.body;
  try {
    // Validar si el email ya está registrado
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'El email ya está registrado' });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      roleId,
    });

    res.status(201).json({ message: 'Usuario registrado correctamente', user });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar el usuario', error });
  }
};

export const login = async (req: Request, res: any) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({
      where: { email },
      include: [{
        model: Role,
        include: [Permission]
      }, {
        model: UserCourse,
        include: [Course]
      }]
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Login exitoso',
      token,
      userData: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        biography: user.biography,
        avatar: user.avatar,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        roleName: user.Role?.roleName,
        courses: user?.UserCourses,
        permissions: user.Role?.Permissions?.map(p => ({
          entity: p.entity,
          action: p.action
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesión', error });
  }
};

export const getMyOwnUser = async (req: any, res: any) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado. Usuario no autenticado.' });
    }

    const user = await User.findByPk(req.user.id, {
      include: [
        { model: Role, include: [Permission] }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    res.status(200).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.Role
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener la información del perfil.',
      error: error instanceof Error ? error.message : error
    });
  }
};

export const updateUser = async (req: any, res: any) => {
  const errors: ValidationErrors = {};  // Tipo explícito para los errores

  try {
    const { id } = req.params;
    const { email, username, roleId, password, firstName, lastName } = req.body;

    if (!id) {
      return res.status(404).json({ message: 'Id invalido' });
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ message: 'User invalido' });
    }

    // Validación para el email
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      errors.newEmail = 'Email inválido';  // Guarda el error para el email
    }

    // Validación para el nombre de usuario
    if (username && !/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.newUsername = 'El nombre de usuario solo puede contener letras, números, guiones y guiones bajos';  // Guarda el error para el nombre de usuario
    }

    // Si hay errores, devuelve el objeto con los errores
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    // Si no hay errores, actualiza el usuario
    user.username = username ? username : user.username;
    user.firstName = firstName ? firstName : user.firstName;
    user.lastName = lastName ? lastName : user.lastName;
    user.email = email ? email : user.email;
    user.password = password ? await bcrypt.hash(password, 10) : user.password;
    user.roleId = roleId ? roleId : user.roleId;

    // Buscar el usuario actualizado e incluir su rol
    await user.save(); // Esperar a que se guarde antes de buscarlo nuevamente
    const updatedUser = await User.findByPk(id, { include: Role });

    res.status(200).json(updatedUser);

  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el usuario' });
  }
};

export const updateMyOwnUser = async (req: any, res: any) => {
  const errors: ValidationErrors = {};  // Tipo explícito para los errores
  try {
    const { firstName, lastName, email, username, roleId, password, biography, phone, avatar } = req.body;
    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado. Usuario no autenticado.' });
    }

    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User invalido' });
    }

    // Validación para el email
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      errors.newEmail = 'Email inválido';  // Guarda el error para el email
    }

    // Validación para el nombre de usuario
    if (username && !/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.newUsername = 'El nombre de usuario solo puede contener letras, números, guiones y guiones bajos';  // Guarda el error para el nombre de usuario
    }

    // Si hay errores, devuelve el objeto con los errores
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    // Si no hay errores, actualiza el usuario
    user.username = username ? username : user.username;
    user.email = email ? email : user.email;
    user.password = password ? await bcrypt.hash(password, 10) : user.password;
    user.roleId = roleId ? roleId : user.roleId;
    user.firstName = firstName ? firstName : user.firstName;
    user.lastName = lastName ? lastName : user.lastName;
    user.phone = phone ? phone : user.phone;
    user.biography = biography ? biography : user.biography;
    user.avatar = avatar ? avatar : user.avatar;

    // Buscar el usuario actualizado e incluir su rol
    await user.save(); // Esperar a que se guarde antes de buscarlo nuevamente
    const updatedUser = await User.findByPk(req.user.id, {
      include: [{
        model: Role,
        include: [Permission]
      }, {
        model: UserCourse,
        include: [Course]
      }]
    });
    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.status(200).json({
      id: updatedUser.id,
      username: updatedUser.username,
      phone: updatedUser.phone,
      biography: updatedUser.biography,
      avatar: updatedUser.avatar,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      roleId: updatedUser.roleId,
      roleName: updatedUser.Role?.roleName,
      courses: updatedUser?.UserCourses,
      permissions: updatedUser.Role?.Permissions?.map(p => ({
        entity: p.entity,
        action: p.action
      }))
    });

  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el usuario' });
  }
};

export const changeMyOwnPassword = async (req: any, res: any) => {

  try {
    const { currentPassword, newPassword } = req.body;
    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado. Usuario no autenticado.' });
    }
    const id = req.user.id
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Contraseña actual incorrecta' });
    }

    // Validar que la nueva contraseña cumpla con los criterios (mínimo 6 caracteres, por ejemplo)
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // Encriptar la nueva contraseña
    const hashedNewPassword: string = await bcrypt.hash(newPassword, 10)

    // Actualizar la contraseña en la base de datos
    user.password = hashedNewPassword;
    await user.save();

    res.status(200).json({ message: 'Contraseña cambiada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar la contraseña', error });
  }
};

export const changePassword = async (req: Request, res: any) => {
  const { currentPassword, newPassword } = req.body;
  const { id } = req.params;

  try {
    // Verificar si el usuario existe
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Contraseña actual incorrecta' });
    }

    // Validar que la nueva contraseña cumpla con los criterios (mínimo 6 caracteres, por ejemplo)
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // Encriptar la nueva contraseña
    const hashedNewPassword: string = await bcrypt.hash(newPassword, 10)

    // Actualizar la contraseña en la base de datos
    user.password = hashedNewPassword;
    await user.save();

    res.status(200).json({ message: 'Contraseña cambiada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar la contraseña', error });
  }
};

export const resetPasswordByAdmin = async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Generar nueva contraseña aleatoria
    const newPassword = Math.random().toString(36).slice(-10); // 10 caracteres aleatorios
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    // Enviar mail con el template HTML
    const cuerpo = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; font-family: Arial, sans-serif;">
        <tr>
          <td align="center" style="padding: 30px 0;">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; border-radius: 10px; box-shadow: 0 0 20px rgba(0, 255, 247, 0.1); color: #FFFFFF;">
              <tr>
                <td style="padding: 40px; text-align: center;">
                  <h2 style="color: #00FFF7; margin-bottom: 10px;">¡Hola ${user.firstName} ${user.lastName}!</h2>
                  <p style="color: #CCCCCC; font-size: 16px; margin-top: 0;">Tu contraseña fue restablecida por un administrador.</p>
                  <p style="font-size: 16px; color: #CCCCCC; margin-top: 30px;">
                    Podés acceder al portal en:<br>
                    <a href="https://sentryx.wearesrv.com" style="color: #00FFF7; text-decoration: none;">https://sentryx.wearesrv.com</a>
                  </p>
                  <div style="margin: 30px 0; padding: 20px; border: 1px solid #333333; border-radius: 8px;">
                    <p style="color: #FFFFFF; font-size: 16px; margin: 0;">Usuario: <b>${user.email}</b></p>
                    <p style="color: #FFFFFF; font-size: 16px; margin: 0;">Contraseña temporal: <b>${newPassword}</b></p>
                  </div>
                  <p style="color: #FF6B6B; font-size: 14px; margin-top: 0;"><i>Por favor, cambiala apenas ingreses.</i></p>
                  <p style="color: #CCCCCC; margin-top: 40px;">Saludos,<br><b style="color: #00FFF7;">Equipo weareSRV</b></p>
                </td>
              </tr>
            </table>
            <img src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png" alt="weareSRV Logo" width="150" style="margin-bottom: 20px;" />
          </td>
        </tr>
      </table>
    `;

    await transporter.sendMail({
      from: `"weareSRV" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Tu nueva contraseña - Plataforma Sentryx',
      html: cuerpo,
    });

    res.status(200).json({ message: 'Contraseña reseteada y correo enviado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al resetear la contraseña', error });
  }
};

export const getUserCourses = async (req: any, res: any) => {
  const { id } = req.params;

  try {
    // Buscar usuario por id incluyendo sus cursos asociados
    const userWithCourses = await User.findByPk(id, {
      include: [{
        model: UserCourse,
        include: [Course]
      }]
    });

    if (!userWithCourses) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Retornar los cursos
    return res.status(200).json(userWithCourses.UserCourses);
  } catch (error) {
    console.error('Error fetching user courses:', error);
    return res.status(500).json({ message: 'Error al obtener cursos del usuario', error });
  }
};

export const syncUserCourses = async (req: any, res: any) => {
  const { id } = req.params;
  const { courseIds = [] } = req.body; // lista completa de cursos que el usuario debe tener

  try {
    // Validar usuario
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Validar que existan todos los cursos enviados
    if (courseIds.length > 0) {
      const courses = await Course.findAll({ where: { id: courseIds } });
      if (courses.length !== courseIds.length) {
        return res.status(404).json({ message: 'Algunos cursos no fueron encontrados' });
      }
    }

    // Obtener asignaciones actuales del usuario
    const existingAssignments = await UserCourse.findAll({ where: { userId: id } });
    const existingCourseIds = existingAssignments.map(a => a.courseId);

    // Cursos a agregar (los que están en courseIds pero no en existing)
    const toAdd = courseIds.filter((courseId: any) => !existingCourseIds.includes(courseId))
      .map((courseId: any) => ({ userId: id, courseId }));

    // Cursos a eliminar (los que están en existing pero no en courseIds)
    const toRemove = existingCourseIds.filter(courseId => !courseIds.includes(courseId));

    // Ejecutar operaciones
    if (toAdd.length > 0) await UserCourse.bulkCreate(toAdd);
    if (toRemove.length > 0) await UserCourse.destroy({ where: { userId: id, courseId: toRemove } });

    return res.status(200).json({
      message: 'Cursos sincronizados correctamente',
      added: toAdd.length,
      removed: toRemove.length
    });

  } catch (error) {
    console.error('Error sincronizando cursos del usuario:', error);
    return res.status(500).json({ message: 'Error al sincronizar cursos', error });
  }
};

export const requestPasswordReset = async (req: any, res: any) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // No revelar si el email existe o no
      return res.status(200).json({ message: 'Si el correo existe, se envió un email para resetear la contraseña' });
    }

    // Generar token aleatorio y expiración en 1 hora
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hora

    // Eliminar tokens antiguos
    await PasswordResetToken.destroy({ where: { userId: user.id } });

    // Crear nuevo token
    await PasswordResetToken.create({ userId: user.id, token, expiresAt });

    // Construir link para reset (ajustar FRONTEND_URL en .env)
    const resetLink = `https://sentryx.wearesrv.com/reset-password?token=${token}`;

    const cuerpo = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; font-family: Arial, sans-serif;">
        <tr>
          <td align="center" style="padding: 30px 0;">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #1B1B1B; border-radius: 10px; box-shadow: 0 0 20px rgba(0, 255, 247, 0.1); color: #FFFFFF;">
              <tr>
                <td style="padding: 40px; text-align: center;">
                  <h2 style="color: #00FFF7; margin-bottom: 10px;">¡Hola ${user.firstName} ${user.lastName}!</h2>
                  <p style="color: #CCCCCC; font-size: 16px; margin-top: 0;">
                    Recibimos una solicitud para restablecer tu contraseña.
                    Para continuar, hacé clic en el siguiente enlace:
                  </p>
                  <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; margin: 20px 0; background-color: #00FFF7; color: #1B1B1B; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    Restablecer contraseña
                  </a>
                  <p style="color: #CCCCCC; font-size: 14px;">
                    Si no solicitaste este cambio, simplemente ignorá este correo.
                  </p>
                  <p style="color: #CCCCCC; margin-top: 40px;">Saludos,<br><b style="color: #00FFF7;">Equipo weareSRV</b></p>
                </td>
              </tr>
            </table>
            <img src="https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/logotipo.png" alt="weareSRV Logo" width="150" style="margin-bottom: 20px;" />
          </td>
        </tr>
      </table>
    `;

    await transporter.sendMail({
      from: `"SRV" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Restablece tu contraseña - Sentryx',
      html: cuerpo,
    });

    return res.status(200).json({ message: 'Si el correo existe, se envió un email para resetear la contraseña' });
  } catch (error) {
    console.error('Error en requestPasswordReset:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Endpoint para resetear la contraseña con token
export const resetPassword = async (req: any, res: any) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
  }

  try {
    // Buscar token válido y no expirado
    const resetToken = await PasswordResetToken.findOne({ where: { token } });
    if (!resetToken) {
      return res.status(400).json({ error: 'Token inválido' });
    }
    if (resetToken.expiresAt < new Date()) {
      // Token expirado
      await resetToken.destroy(); // Eliminar token expirado
      return res.status(400).json({ error: 'Token expirado' });
    }

    // Buscar usuario
    const user = await User.findByPk(resetToken.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Hashear nueva contraseña y guardar
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    // Borrar token para que no se pueda reutilizar
    await resetToken.destroy();

    return res.json({ message: 'Contraseña reseteada correctamente' });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};


export const searchUsers = async (req: Request, res: any) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ message: 'Falta el parámetro de búsqueda (?q=)' });
  }

  try {
    const users = await User.findAll({
      where: {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${q}%` } },
          { lastName: { [Op.iLike]: `%${q}%` } },
          { username: { [Op.iLike]: `%${q}%` } },
          { biography: { [Op.iLike]: `%${q}%` } },
        ]
      },
      attributes: ['id', 'username', 'firstName', 'lastName', 'avatar', 'biography'], // Solo lo necesario
      include: [{ model: Role, attributes: ['roleName'] }]
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al buscar usuarios', error });
  }
};
