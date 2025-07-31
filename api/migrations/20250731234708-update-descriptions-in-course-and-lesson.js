module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Cambiar 'Course.description' a TEXT largo
    await queryInterface.changeColumn('Course', 'description', {
      type: Sequelize.TEXT('medium'),
      allowNull: false
    });

    // Cambiar 'Lesson.description' de STRING a TEXT largo
    await queryInterface.changeColumn('Lesson', 'description', {
      type: Sequelize.TEXT('medium'),
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revertir 'Course.description' a TEXT (sin variante)
    await queryInterface.changeColumn('Course', 'description', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    // Revertir 'Lesson.description' a STRING
    await queryInterface.changeColumn('Lesson', 'description', {
      type: Sequelize.STRING,
      allowNull: false
    });
  }
};
