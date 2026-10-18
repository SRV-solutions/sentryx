import { Request, Response } from 'express';
import Role from '../models/Role';
import User from '../models/User';

export const getRole = async (req: Request, res: any) => {
  const { id } = req.params;
  try {
    const role = await Role.findByPk(id, {
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'email'] }],
    });
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    return res.json(role);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching role' });
  }
}

export const getRoles = async (req: Request, res: any) => {
  try {
    const roles: any = await Role.findAll();
    return res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching role' });
  }
}


// Crear un nuevo rol
export const createRole = async (req: Request, res: Response) => {
  const { roleName, description } = req.body;
  if (!roleName || typeof roleName !== 'string') return res.status(400).json({ message: 'roleName es obligatorio' });
  try {
    const role = await Role.create({ roleName, description } as any);
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ message: 'Error creating role' });
  }
};
