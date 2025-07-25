'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Crear tabla ChatUser
    await queryInterface.createTable('ChatUser', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      chatId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Chat',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      isAdmin: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      lastReadMessageId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'ChatMessage',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 2. Copiar usuarios existentes desde la columna Chat.userId
    await queryInterface.sequelize.query(`
      INSERT INTO "ChatUser" ("chatId", "userId", "isAdmin", "createdAt", "updatedAt")
      SELECT "id", "userId", true, NOW(), NOW()
      FROM "Chat"
      WHERE "userId" IS NOT NULL
    `);

    // 3. ⚠️ (Opcional) Eliminar columna userId de Chat
    // ⚠️ Comenta esto si querés mantener compatibilidad temporal con código viejo
    /*
    */
    await queryInterface.removeColumn('Chat', 'userId');
  },

  down: async (queryInterface, Sequelize) => {
    // 1. Restaurar columna userId en Chat
    await queryInterface.addColumn('Chat', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });

    // 2. Restaurar los valores de userId desde ChatUser donde isAdmin = true
    await queryInterface.sequelize.query(`
    UPDATE "Chat" c
    SET "userId" = cu."userId"
    FROM "ChatUser" cu
    WHERE cu."chatId" = c."id"
      AND cu."isAdmin" = true
  `);

    // 3. Eliminar tabla ChatUser
    await queryInterface.dropTable('ChatUser');
  }
};
