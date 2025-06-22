'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.addColumn('User', 'lastLogin', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('User', 'lastLogin');
  }
};
