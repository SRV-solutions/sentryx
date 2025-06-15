import { Request } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Role from '../models/Role';
import User from '../models/User';
import Permission from '../models/Permission';
import UserCourse from '../models/UserCourse';
import Course from '../models/Course';

// Clave secreta para JWT (colócala en un archivo .env)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
interface ValidationErrors {
  newEmail?: string;
  newUsername?: string;
}

export const getAllUsers = async (req: Request, res: any) => {
  try {
    const users = await User.findAll({
      include: [Role],
      attributes: [
        'id',
        'username',
        'email',
        'roleId'
      ]
    });
    if (!users.length) {
      return res.status(404).json({ message: 'No hay usuarios disponibles' });
    }
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los usuarios', error });
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
  const { username, fistName, lastName, email, password, roleId } = req.body;
  try {
    // Validar si el rol existe
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      roleId,
      fistName,
      lastName
    });

    res.status(201).json(user);
  } catch (error) {
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
        email: user.email,
        firstName: user.fistName,
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
    const { email, username, roleId, password } = req.body;

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
    const { email, username, roleId, password } = req.body;
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

    // Buscar el usuario actualizado e incluir su rol
    await user.save(); // Esperar a que se guarde antes de buscarlo nuevamente
    const updatedUser = await User.findByPk(req.user.id, { include: Role });

    res.status(200).json(updatedUser);

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
