import { Request, Response } from 'express';
import Role from '../models/Role';
import User from '../models/User';

export const getRole = async (req: Request, res: any) => {
  const { id } = req.params;
  try {
    const role = await Role.findByPk(id, {
      include: [User],
    });
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    return res.json(role);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching role', error });
  }
}

export const getRoles = async (req: Request, res: any) => {
  try {
    const roles: any = await Role.findAll();
    if (!roles && roles.length !== 0) {
      return res.status(404).json({ message: 'Role not found' });
    }
    return res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching role', error });
  }
}


// Crear un nuevo rol
export const createRole = async (req: Request, res: Response) => {
  const { name } = req.body;
  try {
    const role = await Role.create({ name });
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ message: 'Error creating role', error });
  }
};
