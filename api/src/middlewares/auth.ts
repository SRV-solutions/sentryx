import { Request, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Permission from '../models/Permission';
import Role from '../models/Role';
import { Action, Entity } from '../models/enums'; // Importando desde enums.ts

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

interface JwtPayload {
  id: string;
  email: string;
  roleId: string;
}

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    roleId: number;
  };
}

// 🛡️ Middleware para verificar si el usuario está autenticado
export const isAuth = (req: AuthRequest, res: any, next: NextFunction) => {
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No autorizado. Token no proporcionado.' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, decodedToken) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido o expirado.' });
    }
    
    const user = decodedToken as JwtPayload;
    req.user = {
      id: parseInt(user.id, 10),
      email: user.email,
      roleId: parseInt(user.roleId, 10),
    };

    next();
  });
};

// src/middlewares/verifyEmbeddingToken.ts

export const verifyEmbeddingToken = (req: any, res: any, next: any) => {
  const token = req.headers['x-embedding-token'];

  if (!token || token !== process.env.EMBEDDING_SECRET) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  next();
};


export const checkPermission = (entity: Entity, action: Action) => {
  return async (req: any, res: any, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado.' });
    }

    try {
      const role = await Role.findByPk(req.user.roleId, {
        include: [Permission]
      });

      if (!role) {
        return res.status(404).json({ message: 'Rol no encontrado.' });
      }

      const hasPermission = role.Permissions?.some((p: any) => p.entity === entity && p.action === action);

      if (!hasPermission) {
        return res.status(403).json({ message: `No tenés permisos para ${action} en ${entity}` });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: 'Error verificando permisos', error });
    }
  };
};