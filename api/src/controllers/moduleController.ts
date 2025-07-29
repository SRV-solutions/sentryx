import Module from '../models/Module';
import Course from '../models/Course';

export const createModule = async (req: any, res: any) => {
  try {
    const { courseId, title, order } = req.body;

    if (!courseId || !title || typeof order !== 'number') {
      return res.status(400).json({ message: 'Faltan datos requeridos.' });
    }

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Curso no encontrado.' });
    }

    const newModule = await Module.create({
      courseId,
      title,
      order,
    });

    res.status(201).json(newModule);
  } catch (error) {
    console.error('Error al crear módulo:', error);
    res.status(500).json({ message: 'Error al crear módulo.', error });
  }
};

export const updateModule = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { title, order } = req.body;

    if (!title || typeof order !== 'number') {
      return res.status(400).json({ message: 'Faltan datos requeridos o formato inválido.' });
    }

    const module = await Module.findByPk(id);

    if (!module) {
      return res.status(404).json({ message: 'Módulo no encontrado.' });
    }

    module.title = title;
    module.order = order;

    await module.save();

    res.status(200).json(module);
  } catch (error) {
    console.error('Error al editar módulo:', error);
    res.status(500).json({ message: 'Error al editar módulo.', error });
  }
};