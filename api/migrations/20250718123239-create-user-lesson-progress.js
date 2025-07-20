'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('UserLessonProgress', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User', // Nombre exacto de la tabla Users
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      lessonId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Lesson', // Nombre exacto de la tabla Lessons
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      watchedDuration: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Opcional: índice único para evitar duplicados userId + lessonId
    await queryInterface.addConstraint('UserLessonProgress', {
      fields: ['userId', 'lessonId'],
      type: 'unique',
      name: 'user_lesson_unique_constraint',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('UserLessonProgress');
  },
};
