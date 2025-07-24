'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Friendship', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      requesterId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',  // Asegurate que la tabla de usuarios se llame 'User'
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      receiverId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'rejected', 'blocked', 'cancelled', 'removed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Índice único para requesterId + receiverId
    await queryInterface.addConstraint('Friendship', {
      fields: ['requesterId', 'receiverId'],
      type: 'unique',
      name: 'friendship_requester_receiver_unique',
    });
  },

  down: async (queryInterface) => {
    // Primero eliminamos el ENUM para evitar errores en Postgres
    await queryInterface.dropTable('Friendship');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_Friendship_status;');
  },
};
